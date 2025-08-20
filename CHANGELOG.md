# Changelog

All notable changes to the vibe-log-cli project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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