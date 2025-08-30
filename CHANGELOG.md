# Changelog

All notable changes to the vibe-log-cli project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Status Line in First-Time Menu**: Added "Configure Real-time prompt coach status line" option to the first-time welcome menu for improved feature discoverability during onboarding

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