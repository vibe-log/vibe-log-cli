# Test Coverage Improvement Plan

## Session 1 Summary (COMPLETED)

### What Was Accomplished ✅

1. **Removed Legacy Code**
   - Deleted `installVibeLogHooks()` function from `hooks-manager.ts` (70 lines)
   - Removed broken `force` parameter and misleading `--force` flag error messages
   - Updated `install-hooks.ts` to use modern `installSelectedHooks()` from `hooks-controller.ts`
   - Removed 450+ lines of legacy/duplicate code total

2. **Test Coverage for hooks-manager.ts**
   - Created new test file: `src/lib/__tests__/hooks-manager.test.ts` (254 lines)
   - Restored 9 relevant tests from deleted file:
     - 4 tests for `uninstallVibeLogHooks()` (hook preservation)
     - 3 tests for `getHookStatus()` (status detection)
     - 2 tests for `areHooksInstalled()` (boolean check)
   - Added 7 NEW tests for previously untested functions:
     - 4 tests for `validateHookCommands()` (CLI validation)
     - 3 tests for `readClaudeSettings()` (settings reading)
   - **Result: 16 tests total, 86.71% coverage, 100% of exported functions tested**

3. **Installed Coverage Tooling**
   - Installed: `@vitest/coverage-v8@3.2.4` (matches Vitest 3.2.4)
   - Added script: `"test:coverage": "vitest --coverage"` to package.json
   - Command to run: `npm run test:coverage`

4. **Updated Documentation**
   - Updated `CLAUDE.md` to reflect hooks-manager's current functionality
   - Removed references to deleted functions

### Current Coverage Status

**Overall Project:**
```
All files: 18.66% statements (expected - many UI/interactive files untested)
```

**High-Priority Files:**

| File | Current Coverage | Target | Priority | Status |
|------|-----------------|--------|----------|--------|
| **hooks-manager.ts** | **86.71%** | 80%+ | Critical | ✅ COMPLETE |
| **hooks-controller.ts** | **46.23%** | 80%+ | Critical | 🔴 NEEDS WORK |
| **send-orchestrator.ts** | **40.93%** | 75%+ | Critical | 🔴 NEEDS WORK |
| api-client.ts | 68.2% | 85%+ | Important | 🟡 Future |
| detector.ts | 28.2% | 60%+ | Important | 🟡 Future |

---

## Session 2 TODO: Remaining Coverage Work

### Priority 1: hooks-controller.ts (46% → 80%+)

**Current State:**
- Has 24 existing tests (in 2 test files)
- Uncovered lines: 517-572, 600-783
- Missing ~35-40 test cases

**Uncovered Functions (0% coverage):**

1. **`installProjectHooks()`** - Lines 600-646
   - **What it does:** Installs all 3 hooks to specific projects' local settings
   - **Return type:** `Promise<void>` (tracks installedCount/failedCount internally but doesn't return them)
   - **Tests needed:**
     - Successfully install to single project
     - Successfully install to multiple projects
     - Skip projects without `actualPath`
     - Handle fs errors (permission denied, etc.)
     - Verify telemetry called when installedCount > 0
     - Verify mode='selected' passed to installHooksToSettings

2. **`installSelectiveProjectHooks()`** - Lines 662-715
   - **What it does:** Install different hooks for different projects (granular control)
   - **Return type:** `Promise<void>`
   - **Tests needed:**
     - Different hooks for different projects (A: SessionStart, B: PreCompact, C: Both)
     - All hooks enabled for project
     - All hooks disabled for project (should skip)
     - Empty projectConfigs array

3. **`removeProjectHooks()`** - Lines 720-783
   - **What it does:** Remove vibe-log hooks from projects' local settings
   - **Return type:** `Promise<void>` (tracks removedCount/failedCount internally)
   - **Tests needed:**
     - Remove from single project
     - Remove from multiple projects
     - Preserve non-vibe-log hooks
     - Handle ENOENT gracefully (file doesn't exist)
     - Handle other fs errors
     - Delete empty hooks object after removal

4. **`updateHookConfig()`** - Lines 517-543
   - **What it does:** Update timeout configuration for installed hooks
   - **Return type:** `Promise<void>`
   - **Tests needed:**
     - Update timeout for sessionstart
     - Update timeout for precompact
     - Update timeout for sessionend
     - Error: No hooks installed
     - Error: Specific hook not installed

5. **`checkForHookUpdates()`** - Lines 548-565
   - **What it does:** Compare installed versions vs latest
   - **Return type:** `Promise<{ needsUpdate: boolean; currentVersion: string; latestVersion: string }>`
   - **Tests needed:**
     - All hooks current (needsUpdate: false)
     - All hooks outdated (needsUpdate: true)
     - Mixed versions (returns highest)
     - No hooks installed (currentVersion: '0.0.0')

**Test File Location:**
- Extend: `src/lib/hooks/__tests__/hooks-controller.test.ts`
- Already has correct mocking setup

**Mocking Pattern to Follow:**
```typescript
vi.mock('fs', () => ({
  promises: { readFile, writeFile, mkdir, stat, rename }
}));
vi.mock('../../config', () => ({ getCliPath }));
vi.mock('../../claude-core', () => ({
  getGlobalSettingsPath,
  getProjectLocalSettingsPath,
  discoverProjects  // ADD THIS!
}));
vi.mock('../../claude-settings-reader', () => ({
  readGlobalSettings, writeGlobalSettings, getHookMode, getTrackedProjects
}));
vi.mock('../../telemetry', () => ({ sendTelemetryUpdate }));
```

**IMPORTANT:** These functions return `void` - don't try to assert on return values!

---

### Priority 2: send-orchestrator.ts (41% → 75%+)

**Current State:**
- Has 10 existing tests
- Uncovered lines: 320-425, 428-441
- Missing ~10-12 test cases

**Location:** `src/lib/orchestrators/send-orchestrator.ts`

**Uncovered Code Paths:**

1. **`sendWithTimeout()` edge cases**
   - Timeout scenarios
   - Various session counts (0, 1, many)
   - Error recovery
   - Cancellation handling

2. **Error handling**
   - Network failures
   - API errors
   - Partial upload failures
   - Invalid session data

3. **Edge cases**
   - Empty session arrays
   - Large batch uploads
   - Concurrent uploads

**Test File Location:**
- Extend: `tests/unit/lib/orchestrators/send-orchestrator.test.ts`

---

## How to Resume Work

### Step 1: Verify Current State
```bash
cd /Users/danny/dev/vibe-log/vibe-log-cli
npm run test:coverage
```

Look for:
- hooks-manager.ts: Should be ~87%
- hooks-controller.ts: Should be ~46%
- send-orchestrator.ts: Should be ~41%

### Step 2: Start with hooks-controller.ts

Read existing tests to understand patterns:
```bash
cat src/lib/hooks/__tests__/hooks-controller.test.ts
```

Read the actual function implementations:
```bash
# Read lines 600-650 (installProjectHooks)
sed -n '600,650p' src/lib/hooks/hooks-controller.ts

# Read lines 720-780 (removeProjectHooks)
sed -n '720,780p' src/lib/hooks/hooks-controller.ts
```

### Step 3: Add Tests Incrementally

Create tests in batches, run coverage after each batch:
1. Add 5-6 tests for `installProjectHooks()`
2. Run coverage: `npm run test:coverage | grep hooks-controller`
3. Add 5-6 tests for `removeProjectHooks()`
4. Run coverage again
5. Continue until 80%+

### Step 4: Move to send-orchestrator.ts

Follow same pattern:
1. Read existing tests
2. Identify gaps
3. Add 3-4 tests at a time
4. Check coverage
5. Iterate until 75%+

---

## Key Learnings from Session 1

1. **Functions may not return what you expect**
   - `installProjectHooks()` tracks installedCount but returns void
   - Always check function signature before writing tests

2. **Mocks must match actual dependencies**
   - If function calls `discoverProjects()`, mock must export it
   - Check import statements in source file

3. **Test incrementally**
   - Don't create 25 tests at once
   - Add 5-6, run tests, verify, iterate

4. **Use coverage to guide priorities**
   - `npm run test:coverage | grep "filename"` shows specific file coverage
   - Focus on uncovered line ranges

---

## Success Criteria

**Session 2 Complete When:**
- ✅ hooks-controller.ts coverage ≥ 80%
- ✅ send-orchestrator.ts coverage ≥ 75%
- ✅ All new tests passing
- ✅ Changes committed to git

**Commands to Verify:**
```bash
npm run test:coverage | grep "hooks-controller\|send-orchestrator"
npm run test
```

---

## Notes & Warnings

- ⚠️ Don't amend commits already pushed to remote (per CLAUDE.md)
- ⚠️ Run `npm run build` and `npm run type-check` before committing
- ⚠️ Current branch: `hot-fix-hooks-overwrite-bug`
- ⚠️ Cannot push to main (blocked)

---

## Useful Commands

```bash
# Run tests for specific file
npm run test -- src/lib/hooks/__tests__/hooks-controller.test.ts

# Run coverage for specific file
npm run test:coverage -- src/lib/hooks/hooks-controller.ts

# Check overall coverage
npm run test:coverage | head -20

# Run all tests
npm run test

# Type check
npm run type-check

# Build
npm run build
```

---

## Contact/Reference

- PR being reviewed: https://github.com/vibe-log/vibe-log-cli/pull/10
- Focus: Hook preservation during install/uninstall operations
- Context: Removed legacy installVibeLogHooks, improved test coverage
