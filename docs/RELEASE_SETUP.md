# Release Setup Guide

This guide explains how to set up automated npm releases via GitHub Actions.

## Prerequisites

1. **npm Account**: You need an npm account with publish access to `vibe-log-cli`
2. **GitHub Repository**: Push access to the GitHub repository
3. **npm Token**: An automation token from npm

## Step 1: Generate npm Token

1. Log in to [npmjs.com](https://www.npmjs.com)
2. Click your profile picture → **Access Tokens**
3. Click **Generate New Token** → **Classic Token**
4. Select type: **Automation** (important for CI/CD)
5. Copy the token (starts with `npm_`)

## Step 2: Add Token to GitHub Secrets

1. Go to the GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **Add secret**

## Step 3: Create npm Production Environment (Optional but Recommended)

1. In GitHub repository, go to **Settings** → **Environments**
2. Click **New environment**
3. Name: `npm-production`
4. Add protection rules:
   - Required reviewers (optional)
   - Restrict to protected branches only
5. Add the `NPM_TOKEN` secret to this environment for extra security

## Step 4: Release Process

### Automated Release (Recommended)

1. Update version in package.json:
   ```bash
   npm version patch  # or minor/major
   ```

2. Update CHANGELOG.md with release notes

3. Commit and push:
   ```bash
   git add .
   git commit -m "chore: release v0.3.18"
   git push origin main
   ```

4. Create and push tag:
   ```bash
   git tag v0.3.18
   git push origin v0.3.18
   ```

5. GitHub Actions will automatically:
   - Build the package
   - Run tests
   - Generate checksums
   - Publish to npm with provenance
   - Create GitHub release

### Manual Trigger (Alternative)

You can also trigger the release workflow manually:

1. Go to **Actions** → **NPM Publish**
2. Click **Run workflow**
3. Enter the version (e.g., `0.3.18`)
4. Click **Run workflow**

## Verification

After release:

1. Check the [Actions tab](https://github.com/vibe-log/vibe-log-cli/actions) for workflow status
2. Verify on npm: https://www.npmjs.com/package/vibe-log-cli
3. Look for the "Provenance" badge on the npm page
4. Test installation:
   ```bash
   npx vibe-log-cli@latest --version
   ```

## Troubleshooting

### Token Issues

- **Error: 401 Unauthorized**: Token is invalid or expired
- **Error: 403 Forbidden**: Token lacks publish permissions
- **Solution**: Generate a new **Automation** token (not Publish token)

### Version Mismatch

- **Error**: Package version doesn't match tag
- **Solution**: Ensure package.json version matches the git tag (without 'v' prefix)

### Build Failures

- Check that all tests pass locally: `npm test`
- Verify TypeScript compilation: `npm run type-check`
- Ensure clean build: `npm run build`

## Security Notes

- Never commit the npm token to the repository
- Use GitHub Secrets for all sensitive data
- Enable 2FA on your npm account
- Regularly rotate tokens (every 90 days recommended)
- Use environment protection rules for production releases

## Support

For issues with the release process:
- Check [GitHub Actions logs](https://github.com/vibe-log/vibe-log-cli/actions)
- Open an issue in the repository
- Contact the maintainers