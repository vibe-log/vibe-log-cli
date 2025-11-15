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
All files: 18.82% statements (expected - many UI/interactive files untested)
```

**High-Priority Files:**

| File | Current Coverage | Target | Priority | Status |
|------|-----------------|--------|----------|--------|
| **hooks-manager.ts** | **86.71%** | 80%+ | Critical | ✅ COMPLETE |
| **hooks-controller.ts** | **82.63%** | 80%+ | Critical | ✅ COMPLETE |
| **send-orchestrator.ts** | **40.93%** | 75%+ | Critical | 🔴 NEEDS WORK |
| api-client.ts | 68.2% | 85%+ | Important | 🟡 Future |
| detector.ts | 28.2% | 60%+ | Important | 🟡 Future |

---

## Session 2 Summary (COMPLETED)

### What Was Accomplished ✅

**Test Coverage for hooks-controller.ts**
- Extended existing test file: `src/lib/hooks/__tests__/hooks-controller.test.ts`
- Added 23 NEW tests for previously untested functions:
  - 5 tests for `installProjectHooks()` (project-level hook installation)
  - 6 tests for `removeProjectHooks()` (project-level hook removal)
  - 5 tests for `updateHookConfig()` (timeout configuration updates)
  - 4 tests for `checkForHookUpdates()` (version comparison)
  - 4 tests for `installSelectiveProjectHooks()` (granular hook control)
- **Result: 35 tests total (was 24), 82.63% coverage (was 46.23%), +36.4 percentage points**

### Coverage Achievement
- ✅ **Target Met**: 82.63% > 80% goal
- ✅ **All 35 tests passing**
- ✅ **Uncovered lines**: Only 713-714, 770-774 (edge cases, minimal impact)

### Key Test Patterns Established

1. **Project-level operations**: Tested multi-project scenarios, error handling, telemetry
2. **Configuration updates**: Tested all hook types, error cases for missing hooks
3. **Version management**: Tested current/outdated/mixed version scenarios
4. **Selective installation**: Tested granular per-project hook control

---

## Session 3 TODO: Remaining Coverage Work

### Priority 1: send-orchestrator.ts (41% → 75%+)

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

## How to Resume Work for Session 3

### Step 1: Verify Current State
```bash
cd /Users/danny/dev/vibe-log/vibe-log-cli
npm run test:coverage
```

Look for:
- hooks-manager.ts: Should be ~87% ✅
- hooks-controller.ts: Should be ~83% ✅
- send-orchestrator.ts: Should be ~41% 🔴

### Step 2: Start with send-orchestrator.ts

Read existing tests to understand patterns:
```bash
cat tests/unit/lib/orchestrators/send-orchestrator.test.ts
```

Read the actual function implementations:
```bash
# Read uncovered lines 320-425
sed -n '320,425p' src/lib/orchestrators/send-orchestrator.ts

# Read uncovered lines 428-441
sed -n '428,441p' src/lib/orchestrators/send-orchestrator.ts
```

### Step 3: Add Tests Incrementally

Create tests in batches, run coverage after each batch:
1. Add 3-4 tests for timeout scenarios
2. Run coverage: `npm run test:coverage | grep send-orchestrator`
3. Add 3-4 tests for error handling
4. Run coverage again
5. Continue until 75%+

---

## Key Learnings from Sessions 1 & 2

1. **Functions may not return what you expect**
   - `installProjectHooks()` tracks installedCount but returns void
   - Always check function signature before writing tests

2. **Mocks must match actual dependencies**
   - If function calls `discoverProjects()`, mock must export it
   - Check import statements in source file

3. **Test incrementally**
   - Don't create 25 tests at once
   - Add 5-6, run tests, verify, iterate
   - Session 2 successfully added 23 tests incrementally with 100% pass rate

4. **Use coverage to guide priorities**
   - `npm run test:coverage | grep "filename"` shows specific file coverage
   - Focus on uncovered line ranges

5. **Use optional chaining for undefined objects**
   - When testing removal operations, hooks object may be undefined
   - Use `expect(obj?.prop).toBeUndefined()` instead of `expect(obj.prop)`

---

## Success Criteria

**Session 2 Complete ✅**
- ✅ hooks-controller.ts coverage ≥ 80% (achieved 82.63%)
- ✅ All 35 tests passing
- ✅ Changes ready to commit

**Session 3 Complete When:**
- ⬜ send-orchestrator.ts coverage ≥ 75%
- ⬜ All new tests passing
- ⬜ Changes committed to git

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
