#!/usr/bin/env node
// build.js — copies the correct manifest and optionally zips the extension
// Usage:
//   node build.js chrome              → sets manifest.json for Chrome/Edge
//   node build.js firefox             → sets manifest.json for Firefox
//   node build.js chrome --zip        → also creates a zip
//   node build.js chrome --zip --bump          → bumps patch version (1.0.0 → 1.0.1)
//   node build.js chrome --zip --bump minor    → bumps minor version (1.0.0 → 1.1.0)
//   node build.js chrome --zip --bump major    → bumps major version (1.0.0 → 2.0.0)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const target = process.argv[2];
const shouldZip = process.argv.includes('--zip');
const bumpIdx = process.argv.indexOf('--bump');
const shouldBump = bumpIdx !== -1;
const bumpType = process.argv[bumpIdx + 1] || 'patch';

if (!target || !['chrome', 'firefox'].includes(target)) {
  console.error('Usage: node build.js [chrome|firefox] [--zip] [--bump [major|minor|patch]]');
  process.exit(1);
}

if (shouldBump && !['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('--bump type must be one of: major, minor, patch');
  process.exit(1);
}

// ─── Version bump ─────────────────────────────────────────────────────────────
function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

let version;

if (shouldBump) {
  // Read current version from package.json
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const oldVersion = pkg.version;
  version = bumpVersion(oldVersion, bumpType);

  // Update package.json
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✓ Bumped version: ${oldVersion} → ${version} (${bumpType})`);

  // Update both manifests
  for (const name of ['manifest.chrome.json', 'manifest.firefox.json']) {
    const mPath = path.join(__dirname, name);
    const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    manifest.version = version;
    fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`✓ Updated version in ${name}`);
  }
} else {
  // Just read current version for display
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  version = pkg.version;
}

// ─── Copy manifest ────────────────────────────────────────────────────────────
const src = path.join(__dirname, `manifest.${target}.json`);
const dest = path.join(__dirname, 'manifest.json');
fs.copyFileSync(src, dest);
console.log(`✓ Copied manifest.${target}.json → manifest.json`);

// ─── Zip ──────────────────────────────────────────────────────────────────────
if (shouldZip) {
  const zipName = `lazy-tab-manager-${target}-v${version}.zip`;
  const exclude = [
    '--exclude=*.git*',
    '--exclude=build.js',
    '--exclude=manifest.chrome.json',
    '--exclude=manifest.firefox.json',
    '--exclude=*.zip',
    '--exclude=package.json',
    '--exclude=README.md',
    '--exclude=LICENSE',
  ].join(' ');

  execSync(`zip -r ${zipName} . ${exclude}`, { cwd: __dirname, stdio: 'inherit' });
  console.log(`✓ Created ${zipName}`);
}

console.log(`\nv${version} ready for ${target === 'chrome' ? 'Chrome/Edge' : 'Firefox'}.`);
