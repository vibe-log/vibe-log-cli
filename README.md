
<div align="center">
<pre>

 ██╗   ██╗ ██╗ ██████╗  ███████╗        ██╗       ██████╗   ██████╗
 ██║   ██║ ██║ ██╔══██╗ ██╔════╝        ██║      ██╔═══██╗ ██╔════╝
 ██║   ██║ ██║ ██████╔╝ █████╗   █████╗ ██║      ██║   ██║ ██║  ███╗
 ╚██╗ ██╔╝ ██║ ██╔══██╗ ██╔══╝   ╚════╝ ██║      ██║   ██║ ██║   ██║
  ╚████╔╝  ██║ ██████╔╝ ███████╗        ███████╗ ╚██████╔╝ ╚██████╔╝
   ╚═══╝   ╚═╝ ╚═════╝  ╚══════╝        ╚══════╝  ╚═════╝   ╚═════╝
   
</pre>
<p></p>
<h3> Track your building journey with Vibe-Log - the CLI tool that helps developers improve, analyze productivity patterns,  maintain coding streaks, and build in public with AI-powered insights </h3>
<p></p>

<a href="https://vibe-log.dev">
  <img src="https://img.shields.io/badge/by-vibe--log.dev-16A34A" alt="by vibe-log.dev"></a>
  <a href="https://www.npmjs.com/package/vibe-log-cli"><img src="https://img.shields.io/npm/v/vibe-log-cli.svg" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/vibe-log-cli.svg" alt="Node.js Version"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/Security-Policy-blue.svg" alt="Security Policy"></a>
  <a href="https://github.com/vibe-log/vibe-log-cli">
  <img src="https://img.shields.io/badge/⭐_Star-this_repo-22C55E?labelColor=000000" alt="Star this repo">
</a>
  
</p>

[Website](https://vibe-log.dev) • [Report Bug](https://github.com/vibe-log/vibe-log-cli/issues) • [Request Feature](https://github.com/vibe-log/vibe-log-cli/issues)
</div>
<dib align=left> <h2>🎯 What is vibe-log?</h2>
<p></p>
vibe-log is a comprehensive CLI tool that analyzes your coding sessions to extract productivity metrics, emotional insights, and generates engaging Build in Public content. It integrates seamlessly with Claude Code and other AI coding assistants to help you understand your development patterns and share your journey.<p></p>
✨ Key Features

📊 Productivity Analytics - Track goals, code acceptance rates, and session efficiency<br>
📝 Tailored Prompt Engineering Feedback - Improve your AI interaction efficiency<br>
📈 AI Metrics Tracking - Monitor how effectively you're using AI coding assistants<br>
🔥 Vibe Coding Streaks - Keep your momentum alive! Track daily coding streaks with visual flame indicators and maintain consistency<br>
🐦 Build in Public Automation - Draft authentic tweets based on your vibe-coding sessions<br>


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
