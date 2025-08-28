
<div align="center">

<img width="628" height="176" alt="image" src="https://github.com/user-attachments/assets/1e468c1f-8228-46ad-a441-1b0926edfbc9" />

<p></p>
<h3> Track your building journey with Vibe-Log - the CLI tool that helps developers improve, analyze productivity patterns,  maintain coding streaks, and build in public with AI-powered insights </h3>
<p></p>

<a href="https://vibe-log.dev">
  <img src="https://img.shields.io/badge/by-vibe--log.dev-16A34A" alt="by vibe-log.dev"></a>
  <a href="https://www.npmjs.com/package/vibe-log-cli"><img src="https://img.shields.io/npm/v/vibe-log-cli.svg" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/vibe-log-cli.svg" alt="Node.js Version"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
<a href="https://github.com/vibe-log/vibe-log-cli/actions/workflows/tests.yml"><img src="https://github.com/vibe-log/vibe-log-cli/actions/workflows/tests.yml/badge.svg" alt="Tests"></a>
<a href="https://github.com/vibe-log/vibe-log-cli/actions/workflows/npm-publish.yml"><img src="https://github.com/vibe-log/vibe-log-cli/actions/workflows/npm-publish.yml/badge.svg" alt="NPM Publish"></a>
<a href="https://github.com/vibe-log/vibe-log-cli/actions/workflows/build-verification.yml"><img src="https://github.com/vibe-log/vibe-log-cli/actions/workflows/build-verification.yml/badge.svg" alt="Build Verification"></a>
<a href="SECURITY.md"><img src="https://img.shields.io/badge/Security-Policy-blue.svg" alt="Security Policy"></a>
<a href="https://www.npmjs.com/package/vibe-log-cli"><img src="https://img.shields.io/badge/npm-provenance-green" alt="npm provenance"></a>
<a href="https://github.com/vibe-log/vibe-log-cli"><img src="https://img.shields.io/badge/source-verified-brightgreen" alt="Source Verified"></a>
<a href="#-security--transparency"><img src="https://img.shields.io/badge/build-transparent-blue" alt="Transparent Build"></a>
  <a href="https://github.com/vibe-log/vibe-log-cli">
  <img src="https://img.shields.io/badge/⭐_Star-this_repo-22C55E?labelColor=000000" alt="Star this repo">
</a>  
</p>

[Website](https://vibe-log.dev) • [Report Bug](https://github.com/vibe-log/vibe-log-cli/issues) • [Request Feature](https://github.com/vibe-log/vibe-log-cli/issues)
</div>

![vibe-log-cli](https://github.com/user-attachments/assets/d72bebde-f90d-432f-92dd-6f7f0e4ec480)

<dib align=left> <h2>🎯 What is Vibe-Log?</h2>
<p></p>
vibe-log is a comprehensive CLI tool that analyzes your coding sessions to extract productivity metrics, emotional insights, and generates engaging Build in Public content. It integrates seamlessly with Claude Code and other AI coding assistants to help you understand your development patterns and share your journey.<p></p>
✨ Key Features

💬 **NEW: Real-time Status Line** - Get instant prompt quality feedback in Claude Code with personality coaches (Gordon Ramsay, Vibe-log, or Custom)<br>
📊 Productivity Analytics - Track goals, code acceptance rates, and session efficiency<br>
📝 Tailored Prompt Engineering Feedback - Improve your AI interaction efficiency<br>
📈 AI Metrics Tracking - Monitor how effectively you're using AI coding assistants<br>
🔥 Vibe Coding Streaks - Keep your momentum alive! Track daily coding streaks with visual flame indicators and maintain consistency<br>
🐦 Build in Public Automation - Draft authentic tweets based on your vibe-coding sessions<br>

## Quick Start

**Get started with the interactive menu:**
   ```bash
   npx vibe-log-cli
   ```

## 💬 Status Line - Real-time Prompt Coaching in Claude Code

Transform your Claude Code experience with real-time prompt quality feedback! The Status Line feature analyzes your prompts as you type and provides instant coaching to help you write better, more effective prompts.

### How It Works
Every time you submit a prompt in Claude Code, vibe-log:
1. **Analyzes** your prompt quality in real-time using Claude AI
2. **Scores** your prompt from 0-100 based on clarity, context, and specificity
3. **Provides** personalized suggestions through your chosen coach personality
4. **Displays** feedback directly in your Claude Code status bar

### Choose Your Coach Personality
- 🧑‍🍳 **Gordon Ramsay** - Tough love with kitchen metaphors ("This prompt is RAW!")
- 💜 **Vibe-log** - Encouraging and supportive developer coach
- ✨ **Custom** - Define your own coaching style and personality

### Example Feedback
```
🟢 85/100 | ✨ Gordon says: Beautiful context chef! Just needs a pinch of expected output format
🟡 65/100 | 💜 Vibe-log: Good start! Add some context about your current setup
🔴 40/100 | 🧑‍🍳 Gordon: This prompt is UNDERCOOKED! Where's the bloody context?!
```

### Quick Installation
1. Run `npx vibe-log-cli`
2. Select **"Status Line"** from the main menu
3. Choose your coach personality
4. Start getting real-time feedback in Claude Code!

The Status Line works silently in the background, helping you improve with every prompt you write.

## Supported Coding Engines 

Currently supported:
- ✅ Claude Code

Future:
- 🔜 Cursor
- 🔜 VS Code

🌍 Cross-Platform - Runs on macOS, Windows, Linux, and any environment with Node.js

## How does it work

```mermaid
flowchart TB
    subgraph Input ["✳️ In Claude Code"]
        User([👤 You type a prompt]) 
        User --> Submit[Press Enter]
        Submit --> Hook[🪝 Hook triggers]
    end

    Hook --> CLI[Vibe-log CLI<br/>receives prompt]
    
    CLI --> Check{Is new<br/>chat?}
    
    Check -->|Yes| Direct[💭 Analyze<br/>standalone]
    Check -->|No| Context[📝 Include<br/>conversation]
    
    Direct --> SDK
    Context --> SDK
    
    subgraph Analysis ["🧠 Analysis with Personality"]
        Personality[🎭 Coach Personality<br/>🧑‍🍳 Gordon | 💜 Vibe-log | ✨ Custom]
        Personality -.-> SDK[Claude SDK<br/>analyzes quality]
        SDK --> Score[📊 Score &<br/>suggestion]
    end
    
    Score --> Save[💾 Save to<br/>~/.vibe-log]
    
    Save --> Status[Status bar<br/>reads result]
    
    Status --> Show[🟢 85/100<br/>✨ Gordon says:<br/>Add context chef!]
    
    Show --> Improve([📈 Better prompts<br/>Better results])

    style Input fill:#f9f,stroke:#333,stroke-width:2px
    style Analysis fill:#bbf,stroke:#333,stroke-width:2px
```

## 🔒 Privacy & Security

<div align="center">
<a href="https://github.com/vibe-log/vibe-log-cli/actions/workflows/npm-publish.yml"><img src="https://img.shields.io/badge/Automated-Releases-success?logo=githubactions" alt="Automated Releases"></a>
<a href="https://www.npmjs.com/package/vibe-log-cli"><img src="https://img.shields.io/badge/NPM-Provenance-green?logo=npm" alt="NPM Provenance"></a>
<a href="#verify-our-package"><img src="https://img.shields.io/badge/SHA256-Checksums-blue?logo=shield" alt="SHA256 Checksums"></a>
<a href="https://github.com/vibe-log/vibe-log-cli"><img src="https://img.shields.io/badge/Open-Source-orange?logo=github" alt="Open Source"></a>
</div>

<br>

**This package is built with complete transparency:**

- ✅ **Source Code**: Fully open source at [github.com/vibe-log/vibe-log-cli](https://github.com/vibe-log/vibe-log-cli)
- ✅ **Not Minified**: Published code is readable and verifiable
- ✅ **Source Maps**: Included for debugging and verification
- ✅ **Automated Builds**: All releases via GitHub Actions (no manual publishing)
- ✅ **npm Provenance**: Every package includes build attestation
- ✅ **Checksums**: SHA256 hashes for integrity verification

### Verify Our Package

```bash
# Download and inspect the package
npm pack vibe-log-cli@latest
tar -xzf vibe-log-cli-*.tgz
head -100 package/dist/index.js  # Verify it's readable

# Check checksums
cd package/dist && sha256sum -c checksums.sha256
```

### Security Features
- **Secure Token Storage**: Authentication tokens are encrypted using AES-256-GCM with random keys
- **Input Validation**: All user inputs are validated to prevent injection attacks
- **CSRF Protection**: Browser authentication uses CSRF tokens to prevent cross-site attacks
- **Rate Limiting**: Built-in rate limiting to prevent brute force attempts
- **HTTPS Only**: All API communications are restricted to HTTPS
- **Session Security**: Cryptographically secure session IDs (256-bit)
- **Data Sanitization**: All data is sanitized before logging or transmission

### Privacy
- **Context-Preserving Sanitization**: Messages are sanitized to remove sensitive data while preserving context
- **What gets redacted/removed**:
  - Code blocks → `[CODE_BLOCK_1: javascript]`
  - API keys/tokens → `[CREDENTIAL_1]`
  - File paths → `[PATH_1]`
  - URLs → `[DATABASE_URL]`, `[API_URL]`
  - Emails → `[EMAIL_1]`
  - Environment variables → `[ENV_VAR_1]`
  - Also Removed: Images/Binary files 
- **What's preserved**: Conversation flow, questions, explanations
- **Transparent**: Preview sanitized data with the interactive prompt
- **Open source**: Review our sanitization at [src/lib/message-sanitizer-v2.ts](src/lib/message-sanitizer-v2.ts)

## Troubleshooting

### Authentication Issues
Try the following: 
- Log out from the CLI
- Clear cookies
- Re-authenticate via the CLI 

### No Sessions Found
- Make sure Claude Code is installed
- Check that you've used Claude Code recently


### Debug Mode
```bash
# Enable debug logging
VIBELOG_DEBUG=1 npx vibe-log-cli send
```

## Contributing

We love your input! We want to make contributing to Vibe-Log CLI as easy and transparent as possible. Please see our [Contributing Guide](CONTRIBUTING.md) for details.

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
- 🐛 Report bugs in [GitHub Issues](https://github.com/vibe-log/vibe-log-cli/issues)
- 📧 Email us at support@vibe-log.dev

## License

MIT © Vibelog - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with love by the Vibe-Log team and our amazing contributors.
