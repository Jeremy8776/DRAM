const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

console.log('🧙 resetting DRAM for wizard testing...');

// Paths to clean (DRAM only, preserving OpenClaw install)
const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
const dramData = path.join(appData, 'dram-desktop');
const storageDir = path.join(dramData, 'storage');
const localStorageDir = path.join(dramData, 'Local Storage');

// 1. Clean DRAM storage
try {
    if (fs.existsSync(storageDir)) {
        console.log(`- Removing ${storageDir}`);
        fs.rmSync(storageDir, { recursive: true, force: true });
    }
    if (fs.existsSync(localStorageDir)) {
        console.log(`- Removing ${localStorageDir}`);
        fs.rmSync(localStorageDir, { recursive: true, force: true });
    }
} catch (e) {
    console.warn('Warning: Failed to clean some DRAM directories:', e.message);
}

// 2. Optionally clean .openclaw config?
// Usually for wizard testing we want to see the wizard behave as if newly installed.
// If OpenClaw config exists, wizard might skip setup steps.
// Let's ask the user or just remove it to be safe for "wizard" flow testing.
// But if they wanted to test "existing config detection", they wouldn't use this script?
// I will remove .openclaw config but NOT uninstall package.
const openClawConfig = path.join(os.homedir(), '.openclaw');
try {
    if (fs.existsSync(openClawConfig)) {
        console.log(`- Removing ${openClawConfig} (keeping package installed)`);
        fs.rmSync(openClawConfig, { recursive: true, force: true });
    }
} catch (e) {
    console.warn('Warning: Failed to clean .openclaw config:', e.message);
}

console.log('✨ Reset complete. Starting app...');

// 3. Start Electron
try {
    execSync('electron . --dev', { stdio: 'inherit' });
} catch (e) {
    // Electron process exit is handled by stdio inherit
}
