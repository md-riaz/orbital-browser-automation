#!/usr/bin/env node

// Skip Chromium installation if running in Docker or CI environment
if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  console.log('Skipping Chromium installation (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)');
  process.exit(0);
}

// Install Chromium browser binaries
console.log('Installing Chromium browser binaries...');
const { execSync } = require('child_process');

try {
  execSync('npx playwright install chromium', { stdio: 'inherit' });
  console.log('Chromium installation completed successfully');
} catch (error) {
  console.error('Failed to install Chromium:', error.message);
  console.error('You can manually install Chromium later by running: npx playwright install chromium');
  // Don't fail the installation if Chromium download fails
  process.exit(0);
}
