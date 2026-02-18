/**
 * DRAM IPC - Utility Handlers (Orchestrator)
 * 
 * Complies with Golden Rule: Modular structure, files under 500 lines.
 * Delegates to feature-specific modules.
 */
import { getDramEngine } from '../engine/core.js';
import { registerPluginHandlers } from './plugins.js';
import { registerDeviceHandlers } from './devices.js';
import { registerSystemHandlers } from './system.js';
import { registerChannelHandlers } from './channels.js';
import { registerSkillsHandlers } from './skills.js';
import { registerModelHandlers } from './models.js';
import { registerConfigHandlers } from './config-handler.js';
import { registerTtsHandlers } from './tts.js';
import { registerVoiceHandlers } from './voice.js';

// Request deduplication cache
const pendingRequests = new Map();
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Register all utility IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('../secure-storage.js').SecureStorage} secureStorage
 * @param {import('../window-manager.js').WindowManager} windowManager
 * @param {Function} debugLog
 */
export function registerUtilHandlers(ipc, secureStorage, windowManager, debugLog) {
    const dramEngine = getDramEngine(windowManager, debugLog);

    // ... (internalRequest remains the same)
    /**
     * Helper to send an internal request to the engine.
     * Handles deduplication and timeouts.
     * @param {string} method - The RPC method to call.
     * @param {Object} params - The parameters for the call.
     * @param {number} [timeout] - Timeout in milliseconds.
     * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
     */
    async function internalRequest(method, params = {}, timeout = REQUEST_TIMEOUT, options = {}) {
        const useDedupe = options?.dedupe !== false;
        const requestKey = useDedupe ? `${method}-${JSON.stringify(params)}` : null;

        if (useDedupe && requestKey && pendingRequests.has(requestKey)) {
            return pendingRequests.get(requestKey);
        }

        const requestPromise = new Promise((resolve) => {
            const req = { type: 'req', id: `util-${Date.now()}-${Math.random()}`, method, params };
            const timeoutId = setTimeout(() => {
                if (useDedupe && requestKey) pendingRequests.delete(requestKey);
                resolve({ ok: false, error: { message: `Request timeout after ${timeout}ms` } });
            }, timeout);

            console.log(`[Util] internalRequest: ${method} (${req.id})`);
            dramEngine.handleRequest(req, (ok, data, error) => {
                clearTimeout(timeoutId);
                if (useDedupe && requestKey) pendingRequests.delete(requestKey);
                resolve({ ok, data, error });
            }).catch(err => {
                clearTimeout(timeoutId);
                if (useDedupe && requestKey) pendingRequests.delete(requestKey);
                resolve({ ok: false, error: { message: err.message } });
            });
        });

        if (useDedupe && requestKey) pendingRequests.set(requestKey, requestPromise);
        return requestPromise;
    }

    ipc.handle('util:transcribeAudio', async (_event, audioBase64, options = {}) => {
        try {
            const audio = typeof audioBase64 === 'string' ? audioBase64.trim() : '';
            if (!audio) {
                return { success: false, error: 'Missing audio payload' };
            }

            const provider = typeof options?.provider === 'string'
                ? options.provider.trim().toLowerCase()
                : '';
            const model = typeof options?.model === 'string'
                ? options.model.trim()
                : '';
            const mimeType = typeof options?.mimeType === 'string'
                ? options.mimeType.trim().toLowerCase()
                : '';
            const timeoutMsRaw = Number(options?.timeoutMs);
            const timeoutMs = Number.isFinite(timeoutMsRaw)
                ? Math.max(2000, Math.min(120000, timeoutMsRaw))
                : 120000;

            const params = { audio };
            if (provider) params.provider = provider;
            if (model) params.model = model;
            if (mimeType) params.mimeType = mimeType;

            const response = await internalRequest('voice.transcribe', params, timeoutMs, { dedupe: false });
            if (!response.ok) {
                return { success: false, error: response.error?.message || 'Transcription failed' };
            }

            return { success: true, transcript: String(response.data?.transcript || '').trim() };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // Register feature-specific handlers
    registerConfigHandlers(ipc, windowManager);
    registerModelHandlers(ipc, internalRequest);
    registerPluginHandlers(ipc, internalRequest);
    registerChannelHandlers(ipc, internalRequest);
    registerSkillsHandlers(ipc, internalRequest);
    registerDeviceHandlers(ipc, internalRequest);
    registerSystemHandlers(ipc, windowManager, internalRequest, dramEngine, debugLog);
    registerTtsHandlers(ipc, internalRequest);
    registerVoiceHandlers(ipc, secureStorage, windowManager, debugLog);
}
