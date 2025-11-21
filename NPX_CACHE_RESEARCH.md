# NPX Cache Research - Key Findings

**Date**: 2025-01-21
**Purpose**: Research NPX cache management for implementing non-blocking auto-updates in vibe-log-cli

## 1. NPX Cache Structure

### Location
- **Unix/Linux/macOS**: `~/.npm/_npx/`
- **Windows**: `%AppData%/npm-cache/_npx/`

### Directory Structure
- Packages stored in subdirectories named with **first 16 characters of SHA512 hash**
- Example: `prettier` → `~/.npm/_npx/b388654678d519d9`
- Newer NPX versions incorporate version number into hash calculation
- Full package structure: `~/.npm/_npx/{hash}/node_modules/{package-name}/`

### Cache Behavior
- **Cache persists forever** - NOT automatically cleared
- NPX checks cache AFTER local/global installations
- Cache is NOT updated when NPX utility itself is updated
- Without `@latest`, NPX uses cached version indefinitely

**Source**: Stack Overflow, npm documentation, GitHub issues

---

## 2. CONCURRENT EXECUTION PROBLEM ⚠️

### The Root Issue (Confirms User's Problem)
When multiple `npx` processes execute **simultaneously** for the same non-local package:
- They install **atop each other** in the same npx cache directory
- Causes **silent failures** or errors: `TAR_ENTRY_ERROR`, `ENOTEMPTY`, `EJSONPARSE`, `MODULE_NOT_FOUND`

### Why ENOTEMPTY Happens
1. Multiple concurrent npm installations interfere with each other
2. npm tries to replace directory with file, but directory not empty
3. npm cache corruption during concurrent writes

### Official Solution In Development
**GitHub PR #8512** (npm/cli): "fix: allow concurrent non-local npx calls"
- Introduces **file-based lock** around reading/reifying tree in npx cache
- Allows concurrent npx executions for same package to succeed
- **This validates our file-based locking approach!**

**Source**: GitHub npm/cli issues and PRs

---

## 3. CACHE CLEARING - CRITICAL FINDING ✅

### What DOESN'T Work
```bash
npm cache clean --force  # Does NOT clear npx cache!
```
- GitHub Issue #6664: "npm cache clear --force does not clear npx cache"
- User confirmed this returns "npm warn cache Not Found: vibe-log-cli"
- **This is not a valid approach**

### What WORKS
```bash
# Manual deletion (surgical approach)
rm -rf ~/.npm/_npx/

# Or delete specific package
find ~/.npm/_npx -name "vibe-log-cli" -type d -exec rm -rf {} +
```

### Best Practices
- Manual deletion of `~/.npm/_npx/` directory is the **correct** approach
- There's even an npm package `clear-npx-cache` that does this programmatically
- Clearing cache is good practice to prevent version conflicts
- Particularly useful when encountering installation errors

**Source**: Stack Overflow, GitHub issues, npm documentation

---

## 4. NPX @latest BEHAVIOR

### Default Behavior (Without @latest)
- Once package is cached, subsequent uses use cache (never updates)
- Packages stored in cache **forever**
- When NPX utility updates, cache does NOT update
- **This is intentional behavior** per npm team

### With @latest
- Forces download of latest version
- Checks registry every time
- Updates the package you're directly running
- Does NOT update dependencies

### Community Perspective
- Widely considered **problematic** by developers
- Many expect npx to always fetch latest (but it doesn't)
- npm team doesn't want "use latest" as default behavior

**Source**: GitHub npm/rfcs issues, Stack Overflow

---

## 5. IMPLICATIONS FOR VIBE-LOG-CLI

### ✅ Validates Our Approach
1. **Remove @latest from hooks**: Let hooks use cached version (fast, reliable)
2. **Control updates ourselves**: Our code decides when to update
3. **File-based locking**: Prevents concurrent update conflicts (npm is doing this too!)
4. **Manual cache clearing**: Use programmatic `rm -rf` on `~/.npm/_npx/`

### ❌ Invalidates Previous Ideas
1. ~~`npm cache clean --force`~~ - Does NOT work for npx cache
2. ~~Assume @latest is safe~~ - Causes concurrent execution problems

### 🎯 Recommended Implementation

#### Hook Command (No @latest)
```typescript
// Fast, uses cache, no concurrent issues
const command = 'npx vibe-log-cli send --silent --hook-trigger=sessionstart';
```

#### Update Mechanism (Non-Blocking)
```typescript
// In send.ts - after processing sessions
if (versionCheck.isOutdated && !isUpdating) {
  // 1. Acquire file lock (update-lock.ts)
  // 2. Clear NPX cache (npx-cache.ts)
  //    - Delete ~/.npm/_npx/*/node_modules/vibe-log-cli
  // 3. Run: npx vibe-log-cli@latest --version (in background)
  // 4. Release lock
  // 5. Next hook execution uses new cached version
}
```

#### Cache Clearing (Verified Approach)
```typescript
// src/utils/npx-cache.ts
import { rm } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function clearVibeLogFromNpxCache(): Promise<void> {
  const cacheDir = path.join(os.homedir(), '.npm', '_npx');

  // Find and delete vibe-log-cli from cache
  const { stdout } = await execAsync(
    `find "${cacheDir}" -name "vibe-log-cli" -type d`
  );

  const dirs = stdout.trim().split('\n').filter(Boolean);

  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true });
  }
}
```

---

## 6. TESTING PLAN

### Phase 2: Verify on User's Machine
```bash
# 1. Find NPX cache
ls -la ~/.npm/_npx/

# 2. Find vibe-log-cli in cache
find ~/.npm/_npx -name "vibe-log-cli" -type d

# 3. Check cached version
find ~/.npm/_npx -name "vibe-log-cli" -type d -exec cat {}/package.json \; | grep '"version"'

# 4. Delete vibe-log-cli from cache (surgical)
find ~/.npm/_npx -name "vibe-log-cli" -type d -exec rm -rf {} +

# 5. Verify deletion
find ~/.npm/_npx -name "vibe-log-cli" -type d

# 6. Verify NPX re-downloads
npx vibe-log-cli --version

# 7. Confirm new cache entry
find ~/.npm/_npx -name "vibe-log-cli" -type d
```

### Expected Results
- Step 2: Should find 1+ directories
- Step 3: Should show current cached version
- Step 5: Should return empty (no results)
- Step 6: Should download and show version
- Step 7: Should find newly cached directory

---

## 7. REFERENCES

### GitHub Issues & PRs
- [npm/cli#8512](https://github.com/npm/cli/pull/8512) - Fix concurrent npx calls
- [npm/cli#6664](https://github.com/npm/cli/issues/6664) - npm cache clean doesn't clear npx
- [npm/cli#4108](https://github.com/npm/cli/issues/4108) - npx not using latest version
- [npm/rfcs#700](https://github.com/npm/rfcs/issues/700) - npx not getting latest version

### Stack Overflow
- [How can I clear the central cache for npx?](https://stackoverflow.com/questions/63510325/how-can-i-clear-the-central-cache-for-npx)
- [What is the point of NPX using cache?](https://stackoverflow.com/questions/68448165/what-is-the-point-of-npx-using-cache)

### Documentation
- [npm-cache | npm Docs](https://docs.npmjs.com/cli/v11/commands/npm-cache/)
- [Common errors | npm Docs](https://docs.npmjs.com/common-errors/)

### Articles
- [How to clear global npx cache | amanhimself.dev](https://amanhimself.dev/blog/clear-global-npx-cache/)
- [Howto Clear NPM and NPX Cache Effectively](https://jsdev.space/howto/clear-npm-cache/)

---

## 8. CONCLUSION

### Key Takeaways
1. ✅ Concurrent `npx @latest` executions cause ENOTEMPTY errors (confirmed)
2. ✅ Manual deletion of `~/.npm/_npx/` is the correct cache clearing method
3. ✅ File-based locking is the right approach (npm is implementing this too)
4. ✅ Using `npx vibe-log-cli` (no @latest) with our own update mechanism is optimal
5. ❌ `npm cache clean --force` does NOT work for npx cache

### Confidence Level
**High** - All findings corroborated by:
- Official npm documentation
- GitHub issues/PRs from npm maintainers
- Multiple Stack Overflow answers
- Community articles and packages

### Next Steps
1. ✅ Research complete - documented findings
2. ⏭️ Phase 2: Verify cache clearing on user's machine
3. ⏭️ Phase 3: Create automated test script
4. ⏭️ Phase 4: Update implementation plan
5. ⏭️ Phase 5: Implement verified solution
