
<div align="center">

<img width="628" height="176" alt="image" src="https://github.com/user-attachments/assets/1e468c1f-8228-46ad-a441-1b0926edfbc9" />

<p></p>
<h3>Open-source CLI for analyzing Claude Code sessions locally and generating productivity reports</h3>
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

## What is Vibe-Log?

vibe-log-cli is an open-source command-line tool that analyzes your Claude Code sessions to extract productivity insights and generate reports. All analysis can run completely locally on your machine using Claude Code's capabilities.

## Architecture

### 1. 💬 Status Line (Local)
Strategic product advisor in Claude Code. Your prompts are analyzed locally to provide actionable guidance that pushes you to ship faster. Feedback appears in your Claude Code status line with concrete next steps.

### 2. 📊 Local Report Generation (Local) 
Generate comprehensive productivity reports using Claude Code's sub-agents to analyze your sessions in parallel. No data leaves your machine.

### 3. ☁️ Cloud Sync (Optional)
Optionally sync sanitized session data to the vibe-log dashboard for web-based analytics and team insights.

## Status Line - Claude Strategic Co-pilot / Advisor

The Status Line uses your local Claude Code to provide strategic guidance that pushes you to ship faster. It remembers your original goal and gives concrete, actionable steps to achieve it.

<img width="560" height="174" alt="image" src="https://github.com/user-attachments/assets/f509c63e-8b16-47f3-9e8f-3c36d1718ca6" />

### Why Use Status Line?

- **🚀 Ship Faster**: Get pushed to deliver
- **🎯 Stay Focused**: Remembers your original mission and keeps you on track and forward ⏩︎
- **⚡ Concrete Actions**: Specific next steps like:
- **📈 Strategic Thinking**: Considers edge cases, user experience, and scaling at the right time

### How Status Line Works
1. Intercepts prompts submitted in Claude Code
1. Analyzes via local Claude Code latest prompt with relavent sesison context.
4. Provides strategic guidance and pushes you to ship
5. Displays actionable feedback in Claude Code status line

In more details:
```mermaid
flowchart LR
    subgraph Input ["✳️ In Claude Code"]
        User([👤 You type a<br/>prompt]) --> Submit[Press Enter to<br/>submit prompt]
        Submit --> Hook[🪝 UserPromptSubmit<br/>hook triggers]
    end

    subgraph Analysis ["🧠 Local Prompt Analysis via Claude Code SDK"]
        Hook --> CLI[Vibe-log CLI<br/>receives prompt]
        CLI --> Check{Is new chat?}
        Check -->|No| Context[📝 Include previous<br/>conversation]
        Check -->|Yes| Direct[💭 Analyze prompt<br/>standalone]
        
        subgraph Personality ["🎭 Infuse Coach Personality"]
            Gordon[🧑‍🍳 Gordon<br/>Tough love]
            Vibe[💜 Vibe-log<br/>Encouraging]
            Custom[✨ Custom<br/>Your style]
        end
        
        Context --> SDK[Claude SDK<br/>analyzes prompt quality]
        Direct --> SDK
        Personality -.-> SDK
        SDK --> Score[📊 Generate score<br/>& suggestion]
    end

    subgraph Display ["💬 Status Line Feedback"]
        Score --> Save[💾 Save to<br/>~/.vibe-log/analysis]
        Save --> Status[Status bar<br/>reads result]
        Status --> Show[🟢 85/100<br/>✨ Gordon says:<br/>Add more context chef!]
    end

    Show --> Improve([📈 Better prompts<br/>Better results])
  ```

### Coach Personalities
- **Gordon** - Sharp, pushy, business-focused. Creates urgency: "Ship by FRIDAY or you're fired!"
- **Vibe-Log** - Supportive but pushy senior dev. Helps you ship: "MVP checklist: Auth works ✓ | Ship it!"
- **Custom** - User-defined personality with strategic focus

### Example Output


### Setup
1. Run `npx vibe-log-cli`
2. Select "Configure prompt coach status line"
3. Choose coach personality
4. Prompts will be analyzed locally in Claude Code

## Local Report Generation Works

Generate comprehensive productivity reports using Claude Code's sub-agents to analyze your sessions in parallel. No data leaves your machine.
- Select timefrema
- Select projects
  
```mermaid
flowchart TD
    Start([📝 Claude Code Sessions]) --> Select[vibe-log-cli select time frame and projects]
    Select --> Extract[Extracts & prepares session data]
    Extract --> Launch[Launches Claude with instructions]
    Launch --> Parallel{Parallel sub-agents<br/> session analysis}
    Parallel --> Gather[Gathers results &<br/>Generates report]
    Gather --> Output[📊 HTML Report in current folder]    
    style Start fill:#e1f5fe
    style Output fill:#d4edda
```

## ☁️ Cloud Sync (Optional)

Optionally sync your sanitized session data to the vibe-log dashboard for advanced analytics and tracking over time.

### Features
- **🎁 Free Forever**: Up to 1,000 session analyses per month
- **📈 Track Over Time**: Monitor your prompt quality and productivity trends
- **🔄 Auto-sync**: Configure hooks for automatic background sync
- **🔒 Privacy First**: All code removed before upload, only patterns synced
- **📊 Web Dashboard**: Learn and improve your AI coding sessions.

### How It Works

```mermaid
flowchart TD
    subgraph Local ["🏠 Your Machine"]
        Sessions[Claude Code Sessions] --> Select[Select sessions]
        Select --> Privacy[🔒 Privacy Layer<br/>Removes code & secrets<br/>Keeps only patterns]
    end
    
    subgraph Cloud ["☁️ Vibe-Log Cloud"]
        Privacy --> Upload[Upload patterns]
        Upload --> Verify[Server verification]
        Verify --> Analysis[AI analysis]
        Analysis --> Dashboard[📊 Web Dashboard]
    end
    
    subgraph Features ["Dashboard Features"]
        Dashboard --> Track[📈 Track prompt improvement over time]
        Dashboard --> Metrics[⚡ Deeper productivity insights]  
        Dashboard --> Streaks[🔥 Peak times/Low times]
        Dashboard --> Prompt[💬 User Prompt Analysis]
    end
    
    style Local fill:#e1f5fe
    style Cloud fill:#f3e5f5
    style Features fill:#d4edda
```

### Setup Auto-sync
1. Run `npx vibe-log-cli`
2. Authenticate with your Github account
3. Enable auto-sync in cli menu

## Supported Coding Engines 

Currently supported:
- ✅ Claude Code

Future:
- 🔜 Cursor
- 🔜 VS Code

🌍 Cross-Platform - Runs on macOS, Windows, Linux, and any environment with Node.js


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

### Sessions Stuck in Analyzing
- Please open a Github issue.


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

MIT © Vibe-Log - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with love by the Vibe-Log team [@mickmicksh](https://github.com/mickmicksh), [@dannyshmueli](https://github.com/dannyshmueli)

Special thanks to [ccusage](https://www.npmjs.com/package/ccusage) for providing token usage metrics integration for Claude Code sessions.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=vibe-log/vibe-log-cli&type=Date)](https://www.star-history.com/#vibe-log/vibe-log-cli&Date)
