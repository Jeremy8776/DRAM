#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const fromDir = resolveArg('--from') || 'dist';
const toDir = resolveArg('--to') || 'dist-release';
const platform = normalizePlatform(resolveArg('--platform') || '');

if (!platform) {
  fail('Missing or invalid --platform. Use windows|linux|macos.');
}

const sourceRoot = path.resolve(process.cwd(), fromDir);
const destRoot = path.resolve(process.cwd(), toDir);

if (!fs.existsSync(sourceRoot)) {
  fail(`Source directory not found: ${sourceRoot}`);
}

fs.rmSync(destRoot, { recursive: true, force: true });
fs.mkdirSync(destRoot, { recursive: true });

const allowedExtensions = new Set(['.exe', '.appimage', '.deb', '.dmg', '.zip', '.blockmap', '.yml', '.yaml']);
const platformMatchers = {
  windows: (name) => name.endsWith('.exe') || name.endsWith('.blockmap') || name.endsWith('.yml') || name.endsWith('.yaml'),
  linux: (name) => name.endsWith('.appimage') || name.endsWith('.deb') || name.endsWith('.yml') || name.endsWith('.yaml'),
  macos: (name) => name.endsWith('.dmg') || name.endsWith('.zip') || name.endsWith('.blockmap') || name.endsWith('.yml') || name.endsWith('.yaml')
};

const candidates = fs
  .readdirSync(sourceRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

const selected = candidates.filter((name) => {
  const lower = name.toLowerCase();
  const ext = path.extname(lower);
  if (!allowedExtensions.has(ext)) return false;
  if (!platformMatchers[platform](lower)) return false;
  if (ext === '.yml' || ext === '.yaml') {
    if (!lower.startsWith('latest')) return false;
  }
  return true;
});

if (selected.length === 0) {
  fail(`No release assets found for ${platform} in ${sourceRoot}`);
}

for (const name of selected) {
  fs.copyFileSync(path.join(sourceRoot, name), path.join(destRoot, name));
}

console.log(`[collect-release-assets] ${platform}: copied ${selected.length} file(s) to ${destRoot}`);
for (const name of selected.sort()) {
  console.log(` - ${name}`);
}

function resolveArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return '';
  return String(args[index + 1] || '').trim();
}

function normalizePlatform(value) {
  const lower = String(value || '').toLowerCase();
  if (lower === 'win' || lower === 'windows') return 'windows';
  if (lower === 'linux') return 'linux';
  if (lower === 'mac' || lower === 'macos' || lower === 'darwin') return 'macos';
  return '';
}

function fail(message) {
  console.error(`[collect-release-assets] ${message}`);
  process.exit(1);
}
