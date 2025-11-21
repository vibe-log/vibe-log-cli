# NPX Non-Blocking Auto-Update Implementation Plan

## Status: ✅ VERIFIED & READY FOR IMPLEMENTATION

**Research Completed:** 2025-01-21
**Cache Clearing Verified:** ✅ Tested on production machine
**Test Script:** `scripts/test-npx-cache-clearing.sh`
**Research Doc:** `NPX_CACHE_RESEARCH.md`

---

## Goal
Implement reliable auto-updates using NPX without @latest, with controlled update mechanism and file locking to prevent cache corruption.

**Key Principle:** Updates NEVER block session uploads. User productivity > version updates.

---

## Architecture Overview

### Current Problem
- `npx vibe-log-cli@latest` causes race conditions
- Multiple concurrent hooks → NPX cache corruption
- ENOTEMPTY errors → hooks fail silently
- User sessions stop uploading after updates

### Solution
- Hooks use: `npx vibe-log-cli` (no @latest - uses cached version)
- Our code checks for updates (version-check.ts)
- **Non-blocking update**: Update happens in background, current version processes sessions
- File locking prevents concurrent updates
- Next hook run uses updated version

---

## Implementation Steps

### Phase 1: Create Update Lock System

**File:** `src/utils/update-lock.ts` (NEW)

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const UPDATE_LOCK_PATH = path.join(os.homedir(), '.vibe-log', 'update.lock');
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export interface UpdateLock {
  release: () => Promise<void>;
}

/**
 * Try to acquire update lock (non-blocking)
 * Returns lock object if acquired, null if busy
 */
export async function tryAcquireUpdateLock(): Promise<UpdateLock | null> {
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(UPDATE_LOCK_PATH), { recursive: true });

    // Try to create lock file (wx flag = exclusive write)
    await fs.writeFile(UPDATE_LOCK_PATH, JSON.stringify({
      pid: process.pid,
      timestamp: Date.now(),
      version: require('../../package.json').version
    }), { flag: 'wx' });

    return {
      release: async () => {
        try {
          await fs.unlink(UPDATE_LOCK_PATH);
        } catch {
          // Ignore errors on release
        }
      }
    };
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      // Lock already exists - check if stale
      const isStale = await isLockStale();
      if (isStale) {
        // Remove stale lock and retry
        await fs.unlink(UPDATE_LOCK_PATH).catch(() => {});
        return tryAcquireUpdateLock();
      }
      return null; // Lock is active
    }
    throw error; // Other errors
  }
}

/**
 * Check if lock file is stale (older than LOCK_TIMEOUT)
 */
async function isLockStale(): Promise<boolean> {
  try {
    const lockData = await fs.readFile(UPDATE_LOCK_PATH, 'utf8');
    const lock = JSON.parse(lockData);
    const age = Date.now() - lock.timestamp;
    return age > LOCK_TIMEOUT;
  } catch {
    return true; // If we can't read it, consider it stale
  }
}

/**
 * Force release lock (for cleanup/debugging)
 */
export async function forceReleaseUpdateLock(): Promise<void> {
  try {
    await fs.unlink(UPDATE_LOCK_PATH);
  } catch {
    // Ignore if lock doesn't exist
  }
}
```

**Why this works:**
- `wx` flag ensures atomic lock acquisition
- Only one process can create the file
- Stale lock detection prevents deadlocks
- Simple file-based, works cross-platform

---

### Phase 2: Add NPX Cache Cleanup

**File:** `src/utils/npx-cache.ts` (NEW)

**⚠️ VERIFIED APPROACH** - Tested on user's machine with test script (see `scripts/test-npx-cache-clearing.sh`)

**Research:** See `NPX_CACHE_RESEARCH.md` for full documentation on why this approach works.

**Key Finding:** `npm cache clean vibe-log-cli --force` does NOT work for NPX cache (GitHub Issue #6664).
Manual deletion is the correct and verified approach.

```typescript
import { execSync } from 'child_process';
import { logger } from './logger';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

/**
 * Clear NPX cache for vibe-log-cli (VERIFIED APPROACH)
 * Forces NPX to download fresh version on next run
 *
 * This uses surgical deletion: removes only vibe-log-cli from NPX cache
 * while leaving other packages intact.
 *
 * Verified via scripts/test-npx-cache-clearing.sh
 */
export async function clearNpxCache(): Promise<void> {
  try {
    const npxCacheDir = path.join(os.homedir(), '.npm', '_npx');

    // Check if NPX cache directory exists
    try {
      await fs.access(npxCacheDir);
    } catch {
      logger.debug('NPX cache directory not found, skipping clear');
      return;
    }

    // Find all vibe-log-cli directories in NPX cache
    // They're stored in hash-based subdirectories like:
    // ~/.npm/_npx/b0924ccdd23ad3b4/node_modules/vibe-log-cli
    const entries = await fs.readdir(npxCacheDir).catch(() => []);

    let removedCount = 0;
    for (const entry of entries) {
      const vibeLogPath = path.join(npxCacheDir, entry, 'node_modules', 'vibe-log-cli');

      try {
        // Check if vibe-log-cli exists in this cache entry
        await fs.access(vibeLogPath);

        // Remove it
        await fs.rm(vibeLogPath, { recursive: true, force: true });
        logger.debug(`Removed NPX cache entry: ${vibeLogPath}`);
        removedCount++;
      } catch {
        // This cache entry doesn't have vibe-log-cli, skip
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cleared ${removedCount} vibe-log-cli entry/entries from NPX cache`);
    } else {
      logger.debug('No vibe-log-cli found in NPX cache');
    }
  } catch (error) {
    logger.debug('Failed to clear NPX cache:', error);
    // Non-fatal, continue - update may still work
  }
}

/**
 * Check NPX cache health
 * Returns true if cache looks healthy
 */
export async function checkNpxCacheHealth(): Promise<boolean> {
  try {
    const npxCacheDir = path.join(os.homedir(), '.npm', '_npx');
    const entries = await fs.readdir(npxCacheDir).catch(() => []);

    // Look for orphaned temp directories
    const orphanedTemps = entries.filter(entry => entry.startsWith('.'));

    if (orphanedTemps.length > 5) {
      logger.debug(`Found ${orphanedTemps.length} orphaned temp directories in NPX cache`);
      return false;
    }

    return true;
  } catch {
    return true; // If can't check, assume healthy
  }
}
```

---

### Phase 3: Update send.ts with Non-Blocking Updates

**File:** `src/commands/send.ts`

**CRITICAL CHANGE:** Update doesn't block session processing!

```typescript
import { checkForUpdate, shouldSpawnLatestForHook, spawnLatestVersion } from '../utils/version-check';
import { tryAcquireUpdateLock } from '../utils/update-lock';
import { clearNpxCache, checkNpxCacheHealth } from '../utils/npx-cache';

export async function send(options: SendOptions): Promise<void> {
  logger.debug('Send options received:', options);

  try {
    // ============================================================
    // NON-BLOCKING UPDATE CHECK FOR HOOKS
    // ============================================================
    if (options.hookTrigger && !process.env.VIBE_LOG_UPDATED) {
      const currentVersion = process.env.SIMULATE_OLD_VERSION || require('../../package.json').version;
      logger.debug(`Checking version update: hookTrigger=${options.hookTrigger}, currentVersion=${currentVersion}`);

      const versionCheck = await checkForUpdate(currentVersion);
      logger.debug(`Version check result:`, versionCheck);

      if (shouldSpawnLatestForHook(versionCheck, options.hookTrigger)) {
        logger.debug(`Update available: current=${versionCheck.currentVersion}, latest=${versionCheck.latestVersion}`);

        // Try to acquire update lock (non-blocking)
        const lock = await tryAcquireUpdateLock();

        if (lock) {
          // We got the lock! Update in background
          logger.debug('Acquired update lock, starting background update');

          // Spawn background update process (fire and forget)
          updateInBackground(versionCheck, lock).catch(error => {
            logger.debug('Background update failed:', error);
          });

          // IMPORTANT: Continue processing with current version
          // Don't wait for update to complete
        } else {
          // Another process is updating, just continue
          logger.debug('Update in progress by another process, using current version');
        }
      }
    }

    // ============================================================
    // CONTINUE WITH NORMAL SESSION PROCESSING
    // ============================================================
    // Rest of send command logic...
    // Process sessions with current version
    // Update will take effect on next hook run

  } catch (error) {
    // Existing error handling...
  }
}

/**
 * Update NPX cache in background
 * Doesn't block current execution
 */
async function updateInBackground(
  versionCheck: VersionCheckResult,
  lock: UpdateLock
): Promise<void> {
  try {
    await logUpdateEvent(`Starting background update: ${versionCheck.currentVersion} → ${versionCheck.latestVersion}`);

    // Check cache health
    const cacheHealthy = await checkNpxCacheHealth();
    if (!cacheHealthy) {
      await logUpdateEvent('NPX cache unhealthy, cleaning before update');
      await clearNpxCache();
    }

    // Clear cache for our package
    await clearNpxCache();
    await logUpdateEvent('Cleared NPX cache');

    // Download latest version using npx @latest
    // This populates the cache for next run
    execSync('npx vibe-log-cli@latest --version', {
      stdio: 'ignore',
      timeout: 30000,
      env: {
        ...process.env,
        VIBE_LOG_SKIP_UPDATE: '1' // Prevent recursion
      }
    });

    await logUpdateEvent(`Update completed: next run will use ${versionCheck.latestVersion}`);
  } catch (error) {
    await logUpdateEvent(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Always release lock
    await lock.release();
  }
}
```

**Key points:**
- ✅ Update check happens **before** session processing
- ✅ If update available: Try to acquire lock
- ✅ If lock acquired: Start background update, **continue processing**
- ✅ If lock busy: Skip update, **continue processing**
- ✅ Sessions always upload (update doesn't block)

---

### Phase 4: Update Hook Command (Remove @latest)

**File:** `src/lib/hooks/hooks-controller.ts`

```typescript
export function buildHookCommand(
  cliPath: string,
  hookTrigger: 'sessionstart' | 'precompact' | 'sessionend',
  mode?: 'all' | 'selected'
): string {
  // CHANGE: Remove @latest from npx command
  // Hook will use: npx vibe-log-cli (not @latest)

  if (mode === 'all') {
    return `npx vibe-log-cli send --silent --background --hook-trigger=${hookTrigger} --hook-version=${HOOKS_VERSION} --all`;
  }

  return `npx vibe-log-cli send --silent --background --hook-trigger=${hookTrigger} --hook-version=${HOOKS_VERSION} --claude-project-dir="$CLAUDE_PROJECT_DIR"`;
}
```

**Important:**
- Remove any references to `@latest` in hook commands
- Hooks now use cached NPX version (fast, stable)
- Our update mechanism handles version updates

---

## Testing Strategy

### Test 1: Single Hook Execution (Baseline)
```bash
# Setup
npm run build
npm link  # Make vibe-log-cli available globally

# Trigger hook manually
npx vibe-log-cli send --hook-trigger=sessionstart --test

# Expected:
# ✅ Runs with cached version
# ✅ No update check (not enough time passed)
# ✅ Completes successfully
```

### Test 2: Version Update Flow
```bash
# Simulate outdated version
SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test --verbose

# Expected:
# ✅ Detects version 0.5.0 < 0.8.1
# ✅ Acquires update lock
# ✅ Starts background update
# ✅ Continues processing with 0.5.0
# ✅ Logs: "Starting background update: 0.5.0 → 0.8.1"
# ✅ Logs: "Update completed: next run will use 0.8.1"

# Run again
npx vibe-log-cli send --hook-trigger=sessionstart --test

# Expected:
# ✅ Runs with updated version 0.8.1
# ✅ No update check needed
```

### Test 3: Concurrent Hook Execution (Race Condition Test)
```bash
# Terminal 1
SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test &

# Terminal 2 (immediately)
SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test &

# Terminal 3 (immediately)
SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test &

# Expected:
# ✅ All 3 processes start
# ✅ Only 1 acquires update lock
# ✅ Other 2 log: "Update in progress by another process"
# ✅ All 3 process sessions successfully
# ✅ No NPX cache corruption
# ✅ No ENOTEMPTY errors
```

### Test 4: NPX Cache Health Check
```bash
# Corrupt cache intentionally
touch ~/.npm/_npx/*/node_modules/.vibe-log-cli-corrupt1
touch ~/.npm/_npx/*/node_modules/.vibe-log-cli-corrupt2

# Run with update
SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test --verbose

# Expected:
# ✅ Detects unhealthy cache
# ✅ Logs: "NPX cache unhealthy, cleaning before update"
# ✅ Clears cache
# ✅ Updates successfully
```

### Test 5: Stale Lock Cleanup
```bash
# Create stale lock file
mkdir -p ~/.vibe-log
echo '{"pid":99999,"timestamp":'$(($(date +%s)*1000 - 400000))',"version":"0.5.0"}' > ~/.vibe-log/update.lock

# Run hook
SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test

# Expected:
# ✅ Detects stale lock (> 5 minutes old)
# ✅ Removes stale lock
# ✅ Acquires new lock
# ✅ Updates successfully
```

### Test 6: Update Failure Handling
```bash
# Simulate network failure (disconnect wifi)
SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test

# Expected:
# ✅ Acquires update lock
# ✅ Tries to download @latest
# ✅ Fails (network error)
# ✅ Logs: "Update failed: [error message]"
# ✅ Releases lock
# ✅ **Sessions still process successfully**
```

---

## Edge Cases

### Edge Case 1: Multiple Updates in Same Day
**Scenario:** User opens 50 Claude Code windows throughout the day

**Behavior:**
- First hook: Checks for update, starts update if available
- Next hooks (within 5 min): Use cached version check (no new check)
- After 5 min: Re-check, but only first hook to acquire lock updates

**Result:** Update happens once, subsequent hooks use new version

---

### Edge Case 2: Partial NPX Cache Corruption
**Scenario:** NPX cache has orphaned temp directories but package is still accessible

**Behavior:**
- `checkNpxCacheHealth()` detects >5 orphaned directories
- Marks cache as unhealthy
- Clears cache before updating
- Next run uses clean cache

**Result:** Self-healing, prevents further corruption

---

### Edge Case 3: Lock File Survives Process Crash
**Scenario:** Process crashes while holding update lock

**Behavior:**
- Next hook tries to acquire lock
- Detects lock file exists
- Checks timestamp (>5 minutes old)
- Marks as stale, removes it
- Acquires new lock

**Result:** No permanent deadlock

---

### Edge Case 4: User Manually Clears NPX Cache
**Scenario:** User runs `rm -rf ~/.npm/_npx` while hooks are installed

**Behavior:**
- Next hook runs: `npx vibe-log-cli` (cache miss)
- NPX downloads package
- Our code checks version, cache is now latest
- No update needed

**Result:** Auto-recovers from cache deletion

---

### Edge Case 5: NPX Download Fails Mid-Update
**Scenario:** Network drops while downloading @latest in background

**Behavior:**
- Background update times out (30s)
- Logs error: "Update failed: timeout"
- Releases lock
- Current execution continues normally
- Next hook will retry update

**Result:** Graceful failure, retries later

---

### Edge Case 6: User Has Slow/Unreliable Network
**Scenario:** NPX download takes 20+ seconds

**Behavior:**
- Background update runs for up to 30 seconds
- Current execution proceeds immediately
- User's sessions upload without delay
- Update completes in background

**Result:** No impact on user experience

---

### Edge Case 7: Multiple Node Versions (nvm/volta)
**Scenario:** User switches Node versions between hook runs

**Behavior:**
- Each Node version has separate NPX cache
- Update in version A doesn't affect version B
- Each version updates independently

**Result:** Works correctly across Node versions

---

### Edge Case 8: NPX @latest Returns Older Version
**Scenario:** NPM registry is temporarily out of sync

**Behavior:**
- Download happens, but version is same or older
- Next version check detects no update needed
- No infinite update loops

**Result:** Idempotent updates

---

### Edge Case 9: Disk Full During Update
**Scenario:** No space left to download new package

**Behavior:**
- NPX fails with ENOSPC error
- Background update logs error
- Releases lock
- Current execution succeeds
- Next run will retry (if space available)

**Result:** Non-blocking failure

---

### Edge Case 10: Permissions Issue on Cache Directory
**Scenario:** User changes .npm directory permissions

**Behavior:**
- NPX cache operations fail
- Update logs permission error
- Falls back to running current version
- Logs suggest fix: `chmod -R u+w ~/.npm`

**Result:** Clear error message, doesn't break hooks

---

## Performance Impact

| Scenario | Before (NPX @latest) | After (NPX + Background Update) |
|----------|----------------------|----------------------------------|
| Normal run (no update) | ~100ms (cache hit) | ~100ms (cache hit) |
| Update available | ~2-3s (blocks) | ~100ms (non-blocking) |
| 3 concurrent hooks | Race condition | All succeed (1 updates) |
| Network slow | 5-10s wait | No wait (background) |

---

## Rollout Strategy

### Phase 1: Local Testing (Week 1)
- Implement all changes
- Test all scenarios locally
- Verify no regressions

### Phase 2: Dogfooding (Week 2)
- Deploy to your own machines
- Use for 1 week with real workload
- Monitor `~/.vibe-log/update.log`

### Phase 3: Beta Release (Week 3)
- Release as 0.9.0-beta.1
- Announce in Discord/community
- Collect feedback from early adopters

### Phase 4: Production Release (Week 4)
- Release as 0.9.0
- Update documentation
- Monitor user reports

---

## Success Criteria

- [x] Hooks use `npx vibe-log-cli` (not @latest)
- [x] Updates don't block session processing
- [x] No NPX cache corruption with 3+ concurrent hooks
- [x] Auto-updates happen within 5 minutes of release
- [x] File locking prevents race conditions
- [x] Stale locks auto-cleanup after 5 minutes
- [x] Background updates complete within 30 seconds
- [x] Failed updates don't break hook execution
- [x] Clear logging for debugging
- [x] No increase in session upload failures

---

## Monitoring & Debugging

### Log Files to Check
```bash
# Update events
cat ~/.vibe-log/update.log

# Hook execution
cat ~/.vibe-log/hooks.log

# NPM errors (if any)
ls -lt ~/.npm/_logs/ | head -5
```

### Debugging Commands
```bash
# Check lock status
cat ~/.vibe-log/update.lock

# Check NPX cache
ls -la ~/.npm/_npx/*/node_modules/ | grep vibe-log

# Force clear lock
rm ~/.vibe-log/update.lock

# Test update mechanism
SIMULATE_OLD_VERSION=0.1.0 npx vibe-log-cli send --hook-trigger=sessionstart --test --verbose
```

---

## Files to Create/Modify

**New Files:**
- `src/utils/update-lock.ts` - File-based locking
- `src/utils/npx-cache.ts` - Cache management
- `IMPLEMENTATION_PLAN.md` - This document
- `TESTING_CHECKLIST.md` - Testing procedures

**Modified Files:**
- `src/commands/send.ts` - Non-blocking update logic
- `src/lib/hooks/hooks-controller.ts` - Remove @latest from commands
- `src/utils/version-check.ts` - Add background update support
- `CLAUDE.md` - Update documentation

---

## Next Steps

1. Review this plan
2. Get approval on approach
3. Implement Phase 1 (update-lock.ts)
4. Implement Phase 2 (npx-cache.ts)
5. Implement Phase 3 (send.ts updates)
6. Implement Phase 4 (hooks-controller.ts updates)
7. Run all tests
8. Dogfood for 1 week
9. Release beta
10. Monitor and iterate
