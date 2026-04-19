# Release Setup Guide

This guide explains how to release new versions of vibe-log-cli using GitHub Actions.

## 🚀 Quick Release Instructions (Using GitHub Actions)

Release from `main` only. Do not create a version commit or tag from a
feature branch, detached worktree, or a local `main` that is ahead/behind
`origin/main`.

The required order is:

1. Merge the feature branch into `main`.
2. Push `main`.
3. Verify local `main` exactly matches `origin/main`.
4. Update the changelog and package version.
5. Commit and push the release commit to `main`.
6. Tag the pushed `main` commit.
7. Push the tag.

The publish workflow rejects tags that do not point at the current
`origin/main` commit.

### Step 0: Verify Main Is Clean and Current

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main

# Must print nothing.
git status --porcelain

# Must print the same SHA twice.
git rev-parse HEAD
git rev-parse origin/main
```

If a feature was built on another branch, merge it before continuing:

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only feature-branch
# If fast-forward is not possible, open/merge a PR or do a normal reviewed merge.
git push origin main
git status --porcelain
```

Do not continue until `git status -sb` shows exactly:

```text
## main...origin/main
```

### Step 1: Prepare Release
```bash
# 1. Update CHANGELOG.md with release notes
# Add new section at the top (after Unreleased) with format:
## [0.8.X] - YYYY-MM-DD

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
npm version patch --no-git-tag-version  # Bug fixes: 0.8.13 -> 0.8.14
# npm version minor --no-git-tag-version  # New features: 0.8.13 -> 0.9.0
# npm version major --no-git-tag-version  # Breaking changes: 0.8.13 -> 1.0.0

# 3. Run local release checks
npm run type-check
npm test
npm run build

# 4. Commit only the release files and intentional release-prep changes
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore: release v$(node -p "require('./package.json').version")"
```

### Step 3: Push and Tag
```bash
# 5. Push the release commit to main first
git push origin main

# 6. Verify the pushed main commit is the release commit
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"

# 7. Tag the exact pushed main commit
VERSION=$(node -p "require('./package.json').version")
git tag -a "v$VERSION" -m "v$VERSION"
test "$(git rev-parse "v$VERSION^{commit}")" = "$(git rev-parse origin/main)"

# 8. Push only this version tag
git push origin "v$VERSION"
```

### Step 4: GitHub Actions Takes Over
The GitHub Action will automatically:
- ✅ Build and test the package
- ✅ Publish to npm through trusted publishing
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
3. **npm Trusted Publishing**: npm must trust this GitHub repository and the
   `.github/workflows/npm-publish.yml` workflow

### Configure npm Trusted Publishing
1. Log in to [npmjs.com](https://www.npmjs.com)
2. Open the `vibe-log-cli` package
3. Go to **Settings** → **Trusted publishers**
4. Add this GitHub repository and workflow:
   - Repository owner: `vibe-log`
   - Repository name: `vibe-log-cli`
   - Workflow filename: `npm-publish.yml`
   - Environment: leave empty unless the workflow is changed to use one

---

## 📝 Manual Release (If GitHub Actions Fails)

Only use this if GitHub Actions is broken. The same `main`-only rule applies:

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
test -z "$(git status --porcelain)"

# 1. Update CHANGELOG.md.
# 2. Bump version without creating a tag yet.
npm version patch --no-git-tag-version

# 3. Build and test
npm run type-check
npm run test
npm run build

# 4. Commit and push the release commit to main.
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore: release v$(node -p "require('./package.json').version")"
git push origin main

# 5. Publish to npm from the same pushed main commit.
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
npm publish

# 6. Tag the same pushed main commit and create the GitHub release.
VERSION=$(node -p "require('./package.json').version")
git tag -a "v$VERSION" -m "v$VERSION"
git push origin "v$VERSION"
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
- **403 Error**: No publish permission or trusted publisher mismatch - check npm package settings
- **E409 Error**: Version already exists - bump version again

### GitHub Release Not Created
- Ensure CHANGELOG.md has entry for the version
- Tag must start with 'v' (e.g., `v0.4.3`)
- Check GitHub Actions has write permissions

### Version Mismatch
- package.json version must match git tag (without 'v')
- Example: package.json has `0.4.3`, tag is `v0.4.3`

### Release Tag Rejected
- The publish workflow rejects any tag that is not the current `origin/main` commit.
- Fix by deleting the bad local tag, making sure the release commit is pushed to `main`, then tagging again:

```bash
VERSION=$(node -p "require('./package.json').version")
git tag -d "v$VERSION"
git fetch origin
git switch main
git pull --ff-only origin main
git tag -a "v$VERSION" -m "v$VERSION"
git push origin "v$VERSION"
```

---

## 📋 Release Checklist

Before releasing, ensure:
- [ ] CHANGELOG.md updated with release notes
- [ ] Feature code is merged into `main`
- [ ] `main` is pushed to origin before tagging
- [ ] Local `main` exactly matches `origin/main`
- [ ] No uncommitted changes before release prep: `git status --porcelain`
- [ ] Tests pass locally: `npm test`
- [ ] Type checking passes locally: `npm run type-check`
- [ ] Build works: `npm run build`
- [ ] You're on main branch: `git branch --show-current`
- [ ] Version tag points at `origin/main`

---

## 🔒 Security Notes

- **Never** commit npm tokens to the repository
- Prefer npm trusted publishing over long-lived npm tokens
- Enable 2FA on your npm account
- If a manual emergency token is ever used, rotate it immediately after the release

---

## 📞 Support

For release issues:
1. Check [GitHub Actions logs](https://github.com/vibe-log/vibe-log-cli/actions)
2. Open an issue in the repository
3. Contact maintainers via Discord/Slack
