# Claude Code - vibe-log CLI Development Notes

## Project Architecture Overview

vibelog-cli is a TypeScript-based CLI application designed to track and analyze developer productivity sessions from Claude Code. It's distributed as an NPX package for cross-platform compatibility.

### Key Technologies
- **TypeScript 5.3+** - Type-safe development
- **Commander.js** - CLI command parsing and routing
- **Inquirer.js** - Interactive terminal UI components
- **Axios** - HTTP client for API communication
- **Better-SQLite3** - Fast SQLite database access for Cursor IDE integration
- **Chalk** - Terminal string styling
- **Ora** - Elegant terminal spinners
- **Conf** - Encrypted configuration storage
- **EventSource Polyfill** - SSE client for real-time auth
- **Vitest** - Modern testing framework
- **tsup** - Zero-config TypeScript bundler

## Core Directory Structure

```
vibelog-cli/
├── bin/              # NPX entry point
├── dist/             # Compiled JavaScript output
├── src/
│   ├── commands/     # CLI command implementations
│   ├── lib/          # Core business logic
│   │   ├── api-client.ts        # Secure API communication
│   │   ├── auth/                # Authentication modules
│   │   ├── readers/             # Session data readers
│   │   ├── sub-agents/          # Claude Code sub-agent management
│   │   └── ui/                  # Terminal UI components
│   ├── types/        # TypeScript type definitions
│   └── utils/        # Helper utilities
└── tests/            # Comprehensive test suite
```

## Main Components

### Command Layer (`/src/commands/`)
Each command is a standalone module that handles specific CLI operations:

- **`init.ts`** - First-time setup and authentication flow
- **`send.ts`** - Upload session data to Vibelog API (supports silent mode for hooks)
  - **IMPORTANT**: Always use `sendWithTimeout({ selectedSessions })` when uploading pre-selected sessions
  - Never call `apiClient.uploadSessions()` directly - the send command handles all session processing
  - The `selectedSessions` parameter expects `SelectedSessionInfo[]` from session-selector
- **`status.ts`** - Display user streak, points, and statistics (includes Cursor IDE stats)
- **`cursor-stats.ts`** - Display dedicated Cursor IDE statistics view with push-up tracking integration
- **`auth.ts`** - Re-authentication for expired/invalid tokens
  - Supports `wizardMode` parameter to suppress menu-related messages during guided flows
- **`config.ts`** - Manage CLI configuration settings
- **`logout.ts`** - Clear stored authentication credentials
- **`install-hooks.ts`** - Legacy hook installation (redirects to hooks-manage)
- **`hooks-log.ts`** - View and manage hook execution logs
- **`hooks-manage.ts`** - Comprehensive hooks management interface
- **`verify-hooks.ts`** - Verify hook installation and configuration
- **`pushup-challenge.ts`** - Push-up challenge gamification system
  - Tracks validation phrases in Claude Code responses
  - Adds push-ups to debt for over-validation patterns
  - Automatically scans Cursor IDE messages for same validation phrases when enabled
  - Subcommands: `enable`, `disable`, `stats`, `summary`, `statusline`

### Core Libraries (`/src/lib/`)

#### API & Authentication
- **`api-client.ts`** - Centralized API client with:
  - Request rate limiting (60 req/min)
  - Automatic retry logic with exponential backoff
  - Request ID tracking for debugging
  - Secure token management
  - Session upload with privacy preservation

- **`auth/browser.ts`** - Browser-based OAuth flow:
  - Opens browser for authentication
  - Uses SSE for real-time auth status
  - Secure token exchange

- **`auth/sse-client.ts`** - Server-sent events client:
  - Real-time authentication monitoring
  - Automatic reconnection handling
  - Event parsing and error handling

#### Configuration & State
- **`config.ts`** - Encrypted configuration management:
  - AES-256-GCM encryption for sensitive data
  - Cross-platform config storage
  - Schema validation
  - Secure key generation and storage

- **`detector.ts`** - Setup state detection:
  - Detects installation state (FIRST_TIME, LOCAL_ONLY, CLOUD_AUTO, etc.)
  - Checks for sub-agents, hooks, and authentication
  - Provides detailed state information for UI

#### Data Processing
- **`message-sanitizer-v2.ts`** - Privacy-preserving sanitization:
  - Redacts sensitive information (credentials, paths, URLs)
  - Preserves semantic meaning for analysis
  - Consistent entity naming across sessions
  - Tracks redaction metadata

- **`readers/claude.ts`** - Claude Code session parser:
  - Reads JSONL session files from `~/.claude/projects/`
  - Extracts messages, timestamps, and metadata
  - Filters by date and project
  - Handles encoded project directory names

- **`readers/cursor.ts`** - Cursor IDE message counter:
  - Reads from Cursor's SQLite database (`state.vscdb`)
  - Supports both legacy and modern conversation formats
  - Counts total messages, user messages, and assistant messages
  - Cross-platform support (macOS, Windows, Linux)
  - Used in status command to show Cursor IDE statistics

#### Claude Code Integration
- **`sub-agents/manager.ts`** - Sub-agent lifecycle management:
  - Install/uninstall sub-agents to `~/.claude/agents/`
  - Check installation status
  - Batch installation support
  - Progress tracking

- **`sub-agents/templates.ts`** - Sub-agent configurations:
  - Defines 8 specialized vibe-log sub-agents
  - Each agent has specific analysis capabilities
  - Coordinated for comprehensive reporting

#### Hook System

##### Core Hook Management (`/src/lib/hooks/`)
- **`hooks-controller.ts`** - Selective hook management:
  - Install/configure individual hooks (SessionStart, PreCompact)
  - Version tracking and update detection (v2.0.0+)
  - Enable/disable hooks without uninstalling
  - Configuration options (timeout, debug mode, CLI path)

- **`hooks-stats.ts`** - Execution statistics:
  - Track hook execution counts and success rates
  - Calculate average execution times
  - Per-project statistics tracking
  - Store metrics in `~/.vibe-log/hooks-stats.json`

- **`hooks-tester.ts`** - Hook testing framework:
  - Test individual hooks in isolation
  - Dry-run validation with `--test` flag
  - Step-by-step execution validation
  - Real-time test output display

##### Hook Utilities
- **`hook-utils.ts`** - Hook execution utilities:
  - Timeout management for hook operations
  - Error logging to `~/.vibe-log/hooks.log`
  - Graceful failure handling

- **`hook-lock.ts`** - Concurrency control:
  - File-based locking mechanism
  - Prevents concurrent hook executions
  - Automatic lock cleanup
  - Stale lock detection (5-minute timeout)

- **`hook-sync.ts`** - Sync state management:
  - Tracks last sync timestamps per hook type
  - Prevents duplicate uploads
  - Manages manual vs automatic sync

- **`hooks-manager.ts`** - Legacy hook management:
  - Basic install/uninstall functionality
  - Settings.json manipulation
  - Path validation

### UI Components (`/src/lib/ui/`)

- **`main-menu.ts`** - Interactive menu system:
  - State-aware menu options
  - Dynamic action routing
  - Cross-platform terminal compatibility

- **`hooks-menu.ts`** - Hooks management interface:
  - Comprehensive hooks management submenu
  - Status overview with statistics
  - Configuration interface with checkboxes
  - Test results display
  - Uninstall confirmation dialogs

- **`hooks-status.ts`** - Detailed status display:
  - Hook installation status per type
  - Execution statistics visualization
  - Version information and updates
  - Top projects by execution count

- **`sub-agents-installer.ts`** - Sub-agent installation UI:
  - Educational explanations about sub-agents
  - Progress visualization
  - Batch installation with real-time updates

- **`styles.ts`** - Terminal styling utilities:
  - Consistent color scheme
  - Box drawing characters
  - Icons and formatting helpers
  - Cross-platform terminal support

- **`progress.ts`** - Progress indicators:
  - Spinners for async operations
  - Progress bars for batch operations
  - Status messages with icons

## Key Technical Features

### Security & Privacy
1. **End-to-end encryption** for stored tokens
2. **Message sanitization** removes sensitive data before upload
3. **Secure random** operations for cryptographic functions
4. **No raw message content** sent to servers
5. **Local-first** approach with optional cloud sync

### Cross-Platform Support
- Works on macOS and Windows (primary Claude Code platforms)
- Platform-specific path handling
- Terminal compatibility layer
- NPX distribution for easy installation

### Hook Integration

#### Comprehensive Management System
- **Selective Installation** - Choose SessionStart, PreCompact, or both hooks
- **Project-Level Control** - Configure hooks per project with automatic cleanup
- **Configuration Options** - Timeout (10-60s), debug mode, custom CLI path
- **Testing Framework** - Validate hooks with `--test` flag before deployment
- **Statistics Tracking** - Monitor success rates, execution times, per-project metrics
- **Version Management** - Track hook versions and detect updates (v2.0.0+)

#### Hook Tracking Modes & Source of Truth
- **Global Mode**: Hooks installed in `~/.claude/settings.json` apply to all projects
- **Selected Mode**: Hooks installed in project-specific `.claude/settings.local.json`
- **Automatic Cleanup**: When projects are deselected, hooks are removed from their local settings
- **Settings Precedence** (highest to lowest):
  1. Enterprise managed settings
  2. Project local settings (`.claude/settings.local.json`)
  3. Project shared settings (`.claude/settings.json`)
  4. Global settings (`~/.claude/settings.json`)

#### Execution Features
- **SessionStart Hook** - Captures previous sessions when starting/resuming work
- **PreCompact Hook** - Captures full sessions before context compression
- Silent mode for unobtrusive operation
- Lock mechanism prevents race conditions
- Comprehensive error logging to `~/.vibe-log/hooks.log`
- Graceful failure without disrupting workflow
- Test mode for validation without data processing

#### Hook Trigger Points
- **SessionStart**: Triggers on `startup`, `resume`, and `clear` events
- **PreCompact**: Triggers before context compression (manual or automatic)
- Both hooks ensure complete session capture without redundancy

### State Management
- Detects setup completion status
- Guides users through setup flow
- Handles partial installations gracefully
- Provides clear error messages

## Development Guidelines

### CLI Commands
```bash
# Main interactive menu
npx vibe-log-cli

# Send command with test mode
npx vibe-log-cl send --test       # Test mode for hook validation
```

### Build Process
```bash
npm run build     # TypeScript compilation + bundling
npm run dev       # Watch mode for development
npm run type-check # Type checking without build
npm run test      # Run test suite
npm run lint      # ESLint checking
```

### Testing Requirements
- Unit tests for core logic
- Integration tests for commands
- E2E tests for critical flows
- Security-focused test cases
- Cross-platform compatibility tests

### Important Notes
1. **No backward compatibility required** - Product hasn't launched yet
2. **Cross-platform priority** - Must work on macOS and Windows
3. **NPX distribution** - Package must be executable via `npx vibe-log`
4. **Manual testing** - Don't run `node vibe-log.js` directly; use proper CLI commands
5. **Type safety** - Always run `npm run build` to catch type errors

## Release Process

### How to Release a New Version

1. **Update CHANGELOG.md**
   ```bash
   # Add release notes with version number, date, and changes
   # Follow the existing format in CHANGELOG.md
   ```

2. **Bump Version**
   ```bash
   # For patch release (bug fixes): 0.3.14 -> 0.3.15
   npm version patch
   
   # For minor release (new features): 0.3.14 -> 0.4.0
   npm version minor
   
   # For major release (breaking changes): 0.3.14 -> 1.0.0
   npm version major
   ```

3. **Build and Test**
   ```bash
   npm run build
   npm run test
   npm run check-all  # Runs lint, typecheck, test, and security audit
   ```

4. **Publish to NPM**
   ```bash
   npm publish
   ```

5. **Push Changes**
   ```bash
   git push origin main --tags
   ```

### Release Checklist
- [ ] CHANGELOG.md updated with release notes
- [ ] Version bumped appropriately (patch/minor/major)
- [ ] All tests passing (`npm run test`)
- [ ] Build successful (`npm run build`)
- [ ] Linting passed (`npm run lint`)
- [ ] Type checking passed (`npm run type-check`)
- [ ] Package published to npm
- [ ] Git tags pushed to repository

### Version Guidelines
- **Patch (0.0.x)**: Bug fixes, small improvements, documentation updates
- **Minor (0.x.0)**: New features, non-breaking changes
- **Major (x.0.0)**: Breaking changes, major refactors (not used pre-1.0.0)

---

# Claude Code - vibe-log CLI Development Notes

## Project Tracking Architecture

### How We Track Projects
1. **Tracking ID**: We use the Claude folder path as the stable tracking identifier
   - Example: `~/.claude/projects/-Users-username-projects-my-app`
   - This path never changes and is used for storing selected projects in config

2. **Display Name**: We read the `cwd` field from JSONL session files
   - Each session line contains: `{ "cwd": "/Users/username/projects/my-app", ... }`
   - We extract the last segment as the project name: `my-app`
   - This gives us the accurate project name without complex parsing

3. **Hook Installation Strategy**:
   - **Global hooks**: Written to `~/.claude/settings.json` for all projects
   - **Per-project hooks**: Written to each project's `.claude/settings.local.json`
   - **Deselection cleanup**: Automatically removes hooks from deselected projects
   - **Source of truth**: The settings files themselves determine which projects have hooks

4. **Important**: 
   - **Never track by actual path** - The cwd could theoretically vary
   - **Always track by Claude folder path** - This is the stable reference
   - **Display using cwd's last segment** - This gives accurate project names
   - **Settings files are the source of truth** - No separate tracking config needed

### Examples of Claude Code Directory Names
```
-Users-username-projects-my-app              -> Display: "my-app"
-Users-username                               -> Display: "username"  
-Users-username-dev-web-project-v2           -> Display: "project"
```


### Testing
To see actual Claude project directories:
```bash
ls ~/.claude/projects | head -20
```

### TypeScript and Build
- Always run `npm run build` which now includes type checking
- Type checking prevents runtime errors and ensures consistency
- Test files are excluded from build but not from type checking
 