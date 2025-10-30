# Testing Challenge Statusline Integration

## Setup

Make sure you're in the `vibe-log-cli` directory and the latest build is ready:

```bash
cd C:\vibelog\vibe-log-cli
npm run build
```

## Test 1: Enable Challenge with Statusline Prompt

Run this command:

```bash
node bin/vibe-log.js pushup enable
```

**Expected prompts:**
1. "How many push-ups per validation phrase?" → Enter a number (e.g., 1)
2. "Install challenge statusline to track progress in Claude Code?" → Yes/No (default: Yes)

**Expected output if Yes:**
```
✅ Push-up challenge enabled with statusline!
   Rate: 1 push-up(s) per validation

💡 Debt will accumulate silently. Check with `vibe-log pushup stats`
💡 Your progress is now visible in Claude Code statusline!
```

**Expected output if No:**
```
✅ Push-up challenge enabled!
   Rate: 1 push-up(s) per validation

💡 Debt will accumulate silently. Check with `vibe-log pushup stats`
   Run `vibe-log pushup statusline install` to add statusline later
```

## Test 2: Statusline Management Menu

Run this command:

```bash
node bin/vibe-log.js pushup statusline
```

**Expected output:**

```
📊 Challenge Statusline Management:
   Current statusline: [Challenge Statusline ✅ | Prompt Analysis Statusline | Custom Statusline | No statusline installed]

What would you like to do?
❯ 📥 Install challenge statusline
  🔄 Switch from prompt analysis to challenge statusline
  🔙 Restore previous statusline
  ❌ Uninstall challenge statusline
  ⬅️  Go back
```

**Note:** Options will be disabled based on current state:
- "Install" disabled if challenge statusline already installed
- "Switch" disabled if not using prompt analysis
- "Restore" disabled if no backup exists
- "Uninstall" disabled if challenge statusline not installed

## Test 3: Help Text

Run this command:

```bash
node bin/vibe-log.js pushup --help
```

**Expected to see:**
```
Examples:
  $ vibe-log pushup enable       # Enable challenge with optional statusline
  $ vibe-log pushup stats        # View current stats
  $ vibe-log pushup summary      # Settle your push-up debt
  $ vibe-log pushup statusline   # Manage statusline display
```

## Test 4: Verify Statusline Installation

After installing via either method, check your Claude settings:

```bash
cat ~/.claude/settings.json | grep -A 3 statusLine
```

**Expected output:**
```json
"statusLine": {
  "type": "command",
  "command": "npx vibe-log-cli statusline-challenge",
  "padding": 0
}
```

## Test 5: Test Statusline Output

Run the statusline command directly:

```bash
node bin/vibe-log.js statusline-challenge
```

**Expected output (if challenge enabled):**
```
💪 Push-Up Challenge | Total Debt: X | Total Done: Y
```

Or with more stats:
```
💪 Push-Up Challenge | Done Today: 5 | Total Debt: 20 | Total Done: 100 | 🔥 3 day streak
```

## Troubleshooting

If you don't see the prompts:

1. **Make sure you disabled the challenge first:**
   ```bash
   node bin/vibe-log.js pushup disable
   ```

2. **Then enable again:**
   ```bash
   node bin/vibe-log.js pushup enable
   ```

3. **Check if challenge is already enabled:**
   ```bash
   node bin/vibe-log.js pushup stats
   ```
   If it shows "Status: ✅ Active", disable it first.

4. **Verify the build is up to date:**
   ```bash
   npm run build
   # Should complete without errors
   ```

5. **Check the built code includes the new features:**
   ```bash
   grep "Install challenge statusline" dist/index.js
   # Should show: message: "Install challenge statusline to track progress in Claude Code?",
   ```
