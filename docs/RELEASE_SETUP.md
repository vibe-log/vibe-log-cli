# Release Setup Guide

This guide explains how to release new versions of vibe-log-cli using GitHub Actions.

## 🚀 Quick Release Instructions (Using GitHub Actions)

### Step 1: Prepare Release
```bash
# 1. Update CHANGELOG.md with release notes
# Add new section at the top (after line 7) with format:
## [0.4.X] - 2025-08-29

### Fixed
- Brief description of fixes

### Improved  
- Brief description of improvements

### Added
- Brief description of new features
```

### Step 2: Create Release Commit
```bash
# 2. Bump version (choose patch/minor/major)
npm version patch  # Bug fixes: 0.4.3 -> 0.4.4
# npm version minor  # New features: 0.4.3 -> 0.5.0
# npm version major  # Breaking changes: 0.4.3 -> 1.0.0

# 3. Commit the changes
git add .
git commit -m "chore: release v$(node -p "require('./package.json').version")"
```

### Step 3: Push and Tag
```bash
# 4. Push to main branch
git push origin main

# 5. Push the version tag (created by npm version)
git push origin --tags
```

### Step 4: GitHub Actions Takes Over
The GitHub Action will automatically:
- ✅ Build and test the package
- ✅ Publish to npm with provenance
- ✅ Create GitHub release with notes from CHANGELOG.md
- ✅ Generate checksums

### Step 5: Verify Release
```bash
# Check npm (wait ~1 minute)
npm view vibe-log-cli version

# Check GitHub releases
open https://github.com/vibe-log/vibe-log-cli/releases

# Test installation
npx vibe-log-cli@latest --version
```

---

## 🔧 Initial Setup (One-Time Only)

### Prerequisites
1. **npm Account**: Must have publish access to `vibe-log-cli`
2. **GitHub Access**: Must have push access to the repository
3. **npm Token**: Required for GitHub Actions

### Generate npm Token
1. Log in to [npmjs.com](https://www.npmjs.com)
2. Click profile → **Access Tokens**
3. **Generate New Token** → **Classic Token**
4. Select type: **Automation** (IMPORTANT!)
5. Copy the token (starts with `npm_`)

### Add Token to GitHub
1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Paste your npm token
5. Click **Add secret**

---

## 📝 Manual Release (If GitHub Actions Fails)

Only use this if GitHub Actions is broken:

```bash
# 1. Update CHANGELOG.md
# 2. Bump version
npm version patch

# 3. Build and test
npm run build
npm run test

# 4. Publish to npm
npm publish

# 5. Push changes
git push origin main --tags

# 6. Create GitHub release manually
gh release create v$(node -p "require('./package.json').version") \
  --title "Release v$(node -p "require('./package.json').version")" \
  --notes "See CHANGELOG.md for details"
```

---

## 🐛 Troubleshooting

### GitHub Actions Not Running
- Check: Did you push the tag? `git push origin --tags`
- Check: Is the workflow enabled? Go to Actions tab
- Check: Any errors in [Actions logs](https://github.com/vibe-log/vibe-log-cli/actions)

### npm Publish Failed
- **401 Error**: Token expired - generate new one
- **403 Error**: No publish permission - check npm account
- **E409 Error**: Version already exists - bump version again

### GitHub Release Not Created
- Ensure CHANGELOG.md has entry for the version
- Tag must start with 'v' (e.g., `v0.4.3`)
- Check GitHub Actions has write permissions

### Version Mismatch
- package.json version must match git tag (without 'v')
- Example: package.json has `0.4.3`, tag is `v0.4.3`

---

## 📋 Release Checklist

Before releasing, ensure:
- [ ] CHANGELOG.md updated with release notes
- [ ] All changes committed
- [ ] Tests pass locally: `npm test`
- [ ] Build works: `npm run build`
- [ ] You're on main branch: `git branch`
- [ ] No uncommitted changes: `git status`

---

## 🔒 Security Notes

- **Never** commit npm tokens to the repository
- Use GitHub Secrets for all tokens
- Enable 2FA on your npm account
- Rotate tokens every 90 days
- Token type must be **Automation** (not Publish)

---

## 📞 Support

For release issues:
1. Check [GitHub Actions logs](https://github.com/vibe-log/vibe-log-cli/actions)
2. Open an issue in the repository
3. Contact maintainers via Discord/Slack