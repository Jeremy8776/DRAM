/**
 * DRAM IPC - Window and App Info Handlers
 */
import { app } from 'electron';
import { validateString } from '../ipc-validation.js';

const ALLOWED_APP_PATHS = new Set([
    'home',
    'appData',
    'userData',
    'sessionData',
    'temp',
    'exe',
    'module',
    'desktop',
    'documents',
    'downloads',
    'music',
    'pictures',
    'videos',
    'recent',
    'logs',
    'crashDumps'
]);

function sanitizeDialogOptions(options: any) {
    const input = (options && typeof options === 'object') ? options : {};
    return {
        type: validateString(input.type || 'info', 32),
        title: validateString(input.title || 'DRAM', 100),
        message: validateString(input.message || '', 1000),
        buttons: Array.isArray(input.buttons) && input.buttons.length > 0
            ? input.buttons.map((label) => validateString(label, 64))
            : ['OK']
    };
}

export function registerWindowHandlers(ipc, secureStorage, windowManager, _debugLog) {
    /**
     * Minimize to tray
     */
    ipc.handle('window:minimize', async () => {
        const win = windowManager.getMainWindow();
        if (win) {
            win.minimize();
        }
        return true;
    });

    /**
     * Toggle fullscreen
     */
    ipc.handle('window:toggleFullscreen', async () => {
        const win = windowManager.getMainWindow();
        if (win) {
            win.setFullScreen(!win.isFullScreen());
        }
        return true;
    });

    /**
     * Get app version and info
     */
    ipc.handle('app:getInfo', async () => {
        return {
            name: app.getName(),
            version: app.getVersion(),
            isPackaged: app.isPackaged,
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
            platform: process.platform,
            arch: process.arch
        };
    });

    /**
     * Get system path
     */
    ipc.handle('app:getPath', async (_event, name) => {
        try {
            const safeName = validateString(name || '', 32);
            if (!ALLOWED_APP_PATHS.has(safeName)) return null;
            return app.getPath(safeName as any);
        } catch {
            return null;
        }
    });

    /**
     * Show message box (Generic)
     */
    ipc.handle('dialog:showMessage', async (_event, options) => {
        try {
            const { dialog } = await import('electron');
            const win = windowManager.getMainWindow();
            return await dialog.showMessageBox(win, sanitizeDialogOptions(options) as any);
        } catch (err) {
            console.error('dialog:showMessage error:', err);
            return { response: 0 };
        }
    });

    /**
     * Show open file/directory dialog
     */
    ipc.handle('dialog:showOpenDialog', async (_event, options) => {
        try {
            const { dialog } = await import('electron');
            const win = windowManager.getMainWindow();
            return await dialog.showOpenDialog(win, options as any);
        } catch (err) {
            console.error('dialog:showOpenDialog error:', err);
            return { canceled: true, filePaths: [] };
        }
    });
}






