/**
 * DRAM Config Synchronizer
 * Maps StateManager state to the DRAM Engine's dram.json config.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

import chokidar from 'chokidar';

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
        'ELEVENLABS_API_KEY',
        'XI_API_KEY'
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
        groq: [
            { profileId: 'groq:default', provider: 'groq' }
        ]
    };
    const forEachAuthAlias = (baseProvider, callback) => {
        const aliases = authProfileAliases[baseProvider] || [];
        aliases.forEach(({ profileId, provider }) => callback(profileId, provider));
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

            // 1. Sync Model
            const primaryModel = get(config, 'agents.defaults.model.primary');
            if (primaryModel) {
                // Keep the full provider/id path to match the new UI values
                updates.push({ key: 'settings.model', value: primaryModel });
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

            if (anthropicKey) updates.push({ key: 'settings.apiKeyAnthropic', value: anthropicKey });
            if (openaiKey) updates.push({ key: 'settings.apiKeyOpenAI', value: openaiKey });
            if (googleKey) updates.push({ key: 'settings.apiKeyGoogle', value: googleKey });
            if (groqKey) updates.push({ key: 'settings.apiKeyGroq', value: groqKey });

            const ttsElevenLabsKey = resolveSecretValue(get(config, 'messages.tts.elevenlabs.apiKey'))
                || resolveSecretValue(envVars.ELEVENLABS_API_KEY)
                || resolveSecretValue(envVars.XI_API_KEY);
            if (ttsElevenLabsKey) updates.push({ key: 'settings.apiKeyElevenLabs', value: ttsElevenLabsKey });

            // 5. Sync Ollama
            const ollamaBaseUrl = get(config, 'models.providers.ollama.baseUrl');
            if (ollamaBaseUrl) updates.push({ key: 'settings.ollamaHost', value: ollamaBaseUrl });

            // 6. Sync Agent Defaults
            const temp = get(config, 'agents.defaults.temperature');
            if (temp !== undefined) updates.push({ key: 'settings.temperature', value: temp });
            // 6. Sync Plugins (Enabled List)
            const pluginsEntries = get(config, 'plugins.entries') || {};
            const enabledPlugins = Object.entries(pluginsEntries)
                .filter(([_, entry]) => entry && entry.enabled === true)
                .map(([id, _]) => id);
            if (enabledPlugins.length > 0) updates.push({ key: 'plugins', value: enabledPlugins });

            // 6. Sync Skills (Enabled List)
            const skillsEntries = get(config, 'skills.entries') || {};
            const enabledSkills = Object.entries(skillsEntries)
                .filter(([_, entry]) => entry && entry.enabled === true)
                .map(([id, _]) => id);
            if (enabledSkills.length > 0) updates.push({ key: 'skills', value: enabledSkills });

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
            const detectProvider = (modelId) => {
                if (!modelId) return 'anthropic';
                if (modelId.includes('/')) return modelId.split('/')[0];
                if (modelId.includes('claude')) return 'anthropic';
                if (modelId.includes('gpt') || modelId.includes('o1')) return 'openai';
                if (modelId.includes('gemini')) return 'google';
                if (modelId.includes('llama')) return 'groq';
                return 'unknown';
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
                    fullModelName = `${provider}/${cloudModelId}`;
                }
            }

            // Sync Ollama Host
            const ollamaHost = getSettingValue(state, 'ollamaHost');
            const providers = { ...currentConfig.models?.providers };
            if (ollamaHost) {
                providers.ollama = {
                    ...providers.ollama,
                    baseUrl: ollamaHost.includes('/v1') ? ollamaHost : `${ollamaHost.replace(/\/$/, '')}/v1`
                };
            } else if (providers.ollama) {
                delete providers.ollama;
            }

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
                            fallbacks: (state.settings?.fallbackChain || []).map(fb => {
                                const fbModel = typeof fb === 'string' ? fb : fb.model;
                                return fbModel.includes('/') ? fbModel : `${detectProvider(fbModel)}/${fbModel}`;
                            })
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

            // Configure tools for desktop experience (native execution)
            if (!nextConfig.tools) nextConfig.tools = {};

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
            // Set more permissive defaults for advanced mode
            if (state.settings?.advancedMode) {
                if (!nextConfig.tools.exec.security) nextConfig.tools.exec.security = 'allowlist';
                if (!nextConfig.tools.exec.ask) nextConfig.tools.exec.ask = 'on-miss';
            }

            // Sync API keys to auth profiles and env.vars if present
            const apiKeys = {
                anthropic: normalizeSecretValue(getSettingValue(state, 'apiKeyAnthropic')),
                openai: normalizeSecretValue(getSettingValue(state, 'apiKeyOpenAI')),
                google: normalizeSecretValue(getSettingValue(state, 'apiKeyGoogle')),
                groq: normalizeSecretValue(getSettingValue(state, 'apiKeyGroq')),
                elevenlabs: normalizeSecretValue(getSettingValue(state, 'apiKeyElevenLabs'))
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
            applyRuntimeSecret('ELEVENLABS_API_KEY', apiKeys.elevenlabs);
            applyRuntimeSecret('XI_API_KEY', apiKeys.elevenlabs);
            const runtimeSecretSignature = stableSerialize({
                anthropic: process.env.ANTHROPIC_API_KEY || '',
                openai: process.env.OPENAI_API_KEY || '',
                google: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '',
                groq: process.env.GROQ_API_KEY || '',
                elevenlabs: process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY || ''
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

            // Also sync API keys to auth-profiles.json for usage tracking
            await syncAuthProfiles(state);
        } catch (err) {
            console.error('[ConfigSync] Sync failed:', err);
        }
    }

    /**
             * Sync auth profiles for the active agent.
             * OpenClaw resolves provider credentials from auth-profiles.json first,
             * so we persist API key entries here to avoid stale/missing auth at runtime.
             */
    async function syncAuthProfiles(state) {
        try {
            const apiKeys = {
                anthropic: normalizeSecretValue(getSettingValue(state, 'apiKeyAnthropic')),
                openai: normalizeSecretValue(getSettingValue(state, 'apiKeyOpenAI')),
                google: normalizeSecretValue(getSettingValue(state, 'apiKeyGoogle')),
                groq: normalizeSecretValue(getSettingValue(state, 'apiKeyGroq'))
            };

            const openClawHome = (typeof configPath === 'string' && configPath.trim())
                ? path.dirname(configPath)
                : path.join(os.homedir(), '.openclaw');
            const targetAgentDirs = [
                path.join(openClawHome, 'agents', 'main', 'agent'),
                path.join(os.homedir(), '.dram', 'agents', 'main', 'agent') // Legacy mirror
            ];

            // Load existing auth profiles from first available location.
            let store = { version: 1, profiles: {} };
            for (const agentDir of targetAgentDirs) {
                const candidatePath = path.join(agentDir, 'auth-profiles.json');
                try {
                    const existing = await fs.promises.readFile(candidatePath, 'utf-8');
                    store = JSON.parse(existing);
                    break;
                } catch {
                    // Try next location
                }
            }

            if (!store.profiles || typeof store.profiles !== 'object') {
                store.profiles = {};
            }

            // Update profile metadata only (provider + mode), never raw keys.
            const syncedProviders = [];

            // Helper to update or remove a profile
            const updateProfile = (provider, profileId, key) => {
                const resolvedKey = resolveRuntimeSecret(key);
                if (resolvedKey) {
                    store.profiles[profileId] = {
                        type: 'api_key',
                        provider: provider,
                        key: resolvedKey
                    };
                    syncedProviders.push(provider);
                } else {
                    // Only remove desktop-managed API key profiles.
                    // Preserve non-api_key credentials (e.g., OAuth tokens) for the same profile id.
                    const existing = store.profiles[profileId];
                    if (!existing || existing.type === 'api_key') {
                        delete store.profiles[profileId];
                    }
                }
            };

            forEachAuthAlias('anthropic', (profileId, provider) => updateProfile(provider, profileId, apiKeys.anthropic));
            forEachAuthAlias('openai', (profileId, provider) => updateProfile(provider, profileId, apiKeys.openai));
            forEachAuthAlias('google', (profileId, provider) => updateProfile(provider, profileId, apiKeys.google));
            forEachAuthAlias('groq', (profileId, provider) => updateProfile(provider, profileId, apiKeys.groq));

            // Write updated store to primary + legacy locations for compatibility.
            const writtenPaths = [];
            for (const agentDir of targetAgentDirs) {
                const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
                await fs.promises.mkdir(agentDir, { recursive: true });
                await fs.promises.writeFile(authProfilesPath, JSON.stringify(store, null, 2), 'utf-8');
                writtenPaths.push(authProfilesPath);
            }

            console.log('[ConfigSync] Synced API keys to auth-profiles.json:', syncedProviders.join(', ') || 'none', writtenPaths);
        } catch (err) {
            console.error('[ConfigSync] Failed to sync auth profiles:', err);
        }
    }

    // Initial sync
    syncToEngine().catch(err => console.error('[ConfigSync] Initial sync failed:', err));
}
