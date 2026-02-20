/**
 * DRAM Config Synchronizer
 * Maps StateManager state to the DRAM Engine's dram.json config.
 */
import chokidar from 'chokidar';
import { syncAuthProfiles } from './config-sync-auth.js';

export function setupConfigSync(stateManager, engineModules) {
    const { loadConfig, writeConfigFile, configPath } = engineModules;
    let isSyncing = false;
    let lastRuntimeSecretSignature = null;
    const stableSerialize = (value) => {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    };
    const getSettingValue = (state, key) => state?.settings?.[key] ?? state?.[`settings.${key}`];
    const secretRefPattern = /^\$\{([A-Z0-9_]+)\}$/;
    const normalizeSecretValue = (rawValue) => {
        const value = typeof rawValue === 'string' ? rawValue.trim() : '';
        if (!value) return '';
        if (secretRefPattern.test(value)) return value;
        return value.replace(/\s+/g, '');
    };
    const resolveRuntimeSecret = (rawValue) => {
        const value = normalizeSecretValue(rawValue);
        if (!value) return '';
        const match = secretRefPattern.exec(value);
        if (!match) return value;
        return normalizeSecretValue(process.env[match[1]]);
    };
    const desktopManagedEnvVars = [
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'GROQ_API_KEY',
        'OLLAMA_API_KEY',
        'ELEVENLABS_API_KEY',
        'XI_API_KEY',
        'BRAVE_API_KEY',
        'PERPLEXITY_API_KEY'
    ];
    const authProfileAliases = {
        anthropic: [
            { profileId: 'anthropic:default', provider: 'anthropic' }
        ],
        openai: [
            { profileId: 'openai:default', provider: 'openai' },
            { profileId: 'openai-codex:default', provider: 'openai-codex' }
        ],
        google: [
            { profileId: 'google:default', provider: 'google' },
            { profileId: 'google-antigravity:default', provider: 'google-antigravity' },
            { profileId: 'google-gemini-cli:default', provider: 'google-gemini-cli' }
        ],
        ollama: [
            { profileId: 'ollama:default', provider: 'ollama' }
        ],
        groq: [
            { profileId: 'groq:default', provider: 'groq' }
        ]
    };
    const forEachAuthAlias = (baseProvider, callback) => {
        const aliases = authProfileAliases[baseProvider] || [];
        aliases.forEach(({ profileId, provider }) => callback(profileId, provider));
    };
    const DM_POLICIES = new Set(['pairing', 'allowlist', 'open', 'disabled']);
    const WEB_SEARCH_PROVIDERS = new Set(['brave', 'perplexity']);
    const WHATSAPP_CHAT_TYPES = new Set(['direct', 'group', 'channel', 'dm']);
    const MANAGED_WHATSAPP_CHAT_TYPES = ['direct', 'group', 'channel'];
    const normalizeDmPolicy = (rawValue) => {
        const policy = String(rawValue || '').trim().toLowerCase();
        return DM_POLICIES.has(policy) ? policy : 'open';
    };
    const normalizeWebSearchProvider = (rawValue) => {
        const provider = String(rawValue || '').trim().toLowerCase();
        return WEB_SEARCH_PROVIDERS.has(provider) ? provider : 'brave';
    };
    const ensureWildcardAllowFrom = (rawAllowFrom) => {
        const values = Array.isArray(rawAllowFrom)
            ? rawAllowFrom.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [];
        if (!values.includes('*')) values.push('*');
        return values;
    };
    const isManagedWhatsappDenyRule = (rule) => {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
        if (String((rule as any).action || '').trim().toLowerCase() !== 'deny') return false;
        const match = (rule as any).match;
        if (!match || typeof match !== 'object' || Array.isArray(match)) return false;
        const matchKeys = Object.keys(match);
        if (!Object.prototype.hasOwnProperty.call(match, 'channel')) return false;
        const channel = String((match as any).channel || '').trim().toLowerCase();
        if (channel !== 'whatsapp') return false;
        if (!Object.prototype.hasOwnProperty.call(match, 'chatType')) {
            return matchKeys.length === 1;
        }
        const chatType = String((match as any).chatType || '').trim().toLowerCase();
        return matchKeys.length === 2 && WHATSAPP_CHAT_TYPES.has(chatType);
    };
    const isWhatsappOutboundDeniedRule = (rule) => {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return { deniesAll: false, chatType: '' };
        if (String((rule as any).action || '').trim().toLowerCase() !== 'deny') return { deniesAll: false, chatType: '' };
        const match = (rule as any).match;
        if (!match || typeof match !== 'object' || Array.isArray(match)) return { deniesAll: false, chatType: '' };
        const channel = String((match as any).channel || '').trim().toLowerCase();
        if (channel !== 'whatsapp') return { deniesAll: false, chatType: '' };
        const chatType = String((match as any).chatType || '').trim().toLowerCase();
        if (!chatType) return { deniesAll: true, chatType: '' };
        if (WHATSAPP_CHAT_TYPES.has(chatType)) return { deniesAll: false, chatType };
        return { deniesAll: false, chatType: '' };
    };
    const isWhatsappOutboundDisabled = (sendPolicy) => {
        const rules = Array.isArray(sendPolicy?.rules) ? sendPolicy.rules : [];
        if (rules.length === 0) return false;
        const denied = new Set();
        for (const rule of rules) {
            const verdict = isWhatsappOutboundDeniedRule(rule);
            if (verdict.deniesAll) return true;
            if (verdict.chatType) denied.add(verdict.chatType === 'dm' ? 'direct' : verdict.chatType);
        }
        return MANAGED_WHATSAPP_CHAT_TYPES.every((chatType) => denied.has(chatType));
    };
    const resolveSecretValue = (rawValue) => {
        const value = normalizeSecretValue(rawValue);
        if (!value) return '';
        const match = secretRefPattern.exec(value);
        if (!match) return value;
        return normalizeSecretValue(process.env[match[1]]);
    };
    const applyRuntimeSecret = (envVar, rawValue) => {
        const value = resolveRuntimeSecret(rawValue);
        if (value) {
            process.env[envVar] = value;
        } else {
            delete process.env[envVar];
        }
    };
    const sanitizeDesktopEnvVars = (cfg) => {
        if (!cfg.env?.vars || typeof cfg.env.vars !== 'object') return;
        for (const envVar of desktopManagedEnvVars) {
            delete cfg.env.vars[envVar];
        }
        if (Object.keys(cfg.env.vars).length === 0) {
            delete cfg.env.vars;
        }
        if (Object.keys(cfg.env).length === 0) {
            delete cfg.env;
        }
    };

    // 1. Watch for file changes on disk (Manual Edits)
    if (configPath) {
        console.log('[ConfigSync] Watching for changes:', configPath);
        const watcher = chokidar.watch(configPath, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            }
        });

        watcher.on('change', async () => {
            if (isSyncing) return;
            console.log('[ConfigSync] File changed on disk, reloading...');
            await reloadFromDisk();
        });
    }

    /**
     * Reload settings from disk into StateManager (silently)
     */
    async function reloadFromDisk() {
        try {
            isSyncing = true;
            const config = loadConfig() || {};

            // Helper to get nested value safely
            const get = (obj, path) => {
                try {
                    return path.split('.').reduce((o, i) => (o && typeof o === 'object') ? o[i] : undefined, obj);
                } catch { return undefined; }
            };

            const updates = [];

            // 1. Sync Model (preserve separate cloud/local selections)
            const primaryModel = get(config, 'agents.defaults.model.primary');
            if (primaryModel && typeof primaryModel === 'string') {
                const normalizedPrimary = primaryModel.trim();
                const localPrefixes = ['ollama/', 'local/', 'lmstudio/', 'llamacpp/', 'vllm/'];
                const hasOllamaAuth = Boolean(
                    resolveSecretValue((config.env?.vars || {}).OLLAMA_API_KEY)
                    || resolveSecretValue(get(config, 'models.providers.ollama.apiKey'))
                );
                const looksLikeBareOllama = !normalizedPrimary.includes('/')
                    && (normalizedPrimary.includes(':') || normalizedPrimary.toLowerCase().includes('ollama'));
                const isLocalPrimary = localPrefixes.some((prefix) => normalizedPrimary.toLowerCase().startsWith(prefix))
                    || (hasOllamaAuth && looksLikeBareOllama);
                updates.push({ key: 'settings.primaryModeLocal', value: isLocalPrimary });
                if (isLocalPrimary) {
                    const normalizedLocalModel = normalizedPrimary.includes('/')
                        ? normalizedPrimary
                        : `ollama/${normalizedPrimary}`;
                    updates.push({ key: 'settings.modelLocal', value: normalizedLocalModel });
                } else {
                    updates.push({ key: 'settings.model', value: normalizedPrimary });
                }
            }

            // 2. Sync Fallbacks
            const fallbacks = get(config, 'agents.defaults.model.fallbacks') || [];
            updates.push({
                key: 'settings.fallbackChain',
                value: fallbacks
                    .map(f => (typeof f === 'string' ? f.trim() : ''))
                    .filter(Boolean)
            });

            // 3. Sync Workspace
            const workspace = get(config, 'agents.defaults.workspace');
            if (workspace) updates.push({ key: 'settings.workspacePath', value: workspace });

            // 4. Sync API Keys
            const envVars = config.env?.vars || {};
            const anthropicKey = resolveSecretValue(envVars.ANTHROPIC_API_KEY);
            const openaiKey = resolveSecretValue(envVars.OPENAI_API_KEY);
            const googleKey = resolveSecretValue(envVars.GOOGLE_API_KEY || envVars.GEMINI_API_KEY);
            const groqKey = resolveSecretValue(envVars.GROQ_API_KEY);
            const ollamaKey = resolveSecretValue(envVars.OLLAMA_API_KEY)
                || resolveSecretValue(get(config, 'models.providers.ollama.apiKey'));
            const braveKey = resolveSecretValue(get(config, 'tools.web.search.apiKey'))
                || resolveSecretValue(envVars.BRAVE_API_KEY);
            const perplexityKey = resolveSecretValue(get(config, 'tools.web.search.perplexity.apiKey'))
                || resolveSecretValue(envVars.PERPLEXITY_API_KEY);

            if (anthropicKey) updates.push({ key: 'settings.apiKeyAnthropic', value: anthropicKey });
            if (openaiKey) updates.push({ key: 'settings.apiKeyOpenAI', value: openaiKey });
            if (googleKey) updates.push({ key: 'settings.apiKeyGoogle', value: googleKey });
            if (groqKey) updates.push({ key: 'settings.apiKeyGroq', value: groqKey });
            if (ollamaKey) updates.push({ key: 'settings.apiKeyOllama', value: ollamaKey });
            if (braveKey) updates.push({ key: 'settings.apiKeyBrave', value: braveKey });
            if (perplexityKey) updates.push({ key: 'settings.apiKeyPerplexity', value: perplexityKey });

            const ttsElevenLabsKey = resolveSecretValue(get(config, 'messages.tts.elevenlabs.apiKey'))
                || resolveSecretValue(envVars.ELEVENLABS_API_KEY)
                || resolveSecretValue(envVars.XI_API_KEY);
            if (ttsElevenLabsKey) updates.push({ key: 'settings.apiKeyElevenLabs', value: ttsElevenLabsKey });

            // 5. Sync Ollama
            const ollamaBaseUrl = get(config, 'models.providers.ollama.baseUrl');
            if (ollamaBaseUrl) updates.push({ key: 'settings.ollamaHost', value: ollamaBaseUrl });

            // 6. Sync Web Search provider
            const webSearchProvider = normalizeWebSearchProvider(get(config, 'tools.web.search.provider') || 'brave');
            updates.push({ key: 'settings.webSearchProvider', value: webSearchProvider });

            // 7. Sync WhatsApp DM policy
            const whatsappRootPolicy = get(config, 'channels.whatsapp.dmPolicy');
            const whatsappAccounts = get(config, 'channels.whatsapp.accounts');
            const accountPolicy = (whatsappAccounts && typeof whatsappAccounts === 'object')
                ? (Object.values(whatsappAccounts as Record<string, any>).find((entry: any) => entry && typeof entry.dmPolicy === 'string') as any)?.dmPolicy
                : '';
            const resolvedDmPolicy = normalizeDmPolicy(whatsappRootPolicy || accountPolicy || 'open');
            updates.push({ key: 'settings.dmPolicy', value: resolvedDmPolicy });
            const persistedSendPolicy = get(config, 'session.sendPolicy');
            const outboundEnabled = persistedSendPolicy && typeof persistedSendPolicy === 'object'
                ? !isWhatsappOutboundDisabled(persistedSendPolicy)
                : Boolean(stateManager.get('settings.whatsappOutboundEnabled', false));
            updates.push({ key: 'settings.whatsappOutboundEnabled', value: outboundEnabled });

            // 8. Sync Agent Defaults
            const temp = get(config, 'agents.defaults.temperature');
            if (temp !== undefined) updates.push({ key: 'settings.temperature', value: temp });
            // 9. Sync Plugins (Enabled List)
            const pluginsEntries = get(config, 'plugins.entries') || {};
            const enabledPlugins = Object.entries(pluginsEntries)
                .filter(([_, entry]) => (entry as any) && (entry as any).enabled === true)
                .map(([id, _]) => id);
            updates.push({ key: 'plugins', value: enabledPlugins });

            // 10. Sync Skills (Enabled List)
            const skillsEntries = get(config, 'skills.entries') || {};
            const enabledSkills = Object.entries(skillsEntries)
                .filter(([_, entry]) => (entry as any) && (entry as any).enabled === true)
                .map(([id, _]) => id);
            updates.push({ key: 'skills', value: enabledSkills });

            // Apply updates to state (persist = false to avoid looping back to file)
            for (const { key, value } of updates) {
                await stateManager.set(key, value, false);
            }

            console.log(`[ConfigSync] Successfully reloaded ${updates.length} settings from disk`);
        } catch (err) {
            console.error('[ConfigSync] Reload from disk failed:', err);
        } finally {
            // Delay resetting isSyncing to avoid picking up the file-write we might have just done
            setTimeout(() => { isSyncing = false; }, 1000);
        }
    }

    stateManager.on('change', async ({ key, value: _value }) => {
        if (isSyncing) {
            console.log('[ConfigSync] Ignoring change during sync:', key);
            return;
        }
        // Sync keys that affect the engine
        const syncKeys = [
            'model',
            'apiKey',
            'plugins',
            'skills',
            'workspacePath',
            'fallbacks',
            'apiKeyAnthropic',
            'apiKeyOpenAI',
            'apiKeyGoogle',
            'apiKeyGroq',
            'apiKeyOllama',
            'temperature',
            'sttProvider',
            'sttModel',
            'ttsProvider',
            'ttsVoice',
            'ollamaHost',
            'primaryModeLocal',
            'modelLocal'
        ];

        const isThinkLevelSetting = key === 'thinkLevel' || key === 'settings.thinkLevel';
        const isCanvasWorkspaceSetting = key === 'canvasWorkspacePath' || key === 'settings.canvasWorkspacePath';
        const shouldSync = !isThinkLevelSetting && !isCanvasWorkspaceSetting && (
            syncKeys.includes(key)
            || key.startsWith('agents.')
            || key.startsWith('gateway.')
            || key.startsWith('settings.')
        );
        console.log(`[ConfigSync] State change: ${key}, shouldSync: ${shouldSync}`);

        if (shouldSync) {
            await syncToEngine();
        }
    });

    /**
     * Perform the synchronization from StateManager to engine config
     */
    async function syncToEngine() {
        try {
            const currentConfig = loadConfig() || {};
            const state = stateManager.getAll();

            // Detect provider from model if not present
            const detectProvider = (modelId, { localHint = false } = {}) => {
                if (!modelId) return 'anthropic';
                const normalized = String(modelId).trim().toLowerCase();
                if (normalized.includes('/')) return normalized.split('/')[0];
                if (localHint) return 'ollama';
                if (normalized.includes('claude') || normalized.includes('anthropic')) return 'anthropic';
                if (normalized.includes('gpt') || normalized.includes('o1') || normalized.includes('o3') || normalized.includes('openai')) return 'openai';
                if (normalized.includes('gemini') || normalized.includes('google')) return 'google';
                if (normalized.includes('groq')) return 'groq';
                if (normalized.includes('ollama') || normalized.includes(':')) return 'ollama';
                return 'unknown';
            };
            const normalizeOllamaBaseUrl = (rawUrl) => {
                const trimmed = String(rawUrl || '').trim();
                if (!trimmed) return '';
                const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
                try {
                    const parsed = new URL(withProtocol);
                    const base = `${parsed.protocol}//${parsed.host}`;
                    return base.endsWith('/v1') ? base : `${base}/v1`;
                } catch {
                    return '';
                }
            };

            const isLocalPrimary = getSettingValue(state, 'primaryModeLocal') || false;
            const cloudModelId = state.settings?.model || 'claude-3-7-sonnet-latest';
            const localModelId = state.settings?.modelLocal || '';

            let fullModelName;
            if (isLocalPrimary && localModelId) {
                fullModelName = localModelId.includes('/') ? localModelId : `ollama/${localModelId}`;
            } else {
                // If the cloudModelId already has a slash, use it directly (e.g. google-antigravity/claude-...)
                if (cloudModelId.includes('/')) {
                    fullModelName = cloudModelId;
                } else {
                    const provider = detectProvider(cloudModelId);
                    fullModelName = provider === 'unknown'
                        ? cloudModelId
                        : `${provider}/${cloudModelId}`;
                }
            }

            // Sync Ollama Host
            const ollamaHost = getSettingValue(state, 'ollamaHost');
            const providers = { ...currentConfig.models?.providers };
            const existingOllama = (providers.ollama && typeof providers.ollama === 'object' && !Array.isArray(providers.ollama))
                ? providers.ollama
                : {};
            const normalizeForCompare = (rawUrl) => String(rawUrl || '').trim().toLowerCase().replace(/\/+$/, '');
            const configuredBase = normalizeOllamaBaseUrl(ollamaHost);
            const existingBase = normalizeForCompare(existingOllama.baseUrl);
            const defaultBases = new Set(['http://localhost:11434/v1', 'http://127.0.0.1:11434/v1']);
            const existingModels = Array.isArray(existingOllama.models) ? existingOllama.models : [];
            const existingApi = String(existingOllama.api || '').trim().toLowerCase();
            const existingApiKey = String(existingOllama.apiKey || '').trim();
            const hasOnlyManagedKeys = Object.keys(existingOllama).every((key) => ['baseUrl', 'models', 'api', 'apiKey'].includes(key));
            const isDefaultDiscoveryStub = hasOnlyManagedKeys
                && existingModels.length === 0
                && (!existingApi || existingApi === 'openai-completions')
                && (!existingApiKey || existingApiKey === '${OLLAMA_API_KEY}')
                && (!existingBase || defaultBases.has(existingBase));

            if (isDefaultDiscoveryStub) {
                // Keep implicit Ollama discovery enabled by removing default explicit provider stubs.
                delete providers.ollama;
            } else if (providers.ollama && typeof providers.ollama === 'object' && !Array.isArray(providers.ollama)) {
                const nextOllama = {
                    ...providers.ollama,
                    models: existingModels
                };
                if (configuredBase) nextOllama.baseUrl = configuredBase;
                // Never persist unresolved env placeholders in config.
                if (String(nextOllama.apiKey || '').trim() === '${OLLAMA_API_KEY}') {
                    delete nextOllama.apiKey;
                }
                providers.ollama = nextOllama;
            }

            const mappedFallbacks = (state.settings?.fallbackChain || []).map(fb => {
                const fbModel = typeof fb === 'string' ? fb : fb.model;
                if (!fbModel || typeof fbModel !== 'string') return '';
                if (fbModel.includes('/')) return fbModel;
                const provider = detectProvider(fbModel, { localHint: isLocalPrimary });
                return provider === 'unknown' ? fbModel : `${provider}/${fbModel}`;
            });
            const effectiveFallbacks = isLocalPrimary ? [] : mappedFallbacks.filter(Boolean);

            // Map StateManager state to DramConfig structure
            const nextConfig = {
                ...currentConfig,
                models: {
                    ...currentConfig.models,
                    providers
                },
                agents: {
                    ...currentConfig.agents,
                    defaults: {
                        ...currentConfig.agents?.defaults,
                        temperature: state.settings?.temperature !== undefined ? parseFloat(state.settings.temperature) : currentConfig.agents?.defaults?.temperature,
                        model: {
                            ...currentConfig.agents?.defaults?.model,
                            primary: fullModelName,
                            fallbacks: effectiveFallbacks
                        }
                    }
                },
                // PROTECT Symbiotic Gateway Settings
                gateway: {
                    ...currentConfig.gateway,
                    mode: currentConfig.gateway?.mode || 'local',
                    controlUi: {
                        ...currentConfig.gateway?.controlUi,
                        allowedOrigins: currentConfig.gateway?.controlUi?.allowedOrigins || ['*']
                    }
                }
            };
            if (nextConfig.agents?.defaults && Object.prototype.hasOwnProperty.call(nextConfig.agents.defaults, 'thinkLevel')) {
                delete nextConfig.agents.defaults.thinkLevel;
            }
            // Sync workspace path if present
            if (state.settings?.workspacePath) {
                if (!nextConfig.agents) nextConfig.agents = {};
                if (!nextConfig.agents.defaults) nextConfig.agents.defaults = {};
                nextConfig.agents.defaults.workspace = state.settings.workspacePath;
            }

            // Sync WhatsApp DM policy to avoid forced pairing prompts on inbound DMs.
            const desiredDmPolicy = normalizeDmPolicy(getSettingValue(state, 'dmPolicy') || 'open');
            if (!nextConfig.channels) nextConfig.channels = {};
            const existingWhatsapp = (nextConfig.channels.whatsapp && typeof nextConfig.channels.whatsapp === 'object' && !Array.isArray(nextConfig.channels.whatsapp))
                ? nextConfig.channels.whatsapp
                : {};
            const nextWhatsapp = {
                ...existingWhatsapp,
                dmPolicy: desiredDmPolicy
            };
            if (desiredDmPolicy === 'open') {
                nextWhatsapp.allowFrom = ensureWildcardAllowFrom(existingWhatsapp.allowFrom);
            }
            if (existingWhatsapp.accounts && typeof existingWhatsapp.accounts === 'object' && !Array.isArray(existingWhatsapp.accounts)) {
                const nextAccounts = {};
                for (const [accountId, accountConfig] of Object.entries(existingWhatsapp.accounts)) {
                    if (!accountConfig || typeof accountConfig !== 'object' || Array.isArray(accountConfig)) continue;
                    const accountNext = {
                        ...(accountConfig as any),
                        dmPolicy: desiredDmPolicy
                    };
                    if (desiredDmPolicy === 'open') {
                        accountNext.allowFrom = ensureWildcardAllowFrom((accountConfig as any).allowFrom);
                    }
                    nextAccounts[accountId] = accountNext;
                }
                nextWhatsapp.accounts = nextAccounts;
            }
            nextConfig.channels.whatsapp = nextWhatsapp;

            // Sync WhatsApp outbound reply policy via session.sendPolicy deny rules.
            const whatsappOutboundEnabled = getSettingValue(state, 'whatsappOutboundEnabled') === true;
            if (!nextConfig.session || typeof nextConfig.session !== 'object' || Array.isArray(nextConfig.session)) {
                nextConfig.session = {};
            }
            const existingSendPolicy = (nextConfig.session.sendPolicy && typeof nextConfig.session.sendPolicy === 'object' && !Array.isArray(nextConfig.session.sendPolicy))
                ? nextConfig.session.sendPolicy
                : {};
            const currentRules = Array.isArray(existingSendPolicy.rules) ? existingSendPolicy.rules : [];
            let nextRules = currentRules.filter((rule: any) => !isManagedWhatsappDenyRule(rule));
            if (!whatsappOutboundEnabled) {
                const managedRules = [{
                    action: 'deny',
                    match: {
                        channel: 'whatsapp'
                    }
                }];
                nextRules = [...nextRules, ...managedRules];
            }
            nextConfig.session.sendPolicy = {
                ...existingSendPolicy,
                default: String(existingSendPolicy.default || 'allow'),
                rules: nextRules
            };
            // Safety cleanup: previous DRAM versions wrote this key to an invalid path.
            if (nextConfig.agents?.defaults && Object.prototype.hasOwnProperty.call(nextConfig.agents.defaults, 'sendPolicy')) {
                delete nextConfig.agents.defaults.sendPolicy;
            }

            // Configure tools for desktop experience (native execution)
            if (!nextConfig.tools) nextConfig.tools = {};

            // Sync web search provider (keys are supplied via runtime env vars only).
            const webSearchProvider = normalizeWebSearchProvider(getSettingValue(state, 'webSearchProvider') || currentConfig.tools?.web?.search?.provider || 'brave');
            if (!nextConfig.tools.web || typeof nextConfig.tools.web !== 'object' || Array.isArray(nextConfig.tools.web)) {
                nextConfig.tools.web = {};
            }
            const existingWeb = (nextConfig.tools.web && typeof nextConfig.tools.web === 'object' && !Array.isArray(nextConfig.tools.web))
                ? nextConfig.tools.web
                : {};
            const existingSearch = (existingWeb.search && typeof existingWeb.search === 'object' && !Array.isArray(existingWeb.search))
                ? existingWeb.search
                : {};
            const nextSearch = {
                ...existingSearch,
                enabled: existingSearch.enabled !== false,
                provider: webSearchProvider
            };
            if (Object.prototype.hasOwnProperty.call(nextSearch, 'apiKey')) {
                delete nextSearch.apiKey;
            }
            const existingPerplexity = (nextSearch.perplexity && typeof nextSearch.perplexity === 'object' && !Array.isArray(nextSearch.perplexity))
                ? nextSearch.perplexity
                : {};
            const nextPerplexity = {
                ...existingPerplexity
            };
            if (Object.prototype.hasOwnProperty.call(nextPerplexity, 'apiKey')) {
                delete nextPerplexity.apiKey;
            }
            nextSearch.perplexity = nextPerplexity;
            nextConfig.tools.web = {
                ...existingWeb,
                search: nextSearch
            };

            // Enable elevated execution for the desktop app's internal channel
            if (!nextConfig.tools.elevated) nextConfig.tools.elevated = { enabled: true };
            if (!nextConfig.tools.elevated.allowFrom) nextConfig.tools.elevated.allowFrom = {};
            if (!nextConfig.tools.elevated.allowFrom.webchat) {
                nextConfig.tools.elevated.allowFrom.webchat = ['*'];
            }

            // Default exec to gateway (host) since desktop apps usually don't have Docker
            if (!nextConfig.tools.exec) nextConfig.tools.exec = {};
            if (!nextConfig.tools.exec.host) {
                nextConfig.tools.exec.host = 'gateway';
            }
            // Desktop mode: grant DRAM direct exec access for host operations.
            // This avoids allowlist-miss/approval friction in local app workflows.
            nextConfig.tools.exec.security = 'full';
            nextConfig.tools.exec.ask = 'off';

            // Sync API keys to auth profiles and env.vars if present
            const apiKeys = {
                anthropic: normalizeSecretValue(getSettingValue(state, 'apiKeyAnthropic')),
                openai: normalizeSecretValue(getSettingValue(state, 'apiKeyOpenAI')),
                google: normalizeSecretValue(getSettingValue(state, 'apiKeyGoogle')),
                groq: normalizeSecretValue(getSettingValue(state, 'apiKeyGroq')),
                ollama: normalizeSecretValue(getSettingValue(state, 'apiKeyOllama')),
                elevenlabs: normalizeSecretValue(getSettingValue(state, 'apiKeyElevenLabs'))
            };
            const webSearchKeys = {
                brave: normalizeSecretValue(getSettingValue(state, 'apiKeyBrave')),
                perplexity: normalizeSecretValue(getSettingValue(state, 'apiKeyPerplexity'))
            };

            const hasAnyKeys = Object.values(apiKeys).some(Boolean);
            if (hasAnyKeys) {
                if (!nextConfig.auth) nextConfig.auth = {};
                if (!nextConfig.auth.profiles) nextConfig.auth.profiles = {};
            } else {
                if (nextConfig.auth?.profiles) {
                    forEachAuthAlias('anthropic', (profileId) => delete nextConfig.auth.profiles[profileId]);
                    forEachAuthAlias('openai', (profileId) => delete nextConfig.auth.profiles[profileId]);
                    forEachAuthAlias('google', (profileId) => delete nextConfig.auth.profiles[profileId]);
                    forEachAuthAlias('groq', (profileId) => delete nextConfig.auth.profiles[profileId]);
                }
            }

            sanitizeDesktopEnvVars(nextConfig);

            const setApiKeyProfile = (profileId, provider, keyValue) => {
                const key = normalizeSecretValue(keyValue);
                if (!nextConfig.auth) nextConfig.auth = {};
                if (!nextConfig.auth.profiles) nextConfig.auth.profiles = {};
                if (key) {
                    nextConfig.auth.profiles[profileId] = { provider, mode: 'api_key' };
                } else {
                    delete nextConfig.auth.profiles[profileId];
                }
            };

            forEachAuthAlias('anthropic', (profileId, provider) => setApiKeyProfile(profileId, provider, apiKeys.anthropic));
            forEachAuthAlias('openai', (profileId, provider) => setApiKeyProfile(profileId, provider, apiKeys.openai));
            forEachAuthAlias('google', (profileId, provider) => setApiKeyProfile(profileId, provider, apiKeys.google));
            forEachAuthAlias('groq', (profileId, provider) => setApiKeyProfile(profileId, provider, apiKeys.groq));

            // Keep secrets in runtime env only; never persist raw values to dram.json.
            applyRuntimeSecret('ANTHROPIC_API_KEY', apiKeys.anthropic);
            applyRuntimeSecret('OPENAI_API_KEY', apiKeys.openai);
            applyRuntimeSecret('GOOGLE_API_KEY', apiKeys.google);
            applyRuntimeSecret('GEMINI_API_KEY', apiKeys.google);
            applyRuntimeSecret('GROQ_API_KEY', apiKeys.groq);
            applyRuntimeSecret('OLLAMA_API_KEY', apiKeys.ollama);
            applyRuntimeSecret('ELEVENLABS_API_KEY', apiKeys.elevenlabs);
            applyRuntimeSecret('XI_API_KEY', apiKeys.elevenlabs);
            applyRuntimeSecret('BRAVE_API_KEY', webSearchKeys.brave);
            applyRuntimeSecret('PERPLEXITY_API_KEY', webSearchKeys.perplexity);
            const runtimeSecretSignature = stableSerialize({
                anthropic: process.env.ANTHROPIC_API_KEY || '',
                openai: process.env.OPENAI_API_KEY || '',
                google: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '',
                groq: process.env.GROQ_API_KEY || '',
                ollama: process.env.OLLAMA_API_KEY || '',
                elevenlabs: process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY || '',
                brave: process.env.BRAVE_API_KEY || '',
                perplexity: process.env.PERPLEXITY_API_KEY || ''
            });
            if (lastRuntimeSecretSignature !== null && lastRuntimeSecretSignature !== runtimeSecretSignature) {
                try {
                    if (typeof engineModules?.restartGatewayForRuntimeSecrets === 'function') {
                        await engineModules.restartGatewayForRuntimeSecrets();
                    }
                } catch (restartErr) {
                    console.warn('[ConfigSync] Runtime secret restart failed:', restartErr?.message || restartErr);
                }
            }
            lastRuntimeSecretSignature = runtimeSecretSignature;

            // Ensure we do not persist ElevenLabs secrets in config.
            if (nextConfig.messages?.tts?.elevenlabs && typeof nextConfig.messages.tts.elevenlabs === 'object') {
                const { apiKey, ...rest } = nextConfig.messages.tts.elevenlabs;
                void apiKey;
                nextConfig.messages.tts.elevenlabs = rest;
            }

            // Sync TTS config from settings
            const currentTts = currentConfig.messages?.tts || {};
            const clean = (value) => typeof value === 'string' ? value.trim() : '';
            const ttsProvider = clean(getSettingValue(state, 'ttsProvider'));
            const edgeVoice = clean(getSettingValue(state, 'ttsVoiceEdge'));
            const openaiVoice = clean(getSettingValue(state, 'ttsVoiceOpenAI'));
            const savedElevenlabsVoice = clean(getSettingValue(state, 'ttsVoiceElevenlabs'));
            const customElevenlabsVoice = clean(getSettingValue(state, 'ttsVoiceElevenlabsCustom'));

            let elevenlabsVoice = currentTts.elevenlabs?.voiceId;
            if (savedElevenlabsVoice === 'custom') {
                if (customElevenlabsVoice) {
                    elevenlabsVoice = customElevenlabsVoice;
                }
            } else if (savedElevenlabsVoice) {
                elevenlabsVoice = savedElevenlabsVoice;
            }

            const nextTts = { ...currentTts };
            if (ttsProvider) nextTts.provider = ttsProvider;
            if (edgeVoice) nextTts.edge = { ...currentTts.edge, voice: edgeVoice };
            if (openaiVoice) nextTts.openai = { ...currentTts.openai, voice: openaiVoice };
            if (elevenlabsVoice) nextTts.elevenlabs = { ...currentTts.elevenlabs, voiceId: elevenlabsVoice };
            if (nextTts.elevenlabs && typeof nextTts.elevenlabs === 'object') {
                const { apiKey, ...rest } = nextTts.elevenlabs;
                void apiKey;
                nextTts.elevenlabs = rest;
            }

            const hasTtsUpdates = ttsProvider || edgeVoice || openaiVoice || elevenlabsVoice || apiKeys.elevenlabs;
            if (hasTtsUpdates) {
                if (!nextConfig.messages) nextConfig.messages = {};
                nextConfig.messages.tts = nextTts;
            }

            // Sync plugins
            if (state.plugins && Array.isArray(state.plugins)) {
                if (!nextConfig.plugins) nextConfig.plugins = { entries: {} };
                state.plugins.forEach(pId => {
                    if (!nextConfig.plugins.entries[pId]) {
                        nextConfig.plugins.entries[pId] = { enabled: true };
                    }
                });
            }

            const currentSnapshot = stableSerialize(currentConfig);
            const nextSnapshot = stableSerialize(nextConfig);
            if (currentSnapshot !== nextSnapshot) {
                await writeConfigFile(nextConfig);
                console.log('[ConfigSync] Synced state to engine config at:', new Date().toISOString());
                console.log('[ConfigSync] Config path:', configPath || 'unknown');
            } else {
                console.log('[ConfigSync] No config changes detected, skipping write');
            }

            // Also sync API keys to auth-profiles.json for usage tracking.
            await syncAuthProfiles({
                state,
                configPath,
                getSettingValue,
                normalizeSecretValue,
                resolveRuntimeSecret,
                forEachAuthAlias
            });
        } catch (err) {
            console.error('[ConfigSync] Sync failed:', err);
        }
    }

    // Initial sync
    syncToEngine().catch(err => console.error('[ConfigSync] Initial sync failed:', err));
}

