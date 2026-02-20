/**
 * DRAM IPC - OpenClaw Engine Lifecycle Registration
 */
import { app } from 'electron';
import { OpenClawManager } from './openclaw-manager.js';

/**
 * Register IPC handlers for OpenClaw discovery and management.
 */
export function registerOpenClawHandlers(ipc, _stateManager, windowManager, debugLog) {
  const manager = new OpenClawManager(windowManager, debugLog);

  // Discovery and Installation
  ipc.handle('openclaw:discover', () => manager.discover());
  ipc.handle('openclaw:install', (_event, version = 'latest') => manager.install(version));
  ipc.handle('openclaw:getVersions', () => manager.getAvailableVersions());

  // Configuration Management
  ipc.handle('openclaw:readConfig', () => manager.readConfig());
  ipc.handle('openclaw:writeConfig', (_event, config) => manager.writeConfig(config));

  // Backup and Restore
  ipc.handle('openclaw:createBackup', () => manager.createBackup());
  ipc.handle('openclaw:listBackups', () => manager.listBackups());
  ipc.handle('openclaw:restoreBackup', (_event, backupPath) => manager.restoreBackup(backupPath));

  /**
   * Initialize the engine (DRAM Desktop symbiotic gateway)
   */
  ipc.handle('openclaw:initializeEngine', async () => {
    debugLog('[OpenClaw] Initializing engine after install...');
    try {
      const { getDramEngine } = await import('../engine/core.js');
      const engine = getDramEngine(windowManager, debugLog);
      await engine.initialize();

      if (engine.embeddedGatewayToken) {
        const { SecureStorage } = await import('../secure-storage.js');
        const secureStorage = new SecureStorage();
        await secureStorage.set('gateway.token', engine.embeddedGatewayToken);
        debugLog('[OpenClaw] Gateway token saved to secure storage');
      }

      debugLog('[OpenClaw] Engine initialized successfully');
      return { success: true };
    } catch (err: any) {
      debugLog('[OpenClaw] Engine initialization failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // Cleanup on quit
  app.on('before-quit', () => {
    manager.dispose();
  });
}
