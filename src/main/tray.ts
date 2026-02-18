/**
 * DRAM Desktop - System Tray Manager
 * 
 * Manages the system tray icon and context menu.
 * Allows minimizing to tray and quick actions.
 */

import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TrayManager {
  [key: string]: any;

  constructor(windowManager) {
    this.windowManager = windowManager;
    this.tray = null;
    this.createTray();
  }

  /**
   * Create the system tray icon
   */
  createTray() {
    // Create tray icon
    const iconPath = path.join(__dirname, '../../resources/platform/web/tray-icon.png');

    // Create a small icon for tray (16x16 or 22x22 depending on platform)
    let icon;
    try {
      icon = nativeImage.createFromPath(iconPath);
      // Resize for tray if needed
      if (process.platform === 'win32') {
        icon = icon.resize({ width: 16, height: 16 });
      }
    } catch {
      console.warn('Could not load tray icon, using default');
      // Create a simple colored square as fallback
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('DRAM - AI Assistant');

    // Create context menu
    this.updateContextMenu();

    // Handle click on tray icon
    this.tray.on('click', () => {
      this.windowManager.focusMainWindow();
    });

    // Handle double-click (Windows)
    this.tray.on('double-click', () => {
      this.windowManager.focusMainWindow();
    });
  }

  /**
   * Update the context menu
   */
  updateContextMenu(status = 'disconnected') {
    const statusIcon = status === 'connected' ? '🟢' : '🔴';

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `${statusIcon} DRAM`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => {
          this.windowManager.focusMainWindow();
        }
      },
      {
        label: 'Settings',
        click: () => {
          this.windowManager.createSettingsWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Update connection status in tray
   */
  setStatus(status) {
    this.updateContextMenu(status);

    // Update tooltip
    const statusText = status === 'connected' ? 'Connected' : 'Disconnected';
    this.tray.setToolTip(`DRAM - ${statusText}`);
  }

  /**
   * Show a balloon notification (Windows only)
   */
  showNotification(title, content) {
    if (process.platform === 'win32') {
      this.tray.displayBalloon({
        title: title,
        content: content,
        iconType: 'info'
      });
    }
  }

  /**
   * Destroy the tray icon
   */
  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}










