# Changelog

All notable changes to the vibe-log-cli project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Note
- This release reconciles the pr-8-review branch with main after the v0.8.0 release was accidentally published from a PR branch. All Cursor IDE integration features from the original PR are included in v0.8.0 and v0.8.1 below.

## [0.8.1] - 2025-11-15

### Fixed
- **CRITICAL**: Fixed hooks overwrite bug that deleted users' custom Claude Code hooks during install/uninstall operations
  - Installing vibe-log hooks now appends to existing hooks array instead of replacing them
  - Uninstalling vibe-log hooks now filters out only vibe-log commands instead of deleting entire hook type
  - Added duplicate prevention to avoid multiple installations

### Improved
- Added comprehensive test coverage for hooks-controller (36 unit tests)
- Removed legacy camelCase hook format support for cleaner codebase

### Refactored
- Code cleanup and improved maintainability throughout hooks system

## [0.8.0] - 2025-11-07

### Added
- **Cursor IDE Push-Up Challenge Integration**: New hook integration for Cursor IDE's `afterAgentResponse` trigger
  - Automatically detects over-validation phrases in Cursor conversations
  - Supports both ASCII apostrophe (') and smart apostrophe (') characters
  - Modern Cursor format support with bubbleId-based message storage
  - Silent operation to avoid disrupting Cursor IDE workflow
- **Cursor IDE Session Sync**: New `cursor-upload` command for uploading Cursor conversations to vibe-log
  - Date range selection options: 7 days, 30 days, or all conversations
  - Dry-run mode (`--dry-run`) to preview sessions before upload
  - Silent mode (`--silent`) for automation and scripting
  - Extracts project names from Cursor workspace databases
  - Optional file logging for troubleshooting
- **Full Cursor IDE Integration**:
  - New "View Cursor IDE stats" menu option
  - Push-up challenge tracks validation phrases in both Claude Code AND Cursor IDE
  - Supports both legacy and modern Cursor conversation formats
  - Cross-platform support (macOS, Windows, Linux)
  - Time-based statistics: Shows stats for this week, last week, this month, this year
- Added `better-sqlite3` dependency for Cursor database access

### Changed
- **Hook Auto-Update Mechanism**: All hooks now use `npx vibe-log-cli@latest` instead of `npx vibe-log-cli`
  - Ensures users automatically get latest bug fixes and improvements
  - Applies to both Claude Code hooks and Cursor hooks

### Fixed
- Apostrophe detection for validation phrases (supports both ASCII and smart apostrophes)
- Cursor integration timestamp initialization for accurate tracking from first enable
- Cursor hook stdout logging silenced to prevent JSON parse errors
- Latest message retrieval improved for modern Cursor conversation format
- Logger file output now dynamically redirects logs after initialization

## [0.7.6] - 2025-10-31

### Added
- **Email Setup Integration**: Push-up challenge now prompts users to enable daily emails with push-up stats and coding session summaries for standups
  - Automatically triggers cloud setup wizard if user isn't authenticated
  - Default "Yes" for streamlined onboarding
  - Only appears for non-authenticated users to avoid duplicate prompts

### Fixed
- **Authentication Checks**: Push-up stats sync now only attempts when user is authenticated
  - Prevents 401 Unauthorized errors during challenge enable/disable/settle/reset operations
  - Silently skips sync for local-only users
  - All sync operations check authentication status first

### Improved
- **Privacy Notice Clarity**: Updated privacy notice text to be more positive and clear
  - Changed from "Never store" to "Your code and personal data never leaves your machine"
  - More reassuring messaging about data privacy
- **Push-Up Menu Simplification**: Streamlined push-up challenge menu display
  - Removed verbose benefit descriptions from disabled state
  - Cleaner, more focused UI
  - "The Rule" now displayed prominently in both main menu and first-time setup

## [0.7.5] - 2025-10-31

### Fixed
- Push-up challenge first-time setup now correctly transitions to main menu instead of looping back to welcome screen
- Added PUSHUP_ONLY state detection for users with only push-up challenge enabled
- Push-up challenge status section now displays even when disabled, showing installation state
- State refresh after first-time feature setup now works correctly

### Improved
- Added challenge and statusline installation status to push-up challenge section
- Push-up challenge info now shown when challenge is disabled (setup instructions)
- Cloud dashboard feature details now visible in main menu for non-authenticated users
- Centralized menu item labels to eliminate duplication across different states
- Increased main menu page size to prevent status sections from scrolling out of view
- Updated statusline description text for clarity

## [0.7.4] - 2025-10-30

### Added
- **Push-Up Challenge Integration**: New push-up challenge feature integrated into statusline
  - Tracks push-up completion during coding sessions
  - Real-time sync of push-up stats during session upload
  - Dynamic "receipt" display with better formatting and sizing

### Fixed
- **Cross-Platform Compatibility**: Replaced hardcoded /tmp paths with cross-platform temporary directory paths
  - Now properly uses OS-specific temp directories (Windows TEMP, Unix /tmp)
  - Eliminates path-related errors on Windows systems
- **Entry Point Configuration**: Added bin/vibe-log.js entry point and updated statusline order


## [0.7.3] - 2025-10-27

### Changed
- **SDK Migration**: Migrated from `@anthropic-ai/claude-code` to `@anthropic-ai/claude-agent-sdk@0.1.27`
  - Future-proof solution using Anthropic's actively maintained SDK
  - Better isolation with no interference from Claude Code settings
  - Maintains full API compatibility with no breaking changes

### Fixed
- "Today's standup" option now appears in LOCAL_ONLY menu for users who completed onboarding but didn't enable cloud mode
- Standup command properly skips authentication for local-only users
- Updated Discord invite link to correct URL

## [0.7.2] - 2025-10-02

### Fixed
- Duration calculation accuracy improved using gap-based approach
- Sessions with large time gaps between messages now accurately calculate active coding time
- Fixed issue where total duration could exceed actual session length

## [0.7.1] - 2025-10-01

### Fixed
- Test compatibility with telemetry feature
- Chalk.hex fallback for test environments

## [0.7.0] - 2025-10-01

### Added
- **Daily Standup Command**: New `standup` command to prepare for daily meetings
  - Runs locally on user's machine
  - Analyzes previous day's Claude Code sessions automatically
  - Extracts real accomplishments and features built
  - Provides business-value focused summaries
  - Includes smart suggestions for next steps
  - Anti-hallucination safeguards ensure accuracy
- **Interactive Onboarding Menu**: Enhanced first-time user experience
  - Streamlined setup flow with clear guidance
- **CLI Telemetry**: Anonymous usage tracking for authenticated users
  - Helps improve CLI based on actual usage patterns
  - Fully respects user privacy
- **Gamification Feature**: CLI now showing streak and awarded points

### Fixed
- Session filtering now correctly excludes today's sessions from standup reports
- Project name matching in standup duration calculations
- Claude Code no longer creates project folders for temp directories
- Standup command parsing with proper JSON delimiters
- Parallel session and sub-agent dependency issues resolved
- Time calculation consistency in standup reports

### Improved
- Temp directory cleanup for standup operations
- Error handling and user feedback throughout the CLI
- Configuration transmission to server for better sync

## [0.6.4] - 2025-01-14

### Added
- **SessionEnd Hook Support**: New hook type for capturing sessions when Claude Code terminates
  - Captures sessions on clear, logout, prompt_input_exit, and other termination events
  - Full integration with existing hook management system
  - Statistics tracking for SessionEnd executions
  - Available in both global and project-specific modes
  - Testing framework support with individual and batch testing

### Improved
- **Hook Management UI**: Enhanced interface to include SessionEnd configuration
  - SessionEnd appears in all hook selection menus
  - Status displays show SessionEnd installation and statistics
  - Test menu includes SessionEnd hook testing option

## [0.6.3] - 2025-09-12

### Improved
- **Message Length Capture**: Claude Code sessions now capture full message content instead of truncating at 5K characters
  - Ensures complete context preservation for analysis
  - Better analytics and insights from comprehensive session data
  - No more data loss from longer development conversations

## [0.6.2] - 2025-09-10

### Added
- **Git Branch Information**: Sessions now capture and send the current git branch name to the API
  - Automatically extracts branch from Claude Code session directory
  - Provides better context for development activity tracking
  - Enhances analytics with branch-level insights

### Improved
- **Time-Based Sync Options**: Enhanced sync menu with convenient time-range options
  - Added "Last 7 days" quick sync option
  - Added "Last 14 days" quick sync option
  - Simplified workflow for regular syncing patterns
  - Better user experience for common sync scenarios

## [0.6.1] - 2025-09-09

### Fixed
- **Hotfix**: Resolved critical issue preventing users from generating local reports in certain scenarios
  - Fixed template path resolution for NPM package distribution
  - Ensured proper access to report templates in all environments

## [0.6.0] - 2025-09-05

### Added
- **Template-Based Report Generation**: Complete replacement of direct HTML generation with JSON→Template system
  - Claude now returns only structured JSON data
  - Fixed HTML template guarantees consistent report structure
  - All sections always appear in the correct order
  - No more missing "Prompt Quality Analysis" sections
  - Clean section titles without emojis
  - Simple stats line instead of grid cards
  - Template is the single source of truth for HTML structure
- **Version Indicators**: Clear console output showing template-based system v0.6.0 is running
- **Type Safety**: Full TypeScript interfaces for report data structure

### Fixed
- **Report Consistency**: Solved all 8 formatting issues identified in previous versions
- **Section Ordering**: Executive Summary, Activity Distribution, Key Accomplishments, Prompt Quality Analysis, Project Breakdown always appear
- **Styling Issues**: CSS is now predefined in template, not dynamically generated
- **Footer Problems**: No unwanted footer elements in reports

### Changed
- **Report Generation Flow**: Claude provides data, template provides structure (separation of concerns)
- **Error Messages**: More descriptive feedback during report generation process

### Improved
- **Report Generation Output**: Tool failures are now hidden during report generation
  - "Tool failed" messages no longer shown for expected errors (file not found, etc.)
  - Cleaner, less intimidating output during analysis
  - Error messages still visible in debug mode (VIBELOG_DEBUG=1)
  - Reduces user anxiety during the 4-5 minute generation process
- **Auto-sync menu**: Simplified educational text for better clarity
  - Added shortcut command `install-auto-sync` for quick access
  - Added documentation link in the menu
  - Updated help text to show the new command

## [0.5.3] - 2025-08-31

### Fixed
- **Hook Installation**: Now correctly appends vibe-log hook to existing UserPromptSubmit hooks instead of overwriting
- **Claude Sessions**: Isolated all automated Claude sessions to dedicated temp directories to prevent project clutter
- **Session File Access**: Fixed local report generation by copying session files to temp directory accessible by Claude
- **Project Filtering**: Temp projects are now properly hidden from all project lists and menus

### Added
- **Temp Directory Management**: Centralized configuration for temp directories with single source of truth
- **Dark Theme**: Applied consistent dark theme to local report generation for better readability

### Improved
- **Project Discovery**: Unified project filtering across all features using single discoverProjects function
- **Code Organization**: Eliminated code duplication for temp directory handling

## [0.5.2] - 2025-08-31

### Improved
- **Status Line Analysis**: Transformed approach from aggressive "Ship NOW!" to thoughtful questioning with specific examples
- **Session Context Awareness**: Now detects first prompts, question/answer patterns, and image attachments
- **Smarter Suggestions**: Provides specific test cases and edge cases to consider rather than just pushing to ship
- **Promotional Tips**: Reduced frequency from 10% to 5% and disabled for first 3 messages
- **Documentation**: Enhanced README to highlight status line safety features and backup/restore capability
- **User Trust**: Added prominent messaging about automatic backup of existing status line configurations
- **Setup Flow**: Reorganized ccusage token metrics as optional step after coach personality selection

### Added
- **Session Metadata Tracking**: Rich context extraction including message position and attachments
- **Thoughtful Questioning**: Status line now asks clarifying questions with concrete examples
- **Safety Documentation**: Clear explanation that uninstalling restores original status line configuration
- **Feature Visibility**: Added backup/restore and ccusage support to feature list

## [0.5.1] - 2025-08-30

### Improved
- **Menu Labels**: Clarified status line feature as "Prompt feedback in Claude Code"
- **UI Organization**: Moved status display and learn more link to bottom of header for better flow
- **Code Quality**: Centralized menu labels to follow DRY principle
- **First-time Welcome**: Updated descriptions to accurately reflect status line functionality

### Fixed
- **Duplicate Code**: Removed redundant status display in status line menu
- **Text Accuracy**: Removed "real-time" terminology as feature analyzes after prompt submission
- **Typography**: Fixed "to for" typo in first-time welcome screen

## [0.5.0] - 2025-08-30

### Added
- **Strategic Product Advisor**: Status line now acts as a proactive co-pilot that pushes users to ship faster
- **Original Mission Tracking**: Remembers user's first message to maintain focus on original goal
- **Concrete Actionable Guidance**: Provides specific values (timeouts, error codes) and deadlines
- **Enhanced Context Extraction**: Increased conversation context from 3 to 10 turns for better analysis

### Improved
- **Gordon Personality**: Now sharp and business-focused with less food metaphors, creates urgency
- **Vibe-Log Personality**: Supportive but pushy senior dev that helps ship with concrete deadlines
- **Prompt Analysis**: More specific and action-oriented with MVP focus and "ship TODAY" mentality
- **README Documentation**: Updated to reflect strategic advisor capabilities

### Fixed
- **Context Extraction**: Handles duplicate first messages in short conversations gracefully
- **TypeScript Compilation**: Fixed potential null reference in session context extractor

## [0.4.3] - 2025-08-29

### Fixed
- **Status Line Analysis Timeout**: Fixed critical issue where prompt analysis would timeout in Claude Code
  - Implemented background processing - hook now exits in 0.3s (was timing out at 5s)
  - Added HTML comment guard (`<!--VIBE_LOG_GUARD:1-->`) for clean recursion prevention
  - Removed hardcoded fallback suggestions - SDK now returns real, contextual feedback
  - Fixed SDK prompt format to ensure proper JSON response

### Improved
- **Analysis Quality**: Status line now provides specific, actionable suggestions based on actual prompt content
- **Loading State**: Extended staleness timeout from 15s to 5 minutes for better async handling
- **Debug Logging**: Enhanced SDK response logging for easier troubleshooting
- **Status Line Display**: Now shows personality name (Gordon/Vibe-log/Custom) before suggestions for clarity

### Technical Details
- Background process spawns with `detached: true` and `child.unref()` for non-blocking execution
- Analysis completes in ~6 seconds and saves to correct session file
- Creates exactly 2 session files per prompt (user's + SDK's internal) without recursion

## [0.4.2] - 2025-08-29

### Changed
- **Renamed Sub-Agent**: `vibe-log-track-analyzer` is now `vibe-log-session-analyzer` for better clarity
- **Breaking Change**: Users need to reinstall sub-agents after this update

### Fixed
- **Report Generation Performance**: Optimized execution time back to 2-4 minutes
  - Removed unnecessary tools from report generator (Task, Bash, Grep, etc.)
  - Fixed batching strategy to properly limit parallel agents (MAX 9)
  - 17 sessions now correctly uses 2-3 agents instead of 17
- **Headless Mode Compatibility**: Restored === REPORT START/END === markers for reliable operation
- **Sub-Agent Installer UI**: 
  - Shows correct count of 2 sub-agents (not 3)
  - Removed references to deprecated logs-fetcher agent
  - Updated workflow description to reflect simplified 2-phase process

### Improved
- **Orchestrator Batching**: Enhanced batching logic with clear examples (17 sessions = 2 agents, 25 = 3 agents)
- **Report Output Method**: Reports now OUTPUT between markers instead of using Write tool
- **UI Clarity**: Added "In Parallel" to Phase 1 description in sub-agent installer

## [0.4.1] - 2025-08-28

### Added
- **Status Line in First-Time Menu**: Added "Configure prompt coach status line" option to the first-time welcome menu for improved feature discoverability during onboarding

### Improved
- **Documentation**: Updated README with latest features and improvements

## [0.4.0] - 2025-08-28

### Added
- **Real-time Status Line**: Revolutionary prompt quality analyzer that provides instant feedback in Claude Code status bar
- **AI Personality System**: Customizable AI personas (Gordon Ramsay, Bob Ross, etc.) for engaging prompt feedback
- **Context-Aware Analysis**: Multi-turn conversation context tracking for better prompt quality assessment
- **Interactive Personality Testing**: Test and preview different AI personalities before installation
- **Unified Hooks Manager**: Prevent duplicate installations and conflicts between features
- **Planning Mode Detection**: Automatically detect when Claude Code is in planning mode
- **Session-Specific Storage**: Prevent conflicts when multiple Claude sessions are active

### Improved
- **Status Line UI**: Enhanced visual feedback with progress bars and actionable tips
- **Dynamic CLI Paths**: Use configurable paths instead of hardcoded values
- **Prompt Analysis**: Context-aware quality assessment with semantic understanding
- **Installation Flow**: Streamlined status line installation with better menu integration

### Fixed
- **Recursion Prevention**: Robust guards to prevent infinite loops in SDK integration
- **File Lock Issues**: Replaced file-based locks with prompt-based recursion guards
- **Promotional Flickering**: Eliminated status line tip flickering
- **Duplicate Messages**: Removed redundant installation messages
- **Creativity Preservation**: Restored Claude's creative responses in personality system

## [0.3.21] - 2025-08-28

### Added
- **Status Line in First-Time Menu**: Added "Configure Real-time prompt coach status line" option to the first-time welcome menu for improved feature discoverability during onboarding

### Improved
- **User Onboarding**: New users can now immediately discover and configure the AI feedback personality feature during initial setup

## [0.3.20] - 2025-08-24

### Added
- **Claude Model Tracking**: Sessions now capture and track the specific Claude model being used (Opus, Sonnet, Haiku)
- **Comprehensive Unit Tests**: Added extensive test coverage for Claude model detection and session parsing

### Improved
- **Session Data**: Enhanced session metadata to include model information for better analytics
- **README Documentation**: Updated documentation with improved visuals and mermaid diagrams

### Fixed
- **Package Distribution**: Added .npmignore to optimize package size and exclude unnecessary files

## [0.3.19] - 2025-08-22

### Fixed
- GitHub Actions workflows now properly configured with permissions
- Updated artifact actions from v3 to v4 to fix deprecation warnings
- Made lint step non-blocking in npm-publish workflow
- Removed flaky npm verification job that failed due to propagation delays

### Improved
- Simplified npm-publish workflow for more reliable releases
- All workflows now passing with green badges

## [0.3.18] - 2025-08-22

### Added
- **Package Transparency**: Disabled minification for full code verifiability
- **Automated Releases**: GitHub Actions workflow for npm publishing with provenance
- **Build Verification**: Automated CI/CD verification across multiple platforms
- **SHA256 Checksums**: Automatic generation and verification of build artifacts
- **Repository Link**: Added repository field to package.json for source verification
- **Security Documentation**: Comprehensive transparency section in README
- **Release Guide**: Complete setup documentation for automated releases

### Changed
- Build output is now readable (non-minified) for security auditing
- Source maps are included in npm package for debugging
- All releases now automated via GitHub Actions for reproducibility

### Security
- Addresses community concerns about package verifiability
- Implements npm provenance for supply chain security
- Provides checksums for integrity verification

## [0.3.17] - 2025-01-22

### Improved
- Enhanced local report analysis with activity breakdown and prompt engineering insights
- Better async handling for package update checks
- Cleaner repository structure

## [0.3.16] - 2025-01-21

### Fixed
- Restored "Press Enter to continue" for help in first-time menu

## [0.3.15] - 2025-08-20

### Added
- Sub-agent installation check before local report generation
- Two-layer protection to ensure sub-agents are installed
- Automatic prompt to install missing sub-agents
- Option to continue with report generation after installation
- Clear error messages when sub-agents are missing
- Release process documentation in CLAUDE.md

### Changed
- Local report generation now validates sub-agent availability
- Improved user experience with guided installation flow

## [0.3.13] - 2024-08-20

### Added
- Centralized network error handling module (`network-errors.ts`)
- File utilities module (`file-utils.ts`) for safe file operations
- Comprehensive error type detection and categorization
- User-friendly network error messages

### Changed  
- Improved UI text clarity for cloud and local modes
- Cloud mode now explicitly states "FREE FOREVER"
- Local mode clarifies it uses "Claude Code with sub-agents"
- Updated token usage estimates from 25k-100k to 10k-50k
- Reduced time estimates from 5-15 min to 4-10 min
- Manual sync option now clearly states "upload coding sessions"
- Local report options specify "(using Claude sub-agents)"

### Fixed
- Eliminated ~150-200 lines of duplicate network error handling code
- Standardized error messages across all CLI commands
- Improved maintainability with single source of truth for errors

### Refactored
- Updated 6 files to use centralized network error utilities:
  - `commands/send.ts`
  - `commands/auth.ts` 
  - `utils/errors.ts`
  - `lib/auth/browser.ts`
  - `lib/api-client.ts`
  - `lib/ui/cloud-setup-wizard.ts`

## [0.3.12] - 2024-08-15

### Added
- Comprehensive language detection for Claude Code sessions
- Session tracking metadata improvements

## [0.3.11] - 2024-08-14

### Changed
- Performance improvements with increased batch sizes
- Enhanced session tracking metadata

### Fixed
- Various performance optimizations

## [0.3.10] - 2024-08-13

### Added
- Initial session tracking features
- Core CLI functionality

---

For older versions, please refer to the git history.