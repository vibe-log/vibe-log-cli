# Contributing to Vibelog CLI

First off, thank you for considering contributing to Vibelog CLI! It's people like you that make Vibelog CLI such a great tool for the developer community.

## Build Transparency and Verification

We prioritize transparency and security in our build process:

- **No Minification**: Our published packages are NOT minified to ensure code readability and verifiability
- **Source Maps Included**: Every build includes source maps for debugging and verification
- **Automated Releases**: All npm releases are automated via GitHub Actions for reproducibility
- **Build Provenance**: npm packages include provenance attestation for supply chain security
- **Checksums**: Every release includes SHA256 checksums for integrity verification

### Verifying Published Packages

You can verify any published package:

```bash
# Download and extract the package
npm pack vibe-log-cli@latest
tar -xzf vibe-log-cli-*.tgz

# Verify the code is not minified
head -100 package/dist/index.js

# Check source maps are included
ls -la package/dist/*.map

# Verify checksums (if available)
cd package/dist && sha256sum -c checksums.sha256
```

### Build Process

Our build process is completely transparent:

1. **Source Code**: Available at https://github.com/vibe-log/vibe-log-cli
2. **Build Command**: `npm run build` (uses tsup with minification disabled)
3. **Artifacts**: Non-minified JavaScript + source maps
4. **Release**: Automated via GitHub Actions with npm provenance

## Code of Conduct

This project and everyone participating in it is governed by the [Vibelog Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to conduct@vibe-log.dev.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed and what behavior you expected**
- **Include screenshots if relevant**
- **Include your environment details** (OS, Node version, CLI version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Provide specific examples to demonstrate the enhancement**
- **Describe the current behavior and explain the expected behavior**
- **Explain why this enhancement would be useful**

### Your First Code Contribution

Unsure where to begin? You can start by looking through these issues:

- Issues labeled `good-first-issue` - issues which should only require a few lines of code
- Issues labeled `help-wanted` - issues which need extra attention
- Issues labeled `documentation` - improvements or additions to documentation

## Development Setup

### Prerequisites

- Node.js >= 16.0.0
- npm >= 7.0.0
- Git

### Local Development

1. **Fork the repository**
   ```bash
   # Click the 'Fork' button on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/cli.git
   cd cli
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

4. **Make your changes**
   - Write your code
   - Add or update tests as needed
   - Update documentation if needed

5. **Run tests**
   ```bash
   # Run all tests
   npm test

   # Run tests in watch mode
   npm run test:watch

   # Run specific test file
   npm test -- path/to/test.test.ts
   ```

6. **Check code quality**
   ```bash
   # Type checking
   npm run type-check

   # Linting
   npm run lint

   # Format code
   npm run format

   # Run all checks
   npm run check-all
   ```

7. **Build the project**
   ```bash
   npm run build
   ```

8. **Test your changes locally**
   ```bash
   # Link the CLI globally
   npm link

   # Now you can use vibe-log command with your changes
   vibe-log --help
   ```

### Project Structure

```
vibelog-cli/
├── src/
│   ├── commands/       # CLI command implementations
│   ├── lib/            # Core library functions
│   │   ├── api-client.ts    # API communication
│   │   ├── auth/            # Authentication logic
│   │   ├── config.ts        # Configuration management
│   │   └── readers/         # Session readers (Claude, etc.)
│   ├── utils/          # Utility functions
│   └── index.ts        # Main entry point
├── tests/
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── e2e/           # End-to-end tests
├── bin/               # Executable scripts
└── dist/              # Compiled output (generated)
```

## Pull Request Process

1. **Ensure your code adheres to the existing style**
   - Run `npm run format` to auto-format your code
   - Run `npm run lint` to check for linting issues

2. **Update the README.md** with details of changes if applicable

3. **Add or update tests** for your changes
   - Ensure all tests pass: `npm test`
   - Aim for high test coverage

4. **Update the CHANGELOG.md** following the [Keep a Changelog](https://keepachangelog.com/) format

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing new feature"
   ```
   
   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation only changes
   - `style:` Code style changes (formatting, etc.)
   - `refactor:` Code refactoring
   - `test:` Adding or updating tests
   - `chore:` Changes to build process or auxiliary tools

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request**
   - Go to the original repository on GitHub
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill out the PR template
   - Link any relevant issues

8. **Code Review**
   - A maintainer will review your PR
   - Make any requested changes
   - Push updates to the same branch

## Testing Guidelines

### Unit Tests

- Test individual functions and modules in isolation
- Mock external dependencies
- Aim for high code coverage (>80%)
- Location: `tests/unit/`

### Integration Tests

- Test interaction between modules
- Test API client with mock servers
- Test configuration and file operations
- Location: `tests/integration/`

### E2E Tests

- Test complete user workflows
- Test actual CLI commands
- Location: `tests/e2e/`

### Writing Tests

```typescript
// Example test structure
describe('YourModule', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = yourFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

## Security

### Security Vulnerabilities

If you discover a security vulnerability, DO NOT open an issue. Email security@vibe-log.dev instead. See [SECURITY.md](SECURITY.md) for more details.

### Security Checklist

Before submitting a PR, ensure:

- [ ] No hardcoded secrets or tokens
- [ ] All user inputs are validated
- [ ] No use of `eval()` or dynamic code execution
- [ ] Dependencies are up to date
- [ ] No sensitive data in logs or error messages
- [ ] File operations use sanitized paths
- [ ] Network requests use HTTPS

## Documentation

- Update README.md if you change functionality
- Add JSDoc comments to new functions
- Update CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/)
- Create or update example code if applicable

## Style Guide

### TypeScript Style

- Use TypeScript for all new code
- Enable strict mode
- Prefer `const` over `let` when possible
- Use meaningful variable names
- Add type annotations for function parameters and return values

### Code Organization

- Keep functions small and focused
- Extract complex logic into separate functions
- Group related functionality in modules
- Use clear, descriptive names

### Error Handling

- Always handle errors appropriately
- Provide helpful error messages
- Use custom error types when beneficial
- Never expose sensitive information in errors

## Community

### Getting Help

- **Discord**: Join our [Discord server](https://discord.gg/qKqs7MZVJ)
- **Discussions**: Use [GitHub Discussions](https://github.com/vibe-log/vibe-log/discussions)
- **Stack Overflow**: Tag questions with `vibelog`

### Recognition

Contributors who submit accepted PRs will be:
- Added to the contributors list
- Mentioned in release notes
- Eligible for contributor badges

## Release Process

All releases are **fully automated** via GitHub Actions for transparency and reproducibility.

### Automated Release Workflow

1. **Update version** in package.json: `npm version patch|minor|major`
2. **Update CHANGELOG.md** with release notes
3. **Commit and push** the changes
4. **Create and push tag**: `git tag v0.3.18 && git push origin v0.3.18`
5. **GitHub Actions automatically**:
   - Builds the package in a clean CI environment
   - Runs all tests and security checks
   - Generates SHA256 checksums
   - Publishes to npm with provenance attestation
   - Creates GitHub release with checksums
   - Verifies the package is available on npm

### Manual Release (Emergency Only)

In case automated release fails:

```bash
# Build and verify locally
npm run build
npm run verify

# Publish to npm
npm publish --provenance

# Create GitHub release manually with checksums
cat dist/checksums.sha256
```

### Release Verification

After any release:

1. Check npm package: https://www.npmjs.com/package/vibe-log-cli
2. Verify provenance badge is shown
3. Test installation: `npx vibe-log-cli@latest --version`
4. Check GitHub release includes checksums

## Questions?

Feel free to:
- Open a [GitHub Discussion](https://github.com/vibe-log/vibe-log/discussions)
- Join our [Discord](https://discord.gg/qKqs7MZVJ)
- Email us at contribute@vibe-log.dev

Thank you for contributing to Vibelog CLI!