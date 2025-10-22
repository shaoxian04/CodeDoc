# Version Management Guide

This project uses local version management and publishing.

## Quick Release (Recommended)

### One-Command Release
```bash
# Patch release (1.0.3 → 1.0.4) - Bug fixes
npm run release patch

# Minor release (1.0.3 → 1.1.0) - New features  
npm run release minor

# Major release (1.0.3 → 2.0.0) - Breaking changes
npm run release major
```

This single command will:
1. ✅ Bump the version in `package.json`
2. ✅ Create a git commit and tag
3. ✅ Push to GitHub
4. ✅ Compile TypeScript
5. ✅ Publish to VS Code Marketplace

### Alternative Commands

```bash
# Just version bump and push (no publish)
npm run version:patch
npm run version:minor  
npm run version:major

# Full release with separate steps
npm run release:patch
npm run release:minor
npm run release:major

# Quick patch publish (no version bump)
npm run quick-release
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

- `.github/workflows/ci.yml`: Main CI/CD pipeline with publishing on release
- `.github/workflows/code-quality.yml`: Code quality checks