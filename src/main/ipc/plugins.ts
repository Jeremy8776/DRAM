/**
 * DRAM IPC - Plugin Handlers
 * Manages plugin lifecycle and status via config API.
 */
import { validateString } from '../ipc-validation.js';
// Note: Bundled engine runtime removed - using symbiotic OpenClaw mode

// Known plugin metadata for UI display
const PLUGIN_METADATA = {
    // Channel plugins
    'telegram': { name: 'Telegram', description: 'Telegram bot integration', category: 'channel' },
    'discord': { name: 'Discord', description: 'Discord bot integration', category: 'channel' },
    'whatsapp': { name: 'WhatsApp', description: 'WhatsApp via WhatsApp Web', category: 'channel' },
    'signal': { name: 'Signal', description: 'Signal messenger integration', category: 'channel' },
    'slack': { name: 'Slack', description: 'Slack workspace integration', category: 'channel' },
    'msteams': { name: 'Microsoft Teams', description: 'MS Teams integration', category: 'channel' },
    'matrix': { name: 'Matrix', description: 'Matrix/Element integration', category: 'channel' },
    'line': { name: 'LINE', description: 'LINE messenger integration', category: 'channel' },
    'bluebubbles': { name: 'BlueBubbles', description: 'iMessage via BlueBubbles', category: 'channel' },
    'googlechat': { name: 'Google Chat', description: 'Google Chat integration', category: 'channel' },
    'imessage': { name: 'iMessage', description: 'iMessage integration', category: 'channel' },
    'feishu': { name: 'Feishu', description: 'Feishu/Lark integration', category: 'channel' },
    'lobster': { name: 'Lobster', description: 'Lobster chat integration', category: 'channel' },
    'mattermost': { name: 'Mattermost', description: 'Mattermost integration', category: 'channel' },
    'nextcloud-talk': { name: 'Nextcloud Talk', description: 'Nextcloud Talk integration', category: 'channel' },
    'nostr': { name: 'Nostr', description: 'Nostr protocol integration', category: 'channel' },
    'tlon': { name: 'Tlon', description: 'Tlon/Urbit integration', category: 'channel' },
    'twitch': { name: 'Twitch', description: 'Twitch chat integration', category: 'channel' },
    'zalo': { name: 'Zalo', description: 'Zalo messenger integration', category: 'channel' },
    'zalouser': { name: 'Zalo User', description: 'Zalo user integration', category: 'channel' },
    // Auth plugins
    'google-antigravity-auth': { name: 'Google Antigravity', description: 'Google Cloud Code Assist authentication', category: 'auth' },
    'google-gemini-cli-auth': { name: 'Google Gemini', description: 'Gemini API authentication', category: 'auth' },
    'copilot-proxy': { name: 'Copilot Proxy', description: 'GitHub Copilot proxy authentication', category: 'auth' },
    'minimax-portal-auth': { name: 'MiniMax Portal', description: 'MiniMax Portal authentication', category: 'auth' },
    'qwen-portal-auth': { name: 'Qwen Portal', description: 'Qwen Portal authentication', category: 'auth' },
    // Tool plugins
    'llm-task': { name: 'LLM Task', description: 'LLM task execution tools', category: 'tool' },
    'open-prose': { name: 'Open Prose', description: 'Prose writing tools', category: 'tool' },
    // Memory plugins
    'memory-core': { name: 'Memory Core', description: 'Core memory functionality', category: 'memory' },
    'memory-lancedb': { name: 'Memory LanceDB', description: 'LanceDB memory backend', category: 'memory' },
    // Diagnostics plugins
    'diagnostics-otel': { name: 'Diagnostics OTel', description: 'OpenTelemetry diagnostics', category: 'diagnostics' },
    // Voice plugins
    'voice-call': { name: 'Voice Call', description: 'Voice call functionality', category: 'voice' }
};

/**
 * Register plugin-related IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 * @param {Function} internalRequest - Helper to make internal requests to DramEngine
 */
export function registerPluginHandlers(ipc, internalRequest) {
    const normalizeQrStartResult = (data: any = {}) => {
        const qrDataUrl = data.qrDataUrl
            || data.dataUrl
            || data.qr
            || data.qrCodeDataUrl
            || data.image
            || null;

        return {
            ...data,
            qrDataUrl: typeof qrDataUrl === 'string' ? qrDataUrl : null,
            message: data.message || data.status || (qrDataUrl ? 'QR ready' : 'QR unavailable')
        };
    };

    const normalizeQrWaitResult = (data: any = {}) => {
        const connected = data.connected === true
            || data.done === true
            || data.ok === true
            || data.status === 'connected'
            || data.state === 'connected';

        return {
            ...data,
            connected,
            message: data.message || data.status || (connected ? 'Connected' : 'Waiting for scan')
        };
    };

    /**
     * Get all plugins from config with their status
     */
    ipc.handle('util:getPlugins', async () => {
        try {
            const { data: configSnapshot } = await internalRequest('config.get', {});
            const config = configSnapshot?.raw ? JSON.parse(configSnapshot.raw) : {};

            const plugins = Object.keys(PLUGIN_METADATA).map(id => {
                const meta = PLUGIN_METADATA[id];
                const entry = config.plugins?.entries?.[id] || {};

                return {
                    id,
                    name: meta.name || id,
                    description: meta.description || '',
                    category: meta.category || 'other',
                    enabled: entry.enabled === true,
                    status: entry.enabled === true ? 'enabled' : 'disabled',
                    version: entry.version || ''
                };
            });

            return plugins;
        } catch (err) {
            console.error('[Plugins] util:getPlugins error:', err.message);
            return Object.keys(PLUGIN_METADATA).map(id => ({
                id,
                name: PLUGIN_METADATA[id].name || id,
                description: PLUGIN_METADATA[id].description || '',
                category: PLUGIN_METADATA[id].category || 'other',
                enabled: false,
                status: 'disabled'
            }));
        }
    });

    /**
     * Enable a plugin by updating config
     */
    ipc.handle('util:enablePlugin', async (event, pluginId) => {
        try {
            validateString(pluginId, 100);
            if (!PLUGIN_METADATA[pluginId]) return { ok: false, error: `Unknown plugin: ${pluginId}` };

            const { data: configSnapshot } = await internalRequest('config.get', {});
            const patch = { plugins: { entries: { [pluginId]: { enabled: true } } } };

            const result = await internalRequest('config.patch', {
                raw: JSON.stringify(patch),
                baseHash: configSnapshot?.hash || 'new'
            });

            if (!result.ok) {
                const message = result.error?.message || 'Failed to enable plugin';
                if (result.error?.details?.issues) {
                    console.warn(`[Plugins] Activation failed for ${pluginId}: ${message}`);
                    // Validation issues are expected for missing plugins, no need for full stack trace
                    return { ok: false, error: message, issues: result.error.details.issues };
                }
                throw new Error(message);
            }
            return { ok: true };
        } catch (err) {
            console.error('[Plugins] util:enablePlugin critical error:', err.message);
            return { ok: false, error: err.message };
        }
    });

    /**
     * Disable a plugin by updating config
     */
    ipc.handle('util:disablePlugin', async (event, pluginId) => {
        try {
            validateString(pluginId, 100);
            const { data: configSnapshot } = await internalRequest('config.get', {});
            const patch = { plugins: { entries: { [pluginId]: { enabled: false } } } };

            const result = await internalRequest('config.patch', {
                raw: JSON.stringify(patch),
                baseHash: configSnapshot?.hash || 'new'
            });

            if (!result.ok) {
                return { ok: false, error: result.error?.message || 'Failed to disable plugin' };
            }
            return { ok: true };
        } catch (err) {
            console.error('[Plugins] util:disablePlugin critical error:', err.message);
            return { ok: false, error: err.message };
        }
    });

    /**
     * Start WhatsApp Web Login (returns QR code)
     * NOTE: In symbiotic mode, this uses the OpenClaw gateway instead of bundled modules
     */
    ipc.handle('util:whatsappStartLogin', async (_event, opts: any = {}) => {
        try {
            const params = { ...(opts || {}) };
            delete params.channel;

            const result = await internalRequest('web.login.start', params);
            if (!result?.ok) {
                const message = result?.error?.message || 'Failed to start WhatsApp login';
                return { message };
            }
            return normalizeQrStartResult(result.data || {});
        } catch (err) {
            console.error('WhatsApp Login Start Error:', err);
            return { message: String(err) };
        }
    });

    /**
     * Wait for WhatsApp Web Login completion
     * NOTE: In symbiotic mode, this uses the OpenClaw gateway instead of bundled modules
     */
    ipc.handle('util:whatsappPollLogin', async (_event, opts: any = {}) => {
        try {
            const params = { ...(opts || {}) };
            delete params.channel;
            const result = await internalRequest('web.login.wait', params);
            if (!result?.ok) {
                const message = result?.error?.message || 'QR login pending';
                return { connected: false, message };
            }
            return normalizeQrWaitResult(result.data || {});
        } catch (err) {
            console.error('WhatsApp Login Poll Error:', err);
            return { connected: false, message: String(err) };
        }
    });

    /**
     * Start generic QR login via gateway (supports channels with loginWithQrStart)
     */
    ipc.handle('util:webLoginStart', async (_event, opts: any = {}) => {
        try {
            const params = { ...(opts || {}) };
            delete params.channel;
            const result = await internalRequest('web.login.start', params);
            if (!result?.ok) {
                const message = result?.error?.message || 'Failed to start QR login';
                return { message };
            }
            return normalizeQrStartResult(result?.data || {});
        } catch (err) {
            console.error('Web Login Start Error:', err);
            return { message: String(err) };
        }
    });

    /**
     * Wait for generic QR login via gateway
     */
    ipc.handle('util:webLoginWait', async (_event, opts: any = {}) => {
        try {
            const params = { ...(opts || {}) };
            delete params.channel;
            const result = await internalRequest('web.login.wait', params);
            if (!result?.ok) {
                const message = result?.error?.message || 'QR login pending';
                return { connected: false, message };
            }
            return normalizeQrWaitResult(result?.data || {});
        } catch (err) {
            console.error('Web Login Wait Error:', err);
            return { connected: false, message: String(err) };
        }
    });
}






