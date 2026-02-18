const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Paths to clean
const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
const dramData = path.join(appData, 'dram-desktop');
const storageDir = path.join(dramData, 'storage');
const localStorageDir = path.join(dramData, 'Local Storage');
const openClawConfig = path.join(os.homedir(), '.openclaw');

// 0. Kill existing processes to prevent EBUSY/EPERM
try {
    console.log('🔫 Killing existing DRAM/OpenClaw processes...');
    if (process.platform === 'win32') {
        // Kill electron
        try { execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' }); } catch (e) { }

        // Kill anything on the engine port (18789)
        try {
            const output = execSync('netstat -ano | findstr :18789', { encoding: 'utf-8' });
            const pids = output.split('\n')
                .map(line => line.trim().split(/\s+/).pop())
                .filter(pid => pid && pid !== '0' && /^\d+$/.test(pid));

            for (const pid of new Set(pids)) {
                console.log(`- Killing process on port 18789 (PID: ${pid})`);
                try { execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' }); } catch (e) { }
            }
        } catch (e) {
            // No process on port
        }
    } else {
        execSync('pkill -f electron || true');
        execSync('pkill -f openclaw || true');
    }
} catch (e) {
    // Ignore if processes not found
}

console.log('🧹 Cleaning up DRAM Desktop state for fresh install simulation...');

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

// 2. Clean OpenClaw config
try {
    if (fs.existsSync(openClawConfig)) {
        console.log(`- Removing ${openClawConfig}`);
        fs.rmSync(openClawConfig, { recursive: true, force: true });
    }
} catch (e) {
    console.warn('Warning: Failed to clean .openclaw:', e.message);
}

// 3. Uninstall global OpenClaw
try {
    console.log('- Uninstalling global OpenClaw...');
    execSync('npm uninstall -g openclaw', { stdio: 'inherit' });
} catch (e) {
    console.warn('Warning: Failed to uninstall openclaw (might not be installed):', e.message);
}

console.log('✨ Clean complete. Starting app...');

// 4. Start Electron
try {
    execSync('electron . --dev', { stdio: 'inherit' });
} catch (e) {
    // Electron process exit is handled by stdio inherit
}
