/**
 * DRAM Desktop - Window Manager
 * 
 * Handles BrowserWindow creation with security best practices.
 * All windows use context isolation and disabled node integration.
 */

import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WindowManager {
  constructor(secureStorage) {
    this.secureStorage = secureStorage;
    this.windows = new Set();
    this.settingsWindow = null;
  }

  /**
   * Get secure webPreferences for all windows
   * Following Electron security checklist
   */
  getSecureWebPreferences() {
    return {
      // Security: Isolate renderer from Node.js
      nodeIntegration: false,

      // Security: Enable context isolation (default since Electron 12)
      contextIsolation: true,

      // Security: Enable sandbox (default since Electron 20)
      sandbox: true,

      // Security: Disable remote module
      enableRemoteModule: false,

      // Security: Use preload script for safe API exposure
      preload: path.join(__dirname, '../preload/index.cjs'),

      // Security: Disable webview tag
      webviewTag: false,

      // Security: Don't allow running insecure content
      allowRunningInsecureContent: false,

      // Enable spellcheck
      spellcheck: true,

      // Disable experimental features
      experimentalFeatures: false
    };
  }

  /**
   * Create a main application window
   */
  async createMainWindow(options = {}) {
    const { sessionKey } = options;

    // Get saved window bounds or use defaults
    const savedBounds = await this.secureStorage.get('window.bounds');
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const defaultBounds = {
      width: 1344,
      height: 840,
      x: undefined,
      y: undefined
    };

    // Ensure it fits on smaller screens
    if (width < 1344) {
      defaultBounds.width = Math.min(1200, width * 0.9);
      defaultBounds.height = Math.min(800, height * 0.9);
    }

    const bounds = savedBounds || defaultBounds;

    const win = new BrowserWindow({
      ...bounds,
      minWidth: 400,
      minHeight: 300,
      title: 'DRAM',
      icon: path.join(__dirname, '../../resources/png/icon-256.png'),
      backgroundColor: '#060607',
      show: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#060607',
        symbolColor: '#8e8e93',
        height: 48
      },
      autoHideMenuBar: true,
      webPreferences: this.getSecureWebPreferences()
    });

    this.windows.add(win);

    // Store mainWindow reference so settings can be modal
    if (this.windows.size === 1) {
      this.mainWindow = win;
    }

    // Ensure the window is focused and visible
    win.show();
    win.focus();

    // Load custom DRAM UI
    const isDev = process.argv.includes('--dev');
    let uiUrl = 'dram://app/index.html';
    if (sessionKey) {
      uiUrl += `?session=${encodeURIComponent(sessionKey)}`;
    }

    console.log('Loading DRAM UI from:', uiUrl);

    try {
      await win.loadURL(uiUrl);
      console.log('DRAM UI loaded successfully');

      if (isDev) {
        win.webContents.openDevTools({ mode: 'undocked' });

        // Restore DevTools shortcuts
        win.webContents.on('before-input-event', (event, input) => {
          if (input.type === 'keyDown') {
            if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
              win.webContents.toggleDevTools();
              event.preventDefault();
            }
            if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
              win.webContents.reload();
              event.preventDefault();
            }
          }
        });
      }
    } catch (err) {
      console.error('Failed to load DRAM UI:', err);
    }

    // Save window bounds on close (only for the first window usually)
    win.on('close', async () => {
      try {
        if (win && !win.isDestroyed() && this.windows.size === 1) {
          const bounds = win.getBounds();
          await this.secureStorage.set('window.bounds', bounds);
        }
      } catch (err) {
        console.warn('[WindowManager] Failed to save window bounds:', err.message);
      }
    });

    win.on('closed', () => {
      this.windows.delete(win);
      if (this.mainWindow === win) {
        this.mainWindow = null;
      }
    });

    return win;
  }

  /**
   * Open settings view inside the main window
   */
  async createSettingsWindow() {
    console.log('WindowManager: open settings view requested');

    // Close legacy settings window if it exists
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.close();
      this.settingsWindow = null;
    }

    const win = this.mainWindow || this.getMainWindow();
    if (!win) {
      console.warn('WindowManager: No main window available to open settings');
      return null;
    }

    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();

    this.sendToRenderer('ui:open-settings');
    return win;
  }

  /**
   * Focus main window (bring to front)
   */
  focusMainWindow() {
    const win = Array.from(this.windows)[0];
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  }

  /**
   * Get main window instance (returns the first one if multiple exist)
   */
  getMainWindow() {
    return Array.from(this.windows)[0] || null;
  }

  /**
   * Send message to all main windows
   */
  sendToRenderer(channel, ...args) {
    // Ensure all args are serializable
    const safeArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.parse(JSON.stringify(arg));
        } catch (e) {
          console.warn('[WindowManager] Non-serializable arg, skipping:', e.message);
          return null;
        }
      }
      return arg;
    });

    for (const win of this.windows) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          if (win.webContents.isLoading()) continue;
          win.webContents.send(channel, ...safeArgs);
        }
      } catch (err) {
        if (err.code !== 'EPIPE' && !err.message?.includes('EPIPE')) {
          console.error('[WindowManager] Send error:', err.message);
        }
      }
    }
  }
}




