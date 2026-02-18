#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

function getArgs(name) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && i + 1 < args.length) {
      values.push(args[i + 1]);
      i++;
    }
  }
  return values;
}

const rootArgs = getArgs('--root');
const roots = rootArgs.length > 0 ? rootArgs : ['src'];
const filesFromArg = getArg('--files-from', null);
const baselineArg = getArg('--baseline', null);
const warnLimit = Number.parseInt(getArg('--warn', '500'), 10);
const failLimit = Number.parseInt(getArg('--fail', '700'), 10);

if (!Number.isFinite(warnLimit) || !Number.isFinite(failLimit) || warnLimit <= 0 || failLimit <= 0) {
  console.error('[loc-check] Invalid --warn/--fail values.');
  process.exit(2);
}
if (failLimit < warnLimit) {
  console.error('[loc-check] --fail must be >= --warn.');
  process.exit(2);
}

const codeExtensions = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
]);

const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
  '.turbo',
]);

const rootDirs = roots.map((root) => path.resolve(process.cwd(), root));
for (const rootDir of rootDirs) {
  if (!fs.existsSync(rootDir)) {
    console.error(`[loc-check] Root directory does not exist: ${rootDir}`);
    process.exit(2);
  }
}

function loadBaseline() {
  if (!baselineArg) return new Map();
  const baselinePath = path.resolve(process.cwd(), baselineArg);
  if (!fs.existsSync(baselinePath)) {
    console.error(`[loc-check] --baseline file does not exist: ${baselinePath}`);
    process.exit(2);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (error) {
    console.error(`[loc-check] Failed to parse baseline JSON: ${baselinePath}`);
    process.exit(2);
  }

  if (!parsed || typeof parsed !== 'object') {
    console.error('[loc-check] Invalid baseline format: expected an object of { "path": lineCount }.');
    process.exit(2);
  }

  const baseline = new Map();
  for (const [file, value] of Object.entries(parsed)) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      console.error(`[loc-check] Invalid baseline line count for "${file}": ${value}`);
      process.exit(2);
    }
    const norm = file.replace(/\\/g, '/');
    baseline.set(norm, num);
  }
  return baseline;
}

function isCodeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return codeExtensions.has(ext);
}

function isUnderAnyRoot(filePath) {
  const resolved = path.resolve(filePath);
  return rootDirs.some((rootDir) => {
    const rel = path.relative(rootDir, resolved);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      walk(fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isCodeFile(fullPath)) out.push(path.resolve(fullPath));
  }
  return out;
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.length === 0) return 0;
  return content.split(/\r\n|\r|\n/).length;
}

function collectFiles() {
  if (filesFromArg) {
    const listPath = path.resolve(process.cwd(), filesFromArg);
    if (!fs.existsSync(listPath)) {
      console.error(`[loc-check] --files-from file does not exist: ${listPath}`);
      process.exit(2);
    }
    const lines = fs.readFileSync(listPath, 'utf8').split(/\r\n|\r|\n/);
    const set = new Set();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const abs = path.resolve(process.cwd(), trimmed);
      if (!fs.existsSync(abs)) continue;
      if (!fs.statSync(abs).isFile()) continue;
      if (!isCodeFile(abs)) continue;
      if (!isUnderAnyRoot(abs)) continue;
      set.add(abs);
    }
    return [...set];
  }

  const set = new Set();
  for (const rootDir of rootDirs) {
    for (const filePath of walk(rootDir)) {
      set.add(filePath);
    }
  }
  return [...set];
}

const files = collectFiles();
const baseline = loadBaseline();
if (files.length === 0) {
  console.log('[loc-check] PASS - no matching source files to check.');
  process.exit(0);
}

const rows = files.map((filePath) => {
  const lines = countLines(filePath);
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  const baselineMax = baseline.get(rel);
  let status = 'OK';
  let reason = null;
  if (lines > failLimit) status = 'FAIL';
  else if (lines > warnLimit) status = 'WARN';
  if (status === 'FAIL' && Number.isFinite(baselineMax) && lines <= baselineMax) {
    status = 'BASELINE';
    reason = `allowed by baseline (<= ${baselineMax})`;
  }
  return {
    status,
    lines,
    file: rel,
    reason,
  };
});

rows.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));

const flagged = rows.filter((r) => r.status !== 'OK');
if (flagged.length === 0) {
  console.log(`[loc-check] PASS - checked ${rows.length} file(s), no files above warn threshold (${warnLimit}).`);
  process.exit(0);
}

console.log(`[loc-check] Policy: warn > ${warnLimit}, fail > ${failLimit}`);
if (baselineArg) {
  console.log(`[loc-check] Baseline: ${baselineArg} (${baseline.size} entr${baseline.size === 1 ? 'y' : 'ies'})`);
}
console.log(`[loc-check] Checked ${rows.length} file(s).`);
console.log('[loc-check] Files above threshold:');
for (const r of flagged) {
  const suffix = r.reason ? `  (${r.reason})` : '';
  console.log(`- [${r.status}] ${String(r.lines).padStart(5, ' ')} lines  ${r.file}${suffix}`);
}

const failures = flagged.filter((r) => r.status === 'FAIL');
if (failures.length > 0) {
  console.error(`[loc-check] FAIL - ${failures.length} file(s) exceed fail threshold (${failLimit}).`);
  process.exit(1);
}

console.log(`[loc-check] PASS with warnings - ${flagged.length} file(s) exceed warn threshold (${warnLimit}).`);
process.exit(0);
