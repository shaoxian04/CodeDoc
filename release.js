#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

// Get command line argument for version type
const versionType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(versionType)) {
    console.error('❌ Invalid version type. Use: patch, minor, or major');
    process.exit(1);
}

console.log(`🚀 Starting ${versionType} release...`);

try {
    // Get current version
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = packageJson.version;
    console.log(`📦 Current version: ${currentVersion}`);

    // Step 1: Bump version and create tag
    console.log(`⬆️  Bumping ${versionType} version...`);
    execSync(`npm version ${versionType}`, { stdio: 'inherit' });

    // Get new version
    const newPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const newVersion = newPackageJson.version;
    console.log(`✅ New version: ${newVersion}`);

    // Step 2: Push changes and tags
    console.log('📤 Pushing to GitHub...');
    execSync('git push', { stdio: 'inherit' });
    execSync('git push --tags', { stdio: 'inherit' });

    // Step 3: Bundle extension with dependencies
    console.log('📦 Bundling extension with dependencies...');
    execSync('npm run package-extension', { stdio: 'inherit' });

    // Step 4: Publish to marketplace
    console.log('🌐 Publishing to VS Code Marketplace...');
    execSync('vsce publish', { stdio: 'inherit' });

    console.log(`🎉 Successfully released version ${newVersion}!`);
    console.log(`📋 Summary:`);
    console.log(`   • Version: ${currentVersion} → ${newVersion}`);
    console.log(`   • Git tag: v${newVersion} created and pushed`);
    console.log(`   • Published to VS Code Marketplace`);
    console.log(`   • View at: https://marketplace.visualstudio.com/items?itemName=NP.codedocx`);

} catch (error) {
    console.error('❌ Release failed:', error.message);
    process.exit(1);
}