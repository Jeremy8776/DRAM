/**
 * DRAM Secure IPC Bridge
 */
import { getEngineRuntime } from './engine/runtime.js';
import { getDramEngine } from './engine/core.js';
/**
 * @typedef {import('../shared/types/socket.js').SocketRequest} SocketRequest
 * @typedef {import('../shared/types/socket.js').SocketResponse} SocketResponse
 */

console.log('[IPC Bridge] Module loaded');

const MAX_SOCKET_SEND_BYTES = 5_000_000;
const REQUEST_ID_RE = /^[a-zA-Z0-9:_-]{1,128}$/;

function estimatePayloadSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Basic transport-level validation for renderer -> main socket requests.
 * Keeps malformed payloads out of engine handlers.
 * @param {unknown} payload
 * @returns {{ ok: true, value: SocketRequest } | { ok: false, message: string, code: string }}
 */
function validateSocketRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'Invalid request payload', code: 'BAD_PAYLOAD' };
  }
  const candidate = /** @type {Record<string, unknown>} */ (payload);
  if (candidate.type !== 'req') {
    return { ok: false, message: 'Invalid request envelope type', code: 'BAD_ENVELOPE' };
  }
  if (typeof candidate.id !== 'string' || !REQUEST_ID_RE.test(candidate.id)) {
    return { ok: false, message: 'Invalid request id', code: 'BAD_ID' };
  }
  if (typeof candidate.method !== 'string' || candidate.method.length < 1 || candidate.method.length > 128) {
    return { ok: false, message: 'Invalid request method', code: 'BAD_METHOD' };
  }
  const size = estimatePayloadSize(candidate);
  if (size > MAX_SOCKET_SEND_BYTES) {
    return { ok: false, message: 'Request payload exceeds local transport limit', code: 'PAYLOAD_TOO_LARGE' };
  }
  return { ok: true, value: /** @type {SocketRequest} */ (candidate) };
}

/**
 * @param {unknown} err
 * @returns {{ message: string, code?: string | number }}
 */
function normalizeError(err) {
  if (!err || typeof err !== 'object') {
    return { message: String(err || 'Unknown error') };
  }
  const input = /** @type {Record<string, unknown>} */ (err);
  return {
    message: typeof input.message === 'string' ? input.message : 'Unknown error',
    code: typeof input.code === 'string' || typeof input.code === 'number' ? input.code : undefined
  };
}

/**
 * Backward-compat sanitizer for known payload shape mismatches.
 * Older renderer builds may still send `chat.send` with `params.model`,
 * which newer gateways reject. Strip it defensively in main.
 * @param {SocketRequest} payload
 * @param {(args: any[]) => void} debugLog
 * @returns {SocketRequest}
 */
function sanitizeSocketRequest(payload, debugLog) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.method !== 'chat.send') return payload;
  if (!payload.params || typeof payload.params !== 'object' || Array.isArray(payload.params)) return payload;

  if (Object.prototype.hasOwnProperty.call(payload.params, 'model')) {
    const { model: _dropModel, ...rest } = payload.params;
    debugLog('[IPC Bridge] Stripped legacy chat.send params.model before forwarding');
    return {
      ...payload,
      params: rest
    };
  }
  return payload;
}

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
      const wsReady = Boolean(dramEngine.ws && dramEngine.ws.readyState === 1);
      const bridgeReady = wsReady && !dramEngine.configOnlyMode;

      if (!bridgeReady) {
        const reason = dramEngine.configOnlyMode
          ? 'Gateway initialized in config-only mode (WebSocket auth/connect failed).'
          : 'Gateway WebSocket is not ready after initialization.';
        console.warn('[IPC Bridge] Gateway not ready for live chat:', reason);
        debugLog('Bridge: Gateway not ready for live chat:', reason);

        await stateManager.setTransient('engine.connected', false);
        await stateManager.setTransient('engine.status', 'error');
        await stateManager.setTransient('engine.lastError', reason);

        safeSendToRenderer('socket:status', 'error');
        safeSendToRenderer('socket:data', JSON.stringify({
          type: 'res',
          id: 'handshake',
          ok: false,
          error: {
            code: 'GATEWAY_NOT_READY',
            message: reason
          }
        }));
        return;
      }

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

  ipcMain.on('socket:send', async (_event, payload) => {
    const validation = validateSocketRequest(payload);
    if (!validation.ok) {
      safeSendToRenderer('socket:data', JSON.stringify({
        type: 'res',
        id: typeof payload?.id === 'string' ? payload.id : `invalid-${Date.now()}`,
        ok: false,
        error: { message: validation.message, code: validation.code }
      }));
      return;
    }
    const requestPayload = sanitizeSocketRequest(validation.value, debugLog);

    const respond = (ok, data, error, _meta) => {
      try {
        // Pass through full payload for chat/voice/usage and listing/status methods.
        let safeData;
        if (
          requestPayload.method
          && (
            requestPayload.method.startsWith('usage.')
            || requestPayload.method.startsWith('chat.')
            || requestPayload.method.startsWith('voice.')
            || requestPayload.method.includes('.list')
            || requestPayload.method.includes('.status')
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

        const envelope = /** @type {SocketResponse} */ ({
          type: 'res',
          id: requestPayload.id,
          ok,
          payload: safeData,
          error: error ? normalizeError(error) : undefined
        });

        safeSendToRenderer('socket:data', JSON.stringify(envelope));
      } catch (err) {
        console.error('[IPC Bridge] respond error:', err.message);
      }
    };

      try {
        const dramEngine = getDramEngine(windowManager, debugLog);
        await dramEngine.handleRequest(requestPayload as any, respond, undefined);
      } catch (err) {
        console.error('[IPC Bridge] Request error:', err.message);
        respond(false, undefined, { code: -32603, message: err.message }, undefined);
    }
  });

  console.log('[IPC Bridge] Handlers registered');
}






