#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const runtimeDir = path.join(root, 'runtime');
const tscEntry = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const codeExts = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const passthroughCodeExts = new Set(['.js', '.mjs', '.cjs']);

function rmrf(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyStaticAssets(srcPath, outPath) {
  const entries = fs.readdirSync(srcPath, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(srcPath, entry.name);
    const to = path.join(outPath, entry.name);
    if (entry.isDirectory()) {
      copyStaticAssets(from, to);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (codeExts.has(ext)) continue;
    ensureDir(path.dirname(to));
    fs.copyFileSync(from, to);
  }
}

function copyPassthroughCode(srcPath, outPath) {
  const entries = fs.readdirSync(srcPath, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(srcPath, entry.name);
    const to = path.join(outPath, entry.name);
    if (entry.isDirectory()) {
      copyPassthroughCode(from, to);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!passthroughCodeExts.has(ext)) continue;
    ensureDir(path.dirname(to));
    fs.copyFileSync(from, to);
  }
}

function runTsc() {
  const result = spawnSync(
    process.execPath,
    [tscEntry, '-p', path.join(root, 'tsconfig.runtime.json')],
    { stdio: 'inherit', shell: false }
  );
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  console.log('[build-runtime] Cleaning runtime output...');
  rmrf(runtimeDir);

  console.log('[build-runtime] Transpiling runtime sources...');
  runTsc();

  console.log('[build-runtime] Copying JS/CJS passthrough modules...');
  copyPassthroughCode(srcDir, runtimeDir);

  console.log('[build-runtime] Copying static renderer assets...');
  copyStaticAssets(path.join(srcDir, 'renderer'), path.join(runtimeDir, 'renderer'));

  console.log('[build-runtime] Runtime build complete.');
}

main();
