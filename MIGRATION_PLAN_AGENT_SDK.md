# Migration Plan: Claude Code SDK → Claude Agent SDK

## Executive Summary

**Migration Type:** Package rename with minimal code changes
**Impact Level:** Low - Only imports and package.json need updates
**Authentication:** User account authentication (non-API) remains unchanged
**Estimated Time:** 1-2 hours
**Risk Level:** Low

## 🎯 Quick Answer: What's Affected?

### ✅ NOT Affected (Zero Changes Needed)
- ❌ **Hooks** - Uses direct file I/O to `.claude/settings.json`
- ❌ **Statusline** - Writes to settings file, not SDK
- ❌ **Auto-sync** - Just a UI wrapper for hooks
- ❌ **Local Daily Standup** (`standup-local` command) - Reads session files directly, no SDK
- ❌ **Local Reports** - File parsing only, no SDK
- ❌ **Claude Settings Management** - Direct JSON operations

### ⚡ Affected (1 Line of Code)
- ✅ **Prompt Analysis** (`analyze-prompt` command) - Uses SDK for AI analysis
- ✅ **File:** `prompt-analyzer.ts` line 64
- ✅ **Change:** `@anthropic-ai/claude-code` → `@anthropic-ai/claude-agent-sdk`

**TL;DR:** Only the `analyze-prompt` command uses the SDK. Hooks, statusline, and auto-sync manipulate settings files directly and need NO changes.

---

## Overview

Anthropic has renamed the Claude Code SDK to the Claude Agent SDK to reflect its broader capabilities. This is primarily a **rebranding and package rename** - the API remains largely compatible, but with one important breaking change regarding filesystem settings.

### Key Changes

1. **Package Name Change**
   - Old: `@anthropic-ai/claude-code`
   - New: `@anthropic-ai/claude-agent-sdk`

2. **Breaking Change: Filesystem Settings**
   - The SDK no longer automatically reads from filesystem settings (CLAUDE.md, settings.json, slash commands)
   - This is **BENEFICIAL for vibe-log-cli** since we don't want Claude Code's CLI-focused instructions interfering with our prompt analysis

3. **Authentication Method**
   - ✅ **No changes required** - User account authentication continues to work
   - The SDK still respects Claude Code user sessions
   - No need to switch to API keys

---

## Current Usage Analysis

### ✅ What's NOT Affected (Zero Impact)

The following features **DO NOT** use the Claude Code SDK and require **NO changes**:

1. **Hooks System** ([hooks-manager.ts](c:\vibelog\vibe-log-cli\src\lib\hooks-manager.ts))
   - Hooks manipulate `.claude/settings.json` directly via file I/O
   - No SDK dependency - just JSON read/write operations
   - PreCompact and SessionStart hooks work via Claude Code's hook system

2. **Status Line** ([status-line-manager.ts](c:\vibelog\vibe-log-cli\src\lib\status-line-manager.ts))
   - Writes commands to `.claude/settings.json` (statusLine field)
   - Uses file-based configuration, not SDK
   - Display updates are handled by Claude Code reading the JSON

3. **Auto-Sync** ([install-auto-sync.ts](c:\vibelog\vibe-log-cli\src\commands\install-auto-sync.ts))
   - Just a UI wrapper for hooks management menu
   - No SDK usage - delegates to hooks-manager

4. **Local Daily Standup** ([standup-local.ts](c:\vibelog\vibe-log-cli\src\commands\standup-local.ts))
   - Reads Claude session files (`.jsonl`) directly from `~/.claude/projects/`
   - Analyzes messages, tool uses, and metadata
   - Pure file parsing - no AI or SDK calls
   - Extracts accomplishments from session data locally

5. **Local Reports** ([local-report.ts](c:\vibelog\vibe-log-cli\src\lib\reports\local-report.ts))
   - Similar to standup - reads session files directly
   - No SDK dependency

6. **Claude Settings Management**
   - All settings manipulation is direct JSON file operations
   - Reads/writes to `~/.claude/settings.json`
   - No SDK involvement

**Summary:** Hooks, statusline, and auto-sync are **completely independent** of the SDK. They work by:
- Writing JSON configuration to `.claude/settings.json`
- Claude Code reads this configuration file
- Claude Code executes the hooks/commands
- No API or SDK layer involved

### Files Using Claude Code SDK (Only 1!)

1. **[prompt-analyzer.ts:64](c:\vibelog\vibe-log-cli\src\lib\prompt-analyzer.ts#L64)** ← ONLY FILE AFFECTED
   ```typescript
   cachedSDK = await import('@anthropic-ai/claude-code');
   ```
   - Dynamic import for caching
   - Uses `query()` function for prompt analysis
   - **This is the ONLY file that uses the SDK**

2. **[package.json:61](c:\vibelog\vibe-log-cli\package.json#L61)**
   ```json
   "@anthropic-ai/claude-code": "^1.0.0"
   ```
   - Dependency declaration

### How SDK is Used

The vibe-log-cli uses the Claude Code SDK **ONLY** for **prompt quality analysis**:

```typescript
const { query } = await import('@anthropic-ai/claude-code');

for await (const message of query({
  prompt: analysisPrompt,
  options: {
    maxTurns: 1,
    model: 'haiku',
    disallowedTools: ['*'],
    cwd: tempAnalysisDir
  }
})) {
  // Process streaming response
}
```

**Key Usage Characteristics:**
- Uses streaming `query()` function
- Leverages user's Claude Code account (not API)
- Single-turn interactions with no tools
- Model selection (haiku/sonnet)
- Custom working directory for isolation

---

## Migration Steps

### Phase 1: Preparation (5 minutes)

#### 1.1 Backup Current State
```bash
# Create a migration branch
cd c:\vibelog\vibe-log-cli
git checkout -b feat/migrate-to-agent-sdk
git status
```

#### 1.2 Document Current Version
```bash
# Record current SDK version
npm list @anthropic-ai/claude-code
```

### Phase 2: Package Updates (10 minutes)

#### 2.1 Update package.json

**File:** `c:\vibelog\vibe-log-cli\package.json`

**Change:**
```json
// OLD (line 61)
"@anthropic-ai/claude-code": "^1.0.0"

// NEW
"@anthropic-ai/claude-agent-sdk": "^1.0.0"
```

#### 2.2 Install New Package
```bash
# Remove old package
npm uninstall @anthropic-ai/claude-code

# Install new package
npm install @anthropic-ai/claude-agent-sdk

# Verify installation
npm list @anthropic-ai/claude-agent-sdk
```

### Phase 3: Code Updates (15 minutes)

#### 3.1 Update prompt-analyzer.ts

**File:** `c:\vibelog\vibe-log-cli\src\lib\prompt-analyzer.ts`

**Line 64 - Update import:**
```typescript
// OLD
cachedSDK = await import('@anthropic-ai/claude-code');

// NEW
cachedSDK = await import('@anthropic-ai/claude-agent-sdk');
```

**No other code changes required!** The `query()` API remains the same.

#### 3.2 Verify No Other Usages
```bash
# Search for any other imports (should only find package.json and package-lock.json)
grep -r "@anthropic-ai/claude-code" src/
```

### Phase 4: Testing (30 minutes)

#### 4.1 Type Checking
```bash
npm run type-check
```

**Expected Result:** No TypeScript errors

#### 4.2 Build Test
```bash
npm run build
```

**Expected Result:** Clean build with no errors

#### 4.3 Unit Tests
```bash
npm test
```

**Focus on:** Tests involving prompt analysis functionality

#### 4.4 Manual Functionality Test

**Test the analyze-prompt command:**
```bash
# Test basic prompt analysis
npm run dev
./dist/vibe-log.js analyze-prompt

# Enter test prompt: "fix the bug in auth.ts"
# Verify analysis response is generated
```

**Test with hooks (if configured):**
```bash
# In a Claude Code project with vibe-log hooks enabled
# Send a message to Claude Code
# Verify prompt analysis appears in status line
```

#### 4.5 Integration Test - Full Workflow

1. **Setup Test Environment:**
   ```bash
   cd /tmp/test-vibe-log
   npm install -g c:\vibelog\vibe-log-cli
   ```

2. **Test Prompt Analysis:**
   ```bash
   vibe-log analyze-prompt
   # Enter: "Add dark mode to the dashboard"
   # Verify: Analysis completes successfully
   ```

3. **Test with Real Claude Session:**
   - Open Claude Code
   - Start a new session
   - Send a message
   - Check if vibe-log hooks trigger correctly

### Phase 5: Validation (10 minutes)

#### 5.1 Verify Authentication Still Works
- SDK should still use user's Claude Code account
- No API key prompts should appear
- Analysis should work as before

#### 5.2 Check Performance
- Compare analysis speed before/after
- Should be similar or faster

#### 5.3 Verify Filesystem Settings Isolation
- The SDK should NOT read CLAUDE.md or settings.json
- This is a **feature**, not a bug
- Our custom prompts should work independently

---

## Breaking Change: Filesystem Settings

### What Changed?

The Agent SDK no longer automatically reads:
- `.claude/settings.json`
- `CLAUDE.md` files
- Slash commands
- Other Claude Code configurations

### Impact on vibe-log-cli: POSITIVE ✅

This change is **beneficial** for our use case:

1. **Better Isolation:** Our prompt analysis runs in temp directories and doesn't need Claude Code's settings
2. **Cleaner Behavior:** No risk of user's CLAUDE.md interfering with analysis prompts
3. **Predictable Results:** Analysis behavior is consistent regardless of user's Claude Code configuration

### No Action Required

We already use custom prompts and don't rely on filesystem settings, so this breaking change doesn't affect us.

---

## Testing Checklist

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes all tests
- [ ] `analyze-prompt` command works
- [ ] Prompt analysis generates valid JSON responses
- [ ] User authentication works (no API key prompts)
- [ ] Hooks integration works (if applicable)
- [ ] Analysis speed is acceptable
- [ ] No console errors or warnings
- [ ] Package installation works on fresh clone

---

## Rollback Plan

If issues arise, rollback is simple:

```bash
# Revert package changes
npm uninstall @anthropic-ai/claude-agent-sdk
npm install @anthropic-ai/claude-code@^1.0.0

# Revert code changes
git checkout HEAD -- src/lib/prompt-analyzer.ts package.json

# Rebuild
npm run build
```

---

## Post-Migration Tasks

### 1. Update Documentation

**Files to update:**
- `README.md` - Mention Agent SDK usage
- `package.json` - Update description if needed
- Release notes for next version

### 2. Version Bump

Recommend: **Minor version bump** (e.g., 0.7.2 → 0.7.3)

**Rationale:** Dependency change warrants minor version bump

### 3. Changelog Entry

```markdown
## [0.8.0] - 2025-01-XX

### Changed
- Migrated from Claude Code SDK to Claude Agent SDK
- Updated prompt analysis to use @anthropic-ai/claude-agent-sdk
- No breaking changes to CLI functionality

### Technical
- Removed dependency: @anthropic-ai/claude-code
- Added dependency: @anthropic-ai/claude-agent-sdk@^1.0.0
```

### 4. Communication

**Internal team:**
- Migration is transparent to end users
- No changes to CLI commands or behavior
- Authentication method unchanged

**End users:**
- No action required
- Update via `npm install -g vibe-log-cli@latest`

---

## Risk Assessment

### Low Risk ✅

1. **Minimal Code Changes:** Only 1 line of code to change
2. **API Compatibility:** `query()` function signature unchanged
3. **Authentication Preserved:** User account auth still works
4. **No User Impact:** Transparent to CLI users
5. **Easy Rollback:** Simple revert if needed

### Potential Issues & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Import fails | Low | High | Test imports in isolated environment first |
| API changes | Low | Medium | Review SDK changelog before migration |
| Auth breaks | Very Low | High | Test with real Claude Code session |
| Performance regression | Low | Low | Benchmark before/after |

---

## Success Criteria

Migration is successful when:

1. ✅ All TypeScript types resolve correctly
2. ✅ Build completes without errors
3. ✅ All tests pass
4. ✅ `analyze-prompt` command works
5. ✅ User authentication works (no API prompts)
6. ✅ Analysis speed is acceptable (< 3s for typical prompt)
7. ✅ No console errors or warnings
8. ✅ Hooks integration works (if configured)

---

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Preparation | 5 min | Backup and branch creation |
| Package Updates | 10 min | npm install/uninstall |
| Code Updates | 15 min | Update imports |
| Testing | 30 min | Comprehensive testing |
| Validation | 10 min | Final checks |
| **Total** | **70 min** | End-to-end migration |

---

## Implementation Commands Summary

```bash
# 1. Create migration branch
git checkout -b feat/migrate-to-agent-sdk

# 2. Update dependencies
npm uninstall @anthropic-ai/claude-code
npm install @anthropic-ai/claude-agent-sdk

# 3. Update import in prompt-analyzer.ts (line 64)
# Change: '@anthropic-ai/claude-code' → '@anthropic-ai/claude-agent-sdk'

# 4. Test
npm run type-check
npm run build
npm test

# 5. Manual testing
npm run dev
# Test analyze-prompt command

# 6. Commit
git add package.json package-lock.json src/lib/prompt-analyzer.ts
git commit -m "feat: Migrate from Claude Code SDK to Claude Agent SDK

- Updated dependency from @anthropic-ai/claude-code to @anthropic-ai/claude-agent-sdk
- Updated import in prompt-analyzer.ts
- No breaking changes to CLI functionality
- User authentication method unchanged"

# 7. Push and create PR
git push origin feat/migrate-to-agent-sdk
```

---

## References

- [Official Migration Guide](https://docs.claude.com/en/docs/claude-code/sdk/migration-guide)
- [Claude Agent SDK Repository](https://github.com/anthropics/claude-agent-sdk-typescript)
- [vibe-log-cli Current Usage](c:\vibelog\vibe-log-cli\src\lib\prompt-analyzer.ts#L64)

---

## Notes

### Why This Migration is Simple

1. **API Compatibility:** The `query()` function API is unchanged
2. **Minimal Surface Area:** Only 1 file uses the SDK
3. **No Configuration Changes:** We don't use filesystem settings
4. **User Auth Preserved:** Authentication method unchanged

### Why This Migration is Beneficial

1. **Future-Proof:** Agent SDK is the actively maintained version
2. **Better Isolation:** No interference from Claude Code settings
3. **Broader Capabilities:** Agent SDK supports more use cases
4. **Official Support:** Anthropic's recommended SDK going forward

### Key Insight: User Account vs API

**vibe-log-cli uses USER ACCOUNT authentication:**
- ✅ Works with user's existing Claude Code login
- ✅ No API keys required
- ✅ Respects user's subscription tier
- ✅ Seamless integration with Claude Code

This authentication method is **preserved** in the Agent SDK, so our users don't need to do anything differently.

### Architecture Clarification: SDK vs Settings Files

**Two Independent Systems:**

1. **Claude Code SDK** (what we're migrating)
   - Used ONLY for: `analyze-prompt` command (AI-powered prompt quality analysis)
   - Authentication: User's Claude Code account
   - API calls: Sends prompts to Claude for analysis
   - Files affected: `prompt-analyzer.ts` only

2. **Claude Settings Files** (NOT affected by migration)
   - Used for: Hooks, statusline, auto-sync configuration
   - Mechanism: Direct JSON file read/write to `~/.claude/settings.json`
   - Claude Code reads these files and executes the configured commands
   - No SDK involvement whatsoever

**Example Hook Flow (No SDK):**
```
1. User runs: vibe-log install-hooks
2. vibe-log writes to: ~/.claude/settings.json
   {
     "hooks": {
       "PreCompact": [{
         "hooks": [{ "command": "vibe-log send --hook precompact" }]
       }]
     }
   }
3. Claude Code reads settings.json
4. Claude Code executes: vibe-log send --hook precompact
5. No SDK involved - just shell command execution
```

**Example Prompt Analysis Flow (Uses SDK):**
```
1. User runs: vibe-log analyze-prompt
2. vibe-log imports: @anthropic-ai/claude-agent-sdk ← THIS is what we're migrating
3. SDK authenticates using user's Claude Code session
4. SDK calls Claude API to analyze prompt quality
5. Returns AI analysis to user
```

---

*Migration plan created: 2025-01-27*
*vibe-log-cli version: 0.7.2*
*Target SDK: @anthropic-ai/claude-agent-sdk@^1.0.0*
