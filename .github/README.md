# GitHub Actions Setup

This directory contains GitHub Actions workflows for the CodeDoc extension.

## Workflows

### 1. CI/CD Pipeline (`ci.yml`)

- **Triggers**: Push to main/develop, Pull requests, Releases
- **Features**:
  - Tests on multiple OS (Ubuntu, Windows, macOS)
  - Tests on multiple Node.js versions (18.x, 20.x)
  - Runs linting, tests, and compilation
  - Packages extension as .vsix
  - Publishes to VS Code Marketplace on releases

### 2. Code Quality (`code-quality.yml`)

- **Triggers**: Push to main/develop, Pull requests
- **Features**:
  - ESLint code linting
  - TypeScript compilation check
  - Code formatting verification

### 3. Dependency Updates (`dependencies.yml`)

- **Triggers**: Weekly schedule (Mondays), Manual trigger
- **Features**:
  - Automatically updates npm dependencies
  - Creates pull requests for updates
  - Applies security fixes

## Required Secrets

To use these workflows, add the following secrets to your GitHub repository:

### For Publishing (Required for releases)

1. **VSCE_PAT**: Visual Studio Code Extension Personal Access Token

   - Go to https://dev.azure.com/
   - Create a Personal Access Token with "Marketplace (Publish)" scope
   - Add it as a repository secret

2. **OVSX_PAT**: Open VSX Registry Personal Access Token
   - Go to https://open-vsx.org/
   - Create an account and generate a token
   - Add it as a repository secret

### How to Add Secrets

1. Go to your GitHub repository
2. Click on "Settings" tab
3. Click on "Secrets and variables" → "Actions"
4. Click "New repository secret"
5. Add the secret name and value

## Local Development

Before pushing code, run these commands locally:

```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Compile TypeScript
npm run compile

# Run tests
npm test

# Package extension
npm run package
```

## Workflow Status

You can check the status of workflows in the "Actions" tab of your GitHub repository.
