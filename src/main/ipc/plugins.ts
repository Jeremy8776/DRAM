/**
 * DRAM IPC - Plugin Handlers
 * Manages plugin lifecycle and status via config API.
 */
import { validateString } from '../ipc-validation.js';
// Note: Bundled engine runtime removed - using symbiotic OpenClaw mode

// Known plugin metadata for UI display
export const PLUGIN_METADATA = {
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

const KNOWN_PLUGIN_REPAIRS = {
    'diagnostics-otel': {
        code: 'missing-opentelemetry-api',
        action: 'disable',
        errorPattern: /@opentelemetry\/api/i,
        reason: 'Optional diagnostics dependency "@opentelemetry/api" is missing in this OpenClaw runtime.',
        successMessage: 'Disabled diagnostics-otel because @opentelemetry/api is unavailable.'
    }
};

const TRUST_STATUSES = new Set(['trusted', 'untrusted', 'blocked']);
const PLUGIN_VETTING_KEY = 'security.vetting.plugins';

const normalizePluginId = (value: any) => firstString(value, '').toLowerCase();

const normalizeTrustStatus = (value: any) => {
    const status = firstString(value, '').toLowerCase();
    return TRUST_STATUSES.has(status) ? status : '';
};

const sanitizeTrustRegistry = (raw: any) => {
    if (!raw || typeof raw !== 'object') return {};
    const registry: Record<string, string> = {};
    for (const [id, status] of Object.entries(raw)) {
        const normalizedId = normalizePluginId(id);
        const normalizedStatus = normalizeTrustStatus(status);
        if (!normalizedId || !normalizedStatus) continue;
        registry[normalizedId] = normalizedStatus;
    }
    return registry;
};

const readTrustRegistry = async (secureStorage: any, fallbackStore: Record<string, string>) => {
    if (!secureStorage?.get) {
        return sanitizeTrustRegistry(fallbackStore);
    }
    try {
        const stored = await secureStorage.get(PLUGIN_VETTING_KEY);
        return sanitizeTrustRegistry(stored);
    } catch (err) {
        console.warn('[Plugins] Failed to read trust registry:', err?.message || err);
        return sanitizeTrustRegistry(fallbackStore);
    }
};

const writeTrustRegistry = async (secureStorage: any, fallbackStore: Record<string, string>, registry: Record<string, string>) => {
    const sanitized = sanitizeTrustRegistry(registry);
    Object.keys(fallbackStore).forEach((key) => delete fallbackStore[key]);
    Object.assign(fallbackStore, sanitized);
    if (!secureStorage?.set) return true;
    try {
        await secureStorage.set(PLUGIN_VETTING_KEY, sanitized);
        return true;
    } catch (err) {
        console.warn('[Plugins] Failed to persist trust registry:', err?.message || err);
        return false;
    }
};

const stripBom = (value: string) => value.replace(/^\uFEFF/, '');

const parseConfigSnapshot = (snapshot: any) => {
    const raw = typeof snapshot?.raw === 'string' ? stripBom(snapshot.raw).trim() : '';
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.warn('[Plugins] Failed to parse config snapshot, using empty config:', err?.message || err);
        return {};
    }
};

const firstString = (...values: any[]) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
};

const resolvePluginTrustStatus = (plugin: any, trustRegistry: Record<string, string>) => {
    const normalizedId = normalizePluginId(plugin?.id);
    if (normalizedId && trustRegistry[normalizedId]) {
        return trustRegistry[normalizedId];
    }
    if (plugin?.enabled === true || plugin?.status === 'enabled') return 'trusted';
    if (normalizedId && PLUGIN_METADATA[normalizedId]) return 'trusted';
    return 'untrusted';
};

const normalizeRuntimeStatus = (plugin: any) => {
    const status = String(plugin?.status || '').trim().toLowerCase();
    if (status === 'missing' || status === 'not-installed' || status === 'unavailable') return 'missing';
    if (status === 'error' || status === 'failed') return 'error';
    if (status === 'enabled' || status === 'active' || status === 'loaded') return 'enabled';
    if (status === 'disabled' || status === 'inactive') return 'disabled';

    if (plugin?.missing === true || plugin?.available === false || plugin?.installed === false) return 'missing';
    if (firstString(plugin?.error?.message, plugin?.errorMessage, plugin?.lastError, typeof plugin?.error === 'string' ? plugin.error : '')) return 'error';
    if (plugin?.enabled === true || plugin?.active === true || plugin?.loaded === true) return 'enabled';
    return 'disabled';
};

const normalizeRuntimePlugin = (entry: any) => {
    if (!entry) return null;

    if (typeof entry === 'string') {
        const id = entry.trim();
        if (!id) return null;
        return {
            id,
            name: id,
            description: '',
            category: '',
            version: '',
            enabled: false,
            status: 'disabled',
            loadError: ''
        };
    }

    if (typeof entry !== 'object') return null;

    const id = firstString(entry.id, entry.pluginId, entry.key, entry.slug, entry.name);
    if (!id) return null;

    const status = normalizeRuntimeStatus(entry);
    const loadError = firstString(
        entry?.error?.message,
        entry?.errorMessage,
        entry?.lastError,
        typeof entry?.error === 'string' ? entry.error : ''
    );

    return {
        id,
        name: firstString(entry.name, entry.label, id) || id,
        description: firstString(entry.description, entry.summary, ''),
        category: firstString(entry.category, entry.kind, entry.type, ''),
        version: firstString(entry.version, ''),
        enabled: entry?.enabled === true || entry?.active === true || status === 'enabled',
        status,
        loadError
    };
};

const normalizeRuntimePluginList = (payload: any) => {
    if (!payload) return [];

    let rawItems: any[] = [];
    if (Array.isArray(payload)) {
        rawItems = payload;
    } else if (Array.isArray(payload?.plugins)) {
        rawItems = payload.plugins;
    } else if (Array.isArray(payload?.items)) {
        rawItems = payload.items;
    } else if (Array.isArray(payload?.entries)) {
        rawItems = payload.entries;
    } else if (payload?.plugins && typeof payload.plugins === 'object') {
        rawItems = Object.entries(payload.plugins).map(([id, value]) =>
            (value && typeof value === 'object') ? { id, ...(value as any) } : { id }
        );
    } else if (payload?.entries && typeof payload.entries === 'object') {
        rawItems = Object.entries(payload.entries).map(([id, value]) =>
            (value && typeof value === 'object') ? { id, ...(value as any) } : { id }
        );
    }

    const deduped = new Map<string, any>();
    rawItems
        .map(normalizeRuntimePlugin)
        .filter(Boolean)
        .forEach((plugin) => {
            deduped.set(plugin.id, plugin);
        });

    return Array.from(deduped.values());
};

const getPluginRepairPlan = (plugin: any) => {
    if (!plugin || plugin.status !== 'error') return null;

    const knownRule = KNOWN_PLUGIN_REPAIRS[plugin.id];
    if (!knownRule) return null;

    const loadError = String(plugin.loadError || '');
    if (knownRule.errorPattern.test(loadError)) {
        return {
            code: knownRule.code,
            action: knownRule.action,
            reason: knownRule.reason,
            successMessage: knownRule.successMessage
        };
    }

    return null;
};

const buildPluginCatalog = (config: any, runtimePlugins: any[], trustRegistry: Record<string, string>) => {
    const configEntries = config?.plugins?.entries && typeof config.plugins.entries === 'object'
        ? config.plugins.entries
        : {};
    const runtimeMap = new Map<string, any>(runtimePlugins.map((plugin) => [plugin.id, plugin]));

    const ids = new Set([
        ...Object.keys(PLUGIN_METADATA),
        ...Object.keys(configEntries),
        ...runtimePlugins.map((plugin) => plugin.id)
    ]);

    return Array.from(ids).map((id) => {
        const meta = PLUGIN_METADATA[id] || {};
        const runtime = runtimeMap.get(id) || {};
        const configEntry = configEntries[id] || {};

        const enabled = runtime.status === 'enabled'
            || runtime.enabled === true
            || configEntry.enabled === true;

        let status = firstString(runtime.status, '');
        if (!['enabled', 'disabled', 'missing', 'error'].includes(status)) {
            status = enabled ? 'enabled' : 'disabled';
        }

        const plugin = {
            id,
            name: firstString(meta.name, runtime.name, id) || id,
            description: firstString(meta.description, runtime.description, ''),
            category: firstString(meta.category, runtime.category, 'other'),
            enabled,
            status,
            version: firstString(runtime.version, configEntry.version, ''),
            loadError: firstString(runtime.loadError, ''),
            controllable: status !== 'missing'
        };
        const trustStatus = resolvePluginTrustStatus(plugin, trustRegistry);

        const repair = getPluginRepairPlan(plugin);
        return {
            ...plugin,
            trustStatus,
            repairable: Boolean(repair),
            repairAction: firstString(repair?.action, ''),
            repairReason: firstString(repair?.reason, '')
        };
    });
};

/**
 * Register plugin-related IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 * @param {Function} internalRequest - Helper to make internal requests to DramEngine
 */
export function registerPluginHandlers(ipc, internalRequest, secureStorage: any = null) {
    const attemptedAutoRepairs = new Set<string>();
    const inMemoryTrustStore: Record<string, string> = {};
    let pluginsListWsUnsupported = false;

    const shouldMarkPluginsListUnsupported = (err: any) => {
        const message = String(
            err?.error?.message
            || err?.message
            || (typeof err === 'string' ? err : JSON.stringify(err || {}))
        ).toLowerCase();
        return message.includes('unknown method') && message.includes('plugins.list');
    };

    const patchPluginEntries = async (entries: Record<string, any>, baseHash: string) => {
        return internalRequest('config.patch', {
            raw: JSON.stringify({ plugins: { entries } }),
            baseHash: baseHash || 'new'
        });
    };

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

    const pluginExistsInRuntime = async (pluginId: string) => {
        if (pluginsListWsUnsupported) {
            return null;
        }
        try {
            const runtimePluginsRes = await internalRequest('plugins.list', {});
            if (!runtimePluginsRes?.ok) {
                if (shouldMarkPluginsListUnsupported(runtimePluginsRes?.error || runtimePluginsRes)) {
                    pluginsListWsUnsupported = true;
                }
                return null;
            }
            const runtimePlugins = normalizeRuntimePluginList(runtimePluginsRes.data);
            return runtimePlugins.find((plugin) => plugin.id === pluginId) || null;
        } catch (err) {
            if (shouldMarkPluginsListUnsupported(err)) {
                pluginsListWsUnsupported = true;
            }
            return null;
        }
    };

    ipc.handle('util:getPluginVetting', async () => {
        return readTrustRegistry(secureStorage, inMemoryTrustStore);
    });

    ipc.handle('util:setPluginTrust', async (_event, pluginId, status) => {
        try {
            validateString(pluginId, 100);
            const normalizedId = normalizePluginId(pluginId);
            if (!normalizedId) {
                return { ok: false, error: 'Invalid plugin identifier' };
            }

            const requestedStatus = normalizeTrustStatus(status);
            if (!requestedStatus) {
                return { ok: false, error: 'Invalid trust status (expected trusted, untrusted, or blocked)' };
            }

            const registry = await readTrustRegistry(secureStorage, inMemoryTrustStore);
            registry[normalizedId] = requestedStatus;
            const persisted = await writeTrustRegistry(secureStorage, inMemoryTrustStore, registry);
            if (!persisted) {
                return { ok: false, error: 'Failed to persist plugin trust policy' };
            }

            return { ok: true, pluginId: normalizedId, trustStatus: requestedStatus };
        } catch (err) {
            console.error('[Plugins] util:setPluginTrust error:', err?.message || err);
            return { ok: false, error: err?.message || 'Failed to set plugin trust policy' };
        }
    });

    /**
     * Get all plugins from config with their status
     */
    ipc.handle('util:getPlugins', async () => {
        try {
            const { data: configSnapshot } = await internalRequest('config.get', {});
            const config = parseConfigSnapshot(configSnapshot);
            const trustRegistry = await readTrustRegistry(secureStorage, inMemoryTrustStore);

            let runtimePlugins: any[] = [];
            if (!pluginsListWsUnsupported) {
                try {
                    const runtimeResult = await internalRequest('plugins.list', {});
                    if (runtimeResult?.ok) {
                        runtimePlugins = normalizeRuntimePluginList(runtimeResult.data);
                    } else if (shouldMarkPluginsListUnsupported(runtimeResult?.error || runtimeResult)) {
                        pluginsListWsUnsupported = true;
                    }
                } catch (runtimeErr) {
                    if (shouldMarkPluginsListUnsupported(runtimeErr)) {
                        pluginsListWsUnsupported = true;
                    }
                    console.warn('[Plugins] plugins.list unavailable, falling back to config metadata:', runtimeErr?.message || runtimeErr);
                }
            }

            const plugins = buildPluginCatalog(config, runtimePlugins, trustRegistry);
            const autoDisableEntries: Record<string, any> = {};
            for (const plugin of plugins) {
                const repair = getPluginRepairPlan(plugin);
                if (!repair || repair.action !== 'disable') continue;
                const isConfiguredEnabled = config?.plugins?.entries?.[plugin.id]?.enabled === true;
                if (!isConfiguredEnabled) continue;

                const repairKey = `${plugin.id}:${repair.code}`;
                if (attemptedAutoRepairs.has(repairKey)) continue;
                attemptedAutoRepairs.add(repairKey);
                autoDisableEntries[plugin.id] = { enabled: false };
            }

            const autoDisableIds = Object.keys(autoDisableEntries);
            if (autoDisableIds.length > 0) {
                try {
                    const patchResult = await patchPluginEntries(autoDisableEntries, configSnapshot?.hash || 'new');
                    if (!patchResult?.ok) {
                        console.warn('[Plugins] Auto-remediation patch failed:', patchResult?.error?.message || 'config.patch failed');
                    } else {
                        for (const plugin of plugins) {
                            if (!autoDisableEntries[plugin.id]) continue;
                            plugin.enabled = false;
                            plugin.status = 'disabled';
                            plugin.loadError = '';
                        }
                    }
                } catch (autoRepairErr) {
                    console.warn('[Plugins] Auto-remediation error:', autoRepairErr?.message || autoRepairErr);
                }
            }

            const sortedPlugins = plugins.sort((left, right) => {
                const a = String(left?.name || left?.id || '').toLowerCase();
                const b = String(right?.name || right?.id || '').toLowerCase();
                return a.localeCompare(b);
            });

            return sortedPlugins;
        } catch (err) {
            console.error('[Plugins] util:getPlugins error:', err.message);
            return Object.keys(PLUGIN_METADATA).map(id => ({
                id,
                name: PLUGIN_METADATA[id].name || id,
                description: PLUGIN_METADATA[id].description || '',
                category: PLUGIN_METADATA[id].category || 'other',
                enabled: false,
                status: 'disabled',
                controllable: false,
                repairable: false,
                repairAction: '',
                repairReason: ''
            }));
        }
    });

    /**
     * Enable a plugin by updating config
     */
    ipc.handle('util:enablePlugin', async (event, pluginId) => {
        try {
            validateString(pluginId, 100);
            const trustRegistry = await readTrustRegistry(secureStorage, inMemoryTrustStore);
            const trustStatus = resolvePluginTrustStatus({ id: pluginId }, trustRegistry);
            if (trustStatus === 'blocked') {
                return { ok: false, error: `Plugin "${pluginId}" is blocked by vetting policy` };
            }

            const runtimePlugin = await pluginExistsInRuntime(pluginId);
            if (runtimePlugin?.status === 'missing') {
                return { ok: false, error: `Plugin "${pluginId}" is not available in this OpenClaw runtime` };
            }

            const { data: configSnapshot } = await internalRequest('config.get', {});
            const result = await patchPluginEntries({ [pluginId]: { enabled: true } }, configSnapshot?.hash || 'new');

            if (!result.ok) {
                const message = result.error?.message || 'Failed to enable plugin';
                if (result.error?.details?.issues) {
                    console.warn(`[Plugins] Activation failed for ${pluginId}: ${message}`);
                    // Validation issues are expected for missing plugins, no need for full stack trace
                    return { ok: false, error: message, issues: result.error.details.issues };
                }
                throw new Error(message);
            }
            const resultPayload: any = { ok: true };
            if (trustStatus === 'untrusted') {
                resultPayload.warning = `Plugin "${pluginId}" is untrusted. Review and trust it in settings if you want to keep it enabled.`;
            }
            return resultPayload;
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
            const result = await patchPluginEntries({ [pluginId]: { enabled: false } }, configSnapshot?.hash || 'new');

            if (!result.ok) {
                return { ok: false, error: result.error?.message || 'Failed to disable plugin' };
            }
            return { ok: true };
        } catch (err) {
            console.error('[Plugins] util:disablePlugin critical error:', err.message);
            return { ok: false, error: err.message };
        }
    });

    ipc.handle('util:repairPlugin', async (_event, pluginId) => {
        try {
            validateString(pluginId, 100);
            const runtimePlugin = await pluginExistsInRuntime(pluginId);
            if (!runtimePlugin) {
                return { ok: false, error: `Plugin "${pluginId}" not found in runtime` };
            }

            const repair = getPluginRepairPlan(runtimePlugin);
            if (!repair || repair.action !== 'disable') {
                return { ok: false, error: `No automatic repair available for "${pluginId}"` };
            }

            const { data: configSnapshot } = await internalRequest('config.get', {});
            const result = await patchPluginEntries({ [pluginId]: { enabled: false } }, configSnapshot?.hash || 'new');
            if (!result?.ok) {
                return { ok: false, error: result?.error?.message || 'Failed to apply plugin repair' };
            }

            attemptedAutoRepairs.add(`${pluginId}:${repair.code}`);
            return {
                ok: true,
                action: repair.action,
                pluginId,
                message: repair.successMessage || `Disabled ${pluginId}`
            };
        } catch (err) {
            console.error('[Plugins] util:repairPlugin critical error:', err.message);
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






