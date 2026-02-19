/**
 * DRAM IPC - Updater Handlers
 */

export function registerUpdaterHandlers(ipc, secureStorage, getAutoUpdater, debugLog) {
  const resolveUpdater = () => {
    try {
      return typeof getAutoUpdater === 'function' ? getAutoUpdater() : null;
    } catch {
      return null;
    }
  };

  ipc.handle('updater:getStatus', async () => {
    const updater = resolveUpdater();
    if (!updater) {
      const enabled = (await secureStorage.get('settings.autoUpdateEnabled')) !== false;
      return {
        enabled,
        updateAvailable: false,
        updateReady: false,
        currentVersion: null,
        github: { repo: null, latest: null, lastCheckedAt: null },
        lastElectronCheckAt: null,
        lastError: 'Updater unavailable in this build mode'
      };
    }
    return updater.getStatus();
  });

  ipc.handle('updater:checkNow', async () => {
    const updater = resolveUpdater();
    if (!updater) return { ok: false, message: 'Updater unavailable in this build mode' };
    return updater.checkForUpdates({ force: true, reason: 'manual-ipc' });
  });

  ipc.handle('updater:installNow', async () => {
    const updater = resolveUpdater();
    if (!updater) return { ok: false, message: 'Updater unavailable in this build mode' };
    updater.installUpdate();
    return { ok: true };
  });

  ipc.handle('updater:getEnabled', async () => {
    const updater = resolveUpdater();
    if (updater && typeof updater.isEnabled === 'function') {
      return updater.isEnabled();
    }
    return (await secureStorage.get('settings.autoUpdateEnabled')) !== false;
  });

  ipc.handle('updater:setEnabled', async (_event, enabled) => {
    const next = enabled !== false;
    const updater = resolveUpdater();
    if (updater && typeof updater.setEnabled === 'function') {
      const stored = await updater.setEnabled(next);
      return { ok: true, enabled: stored };
    }

    await secureStorage.set('settings.autoUpdateEnabled', next);
    debugLog('[Updater] Updated enabled flag without packaged updater runtime:', next);
    return { ok: true, enabled: next };
  });
}

