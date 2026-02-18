/**
 * DRAM IPC - Window and App Info Handlers
 */
import { app } from 'electron';
import { validateString } from '../ipc-validation.js';

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
    ipc.handle('app:getPath', async (event, name) => {
        try {
            return app.getPath(name);
        } catch {
            return null;
        }
    });

    /**
     * Show message box (Generic)
     */
    ipc.handle('dialog:showMessage', async (event, options) => {
        try {
            const { dialog } = await import('electron');
            const win = windowManager.getMainWindow();
            return await dialog.showMessageBox(win, {
                type: options.type || 'info',
                title: validateString(options.title || 'DRAM', 100),
                message: validateString(options.message || '', 1000),
                buttons: options.buttons || ['OK']
            });
        } catch (err) {
            console.error('dialog:showMessage error:', err);
            return { response: 0 };
        }
    });

    /**
     * Show open file/directory dialog
     */
    ipc.handle('dialog:showOpenDialog', async (event, options) => {
        try {
            const { dialog } = await import('electron');
            const win = windowManager.getMainWindow();
            return await dialog.showOpenDialog(win, options);
        } catch (err) {
            console.error('dialog:showOpenDialog error:', err);
            return { canceled: true, filePaths: [] };
        }
    });
}
