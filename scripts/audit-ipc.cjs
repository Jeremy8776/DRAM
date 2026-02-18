#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAIN_DIR = path.join(ROOT, 'src', 'main');
const PRELOAD_DIR = path.join(ROOT, 'src', 'preload');
const RENDERER_DIR = path.join(ROOT, 'src', 'renderer');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(js|cjs|mjs|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function toRel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

const handleRe = /\b(?:ipcMain|ipc)\.handle\(\s*['"]([^'"]+)['"]/g;
const onRe = /\b(?:ipcMain|ipc)\.on\(\s*['"]([^'"]+)['"]/g;
const invokeRe = /\b(?:safeInvoke|ipcRenderer\.invoke)\(\s*['"]([^'"]+)['"]/g;
const sendRe = /\bipcRenderer\.send\(\s*['"]([^'"]+)['"]/g;

const mainHandles = new Set();
const mainOns = new Set();
const handleSources = new Map();
const onSources = new Map();
const clientInvokes = new Set();
const clientSends = new Set();

for (const file of walk(MAIN_DIR)) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = handleRe.exec(text))) {
    const channel = m[1];
    mainHandles.add(channel);
    if (!handleSources.has(channel)) handleSources.set(channel, []);
    handleSources.get(channel).push(toRel(file));
  }
  while ((m = onRe.exec(text))) {
    const channel = m[1];
    mainOns.add(channel);
    if (!onSources.has(channel)) onSources.set(channel, []);
    onSources.get(channel).push(toRel(file));
  }
}

for (const file of [...walk(PRELOAD_DIR), ...walk(RENDERER_DIR)]) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = invokeRe.exec(text))) clientInvokes.add(m[1]);
  while ((m = sendRe.exec(text))) clientSends.add(m[1]);
}

const missingInvoke = [...clientInvokes].filter((c) => !mainHandles.has(c)).sort();
const missingSend = [...clientSends].filter((c) => !mainOns.has(c)).sort();

const duplicateHandles = [...handleSources.entries()]
  .filter(([, files]) => files.length > 1)
  .sort(([a], [b]) => a.localeCompare(b));
const duplicateOns = [...onSources.entries()]
  .filter(([, files]) => files.length > 1)
  .sort(([a], [b]) => a.localeCompare(b));

const unusedHandles = [...mainHandles].filter((c) => !clientInvokes.has(c)).sort();
const unusedOns = [...mainOns].filter((c) => !clientSends.has(c)).sort();

console.log(`[IPC Audit] main handles=${mainHandles.size}, main ons=${mainOns.size}`);
console.log(`[IPC Audit] client invokes=${clientInvokes.size}, client sends=${clientSends.size}`);

if (missingInvoke.length) {
  console.log('\n[IPC Audit] Missing invoke->handle channels:');
  for (const channel of missingInvoke) console.log(` - ${channel}`);
}
if (missingSend.length) {
  console.log('\n[IPC Audit] Missing send->on channels:');
  for (const channel of missingSend) console.log(` - ${channel}`);
}
if (duplicateHandles.length) {
  console.log('\n[IPC Audit] Duplicate ipc.handle channels:');
  for (const [channel, files] of duplicateHandles) {
    console.log(` - ${channel}`);
    for (const file of files) console.log(`   * ${file}`);
  }
}
if (duplicateOns.length) {
  console.log('\n[IPC Audit] Duplicate ipc.on channels:');
  for (const [channel, files] of duplicateOns) {
    console.log(` - ${channel}`);
    for (const file of files) console.log(`   * ${file}`);
  }
}

if (unusedHandles.length) {
  console.log('\n[IPC Audit] Unused handles (informational):');
  for (const channel of unusedHandles) console.log(` - ${channel}`);
}
if (unusedOns.length) {
  console.log('\n[IPC Audit] Unused ons (informational):');
  for (const channel of unusedOns) console.log(` - ${channel}`);
}

const hasBlockingIssues = missingInvoke.length > 0 || missingSend.length > 0 || duplicateHandles.length > 0 || duplicateOns.length > 0;
if (hasBlockingIssues) {
  console.error('\n[IPC Audit] FAILED');
  process.exit(1);
}

console.log('\n[IPC Audit] PASSED');
