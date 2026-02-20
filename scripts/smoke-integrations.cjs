#!/usr/bin/env node
/* eslint-disable no-console */
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '..');
const BUNDLED_OPENCLAW = path.join(ROOT, 'resources', 'engine', 'openclaw.mjs');

function exists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  return {
    strict: argv.includes('--strict'),
    json: argv.includes('--json')
  };
}

function detectOpenClawCommand() {
  const win = process.platform === 'win32';
  const candidates = [];

  if (win) {
    candidates.push({ command: 'openclaw.cmd', argsPrefix: [] });
    const appData = process.env.APPDATA || '';
    if (appData) {
      candidates.push({ command: path.join(appData, 'npm', 'openclaw.cmd'), argsPrefix: [] });
    }
  } else {
    candidates.push({ command: 'openclaw', argsPrefix: [] });
  }

  if (exists(BUNDLED_OPENCLAW)) {
    candidates.push({ command: process.execPath, argsPrefix: [BUNDLED_OPENCLAW] });
  }

  return candidates;
}

async function tryRun(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || 120000;
  const win = process.platform === 'win32';
  const lowerCommand = String(command || '').toLowerCase();
  const isCmdShim = lowerCommand.endsWith('.cmd') || lowerCommand.endsWith('.bat');

  let result;
  if (win && isCmdShim) {
    const quote = (value) => {
      const str = String(value || '');
      if (!str.length) return '""';
      if (!/[ \t"&|<>^()]/.test(str)) return str;
      return `"${str.replace(/"/g, '""')}"`;
    };
    const commandLine = [quote(command), ...args.map(quote)].join(' ').trim();
    result = await execFileAsync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], {
      cwd: ROOT,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024,
      shell: false,
      windowsVerbatimArguments: true
    });
  } else {
    result = await execFileAsync(command, args, {
      cwd: ROOT,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024
    });
  }

  return {
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  };
}

async function resolveRuntime() {
  const candidates = detectOpenClawCommand();
  for (const candidate of candidates) {
    try {
      const args = [...candidate.argsPrefix, '--version'];
      const run = await tryRun(candidate.command, args, { timeoutMs: 30000 });
      const version = run.stdout.trim().split(/\r?\n/).pop() || 'unknown';
      return {
        command: candidate.command,
        argsPrefix: candidate.argsPrefix,
        version
      };
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('Unable to locate a runnable OpenClaw CLI (openclaw/openclaw.cmd/bundled openclaw.mjs)');
}

function normalizeJsonOutput(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return JSON.parse(text.slice(start, end + 1));
}

function parseRequirementSpec(spec) {
  const text = String(spec || '');
  const groups = text.split(';').map((chunk) => chunk.trim()).filter(Boolean);
  const parsed = {};
  for (const group of groups) {
    const idx = group.indexOf(':');
    if (idx === -1) continue;
    const key = group.slice(0, idx).trim();
    const value = group.slice(idx + 1).trim();
    if (!key) continue;
    parsed[key] = value;
  }
  return parsed;
}

function parseSkillsCheck(rawText) {
  const text = String(rawText || '');
  const total = Number((text.match(/Total:\s+(\d+)/) || [])[1] || 0);
  const eligible = Number((text.match(/Eligible:\s+(\d+)/) || [])[1] || 0);
  const disabled = Number((text.match(/Disabled:\s+(\d+)/) || [])[1] || 0);
  const missing = Number((text.match(/Missing requirements:\s+(\d+)/) || [])[1] || 0);

  const lines = text.split(/\r?\n/);
  const missingSkills = [];
  let inMissing = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^Missing requirements:/i.test(trimmed)) {
      inMissing = true;
      continue;
    }
    if (!inMissing) continue;
    if (/^Tip:/i.test(trimmed)) break;

    const entry = trimmed.match(/^(?:[^a-zA-Z0-9]*)?([a-z0-9-]+)\s*\((.+)\)$/i);
    if (!entry) continue;

    const skill = entry[1].trim();
    const requirement = entry[2].trim();
    missingSkills.push({
      skill,
      requirement,
      parsedRequirement: parseRequirementSpec(requirement)
    });
  }

  const requirementCounts = {};
  for (const item of missingSkills) {
    const keys = Object.keys(item.parsedRequirement);
    if (!keys.length) {
      requirementCounts.other = (requirementCounts.other || 0) + 1;
      continue;
    }
    for (const key of keys) {
      requirementCounts[key] = (requirementCounts[key] || 0) + 1;
    }
  }

  return {
    total,
    eligible,
    disabled,
    missing,
    missingSkills,
    requirementCounts
  };
}

function summarizePlugins(payload) {
  const plugins = Array.isArray(payload?.plugins) ? payload.plugins : [];
  const byStatus = {};
  for (const plugin of plugins) {
    const status = String(plugin?.status || 'unknown').toLowerCase();
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  const loaded = plugins.filter((plugin) => String(plugin?.status || '').toLowerCase() === 'loaded');
  const disabled = plugins.filter((plugin) => String(plugin?.status || '').toLowerCase() === 'disabled');
  const errors = plugins
    .filter((plugin) => String(plugin?.status || '').toLowerCase() === 'error')
    .map((plugin) => ({
      id: plugin.id,
      source: plugin.source,
      error: String(plugin.error || '').split(/\r?\n/)[0]
    }));

  const loadedChannels = loaded
    .filter((plugin) => Array.isArray(plugin.channelIds) && plugin.channelIds.length > 0)
    .map((plugin) => plugin.id)
    .sort();

  return {
    total: plugins.length,
    byStatus,
    loadedCount: loaded.length,
    disabledCount: disabled.length,
    errorCount: errors.length,
    loadedChannels,
    errors
  };
}

function printSummary(summary) {
  console.log('OpenClaw Integration Smoke Report');
  console.log('=================================');
  console.log(`Runtime: ${summary.runtime.command} ${summary.runtime.argsPrefix.join(' ')} (version ${summary.runtime.version})`);
  console.log(`Workspace: ${summary.workspace || 'unknown'}`);
  console.log('');

  console.log('Plugins');
  console.log(`- Total: ${summary.plugins.total}`);
  console.log(`- Loaded: ${summary.plugins.loadedCount}`);
  console.log(`- Disabled: ${summary.plugins.disabledCount}`);
  console.log(`- Errors: ${summary.plugins.errorCount}`);
  console.log(`- Loaded channel plugins: ${summary.plugins.loadedChannels.join(', ') || 'none'}`);
  if (summary.plugins.errors.length > 0) {
    console.log('- Error plugins:');
    for (const plugin of summary.plugins.errors) {
      console.log(`  - ${plugin.id}: ${plugin.error}`);
    }
  }

  console.log('');
  console.log('Skills');
  console.log(`- Total: ${summary.skills.total}`);
  console.log(`- Eligible (ready): ${summary.skills.eligible}`);
  console.log(`- Disabled: ${summary.skills.disabled}`);
  console.log(`- Missing requirements: ${summary.skills.missing}`);
  const requirementOrder = Object.entries(summary.skills.requirementCounts)
    .sort((a, b) => b[1] - a[1]);
  if (requirementOrder.length > 0) {
    console.log('- Missing requirement categories:');
    for (const [category, count] of requirementOrder) {
      console.log(`  - ${category}: ${count}`);
    }
  }

  const topMissing = summary.skills.missingSkills.slice(0, 10);
  if (topMissing.length > 0) {
    console.log('- Sample missing skills:');
    for (const item of topMissing) {
      console.log(`  - ${item.skill}: ${item.requirement}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let runtime = null;
  try {
    runtime = await resolveRuntime();
  } catch (err) {
    const message = String(err?.message || err);
    if (!args.strict && /Unable to locate a runnable OpenClaw CLI/i.test(message)) {
      if (args.json) {
        console.log(JSON.stringify({
          skipped: true,
          reason: 'runtime_missing',
          message
        }, null, 2));
      } else {
        console.log(`[smoke:integrations] Skipped: ${message}`);
        console.log('[smoke:integrations] Tip: run with --strict to require a local/bundled OpenClaw runtime.');
      }
      return;
    }
    throw err;
  }

  const pluginRun = await tryRun(runtime.command, [...runtime.argsPrefix, 'plugins', 'list', '--json'], { timeoutMs: 120000 });
  const pluginPayload = normalizeJsonOutput(pluginRun.stdout);
  if (!pluginPayload) {
    throw new Error('Failed to parse `openclaw plugins list --json` output');
  }

  const skillsRun = await tryRun(runtime.command, [...runtime.argsPrefix, 'skills', 'check'], { timeoutMs: 120000 });
  const skillsSummary = parseSkillsCheck(skillsRun.stdout || skillsRun.stderr);

  const summary = {
    generatedAt: new Date().toISOString(),
    runtime,
    workspace: pluginPayload.workspaceDir || '',
    plugins: summarizePlugins(pluginPayload),
    skills: skillsSummary
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSummary(summary);
  }

  if (args.strict && (summary.plugins.errorCount > 0 || summary.skills.missing > 0)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[smoke:integrations] Failed:', err.message || err);
  process.exitCode = 1;
});
