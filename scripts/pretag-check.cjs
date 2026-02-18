#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const npmBin = 'npm';

const checks = [
  { name: 'Typecheck', args: ['run', 'typecheck'] },
  { name: 'Tests', args: ['run', 'test'] },
  { name: 'Build smoke', args: ['run', 'build:runtime'] },
  { name: 'Bundle smoke', args: ['run', 'bundle-engine'] }
];

function runCheck(check) {
  const pretty = `${npmBin} ${check.args.join(' ')}`;
  console.log(`\n[pretag] ${check.name}: ${pretty}`);
  const result = spawnSync(npmBin, check.args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32'
  });

  if (result.error) {
    console.error(`[pretag] ${check.name} failed to start:`, result.error.message);
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    console.error(`[pretag] ${check.name} failed with exit code ${result.status}`);
    process.exit(result.status);
  }

  if (result.signal) {
    console.error(`[pretag] ${check.name} terminated by signal ${result.signal}`);
    process.exit(1);
  }
}

console.log('[pretag] Running pre-tag checks...');
checks.forEach(runCheck);
console.log('\n[pretag] All pre-tag checks passed.');
