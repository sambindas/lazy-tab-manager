#!/usr/bin/env node
// build.js — copies the correct manifest and optionally zips the extension
// Usage:
//   node build.js chrome   → sets manifest.json for Chrome/Edge
//   node build.js firefox  → sets manifest.json for Firefox
//   node build.js chrome --zip
//   node build.js firefox --zip

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const target = process.argv[2];
const shouldZip = process.argv.includes('--zip');

if (!target || !['chrome', 'firefox'].includes(target)) {
  console.error('Usage: node build.js [chrome|firefox] [--zip]');
  process.exit(1);
}

const src = path.join(__dirname, `manifest.${target}.json`);
const dest = path.join(__dirname, 'manifest.json');

fs.copyFileSync(src, dest);
console.log(`✓ Copied manifest.${target}.json → manifest.json`);

if (shouldZip) {
  const zipName = `lazy-tab-manager-${target}.zip`;
  const exclude = [
    '--exclude=*.git*',
    '--exclude=build.js',
    '--exclude=manifest.chrome.json',
    '--exclude=manifest.firefox.json',
    `--exclude=${zipName}`,
    '--exclude=*.zip',
  ].join(' ');

  execSync(`zip -r ${zipName} . ${exclude}`, { cwd: __dirname, stdio: 'inherit' });
  console.log(`✓ Created ${zipName}`);
}

console.log(`\nDone! Load the folder in ${target === 'chrome' ? 'Chrome/Edge' : 'Firefox'}.`);
