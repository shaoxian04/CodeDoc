# Version Management Guide

This project uses manual version control with automated publishing.

## Manual Version Management (Recommended)

### Local Version Bumping
```bash
# Patch version (1.0.4 → 1.0.5) - Bug fixes
npm run version:patch

# Minor version (1.0.4 → 1.1.0) - New features
npm run version:minor

# Major version (1.0.4 → 2.0.0) - Breaking changes
npm run version:major
```

These commands will:
1. Update the version in `package.json`
2. Create a git commit with the version bump
3. Create a git tag (e.g., `v1.0.5`)
4. Push the commit and tag to GitHub

### Publishing to Marketplace

After bumping the version locally:

1. **Create a GitHub Release**:
   - Go to your GitHub repository
   - Click "Releases" → "Create a new release"
   - Select the tag that was just created (e.g., `v1.0.5`)
   - Add release notes describing the changes
   - Click "Publish release"

2. **Automatic Publishing**:
   - GitHub Actions will automatically trigger
   - Compiles and packages the extension
   - Publishes to VS Code Marketplace
   - Publishes to Open VSX Registry

## Version Types

- **Patch** (1.0.4 → 1.0.5): Bug fixes, small improvements
- **Minor** (1.0.4 → 1.1.0): New features, backwards compatible
- **Major** (1.0.4 → 2.0.0): Breaking changes, major updates

## Publishing Requirements

Make sure you have these GitHub secrets configured:
- `VSCE_PAT`: Personal Access Token for VS Code Marketplace
- `OVSX_PAT`: Personal Access Token for Open VSX Registry (optional)

## Workflow Files

- `.github/workflows/ci.yml`: Main CI/CD pipeline with publishing on release
- `.github/workflows/code-quality.yml`: Code quality checks