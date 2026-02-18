/**
 * DRAM Secure IPC Bridge
 */
import { getEngineRuntime } from './engine/runtime.js';
import { getDramEngine } from './engine/core.js';

console.log('[IPC Bridge] Module loaded');

export function registerBridgeHandlers(ipcMain, stateManager, windowManager, debugLog) {
  console.log('[IPC Bridge] Registering handlers...');

  const engineRuntime = getEngineRuntime(windowManager);

  function safeSendToRenderer(channel, ...args) {
    try {
      windowManager.sendToRenderer(channel, ...args);
    } catch (err) {
      debugLog('Bridge: Send error:', err.message);
    }
  }

  ipcMain.on('socket:connect', async (_event, _data) => {
    console.log('[IPC Bridge] socket:connect received');
    debugLog('Bridge: Handshake initiated.');

    try {
      const isReady = await engineRuntime.checkInstallation();
      console.log('[IPC Bridge] Engine ready:', isReady);

      if (!isReady) {
        throw new Error('Engine not installed');
      }

      const dramEngine = getDramEngine(windowManager, debugLog);
      await dramEngine.initialize();

      // Save gateway token to secure storage for renderer access
      if (dramEngine.embeddedGatewayToken) {
        const { SecureStorage } = await import('./secure-storage.js');
        const secureStorage = new SecureStorage();
        await secureStorage.set('gateway.token', dramEngine.embeddedGatewayToken);
        debugLog('Bridge: Gateway token saved to secure storage');
      }

      await stateManager.setTransient('engine.connected', true);
      await stateManager.setTransient('engine.status', 'connected');
      safeSendToRenderer('socket:status', 'connected');
      safeSendToRenderer('socket:data', JSON.stringify({
        type: 'res',
        id: 'handshake',
        ok: true,
        payload: {
          type: 'hello-ok',
          version: '0.1.5-dram',
          meta: { name: 'DRAM Secure Gateway', role: 'operator' }
        }
      }));

      debugLog('Bridge: Link established');
    } catch (err) {
      console.error('[IPC Bridge] Error:', err.message);
      debugLog('Bridge: Failed:', err.message);
      await stateManager.setTransient('engine.connected', false);
      await stateManager.setTransient('engine.status', 'error');
      await stateManager.setTransient('engine.lastError', err.message);
      safeSendToRenderer('socket:status', 'error');
    }
  });

  ipcMain.on('socket:send', async (event, payload) => {
    const respond = (ok, data, error, _meta) => {
      try {
        // Pass through full payload for chat/voice/usage and listing/status methods.
        let safeData;
        if (
          payload.method
          && (
            payload.method.startsWith('usage.')
            || payload.method.startsWith('chat.')
            || payload.method.startsWith('voice.')
            || payload.method.includes('.list')
            || payload.method.includes('.status')
          )
        ) {
          safeData = data;
        } else if (Array.isArray(data)) {
          safeData = data;
        } else {
          // Allow common keys needed by renderer
          const allowedKeys = ['status', 'runId', 'messages', 'transcript', 'type', 'ok', 'plugins', 'models', 'skills', 'channels', 'devices', 'config', 'cost', 'usage', 'stats', 'modes', 'profiles', 'transcription', 'error'];
          safeData = {};
          if (data && typeof data === 'object') {
            for (const key of allowedKeys) {
              if (data[key] !== undefined) safeData[key] = data[key];
            }
          } else {
            safeData = data;
          }
        }

        safeSendToRenderer('socket:data', JSON.stringify({
          type: 'res',
          id: payload.id,
          ok,
          payload: safeData,
          error: error ? { message: error.message, code: error.code } : undefined
        }));
      } catch (err) {
        console.error('[IPC Bridge] respond error:', err.message);
      }
    };

    try {
      const dramEngine = getDramEngine(windowManager, debugLog);
      await dramEngine.handleRequest(payload, respond);
    } catch (err) {
      console.error('[IPC Bridge] Request error:', err.message);
      respond(false, undefined, { code: -32603, message: err.message });
    }
  });

  console.log('[IPC Bridge] Handlers registered');
}
