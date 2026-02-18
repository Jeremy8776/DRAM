/**
 * DRAM Wizard - Consolidated Logic
 * Merges functionality from state.js and finish.js
 */
import { state } from './state.js';
import { connect } from './socket.js';
import { updateModelStats } from './rate-limits.js';
import { updateConnectionUI } from './connection-ui.js';
import { loadUserSettings } from './settings.js';
import { redactObject } from './logger.js';
import { PLUGIN_SETUP_REQUIREMENTS } from '../data/plugin-metadata.js';

const normalizeSecretInput = (rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return '';
    if (/^\$\{[A-Z0-9_]+\}$/.test(value)) return value;
    return value.replace(/\s+/g, '');
};

// --- STATE MANAGEMENT ---

export const wizardState = {
    model: '',  // No default - user must select
    apiKey: '',
    fallbacks: [],
    plugins: [],
    skills: {},
    pluginConfigs: {},
    workspacePath: '',  // No default - user must select or will be set on finish
    gatewayToken: '',
    foundLegacy: false,
    legacyName: ''
};

const providerAliasMap = {
    'openai-codex': 'openai',
    'google-antigravity': 'google',
    'google-gemini-cli': 'google',
    'google-generative-ai': 'google'
};

function normalizeProvider(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!normalized) return 'unknown';
    return providerAliasMap[normalized] || normalized;
}

/**
 * Validate an API key for a given provider.
 * @param {string} provider 
 * @param {string} value 
 */
export async function validateApiKey(provider, value) {
    try {
        const normalizedValue = normalizeSecretInput(value);
        if (!normalizedValue) return false;
        const result = await window.dram.util.validateApiKey(provider, normalizedValue);
        return result.valid;
    } catch (err) {
        console.error('API Key validation error:', err);
        return false;
    }
}

/**
 * Determine the provider based on the model ID.
 * @param {string} model 
 */
export function getProviderFromModel(model) {
    if (!model) return 'unknown';
    if (model.includes('/')) {
        const [provider] = model.split('/');
        const normalized = normalizeProvider(provider);
        if (normalized !== 'unknown') return normalized;
    }
    if (model.includes('claude') || model.includes('sonnet') || model.includes('opus') || model.includes('haiku')) return 'anthropic';
    if (model.includes('gpt') || model.includes('o1')) return 'openai';
    if (model.includes('gemini')) return 'google';
    if (model.includes('llama') || model.includes('groq')) return 'groq';
    return 'unknown';
}

/**
 * Collect plugin configuration from the DOM and update state.
 * @param {Object} state 
 */
export function collectPluginConfigsFromDOM(state) {
    const inputs = document.querySelectorAll('.plugin-config-input');
    inputs.forEach(input => {
        const pluginId = input.dataset.plugin;
        const field = input.dataset.field;
        const value = input.value.trim();
        if (!state.pluginConfigs[pluginId]) state.pluginConfigs[pluginId] = {};
        state.pluginConfigs[pluginId][field] = value;
    });
}

const parseWizardFieldValue = (field, raw) => {
    const trimmed = typeof raw === 'string' ? raw.trim() : raw;
    if (field?.type === 'number') {
        const num = Number(trimmed);
        if (Number.isFinite(num)) return num;
        return null;
    }
    if (field?.type === 'boolean') {
        if (typeof trimmed === 'boolean') return trimmed;
        if (typeof trimmed !== 'string') return null;
        const lowered = trimmed.toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(lowered)) return true;
        if (['false', '0', 'no', 'off'].includes(lowered)) return false;
        return null;
    }
    if (field?.type === 'list') {
        if (typeof trimmed !== 'string') return null;
        const items = trimmed
            .split(/[,\\n]/)
            .map(item => item.trim())
            .filter(Boolean);
        if (items.length === 0) return null;
        return items;
    }
    return raw;
};

const setByPath = (obj, path, value) => {
    const parts = String(path || '').split('.').filter(Boolean);
    if (parts.length === 0) return;
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key] || typeof current[key] !== 'object') current[key] = {};
        current = current[key];
    }
    current[parts[parts.length - 1]] = value;
};

/**
 * Initialize wizard state from existing storage (if any).
 * Helps synchronize Wizard with Settings (ARCH-003).
 */
export async function initializeWizardState() {
    try {
        const s = await window.dram.storage.getAll();
        const getVal = (key) => {
            return key.split('.').reduce((obj, k) => (obj && obj[k] !== 'undefined') ? obj[k] : undefined, s);
        };

        const existingModel = getVal('settings.model');
        if (existingModel) wizardState.model = existingModel;

        const existingWorkspace = getVal('settings.workspacePath');
        if (existingWorkspace) {
            wizardState.workspacePath = existingWorkspace;
        }
        // Note: We don't set a default workspace here - let the user choose during setup
        // The default will be suggested in the input placeholder

        // Try to find an API key for the selected model
        const provider = getProviderFromModel(wizardState.model);
        let key = '';
        if (provider === 'anthropic') key = getVal('settings.apiKeyAnthropic');
        else if (provider === 'openai') key = getVal('settings.apiKeyOpenAI');
        else if (provider === 'google') key = getVal('settings.apiKeyGoogle');
        else if (provider === 'groq') key = getVal('settings.apiKeyGroq');

        if (key) wizardState.apiKey = key;

        // Plugins might be in a different spot (config file vs storage)
        // But for now, sync what we can from secure storage

        console.log('Wizard: Initialized state from storage', redactObject(wizardState));
    } catch (err) {
        console.warn('Wizard: Failed to initialize state from storage', err);
    }
}

// --- COMPLETION LOGIC ---

/**
 * Finalize the core setup of the wizard.
 * Persists settings, generates tokens, and launches the engine.
 * @param {Object} wizardState 
 */
export async function finishWizardCore(wizardState) {
    wizardState.apiKey = normalizeSecretInput(wizardState.apiKey);
    wizardState.fallbacks = (wizardState.fallbacks || []).map((fallback) => ({
        ...fallback,
        apiKey: normalizeSecretInput(fallback.apiKey)
    }));

    const saveKey = async (model, key) => {
        const normalizedKey = normalizeSecretInput(key);
        if (!normalizedKey) return;
        const provider = getProviderFromModel(model); // Use internal helper
        console.log('Wizard Finish: Saving key for provider', provider);
        // Ensure accurate mapping to settings.js storage keys
        if (provider === 'anthropic') await window.dram.storage.set('settings.apiKeyAnthropic', normalizedKey);
        else if (provider === 'openai') await window.dram.storage.set('settings.apiKeyOpenAI', normalizedKey);
        else if (provider === 'google') await window.dram.storage.set('settings.apiKeyGoogle', normalizedKey);
        else if (provider === 'groq') await window.dram.storage.set('settings.apiKeyGroq', normalizedKey);
        else return;
        // Force immediate sync to config as well
        await window.dram.gateway.patchConfig({
            env: { vars: { [provider.toUpperCase() + '_API_KEY']: normalizedKey } }
        });
    };

    // 1. Save Basic Settings
    await window.dram.storage.set('settings.model', wizardState.model);
    await saveKey(wizardState.model, wizardState.apiKey);

    if (wizardState.fallbacks.length > 0) {
        await window.dram.storage.set('settings.fallbackChain', wizardState.fallbacks.map(fb => fb.model));
        for (const fb of wizardState.fallbacks) { await saveKey(fb.model, fb.apiKey); }
    }

    // 1.5 Initialize Workspace (Create dir and default files if missing)
    // If no workspace set, use default Documents/DRAM
    if (!wizardState.workspacePath) {
        try {
            const docs = await window.dram.app.getPath('documents');
            wizardState.workspacePath = window.dram.path.join(docs, 'DRAM');
        } catch (pErr) {
            console.error('Wizard: Could not get documents path', pErr);
        }
    }

    if (wizardState.workspacePath) {
        try {
            console.log('Wizard Finish: Initializing workspace at', wizardState.workspacePath);
            await window.dram.fs.initWorkspace(wizardState.workspacePath);
        } catch (err) {
            console.error('Wizard Finish: Failed to initialize workspace', err);
        }
    }

    await window.dram.storage.set('settings.workspacePath', wizardState.workspacePath);

    // 2. Reuse existing gateway token when available to avoid auth/device mismatches.
    const generateSecureToken = () => {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    };

    let secureGatewayToken = wizardState.gatewayToken;
    if (!secureGatewayToken) {
        secureGatewayToken = await window.dram.gateway.getToken().catch(() => null);
    }
    if (!secureGatewayToken) {
        secureGatewayToken = await window.dram.storage.get('gateway.token').catch(() => null);
    }
    if (!secureGatewayToken) {
        secureGatewayToken = generateSecureToken();
    }

    // Keep renderer-side connection settings in sync.
    await window.dram.storage.set('gateway.url', 'ws://127.0.0.1:18789');
    await window.dram.storage.set('gateway.token', secureGatewayToken);
    await window.dram.storage.set('gateway.password', secureGatewayToken);

    // 3. Write Initial DRAM Config with model and fallbacks
    const vars = {};
    const setVar = (m, k) => {
        const normalizedKey = normalizeSecretInput(k);
        if (!normalizedKey) return;
        const p = getProviderFromModel(m);
        if (p === 'anthropic') vars['ANTHROPIC_API_KEY'] = normalizedKey;
        if (p === 'openai') vars['OPENAI_API_KEY'] = normalizedKey;
        if (p === 'google') vars['GOOGLE_API_KEY'] = normalizedKey;
        if (p === 'groq') vars['GROQ_API_KEY'] = normalizedKey;
    };
    setVar(wizardState.model, wizardState.apiKey);
    wizardState.fallbacks.forEach(fb => setVar(fb.model, fb.apiKey));

    // Build model configuration with fallbacks
    const modelConfig = {
        primary: wizardState.model,
        fallbacks: wizardState.fallbacks.map(fb => fb.model).filter(m => m && m !== 'none')
    };

    const dramConfig = {
        env: { vars },
        agents: {
            defaults: {
                workspace: wizardState.workspacePath,
                model: modelConfig
            }
        },
        // Token ownership lives in engine config bootstrap to avoid churn during wizard.
    };

    // Save token to wizard state for display in next step
    wizardState.gatewayToken = secureGatewayToken;

    await window.dram.gateway.writeConfig(dramConfig);

    // 4. Update Global State - CRITICAL: Sync fallbackChain for rate panel & settings
    state.models.primary = { id: wizardState.model, name: wizardState.model, limit: 100, active: true, cooldown: 0 };

    // Update fallback chain in state so rate limit panel shows them
    const fallbackModels = wizardState.fallbacks.map(fb => fb.model).filter(m => m && m !== 'none');
    state.fallbackChain = fallbackModels;

    // Set the legacy fallback model for compatibility
    if (fallbackModels.length > 0) {
        state.models.fallback = {
            id: fallbackModels[0],
            name: fallbackModels[0],
            limit: 100,
            active: false,
            cooldown: 0
        };
    } else {
        state.models.fallback = { id: 'none', name: 'None', limit: 100, active: false, cooldown: 0 };
    }

    updateModelStats();

    // 5. Trigger Launch (non-blocking)
    updateConnectionUI('launching');

    // Launch gateway with timeout - don't block if it takes too long
    const launchPromise = window.dram.gateway.launchGateway();
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 5000));

    const launchResult = await Promise.race([launchPromise, timeoutPromise]);

    // Handle both boolean and object response formats
    const success = typeof launchResult === 'boolean' ? launchResult :
        launchResult?.timeout ? true : // Timeout is ?, we'll try to connect later
            launchResult?.success || launchResult?.partial;

    if (success) {
        state.gatewayRunning = true;
        updateConnectionUI('connecting');
        // Try to connect in background
        setTimeout(() => {
            connect().catch(err => console.log('Wizard: Background connect attempt failed:', err.message));
        }, 1000);
    }
    return success;
}

/**
 * Finalize plugin and skill integrations.
 * Updates configuration and persists the 'onboarding complete' flag.
 * @param {Object} wizardState 
 * @param {HTMLElement} wizardContainer 
 */
export async function finishWizardIntegrations(wizardState, wizardContainer) {
    const pluginEntries = {};
    wizardState.plugins.forEach(p => {
        pluginEntries[p] = { enabled: true };
    });

    const skillEntries = {};
    if (wizardState.skills) {
        Object.entries(wizardState.skills).forEach(([id, enabled]) => {
            skillEntries[id] = { enabled };
        });
    }

    // Update config with plugins and skills
    try {
        const configPatch = {
            plugins: { entries: pluginEntries },
            skills: { entries: skillEntries }
        };

        // Apply plugin setup fields collected during the wizard
        const pluginConfigs = wizardState.pluginConfigs || {};
        for (const [pluginId, values] of Object.entries(pluginConfigs)) {
            const req = PLUGIN_SETUP_REQUIREMENTS[pluginId];
            if (!req || !values) continue;

            if (req.type === 'token' && req.configPath) {
                const token = values.token?.trim?.() || '';
                if (token) {
                    setByPath(configPatch, req.configPath, token);
                    await window.dram.storage.set(req.configPath, token);
                    await window.dram.storage.set(`plugins.configured.${pluginId}`, true);
                }
            }

            if (req.type === 'multi' && Array.isArray(req.fields)) {
                for (const field of req.fields) {
                    const val = values[field.key];
                    if (!val) continue;
                    const parsed = parseWizardFieldValue(field, val);
                    if (parsed === null) continue;
                    const configPath = field.configPath || `channels.${pluginId}.${field.key}`;
                    setByPath(configPatch, configPath, parsed);
                    await window.dram.storage.set(configPath, parsed);
                }
                await window.dram.storage.set(`plugins.configured.${pluginId}`, true);
            }

            if (req.type === 'file' && req.configPath) {
                const fileJson = values.__fileJson;
                if (fileJson) {
                    setByPath(configPatch, req.configPath, fileJson);
                    await window.dram.storage.set(req.configPath, JSON.stringify(fileJson));
                    await window.dram.storage.set(`plugins.configured.${pluginId}`, true);
                }
                if (Array.isArray(req.fields)) {
                    for (const field of req.fields) {
                        const val = values[field.key];
                        if (!val) continue;
                        const parsed = parseWizardFieldValue(field, val);
                        if (parsed === null) continue;
                        const configPath = field.configPath || `channels.${pluginId}.${field.key}`;
                        setByPath(configPatch, configPath, parsed);
                        await window.dram.storage.set(configPath, parsed);
                    }
                }
            }
        }

        await window.dram.gateway.patchConfig(configPatch);
    } catch (e) {
        console.error('Failed to update plugins/skills in config:', e);
    }

    await window.dram.storage.set('dram.onboardingComplete', true);
    if (wizardContainer) {
        wizardContainer.classList.add('hidden');
        wizardContainer.style.display = 'none';
        wizardContainer.style.pointerEvents = 'none';
        wizardContainer.innerHTML = '';
    }

    // Hide loading screen if still visible (setup complete)
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen && !loadingScreen.classList.contains('fade-out')) {
        loadingScreen.classList.add('fade-out');
        const app = document.getElementById('app');
        if (app) {
            app.classList.remove('app-hidden');
            app.classList.add('app-visible');
        }
    }
    const app = document.getElementById('app');
    if (app) {
        app.classList.remove('app-hidden');
        app.classList.add('app-visible');
    }

    // Sync fallback chain to engine config (ensures settings page reads correct data)
    try {
        const fallbacks = state.fallbackChain || [];
        if (fallbacks.length > 0) {
            await window.dram.gateway.saveFallbackChain(fallbacks);
            console.log('Wizard: Synced fallback chain to engine:', fallbacks);
        }
    } catch (err) {
        console.error('Wizard: Failed to sync fallback chain:', err);
    }

    // Reload user settings so settings page reflects wizard changes
    try {
        await loadUserSettings();
        // The instruction provided a line for ui-loader.js here, which is not this file.
        // Assuming the intent was to add a redactObject usage if applicable to wizard.js logs.
        // Since no specific wizard.js log was indicated for this spot, I'll keep the existing log.
        console.log('Wizard: Reloaded user settings');
    } catch (err) {
        console.error('Wizard: Failed to reload settings:', err);
    }

    // Final handoff: config patch can restart gateway; aggressively re-establish bridge.
    try {
        state.gatewayRunning = true;
        updateConnectionUI('connecting');
        for (let attempt = 0; attempt < 10; attempt++) {
            if (state.connected) break;
            if (state.connecting) {
                // Guard against stale "connecting" latch with no status callback.
                state.connecting = false;
            }
            connect().catch(() => { });
            await new Promise(resolve => setTimeout(resolve, attempt < 3 ? 800 : 1500));
        }
    } catch (err) {
        console.error('Wizard: Reconnect after finalize failed:', err);
    }
}

/**
 * Convenience wrapper for full finish flow if needed manually.
 * @param {Object} wizardState 
 * @param {HTMLElement} wizardContainer 
 */
export async function finishWizard(wizardState, wizardContainer) {
    await finishWizardIntegrations(wizardState, wizardContainer);
}
