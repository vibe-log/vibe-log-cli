# Changelog

All notable changes to the vibe-log-cli project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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