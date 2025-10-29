# Migration Impact: Visual Architecture

## vibe-log-cli Architecture: SDK vs Settings Files

```
┌─────────────────────────────────────────────────────────────────┐
│                         vibe-log-cli                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────┐     ┌─────────────────────────────┐ │
│  │   Settings Manager    │     │    Prompt Analyzer          │ │
│  │   (hooks/statusline)  │     │    (analyze-prompt cmd)     │ │
│  ├───────────────────────┤     ├─────────────────────────────┤ │
│  │                       │     │                             │ │
│  │ • install-hooks       │     │ • analyze-prompt            │ │
│  │ • install-auto-sync   │     │ • Used by statusline hook   │ │
│  │ • statusline config   │     │                             │ │
│  │                       │     │                             │ │
│  │ NO SDK USAGE          │     │ USES SDK ← MIGRATION HERE   │ │
│  │ ✅ NOT AFFECTED       │     │ ⚡ AFFECTED                 │ │
│  └───────┬───────────────┘     └─────────┬───────────────────┘ │
│          │                               │                     │
└──────────┼───────────────────────────────┼─────────────────────┘
           │                               │
           │                               │
           ▼                               ▼
    ┌─────────────────┐          ┌──────────────────────┐
    │  File System    │          │  Claude Agent SDK    │
    │  Operations     │          │  (formerly Code SDK) │
    ├─────────────────┤          ├──────────────────────┤
    │                 │          │                      │
    │ Read/Write:     │          │ • User auth          │
    │ ~/.claude/      │          │ • API calls          │
    │ settings.json   │          │ • AI analysis        │
    │                 │          │                      │
    │ Direct JSON     │          │ Change import:       │
    │ manipulation    │          │ '@anthropic-ai/      │
    │                 │          │  claude-agent-sdk'   │
    └─────────────────┘          └──────────────────────┘
```

## What Happens When Each Feature Runs

### 1. Hooks Installation (NO SDK)

```
User Command: vibe-log install-hooks

Flow:
1. vibe-log reads ~/.claude/settings.json (fs.readFile)
2. vibe-log modifies JSON object:
   settings.hooks.PreCompact = [{
     hooks: [{ command: "vibe-log send --hook precompact" }]
   }]
3. vibe-log writes ~/.claude/settings.json (fs.writeFile)
4. Done! No SDK involved.

When Claude Code runs:
1. Claude Code reads ~/.claude/settings.json
2. Claude Code sees PreCompact hook
3. On session compact, Claude Code executes shell command:
   $ vibe-log send --hook precompact
4. vibe-log uploads session to cloud
```

### 2. Statusline Installation (NO SDK)

```
User Command: vibe-log statusline (via install menu)

Flow:
1. vibe-log reads ~/.claude/settings.json (fs.readFile)
2. vibe-log modifies JSON object:
   settings.statusLine = {
     command: "vibe-log statusline",
     type: "command"
   }
   settings.hooks.UserPromptSubmit = [{
     hooks: [{ command: "vibe-log analyze-prompt --silent --stdin" }]
   }]
3. vibe-log writes ~/.claude/settings.json (fs.writeFile)
4. Done! No SDK involved in configuration.

When Claude Code runs:
1. Claude Code reads ~/.claude/settings.json
2. Claude Code displays statusline by executing:
   $ vibe-log statusline
3. On prompt submit, Claude Code executes:
   $ vibe-log analyze-prompt --silent --stdin
4. analyze-prompt uses SDK internally (see #3)
```

### 3. Local Daily Standup (NO SDK)

```
User Command: vibe-log standup-local

Flow:
1. vibe-log discovers Claude projects in ~/.claude/projects/
2. For each project, reads .jsonl session files directly (fs.readFile)
3. Filters sessions from yesterday (date comparison)
4. Parses JSON lines to extract:
   - Tool uses (Edit, Write, Bash commands)
   - Message counts
   - Languages used
   - Duration
5. Analyzes patterns locally (no AI):
   - Files created: count Write/create_file tools
   - Files edited: count Edit/str_replace tools
   - Commands run: extract from Bash tools
   - Tests run: detect "test" in commands
6. Formats and displays summary in terminal

NO SDK INVOLVEMENT - Pure file parsing and local analysis.
```

### 4. Prompt Analysis (USES SDK ← MIGRATION)

```
User Command: vibe-log analyze-prompt

Flow:
1. vibe-log imports @anthropic-ai/claude-agent-sdk ← THIS IS THE MIGRATION
2. SDK authenticates using user's Claude Code session
3. SDK sends prompt text to Claude API:
   {
     prompt: "Analyze this: 'fix auth bug'",
     model: "haiku",
     maxTurns: 1
   }
4. Claude API returns analysis:
   {
     quality: "fair",
     score: 55,
     suggestion: "Missing context about which auth system"
   }
5. vibe-log displays result to user

NO SETTINGS FILE INVOLVEMENT - This is pure API interaction.
```

## Migration Impact Matrix

| Feature | SDK Usage | Settings File | Session Files | Migration Needed? |
|---------|-----------|---------------|---------------|-------------------|
| `install-hooks` | ❌ No | ✅ Yes | ❌ No | ❌ NO |
| `install-auto-sync` | ❌ No | ✅ Yes | ❌ No | ❌ NO |
| `statusline` config | ❌ No | ✅ Yes | ❌ No | ❌ NO |
| `standup-local` | ❌ No | ❌ No | ✅ Read | ❌ NO |
| `analyze-prompt` | ✅ YES | ❌ No | ❌ No | ✅ YES |
| `send --hook` | ❌ No | ❌ No | ❌ No | ❌ NO |
| Hook execution | ❌ No | ✅ Read | ❌ No | ❌ NO |
| Local reports | ❌ No | ❌ No | ✅ Read | ❌ NO |

## File Changes Required

```
Files to change: 2
Lines to change: 2

1. package.json (1 line)
   - "@anthropic-ai/claude-code": "^1.0.0"
   + "@anthropic-ai/claude-agent-sdk": "^1.0.0"

2. src/lib/prompt-analyzer.ts (1 line)
   - cachedSDK = await import('@anthropic-ai/claude-code');
   + cachedSDK = await import('@anthropic-ai/claude-agent-sdk');
```

## Testing Required

### ✅ Must Test (Affected)
- [ ] `vibe-log analyze-prompt` - Direct SDK usage
- [ ] Statusline hook (UserPromptSubmit) - Calls analyze-prompt internally

### ⚠️  Should Test (Not Affected, But Verify)
- [ ] `vibe-log install-hooks` - Should work unchanged
- [ ] `vibe-log install-auto-sync` - Should work unchanged
- [ ] Hook execution (PreCompact) - Should trigger sessions correctly
- [ ] Statusline display - Should show stats correctly

## Summary

**90% of vibe-log-cli does NOT use the SDK.**

Most features manipulate Claude Code's configuration files (`.claude/settings.json`), which Claude Code then reads and executes. This is simple file I/O with no SDK involvement.

**Only the prompt analysis feature uses the SDK** - and that's what we're migrating.

This is why the migration is so simple: **1 import statement, 1 package name**.
