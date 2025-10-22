# Version Management Guide

This project uses automated version bumping and publishing workflows.

## Automatic Publishing (Recommended)

### Method 1: GitHub Releases (Fully Automated)
1. Go to your GitHub repository
2. Click "Releases" → "Create a new release"
3. Create a new tag (e.g., `v1.0.5`, `v1.1.0`, `v2.0.0`)
4. Fill in release notes
5. Click "Publish release"

**What happens automatically:**
- GitHub Actions extracts the version from the tag
- Updates `package.json` with the new version
- Commits the version bump
- Compiles and packages the extension
- Publishes to VS Code Marketplace
- Publishes to Open VSX Registry

### Method 2: Manual Workflow Trigger
1. Go to GitHub → Actions → "Version Bump and Release"
2. Click "Run workflow"
3. Select version bump type (patch/minor/major)
4. Choose whether to create a GitHub release
5. Click "Run workflow"

## Local Development

### Quick Version Bumping
```bash
# Patch version (1.0.4 → 1.0.5)
npm run release:patch

# Minor version (1.0.4 → 1.1.0)
npm run release:minor

# Major version (1.0.4 → 2.0.0)
npm run release:major
```

### Manual Version Control
```bash
# Just bump version locally (no git operations)
npm run version:patch
npm run version:minor
npm run version:major

# Then manually commit and push
git push && git push --tags
```

## Version Types

- **Patch** (1.0.4 → 1.0.5): Bug fixes, small improvements
- **Minor** (1.0.4 → 1.1.0): New features, backwards compatible
- **Major** (1.0.4 → 2.0.0): Breaking changes, major updates

## Publishing Requirements

Make sure you have these GitHub secrets configured:
- `VSCE_PAT`: Personal Access Token for VS Code Marketplace
- `OVSX_PAT`: Personal Access Token for Open VSX Registry (optional)

## Workflow Files

- `.github/workflows/ci.yml`: Main CI/CD pipeline with automatic publishing
- `.github/workflows/version-bump.yml`: Manual version bumping workflow
- `.github/workflows/code-quality.yml`: Code quality checks