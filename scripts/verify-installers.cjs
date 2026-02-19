#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const platformArg = getArgValue(args, '--platform');
const distDirArg = getArgValue(args, '--dist');

if (!platformArg) {
  usageAndExit('Missing required --platform argument.');
}

const platform = normalizePlatform(platformArg);
if (!platform) {
  usageAndExit(`Unsupported platform "${platformArg}".`);
}

const distDir = path.resolve(process.cwd(), distDirArg || 'dist');
if (!fs.existsSync(distDir)) {
  fail(`Dist directory not found: ${distDir}`);
}

const files = listFilesRecursive(distDir).map((filePath) => path.relative(distDir, filePath));
if (files.length === 0) {
  fail(`No files found in dist directory: ${distDir}`);
}

const checks = buildChecks(platform);
const missing = [];

for (const check of checks) {
  const matches = files.filter((file) => check.match(file));
  if (matches.length === 0) {
    missing.push(check.label);
  } else {
    console.log(`[verify-installers] ${check.label}: ${matches.join(', ')}`);
  }
}

if (missing.length > 0) {
  fail(
    `Missing expected installer artifact(s) for ${platform}: ${missing.join(', ')}.\n` +
      `Scanned ${files.length} file(s) in ${distDir}.`
  );
}

console.log(`[verify-installers] Installer artifacts validated for ${platform}.`);

function buildChecks(targetPlatform) {
  if (targetPlatform === 'windows') {
    return [
      { label: 'Windows NSIS setup (.exe)', match: (file) => /setup.*\.exe$/i.test(file) },
      { label: 'Windows portable (.exe)', match: (file) => /portable.*\.exe$/i.test(file) }
    ];
  }

  if (targetPlatform === 'linux') {
    return [
      { label: 'Linux AppImage', match: (file) => /\.AppImage$/i.test(file) },
      { label: 'Linux deb', match: (file) => /\.deb$/i.test(file) }
    ];
  }

  return [
    { label: 'macOS dmg', match: (file) => /\.dmg$/i.test(file) },
    { label: 'macOS zip', match: (file) => /\.zip$/i.test(file) }
  ];
}

function listFilesRecursive(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function getArgValue(argv, key) {
  const index = argv.indexOf(key);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] || null;
}

function normalizePlatform(value) {
  const lower = String(value).toLowerCase();
  if (lower === 'win' || lower === 'windows') {
    return 'windows';
  }
  if (lower === 'linux') {
    return 'linux';
  }
  if (lower === 'mac' || lower === 'macos' || lower === 'darwin') {
    return 'macos';
  }
  return null;
}

function usageAndExit(message) {
  if (message) {
    console.error(`[verify-installers] ${message}`);
  }
  console.error('Usage: node scripts/verify-installers.cjs --platform <windows|linux|macos> [--dist <path>]');
  process.exit(1);
}

function fail(message) {
  console.error(`[verify-installers] ${message}`);
  process.exit(1);
}
