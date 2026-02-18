/**
 * DRAM IPC - Gateway Handlers
 */
import { getDramEngine } from '../engine/core.js';
import { validateGatewayUrl, validateString } from '../ipc-validation.js';

export function registerGatewayHandlers(ipc, secureStorage, windowManager, debugLog) {
    const dramEngine = getDramEngine(windowManager, debugLog);
    const ensureConfigIo = async () => {
        await dramEngine.initialize();
        const loadConfig = dramEngine.modules?.loadConfig;
        const writeConfigFile = dramEngine.modules?.writeConfigFile;

        if (typeof loadConfig !== 'function' || typeof writeConfigFile !== 'function') {
            throw new Error('Engine config I/O is not available');
        }
        return { loadConfig, writeConfigFile };
    };

    const toProviderModelId = (modelId) => {
        if (typeof modelId !== 'string' || !modelId.trim()) return null;
        const trimmed = modelId.trim();
        if (trimmed.includes('/')) return trimmed;
        if (trimmed.includes('claude')) return `anthropic/${trimmed}`;
        if (trimmed.includes('gpt') || trimmed.includes('o1')) return `openai/${trimmed}`;
        if (trimmed.includes('gemini')) return `google/${trimmed}`;
        if (trimmed.includes('llama')) return `groq/${trimmed}`;
        if (trimmed === 'ollama') return 'ollama/llama3';
        return `unknown/${trimmed}`;
    };

    /**
     * Save gateway connection settings
     */
    ipc.handle('gateway:saveConnection', async (event, { url, token, password }) => {
        try {
            if (url) {
                validateGatewayUrl(url);
                await secureStorage.set('gateway.url', url);
            }
            if (token) {
                validateString(token, 500);
                await secureStorage.set('gateway.token', token);
            }
            if (password) {
                validateString(password, 500);
                await secureStorage.set('gateway.password', password);
            }
            return true;
        } catch (err) {
            console.error('gateway:saveConnection error:', err);
            throw err;
        }
    });

    /**
     * Get gateway connection settings
     */
    ipc.handle('gateway:getConnection', async () => {
        try {
            return {
                url: await secureStorage.get('gateway.url') || 'ws://127.0.0.1:18789',
                token: await secureStorage.get('gateway.token'),
                hasPassword: !!(await secureStorage.get('gateway.password'))
            };
        } catch (err) {
            console.error('gateway:getConnection error:', err);
            return { url: 'ws://127.0.0.1:18789', token: null, hasPassword: false };
        }
    });

    /**
     * Get gateway token (for WebSocket auth)
     */
    ipc.handle('gateway:getToken', async () => {
        try {
            return await secureStorage.get('gateway.token');
        } catch {
            return null;
        }
    });

    /**
     * Get gateway password (for WebSocket auth)
     */
    ipc.handle('gateway:getPassword', async () => {
        try {
            return await secureStorage.get('gateway.password');
        } catch {
            return null;
        }
    });

    /**
     * Launch DRAM Engine (Internal Core)
     */
    ipc.handle('app:launchGateway', async () => {
        try {
            debugLog('Main: Synchronizing Embedded Gateway...');

            // With the embedded core, "launching" means ensuring initialize() is called.
            // This bypasses the need for external terminals or port binding.
            await dramEngine.initialize();

            // Sync gateway token to secure storage for renderer access
            const gatewayToken = dramEngine.embeddedGatewayToken;
            if (gatewayToken) {
                await secureStorage.set('gateway.token', gatewayToken);
                debugLog('Main: Gateway token synced to secure storage');
            }

            debugLog('Main: Embedded Gateway synchronized.');
            return { success: true, status: 'online' };
        } catch (err) {
            debugLog('Main: Failed to launch embedded gateway:', err.message);
            console.error('Failed to launch gateway:', err);
            return { success: false, error: err.message, status: 'error' };
        }
    });

    /**
     * Save fallback chain to engine config
     */
    ipc.handle('gateway:saveFallbackChain', async (event, fallbackChain) => {
        try {
            debugLog('Main: Saving fallback chain to engine config:', fallbackChain);
            const { loadConfig, writeConfigFile } = await ensureConfigIo();

            // Load current config
            const cfg = loadConfig();

            // Ensure agents.defaults exists
            if (!cfg.agents) cfg.agents = {};
            if (!cfg.agents.defaults) cfg.agents.defaults = {};
            if (!cfg.agents.defaults.model) cfg.agents.defaults.model = {};

            // Convert fallback chain to engine format
            const formattedFallbacks = (fallbackChain || [])
                .map(toProviderModelId)
                .filter(Boolean);

            cfg.agents.defaults.model.fallbacks = formattedFallbacks;

            await writeConfigFile(cfg);

            debugLog('Main: Fallback chain saved successfully');
            return { success: true, fallbacks: formattedFallbacks };
        } catch (err) {
            debugLog('Main: Failed to save fallback chain:', err.message);
            return { success: false, error: err.message };
        }
    });

    /**
     * Get fallback chain from engine config
     */
    ipc.handle('gateway:getFallbackChain', async () => {
        try {
            const { loadConfig } = await ensureConfigIo();
            const cfg = loadConfig();
            const fallbacks = cfg.agents?.defaults?.model?.fallbacks || [];
            const normalizedFallbacks = (fallbacks || [])
                .map(toProviderModelId)
                .filter(Boolean);
            return { success: true, fallbacks: normalizedFallbacks };
        } catch (err) {
            debugLog('Main: Failed to get fallback chain:', err.message);
            return { success: false, error: err.message, fallbacks: [] };
        }
    });

    /**
     * Patch DRAM config via engine API
     */
    ipc.handle('gateway:patchConfig', async (event, patch) => {
        try {
            const getRes = await new Promise(resolve => {
                dramEngine.handleRequest({ type: 'req', id: `pc-${Date.now()}`, method: 'config.get', params: {} }, (ok, data) => resolve({ ok, data }));
            });

            const result = await new Promise(resolve => {
                dramEngine.handleRequest({
                    type: 'req', id: `patch-${Date.now()}`, method: 'config.patch',
                    params: { raw: JSON.stringify(patch), baseHash: getRes.data?.hash || 'new' }
                }, (ok, data, error) => resolve({ ok, data, error }));
            });

            if (!result.ok) throw new Error(result.error?.message || 'Patch failed');
            return true;
        } catch (err) {
            console.error('gateway:patchConfig error:', err);
            throw err;
        }
    });

}
