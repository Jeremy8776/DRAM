/**
 * DRAM IPC - Storage Handlers
 */
import { app, dialog } from 'electron';
import path from 'path';
import fsPromises from 'fs/promises';
import { validateSettingsKey } from '../ipc-validation.js';

export function registerStorageHandlers(ipc, stateManager, windowManager, debugLog) {
    /**
     * Get a setting value
     */
    ipc.handle('storage:get', async (_event, key) => {
        try {
            validateSettingsKey(key);
            return stateManager.get(key);
        } catch (err) {
            debugLog('storage:get error:', err.message);
            // Return undefined instead of null for missing keys
            return undefined;
        }
    });

    /**
     * Set a setting value
     */
    ipc.handle('storage:set', async (_event, key, value) => {
        try {
            validateSettingsKey(key);
            return await stateManager.set(key, value);
        } catch (err) {
            debugLog('storage:set error:', err.message);
            return false;
        }
    });

    /**
     * Delete a setting
     */
    ipc.handle('storage:delete', async (_event, key) => {
        try {
            validateSettingsKey(key);
            return await stateManager.delete(key);
        } catch (err) {
            console.error('storage:delete error:', err);
            return false;
        }
    });

    /**
     * Get all non-sensitive settings
     */
    ipc.handle('storage:getAll', async (_event) => {
        try {
            return stateManager.getAll();
        } catch (err) {
            console.error('storage:getAll error:', err);
            return {};
        }
    });

    /**
     * Check if encryption is available
     */
    ipc.handle('storage:isEncrypted', async (_event) => {
        return stateManager.secureStorage.isEncryptionAvailable();
    });

    /**
     * DEEP WIPE: Clear all storage, session data, and DRAM configs
     */
    ipc.handle('storage:wipe', async (_event) => {
        try {
            const mainWindow = windowManager.getMainWindow();
            const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Confirm Full Reset',
                message: 'This will permanently erase local DRAM data on this machine.',
                detail: 'This includes encrypted settings, session storage, and local DRAM config files. This cannot be undone.',
                buttons: ['Cancel', 'Wipe Everything'],
                defaultId: 0,
                cancelId: 0,
                noLink: true
            });
            if (response !== 1) {
                debugLog('Main: Wipe cancelled by user.');
                return false;
            }

            debugLog('Main: Performing COMPLETE SYSTEM WIPE...');

            // 1. Clear SecureStorage files
            await stateManager.secureStorage.wipeAll();

            // 2. Clear Electron session data (cookies, localStorage, indexedDB, cache)
            const win = windowManager.getMainWindow();
            if (win) {
                const session = win.webContents.session;
                await session.clearStorageData();
                await session.clearCache();
            }

            // 3. Clear DRAM Engine config file specifically
            const home = app.getPath('home');
            const configPath = path.join(home, '.dram', 'dram.json');
            try {
                await fsPromises.unlink(configPath);
            } catch {
                // File may not exist, that's fine
            }

            debugLog('Main: Wipe complete.');
            return true;
        } catch (err) {
            console.error('Deep wipe error:', err);
            return false;
        }
    });
}




