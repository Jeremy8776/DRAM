/**
 * DRAM Desktop - Auto Updater
 * 
 * Handles automatic updates using electron-updater.
 * Updates are downloaded in the background and installed on quit.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');
import { dialog } from 'electron';

export class AutoUpdater {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.updateAvailable = false;
    this.updateDownloaded = false;

    // Configure auto-updater
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Set up auto-updater event handlers
   */
  setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
      this.sendStatusToRenderer('checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      this.updateAvailable = true;
      this.sendStatusToRenderer('available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('No updates available');
      this.sendStatusToRenderer('not-available', info);
    });

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent);
      console.log(`Download progress: ${percent}%`);
      this.sendStatusToRenderer('downloading', { percent });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      this.updateDownloaded = true;
      this.sendStatusToRenderer('downloaded', info);

      // Notify user
      this.notifyUpdateReady(info);
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      this.sendStatusToRenderer('error', { message: err.message });
    });
  }

  /**
   * Check for updates
   */
  async checkForUpdates() {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  }

  /**
   * Notify user that update is ready
   */
  async notifyUpdateReady(info) {
    const mainWindow = this.windowManager.getMainWindow();

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'The update will be installed when you quit the application. Would you like to restart now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  }

  /**
   * Send update status to renderer
   */
  sendStatusToRenderer(status, data = {}) {
    this.windowManager.sendToRenderer('updater:status', { status, ...data });
  }

  /**
   * Manually trigger update installation
   */
  installUpdate() {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall();
    }
  }

  /**
   * Check if update is available
   */
  isUpdateAvailable() {
    return this.updateAvailable;
  }

  /**
   * Check if update is downloaded and ready
   */
  isUpdateReady() {
    return this.updateDownloaded;
  }
}


