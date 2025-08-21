
#Vibe-Log 🚀 


<div align="center">

[![npm version](https://img.shields.io/npm/v/vibe-log-cli.svg)](https://www.npmjs.com/package/vibe-log-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/vibe-log/vibe-log-cli/actions/workflows/tests.yml/badge.svg)](https://github.com/vibe-log/vibe-log-cli/actions/workflows/tests.yml)
[![Node.js Version](https://img.shields.io/node/v/vibe-log-cli.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-blue.svg)](SECURITY.md)

Track your building journey with Vibelog - the CLI tool that helps developers maintain coding streaks and analyze their productivity patterns.

[Website](https://vibe-log.dev) • [Documentation](https://vibe-log.dev/docs) • [Report Bug](https://github.com/vibe-log/vibe-log-cli/issues) • [Request Feature](https://github.com/vibe-log/vibe-log-cli/issues)

</div>

## Installation

Use directly with npx (no installation required):

```bash
npx vibe-log-cli
```

## Quick Start

**Get started with the interactive menu:**
   ```bash
   npx vibe-log-cli
   ```
## Commands

### `npx vibe-log-cli`
Open the interactive menu to access all features, including authentication, sending sessions, managing hooks, and checking status.

### `npx vibe-log-cli send`
Send your coding sessions to Vibelog for analysis and streak tracking. By default, only sends sessions from the current project directory.

Options:
- `-s, --since <date>` - Only send sessions since this date
- `-d, --dry` - Show what would be sent without uploading
- `-a, --all` - Send sessions from all projects (default: current project only)

### `npx vibe-log-cli auth`
Re-authenticate with Vibelog if your token expires.

Options:
- `-t, --token <token>` - Provide authentication token manually

### `npx vibe-log-cli config`
Manage Vibelog configuration settings.

Options:
- `-l, --list` - List all configuration values
- `-s, --set <key=value>` - Set a configuration value
- `-g, --get <key>` - Get a configuration value

### `npx vibe-log-cli logout`
Clear authentication and logout from Vibelog.

### `npx vibe-log-cli privacy`
View privacy settings and understand how your data is sanitized before upload.

## Configuration

Configuration is stored in `~/.config/vibe-log/`

Configurable settings:
- `apiUrl` - Vibe-Log API endpoint

## Supported Tools

Currently supported:
- ✅ Claude Code

Coming soon:
- 🔜 Cursor
- 🔜 VS Code

## Privacy & Security

### Security Features
- **Secure Token Storage**: Authentication tokens are encrypted using AES-256-GCM with random keys
- **Input Validation**: All user inputs are validated to prevent injection attacks
- **CSRF Protection**: Browser authentication uses CSRF tokens to prevent cross-site attacks
- **Rate Limiting**: Built-in rate limiting to prevent brute force attempts
- **Path Sanitization**: File paths are sanitized to prevent directory traversal attacks
- **HTTPS Only**: All API communications are restricted to HTTPS
- **Session Security**: Cryptographically secure session IDs (256-bit)
- **Data Sanitization**: All data is sanitized before logging or transmission

### Security Best Practices
- Never share your authentication token
- Use `vibe-log logout` when switching users
- Keep the CLI updated for latest security patches
- Report security issues to security@vibe-log.dev

### Running Security Checks
```bash
# Check for vulnerabilities
npm run security-check

# Fix security issues
npm run security-fix
```

### Privacy
- **Context-Preserving Sanitization**: Messages are sanitized to remove sensitive data while preserving context
- **What gets redacted**:
  - Code blocks → `[CODE_BLOCK_1: javascript]`
  - API keys/tokens → `[CREDENTIAL_1]`
  - File paths → `[PATH_1]`
  - URLs → `[DATABASE_URL]`, `[API_URL]`
  - Emails → `[EMAIL_1]`
  - Environment variables → `[ENV_VAR_1]`
- **What's preserved**: Conversation flow, questions, explanations
- **Transparent**: Preview sanitized data with the interactive prompt
- **Project-specific**: By default, only sends data from current project
- **Open source**: Review our sanitization at [src/lib/message-sanitizer-v2.ts](src/lib/message-sanitizer-v2.ts)
- **You can verify**: Use `--dry` flag or choose "Preview" when sending

## Troubleshooting

### Authentication Issues
```bash
# Re-authenticate
npx vibe-log-cli auth

# Use manual token
npx vibe-log-cli auth --token YOUR_TOKEN
```

### No Sessions Found
- Make sure Claude Code is installed
- Check that you've used Claude Code recently
- Try specifying a date range: `npx vibe-log-cli send --since 2024-01-01`

### Debug Mode
```bash
# Enable debug logging
VIBELOG_DEBUG=1 npx vibe-log-cli send
```

## Contributing

We love your input! We want to make contributing to Vibelog CLI as easy and transparent as possible. Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Start for Contributors

```bash
# Clone the repository
git clone https://github.com/vibe-log/vibe-log-cli.git
cd vibe-log-cli

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build
```

Check out our [open issues](https://github.com/vibe-log/vibe-log-cli/issues) for a list of proposed features and known issues.

## Community

- **GitHub**: Star us on [GitHub](https://github.com/vibe-log/vibe-log-cli)
- **Issues**: Report bugs and request features in [GitHub Issues](https://github.com/vibe-log/vibe-log-cli/issues)
- **Website**: Visit [vibe-log.dev](https://vibe-log.dev)

## Support

Need help? Here are some ways to get support:

- 📖 Read the [documentation](https://vibe-log.dev/docs)
- 🐛 Report bugs in [GitHub Issues](https://github.com/vibe-log/vibe-log-cli/issues)
- 📧 Email us at support@vibe-log.dev

## License

MIT © Vibelog - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with love by the Vibelog team and our amazing contributors.
