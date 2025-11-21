# Testing NPX Auto-Update on Another Machine

## Goal
Verify the NPX non-blocking auto-update mechanism works correctly on a fresh machine.

---

## Pre-Requisites

1. **Second machine with:**
   - Node.js installed (v16+)
   - npm installed
   - Claude Code installed with active projects
   - Same GitHub account authenticated

2. **On development machine (this machine):**
   - Latest changes built (`npm run build`)
   - Ready to publish new version (or use npm link for testing)

---

## Testing Approach

We'll test two scenarios:
1. **Fresh install** - First time user experience
2. **Update flow** - Existing user getting new version

---

## Scenario 1: Fresh Install Test

### Step 1: Clean State (on test machine)
```bash
# Remove any existing vibe-log data
rm -rf ~/.vibe-log
rm -rf ~/.config/vibe-log-cli

# Clear NPX cache (optional, for clean test)
rm -rf ~/.npm/_npx
```

### Step 2: First Run (on test machine)
```bash
# Run vibe-log-cli for first time
npx vibe-log-cli

# Expected:
# ✅ Downloads and caches latest published version
# ✅ Runs setup wizard
# ✅ No update check (first run)
```

### Step 3: Check Initial Cache (on test machine)
```bash
# Verify NPX cached the package
find ~/.npm/_npx -name "vibe-log-cli" -type d

# Check what version was cached
find ~/.npm/_npx -name "vibe-log-cli" -type d -exec cat {}/package.json \; | grep '"version"'

# Expected: Should show current published version (e.g., 0.8.2)
```

### Step 4: Complete Setup (on test machine)
```bash
# Follow the setup wizard
npx vibe-log-cli

# Actions:
# 1. Authenticate with GitHub
# 2. Install hooks (SessionStart, PreCompact)
# 3. Select "all projects" or specific projects
```

### Step 5: Verify Hook Commands (on test machine)
```bash
# Check what hook commands were installed
cat ~/.claude/settings.json | grep -A 5 "SessionStart"

# Expected to see:
# "command": "npx vibe-log-cli send --silent --background --hook-trigger=sessionstart ..."
#
# IMPORTANT: Should NOT have @latest
```

---

## Scenario 2: Update Flow Test

### Preparation (on dev machine)

**Option A: Publish New Version (Real Test)**
```bash
# On dev machine
cd /Users/danny/dev/vibe-log/vibe-log-cli

# Update version
npm version patch

# Build
npm run build

# Publish to npm
npm publish

# Note the new version number (e.g., 0.8.3)
```

**Option B: Use npm link (Local Test)**
```bash
# On dev machine
cd /Users/danny/dev/vibe-log/vibe-log-cli
npm run build
npm link

# On test machine
npm link vibe-log-cli

# This creates a symlink, but won't test NPX properly
# Use Option A for real test
```

### Step 1: Trigger Hook on Old Version (test machine)

**Method 1: Wait for natural hook trigger**
```bash
# On test machine, in Claude Code:
# 1. Open any project
# 2. Start a new session (triggers SessionStart hook)
# 3. Watch terminal output
```

**Method 2: Manual hook trigger (faster)**
```bash
# On test machine
# Simulate hook execution with old version
SIMULATE_OLD_VERSION=0.8.2 npx vibe-log-cli send --hook-trigger=sessionstart --verbose

# Expected output:
# [DEBUG] Checking version update: hookTrigger=sessionstart, currentVersion=0.8.2
# [DEBUG] Version check result: { isOutdated: true, currentVersion: '0.8.2', latestVersion: '0.8.3', ... }
# [DEBUG] Update available: current=0.8.2, latest=0.8.3
# [DEBUG] Acquired update lock, starting background update
# ... (session processing continues immediately)
# [DEBUG] Cleared NPX cache
```

### Step 2: Monitor Update Process (test machine)
```bash
# In another terminal on test machine
tail -f ~/.vibe-log/update.log

# Expected to see:
# [timestamp] Starting background update: 0.8.2 → 0.8.3
# [timestamp] Cleared NPX cache
# [timestamp] Update completed: next run will use 0.8.3
```

### Step 3: Verify Update Completed (test machine)
```bash
# Check lock was released
ls -la ~/.vibe-log/update.lock
# Expected: File should NOT exist (released after update)

# Check NPX cache has new version
find ~/.npm/_npx -name "vibe-log-cli" -type d -exec cat {}/package.json \; | grep '"version"'
# Expected: "version": "0.8.3"

# Run again to verify new version is used
npx vibe-log-cli --version
# Expected: 0.8.3
```

---

## Scenario 3: Concurrent Hooks Test (Race Condition)

This tests the file locking prevents NPX cache corruption.

### Step 1: Setup (test machine)
```bash
# Create a test script that runs multiple hooks simultaneously
cat > /tmp/test-concurrent-hooks.sh << 'EOF'
#!/bin/bash

echo "Starting 3 concurrent hook executions..."

# Terminal 1 (background)
SIMULATE_OLD_VERSION=0.8.0 npx vibe-log-cli send --hook-trigger=sessionstart --verbose > /tmp/hook1.log 2>&1 &
PID1=$!

# Terminal 2 (background)
SIMULATE_OLD_VERSION=0.8.0 npx vibe-log-cli send --hook-trigger=precompact --verbose > /tmp/hook2.log 2>&1 &
PID2=$!

# Terminal 3 (background)
SIMULATE_OLD_VERSION=0.8.0 npx vibe-log-cli send --hook-trigger=sessionend --verbose > /tmp/hook3.log 2>&1 &
PID3=$!

echo "Waiting for all hooks to complete..."
wait $PID1 $PID2 $PID3

echo ""
echo "=== Hook 1 Log ==="
grep -E "update lock|Update available" /tmp/hook1.log

echo ""
echo "=== Hook 2 Log ==="
grep -E "update lock|Update available" /tmp/hook2.log

echo ""
echo "=== Hook 3 Log ==="
grep -E "update lock|Update available" /tmp/hook3.log

echo ""
echo "Expected: Only ONE hook acquired the lock, others continued without blocking"
EOF

chmod +x /tmp/test-concurrent-hooks.sh
```

### Step 2: Run Concurrent Test (test machine)
```bash
# Clear cache first
rm -rf ~/.npm/_npx/*/node_modules/vibe-log-cli

# Run test
/tmp/test-concurrent-hooks.sh

# Expected results:
# ✅ Hook 1: "Acquired update lock, starting background update"
# ✅ Hook 2: "Update in progress by another process, using current version"
# ✅ Hook 3: "Update in progress by another process, using current version"
# ✅ All 3 hooks complete successfully
# ✅ No ENOTEMPTY errors
```

### Step 3: Verify No Corruption (test machine)
```bash
# Check NPX cache is clean
ls -la ~/.npm/_npx/

# Expected: No orphaned temp directories (starting with .)
# If you see many .vibe-log-cli-XXXXX directories, that indicates corruption

# Verify package installed correctly
find ~/.npm/_npx -name "vibe-log-cli" -type d -exec ls -la {} \;

# Expected: Clean package structure, no partial installations
```

---

## Scenario 4: Stale Lock Recovery Test

Tests that stale locks (from crashed processes) are cleaned up.

### Step 1: Create Stale Lock (test machine)
```bash
# Create a lock file that's > 5 minutes old
mkdir -p ~/.vibe-log
FIVE_MINUTES_AGO=$(($(date +%s)*1000 - 400000))
echo "{\"pid\":99999,\"timestamp\":$FIVE_MINUTES_AGO,\"version\":\"0.8.0\"}" > ~/.vibe-log/update.lock

# Verify lock exists
cat ~/.vibe-log/update.lock
```

### Step 2: Trigger Update with Stale Lock (test machine)
```bash
# Run hook trigger
SIMULATE_OLD_VERSION=0.8.0 npx vibe-log-cli send --hook-trigger=sessionstart --verbose

# Expected:
# [DEBUG] Update available: ...
# [DEBUG] Acquired update lock, starting background update  (stale lock was removed)
# [DEBUG] Cleared NPX cache
```

### Step 3: Verify Stale Lock Cleanup (test machine)
```bash
# Check update log
tail -5 ~/.vibe-log/update.log

# Expected: Update completed successfully (stale lock didn't block)

# Verify new lock was created and released
ls -la ~/.vibe-log/update.lock
# Expected: Should NOT exist (released after update)
```

---

## Scenario 5: Network Failure Test

Tests graceful handling when update fails.

### Step 1: Simulate Network Failure (test machine)
```bash
# Disconnect wifi or block npm registry
# Then run:
SIMULATE_OLD_VERSION=0.8.0 npx vibe-log-cli send --hook-trigger=sessionstart --verbose

# Expected:
# [DEBUG] Acquired update lock, starting background update
# ... (session processing continues - NOT blocked by network failure)
```

### Step 2: Check Update Log (test machine)
```bash
# Check what happened
tail -10 ~/.vibe-log/update.log

# Expected:
# [timestamp] Starting background update: 0.8.0 → 0.8.3
# [timestamp] Cleared NPX cache
# [timestamp] Update failed: [network error message]
```

### Step 3: Verify Recovery (test machine)
```bash
# Reconnect network

# Run again
SIMULATE_OLD_VERSION=0.8.0 npx vibe-log-cli send --hook-trigger=sessionstart --verbose

# Expected: Update should succeed this time
tail -5 ~/.vibe-log/update.log
# Should show: "Update completed: next run will use 0.8.3"
```

---

## Success Criteria

### ✅ All Tests Should Pass:

1. **Fresh Install:**
   - [ ] NPX downloads and caches package
   - [ ] Hooks installed with correct command (no @latest)
   - [ ] First run completes without errors

2. **Update Flow:**
   - [ ] Version check detects outdated version
   - [ ] Lock acquired successfully
   - [ ] Background update completes
   - [ ] Session processing NOT blocked (continues immediately)
   - [ ] Next run uses updated version

3. **Concurrent Hooks:**
   - [ ] Only one hook acquires lock
   - [ ] Other hooks continue without blocking
   - [ ] No ENOTEMPTY errors
   - [ ] No NPX cache corruption
   - [ ] All hooks complete successfully

4. **Stale Lock Recovery:**
   - [ ] Stale locks detected (>5 minutes old)
   - [ ] Stale locks removed automatically
   - [ ] Update proceeds successfully

5. **Network Failure:**
   - [ ] Update failure logged
   - [ ] Session processing NOT affected
   - [ ] Lock released after failure
   - [ ] Retry succeeds when network restored

---

## Troubleshooting

### Issue: Lock file won't release
```bash
# Check lock file
cat ~/.vibe-log/update.lock

# Force remove if needed
rm ~/.vibe-log/update.lock
```

### Issue: NPX cache corruption
```bash
# Check for orphaned directories
ls -la ~/.npm/_npx/ | grep "^\."

# Nuclear option: clear entire cache
rm -rf ~/.npm/_npx

# Next run will re-download
npx vibe-log-cli --version
```

### Issue: Update not triggering
```bash
# Check current version
npx vibe-log-cli --version

# Check latest version on npm
npm view vibe-log-cli version

# Force check with simulated version
SIMULATE_OLD_VERSION=0.1.0 npx vibe-log-cli send --hook-trigger=sessionstart --verbose
```

### Issue: Hooks not executing
```bash
# Check hooks are installed
cat ~/.claude/settings.json | grep -A 10 "SessionStart"

# Check hook error log
tail -50 ~/.vibe-log/hooks.log

# Test hook manually
npx vibe-log-cli send --hook-trigger=sessionstart --test
```

---

## Cleanup After Testing

```bash
# Remove test data
rm -rf ~/.vibe-log
rm -rf ~/.config/vibe-log-cli

# Clear NPX cache
rm -rf ~/.npm/_npx

# Remove test scripts
rm /tmp/test-concurrent-hooks.sh
rm /tmp/hook*.log

# Unlink if you used npm link
npm unlink vibe-log-cli
```

---

## Expected Timeline

- **Scenario 1 (Fresh Install)**: ~5 minutes
- **Scenario 2 (Update Flow)**: ~3 minutes
- **Scenario 3 (Concurrent)**: ~2 minutes
- **Scenario 4 (Stale Lock)**: ~2 minutes
- **Scenario 5 (Network Failure)**: ~3 minutes

**Total**: ~15 minutes for complete test suite

---

## Reporting Results

After testing, collect:

1. **Version info:**
   ```bash
   npx vibe-log-cli --version
   node --version
   npm --version
   uname -a  # or equivalent on Windows
   ```

2. **Logs:**
   ```bash
   cat ~/.vibe-log/update.log
   tail -50 ~/.vibe-log/hooks.log
   ```

3. **Cache state:**
   ```bash
   find ~/.npm/_npx -name "vibe-log-cli" -type d -exec cat {}/package.json \; | grep version
   ```

4. **Hook configuration:**
   ```bash
   cat ~/.claude/settings.json | grep -A 10 "SessionStart"
   ```

Share these with the team for verification!
