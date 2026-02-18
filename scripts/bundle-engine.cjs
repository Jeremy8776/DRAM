/**
 * Bundle official OpenClaw engine with DRAM Plugin Core
 * This creates a standalone engine in resources/engine/
 * 
 * NOTE: This is now OPTIONAL. DRAM can also work with globally installed OpenClaw.
 * Run this if you want a bundled fallback engine.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const ENGINE_SRC = path.join(ROOT_DIR, 'node_modules', 'openclaw');
const PLUGIN_SRC = path.join(ROOT_DIR, 'packages', 'dram-plugin');
const ENGINE_DEST = path.join(ROOT_DIR, 'resources', 'engine');

console.log('=== Bundling DRAM + Official OpenClaw ===\n');

// Check if OpenClaw is installed
if (!fs.existsSync(ENGINE_SRC)) {
  console.log('Note: Official OpenClaw not found in node_modules.');
  console.log('DRAM will use globally installed OpenClaw instead.');
  console.log('To bundle, run: npm install openclaw');
  console.log('\n=== Bundle skipped (using global OpenClaw mode) ===');
  process.exit(0);
}

// 1. Build the DRAM Plugin
console.log('Building DRAM Plugin...');
try {
  execSync('npm run build', { cwd: PLUGIN_SRC, stdio: 'inherit' });
} catch (err) {
  console.error('Failed to build DRAM Plugin:', err.message);
  process.exit(1);
}

// 2. Clean and create destination
console.log('\nCleaning destination...');
if (fs.existsSync(ENGINE_DEST)) {
  try {
    fs.rmSync(ENGINE_DEST, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Warning: Failed to clean ${ENGINE_DEST}.`);
  }
}
fs.mkdirSync(ENGINE_DEST, { recursive: true });

// 3. Copy official OpenClaw source
console.log('Copying OpenClaw core...');
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(ENGINE_SRC, ENGINE_DEST);

// 4. Inject DRAM Plugin into extensions
console.log('Injecting DRAM Plugin...');
const PLUGIN_DEST = path.join(ENGINE_DEST, 'extensions', 'dram-core');
fs.mkdirSync(PLUGIN_DEST, { recursive: true });

// Copy plugin files
const pluginFiles = ['package.json', 'openclaw.plugin.json', 'dist'];
for (const f of pluginFiles) {
  const s = path.join(PLUGIN_SRC, f);
  const d = path.join(PLUGIN_DEST, f);
  if (!fs.existsSync(s)) continue;
  if (fs.lstatSync(s).isDirectory()) {
    copyDir(s, d);
  } else {
    fs.copyFileSync(s, d);
  }
}

// 4a. Install plugin dependencies
console.log('\nInstalling DRAM Plugin dependencies...');
try {
  execSync('npm install --production --no-audit --no-fund', {
    cwd: PLUGIN_DEST,
    stdio: 'inherit'
  });
} catch (err) {
  console.warn('Warning: Failed to install plugin dependencies:', err.message);
}

// 5. Install production dependencies in the bundled engine
console.log('\nInstalling production dependencies for the core bundle...');
try {
  execSync('npm install --production --no-audit --no-fund', {
    cwd: ENGINE_DEST,
    stdio: 'inherit'
  });
  console.log('Dependencies installed successfully!');
} catch (err) {
  console.error('Failed to install dependencies:', err.message);
  process.exit(1);
}

// 6. Create bundle info
fs.writeFileSync(
  path.join(ENGINE_DEST, '.bundle-info.json'),
  JSON.stringify({
    bundledAt: new Date().toISOString(),
    engineVersion: require(path.join(ENGINE_SRC, 'package.json')).version,
    pluginVersion: require(path.join(PLUGIN_SRC, 'package.json')).version,
    platform: process.platform,
    note: 'DRAM can also use globally installed OpenClaw (preferred mode)'
  }, null, 2)
);

console.log('\n=== Bundle complete ===');
console.log(`Location: ${ENGINE_DEST}`);
console.log('Note: DRAM prefers globally installed OpenClaw if available.\n');
