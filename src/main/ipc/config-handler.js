/**
 * DRAM IPC - Config Handlers
 * Handles DRAM configuration file operations (Symbiotic Mode)
 */
import path from 'path';
import fsPromises from 'fs/promises';
import { app } from 'electron';

/**
 * Register config-related IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 */
export function registerConfigHandlers(ipc, _windowManager) {
    const deepMerge = (target, source) => {
        for (const key of Object.keys(source || {})) {
            const nextVal = source[key];
            if (nextVal && typeof nextVal === 'object' && !Array.isArray(nextVal)) {
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                    target[key] = {};
                }
                deepMerge(target[key], nextVal);
            } else {
                target[key] = nextVal;
            }
        }
        return target;
    };

    const ensureGatewayDefaults = (cfg) => {
        if (!cfg.gateway || typeof cfg.gateway !== 'object' || Array.isArray(cfg.gateway)) {
            cfg.gateway = {};
        }
        if (!cfg.gateway.mode || typeof cfg.gateway.mode !== 'string') {
            cfg.gateway.mode = 'local';
        }
        if (!cfg.gateway.auth || typeof cfg.gateway.auth !== 'object' || Array.isArray(cfg.gateway.auth)) {
            cfg.gateway.auth = {};
        }
        if (!cfg.gateway.auth.mode || typeof cfg.gateway.auth.mode !== 'string') {
            cfg.gateway.auth.mode = 'token';
        }
        if (!cfg.gateway.controlUi || typeof cfg.gateway.controlUi !== 'object' || Array.isArray(cfg.gateway.controlUi)) {
            cfg.gateway.controlUi = {};
        }
        if (!Array.isArray(cfg.gateway.controlUi.allowedOrigins) || cfg.gateway.controlUi.allowedOrigins.length === 0) {
            cfg.gateway.controlUi.allowedOrigins = ['*'];
        }
    };

    /**
     * Write DRAM config
     * In symbiotic mode, we write directly to OpenClaw's native format
     */
    ipc.handle('dram:writeConfig', async (event, config) => {
        try {
            // Basic validation
            if (!config || typeof config !== 'object') {
                throw new Error('Invalid config: must be an object');
            }

            const home = app.getPath('home');
            const configDir = path.join(home, '.openclaw');
            const configPath = path.join(configDir, 'openclaw.json');

            // Ensure configDir is within home directory (prevent path traversal)
            const resolvedConfigDir = path.resolve(configDir);
            const resolvedHome = path.resolve(home);
            if (!resolvedConfigDir.startsWith(resolvedHome)) {
                throw new Error('Invalid config directory: path traversal detected');
            }

            await fsPromises.mkdir(configDir, { recursive: true, mode: 0o700 });

            let existingConfig = {};
            try {
                const rawExisting = await fsPromises.readFile(configPath, 'utf-8');
                existingConfig = JSON.parse(rawExisting);
            } catch {
                existingConfig = {};
            }

            const mergedConfig = deepMerge(existingConfig, config);
            ensureGatewayDefaults(mergedConfig);

            await fsPromises.writeFile(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
            console.log('[Config] Written to:', configPath);
            return true;
        } catch (err) {
            console.error('dram:writeConfig error:', err);
            throw err;
        }
    });
}
