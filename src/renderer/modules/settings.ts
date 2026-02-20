/**
 * DRAM Settings & Memory Management
 */
import { elements } from './elements.js';
import { state } from './state.js';
import { renderModelOptions, renderLocalModelOptions } from '../components/settings/utils.js';
import { refreshMainDisplay } from './rate-limits.js';


// Re-export memory functions for backward compatibility
export {
    loadMemoryFiles,
    loadAsset,
    saveCurrentAsset,
    reloadMemoryFiles
} from './settings-memory.js';

/**
 * Load user settings into UI elements
 */
export async function loadUserSettings() {
    try {
        const s = (await window.dram.storage.getAll()) as Record<string, any>;
        const advancedMode = s?.settings?.advancedMode || false;
        updateAdvancedModeUI(advancedMode);
        const appInfo = await window.dram.app.getInfo();
        const isEncrypted = await window.dram.storage.isEncrypted();

        // Helper to get nested value from storage
        const getSetting = (key: string): any => {
            // First try direct key lookup (flat storage like 'settings.ttsProvider')
            if (s[key] !== undefined) {
                return s[key];
            }
            // Fall back to nested traversal (object structure like settings: { ttsProvider })
            const parts = key.split('.');
            let current = s;
            for (const part of parts) {
                if (current === undefined || current === null) return undefined;
                current = current[part];
            }
            return current;
        };

        if (elements.settingWorkspacePath) elements.settingWorkspacePath.value = getSetting('settings.workspacePath') || '';
        if (elements.settingSessionKey) elements.settingSessionKey.value = getSetting('settings.sessionKey') || 'main';

        if (elements.settingModel) {
            elements.settingModel.value = getSetting('settings.model') || 'claude-3-7-sonnet-latest';
            if (elements.currentModel) {
                elements.currentModel.textContent = elements.settingModel.options[elements.settingModel.selectedIndex]?.text || elements.settingModel.value;
            }
        }
        if (elements.settingTemp) {
            const tempVal = getSetting('settings.temperature') || 0.7;
            elements.settingTemp.value = tempVal;
            const display = document.getElementById('setting-temp-value');
            if (display) display.textContent = tempVal;
        }
        if (elements.settingThink) {
            const thinkingLevel = normalizeThinkingLevel(getSetting('settings.thinkLevel'));
            elements.settingThink.value = thinkingLevel;
            await window.dram.storage.set('settings.thinkLevel', thinkingLevel);
        }

        // Sync API Keys via new helper
        syncSecureKeyUI('setting-key-anthropic', getSetting('settings.apiKeyAnthropic'));
        syncSecureKeyUI('setting-key-openai', getSetting('settings.apiKeyOpenAI'));
        syncSecureKeyUI('setting-key-google', getSetting('settings.apiKeyGoogle'));
        syncSecureKeyUI('setting-key-groq', getSetting('settings.apiKeyGroq'));
        syncSecureKeyUI('setting-key-elevenlabs', getSetting('settings.apiKeyElevenLabs'));
        syncSecureKeyUI('setting-key-brave', getSetting('settings.apiKeyBrave'));
        syncSecureKeyUI('setting-key-perplexity', getSetting('settings.apiKeyPerplexity'));
        syncSecureKeyUI('setting-key-ollama', getSetting('settings.apiKeyOllama'));

        if (elements.settingOllamaHost) elements.settingOllamaHost.value = getSetting('settings.ollamaHost') || 'http://localhost:11434';
        const internetAccessSelect = document.getElementById('setting-internet-access-mode') as HTMLSelectElement | null;
        if (internetAccessSelect) {
            const desiredMode = resolveInternetAccessMode(
                getSetting('settings.internetAccessMode'),
                Boolean(getSetting('settings.primaryModeLocal')),
                getSetting('settings.webTools')
            );
            internetAccessSelect.value = desiredMode;
        }

        if (elements.settingWebTools) elements.settingWebTools.checked = getSetting('settings.webTools') || false;
        if (elements.settingWebHeadless) elements.settingWebHeadless.checked = getSetting('settings.webHeadless') !== false;

        const connection = await window.dram.gateway.getConnection();
        if (elements.settingGatewayUrl) elements.settingGatewayUrl.value = connection.url || 'ws://127.0.0.1:18789';
        syncSecureKeyUI('setting-gateway-token-dash', connection.token);
        if (elements.settingAutoConnect) elements.settingAutoConnect.checked = getSetting('settings.autoConnect') !== false;
        if (elements.settingDaemonActive) elements.settingDaemonActive.checked = getSetting('settings.daemonActive') || false;

        if (elements.settingTray) elements.settingTray.checked = getSetting('settings.minimizeToTray') || false;
        if (elements.settingAdvancedMode) elements.settingAdvancedMode.checked = getSetting('settings.advancedMode') || false;
        if (elements.settingHaptics) elements.settingHaptics.checked = getSetting('settings.haptics') || false;
        if (elements.settingDmPolicy) elements.settingDmPolicy.value = getSetting('settings.dmPolicy') || 'open';
        const settingWebSearchProvider = document.getElementById('setting-web-search-provider') as HTMLSelectElement | null;
        if (settingWebSearchProvider) settingWebSearchProvider.value = getSetting('settings.webSearchProvider') || 'brave';
        const settingWhatsappOutboundEnabled = document.getElementById('setting-whatsapp-outbound-enabled') as HTMLInputElement | null;
        if (settingWhatsappOutboundEnabled) settingWhatsappOutboundEnabled.checked = getSetting('settings.whatsappOutboundEnabled') === true;
        const settingDeviceAccessPolicy = document.getElementById('setting-device-access-policy') as HTMLSelectElement | null;
        if (settingDeviceAccessPolicy) settingDeviceAccessPolicy.value = getSetting('settings.deviceAccessPolicy') || 'manual';

        if (elements.encryptionStatus) {
            elements.encryptionStatus.textContent = isEncrypted ? 'SECURE: OS Keychain Active' : 'STANDARD: Session Storage';
            elements.encryptionStatus.style.color = isEncrypted ? 'var(--accent)' : 'var(--text-tertiary)';
        }

        if (elements.appVersion) {
            elements.appVersion.textContent = `DRAM // VERSION v${appInfo.version}`;
        }

        // Load fallback chain from engine config
        await loadFallbackChainIntoUI();

        const { updateThinkingPreview } = await import('../components/settings/tabs/model.js');
        updateThinkingPreview(state.currentActiveModelId);
    } catch (err) {
        console.error('Failed to load user settings:', err);
    }
}

/**
 * Load fallback chain into the Settings Page UI
 */
export async function loadFallbacksIntoUI() {
    await loadFallbackChainIntoUI();
}

const LOCAL_MODEL_PREFIXES = ['ollama/', 'local/', 'lmstudio/', 'llamacpp/', 'vllm/'];
const INTERNET_ACCESS_MODES = new Set(['open', 'limited', 'offline']);

function normalizeThinkingLevel(rawValue: unknown) {
    const value = String(rawValue || '').trim().toLowerCase();
    if (value === 'low' || value === '1' || value === 'off' || value === 'minimal' || value === 'none') return 'low';
    if (value === 'high' || value === '3' || value === 'deep' || value === 'xhigh') return 'high';
    return 'medium';
}

function isLocalModelId(rawId: string) {
    const id = String(rawId || '').trim().toLowerCase();
    if (!id) return false;
    return LOCAL_MODEL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function resolveInternetAccessMode(rawMode: string, primaryModeLocal: boolean, webToolsSetting: unknown) {
    const normalized = String(rawMode || '').trim().toLowerCase();
    if (INTERNET_ACCESS_MODES.has(normalized)) return normalized;
    if (primaryModeLocal) return 'offline';
    if (typeof webToolsSetting === 'boolean') return webToolsSetting ? 'open' : 'limited';
    return 'open';
}

function resolveSelectValue(selectEl: HTMLSelectElement, desiredValue: string) {
    const desired = String(desiredValue || '').trim();
    if (!desired) return '';

    selectEl.value = desired;
    if (selectEl.value === desired) return desired;

    const desiredLower = desired.toLowerCase();
    const match = Array.from(selectEl.options).find((option) => {
        const value = String(option.value || '').trim();
        if (!value) return false;
        const lower = value.toLowerCase();
        return lower === desiredLower
            || lower.endsWith(`/${desiredLower}`)
            || desiredLower.endsWith(`/${lower}`);
    });
    return match?.value || '';
}

/**
 * Internal function to load and render fallback chain
 */
async function loadFallbackChainIntoUI() {
    const fallbackList = document.getElementById('fallback-list');
    if (!fallbackList) return;

    try {
        const engineResult = await window.dram.gateway.getFallbackChain();
        const engineFallbacks = engineResult.success ? engineResult.fallbacks : [];
        const localFallbacks = await window.dram.storage.get('settings.fallbackChain') || [];
        const fallbackChain = engineFallbacks.length > 0 ? engineFallbacks : localFallbacks;

        const { updateFallbackStatus, addFallbackRow } = await import('../components/settings/tabs/fallbacks.js');

        const primaryModel = document.getElementById('setting-model')?.value || 'primary';
        updateFallbackStatus(primaryModel, fallbackChain.length);

        if (fallbackChain.length === 0) {
            // Keep empty state handled by default render
            return;
        }

        fallbackList.innerHTML = '';
        fallbackChain.forEach((modelId, index) => {
            addFallbackRow(modelId, index);
        });
    } catch (err) {
        console.error('Failed to load fallbacks:', err);
    }
}

/**
 * Refresh model lists in Settings UI (model selector + fallbacks).
 */
export async function refreshModelsUI({ force = false, savedModel }: { force?: boolean; savedModel?: string } = {}) {
    try {
        if (!window.dram?.util?.getModels) return null;
        const upstream = await window.dram.util.getModels({ force });
        const models = Array.isArray(upstream) ? [...upstream] : [];
        if (models.length === 0) return null;

        const modelOptionsHtml = renderModelOptions(models);
        const localOptionsHtml = renderLocalModelOptions(models);
        const settingModel = document.getElementById('setting-model');
        const settingModelLocal = document.getElementById('setting-model-local');

        if (settingModel) {
            const currentValue = settingModel.value;
            let desired = savedModel || currentValue;
            if (!desired && window.dram?.storage?.get) {
                desired = await window.dram.storage.get('settings.model');
            }

            settingModel.innerHTML = modelOptionsHtml;
            const resolved = resolveSelectValue(settingModel as HTMLSelectElement, desired as string);
            if (resolved) {
                settingModel.value = resolved;
            } else if (settingModel.options.length > 0) {
                settingModel.value = settingModel.options[0].value;
            }

            if (elements.currentModel && !document.getElementById('setting-primary-mode-local')?.checked) {
                const label = settingModel.options[settingModel.selectedIndex]?.text || settingModel.value;
                elements.currentModel.textContent = label;
            }
        }

        if (settingModelLocal) {
            const currentLocal = settingModelLocal.value;
            let desiredLocal = currentLocal;
            if (!desiredLocal && window.dram?.storage?.get) {
                desiredLocal = await window.dram.storage.get('settings.modelLocal');
            }

            settingModelLocal.innerHTML = localOptionsHtml;
            const resolvedLocal = resolveSelectValue(settingModelLocal as HTMLSelectElement, desiredLocal as string);
            if (resolvedLocal) {
                settingModelLocal.value = resolvedLocal;
            } else {
                let firstLocalValue = '';
                for (let idx = 0; idx < settingModelLocal.options.length; idx++) {
                    const option = settingModelLocal.options[idx];
                    if (option && isLocalModelId(option.value)) {
                        firstLocalValue = option.value;
                        break;
                    }
                }
                if (firstLocalValue) {
                    settingModelLocal.value = firstLocalValue;
                }
            }

            if (elements.currentModel && document.getElementById('setting-primary-mode-local')?.checked) {
                const label = settingModelLocal.options[settingModelLocal.selectedIndex]?.text || settingModelLocal.value;
                elements.currentModel.textContent = label;
            }
        }

        const fallbackSelect = document.getElementById('fallback-model-select');
        if (fallbackSelect) {
            const selected = fallbackSelect.value;
            fallbackSelect.innerHTML = `<option value="">Select a model...</option>${modelOptionsHtml}`;
            if (selected) {
                const resolved = resolveSelectValue(fallbackSelect as HTMLSelectElement, selected);
                if (resolved) fallbackSelect.value = resolved;
            }
        }

        return models;
    } catch (err) {
        console.error('Failed to refresh models UI:', err);
        return null;
    }
}

/**
 * Sync ALL settings page UI elements with stored values
 */
export async function syncSettingsPageUI() {
    try {
        const s = (await window.dram.storage.getAll()) as Record<string, any>;
        const connection = await window.dram.gateway.getConnection();

        const getSetting = (key: string): any => {
            // First try direct key lookup (legacy flat keys)
            if (s[key] !== undefined) {
                return s[key];
            }
            const parts = key.split('.');
            let current = s;
            for (const part of parts) {
                if (current === undefined || current === null) return undefined;
                current = current[part];
            }
            return current;
        };

        // Model Intelligence Tab
        const settingModel = document.getElementById('setting-model');
        const savedPrimaryModeLocal = getSetting('settings.primaryModeLocal') || false;
        if (settingModel) {
            await refreshModelsUI({ force: true, savedModel: getSetting('settings.model') });
        }

        if (settingModel) {
            const savedModel = getSetting('settings.model') || 'anthropic/claude-3-7-sonnet-latest';
            settingModel.value = savedModel;

            // Fallback: If the exact value isn't found (e.g. legacy no-prefix value), 
            // search for an option that ends with the saved value.
            if (settingModel.value !== savedModel && settingModel.options.length > 0) {
                for (let i = 0; i < settingModel.options.length; i++) {
                    const opt = settingModel.options[i];
                    if (opt.value === savedModel || opt.value.endsWith('/' + savedModel)) {
                        settingModel.value = opt.value;
                        break;
                    }
                }
            }

            // Still nothing? Pick the first one
            if (settingModel.value !== savedModel && settingModel.options.length > 0 && !settingModel.value) {
                settingModel.value = settingModel.options[0].value;
            }

            // Sync to renderer state
            const selectedOption = settingModel.options[settingModel.selectedIndex];
            if (selectedOption && !savedPrimaryModeLocal) {
                state.models.primary.id = selectedOption.value;
                state.models.primary.name = selectedOption.text;
                state.currentActiveModelId = selectedOption.value;
                state.model = selectedOption.value;
                if (elements.currentModel) elements.currentModel.textContent = selectedOption.text;
            }
        }

        const settingTemp = document.getElementById('setting-temp');
        if (settingTemp) {
            const val = getSetting('settings.temperature') || 0.7;
            settingTemp.value = val;
            const display = document.getElementById('setting-temp-value');
            if (display) display.textContent = val;
        }
        const settingThink = elements.settingThink || document.getElementById('chat-thinking-select') || document.getElementById('setting-think');
        if (settingThink) {
            const thinkingLevel = normalizeThinkingLevel(getSetting('settings.thinkLevel'));
            settingThink.value = thinkingLevel;
            await window.dram.storage.set('settings.thinkLevel', thinkingLevel);
        }

        // Primary Mode & Sections
        const primaryModeLocal = document.getElementById('setting-primary-mode-local');
        const settingModelLocal = document.getElementById('setting-model-local');
        if (primaryModeLocal) primaryModeLocal.checked = getSetting('settings.primaryModeLocal') || false;
        if (settingModelLocal) settingModelLocal.value = getSetting('settings.modelLocal') || '';

        const { updatePrimaryModeUI } = await import('../components/settings/tabs/model.js');
        updatePrimaryModeUI();

        const cloudSelect = document.getElementById('setting-model');
        const localSelect = document.getElementById('setting-model-local');
        const activeSelect = primaryModeLocal?.checked ? localSelect : cloudSelect;
        if (activeSelect && activeSelect.options[activeSelect.selectedIndex]) {
            const activeModelId = activeSelect.value;
            if (activeModelId) {
                const activeModelName = activeSelect.options[activeSelect.selectedIndex].text || activeModelId;
                state.models.primary.id = activeModelId;
                state.models.primary.name = activeModelName;
                state.currentActiveModelId = activeModelId;
                state.model = activeModelId;
                if (elements.currentModel) elements.currentModel.textContent = activeModelName;
                refreshMainDisplay();
            }
        }

        // Workspace Tab
        const settingWorkspacePath = document.getElementById('setting-workspace-path');
        const settingSessionKey = document.getElementById('setting-session-key');
        if (settingWorkspacePath) settingWorkspacePath.value = getSetting('settings.workspacePath') || '';
        if (settingSessionKey) settingSessionKey.value = getSetting('settings.sessionKey') || 'main';

        // Gateway Tab
        const settingGatewayUrl = document.getElementById('setting-gateway-url-dash');
        const settingAutoConnect = document.getElementById('setting-autoconnect');

        if (settingGatewayUrl) settingGatewayUrl.value = connection.url || 'ws://127.0.0.1:18789';
        syncSecureKeyUI('setting-gateway-token-dash', connection.token);
        if (settingAutoConnect) settingAutoConnect.checked = getSetting('settings.autoConnect') !== false;

        // API Vault Tab
        syncSecureKeyUI('setting-key-anthropic', getSetting('settings.apiKeyAnthropic'));
        syncSecureKeyUI('setting-key-openai', getSetting('settings.apiKeyOpenAI'));
        syncSecureKeyUI('setting-key-google', getSetting('settings.apiKeyGoogle'));
        syncSecureKeyUI('setting-key-groq', getSetting('settings.apiKeyGroq'));
        syncSecureKeyUI('setting-key-elevenlabs', getSetting('settings.apiKeyElevenLabs'));
        syncSecureKeyUI('setting-key-brave', getSetting('settings.apiKeyBrave'));
        syncSecureKeyUI('setting-key-perplexity', getSetting('settings.apiKeyPerplexity'));
        syncSecureKeyUI('setting-key-ollama', getSetting('settings.apiKeyOllama'));
        const settingOllamaHost = document.getElementById('setting-ollama-host');
        if (settingOllamaHost) settingOllamaHost.value = getSetting('settings.ollamaHost') || 'http://localhost:11434';
        const settingDmPolicy = document.getElementById('setting-dm-policy') as HTMLSelectElement | null;
        if (settingDmPolicy) settingDmPolicy.value = getSetting('settings.dmPolicy') || 'open';
        const settingWebSearchProvider = document.getElementById('setting-web-search-provider') as HTMLSelectElement | null;
        if (settingWebSearchProvider) settingWebSearchProvider.value = getSetting('settings.webSearchProvider') || 'brave';
        const settingWhatsappOutboundEnabled = document.getElementById('setting-whatsapp-outbound-enabled') as HTMLInputElement | null;
        if (settingWhatsappOutboundEnabled) settingWhatsappOutboundEnabled.checked = getSetting('settings.whatsappOutboundEnabled') === true;
        const settingDeviceAccessPolicy = document.getElementById('setting-device-access-policy') as HTMLSelectElement | null;
        if (settingDeviceAccessPolicy) settingDeviceAccessPolicy.value = getSetting('settings.deviceAccessPolicy') || 'manual';
        const internetAccessSelect = document.getElementById('setting-internet-access-mode') as HTMLSelectElement | null;
        if (internetAccessSelect) {
            internetAccessSelect.value = resolveInternetAccessMode(
                getSetting('settings.internetAccessMode'),
                Boolean(getSetting('settings.primaryModeLocal')),
                getSetting('settings.webTools')
            );
        }

        // Voice & Audio Tab
        const sttProvider = document.getElementById('setting-stt-provider');
        const sttModel = document.getElementById('setting-stt-model');
        const sttLocalModel = document.getElementById('setting-stt-local-model');
        const ttsProvider = document.getElementById('setting-tts-provider');
        const ttsVoiceEdge = document.getElementById('setting-tts-voice-edge');
        const ttsVoiceElevenlabs = document.getElementById('setting-tts-voice-elevenlabs');
        const ttsVoiceOpenAI = document.getElementById('setting-tts-voice-openai');
        const ttsEnabled = document.getElementById('setting-tts-enabled');

        const savedSttProvider = getSetting('settings.sttProvider') || 'local';
        const savedTtsProvider = getSetting('settings.ttsProvider') || 'edge';

        if (sttProvider) sttProvider.value = savedSttProvider;
        if (sttModel) sttModel.value = getSetting('settings.sttModel') || 'whisper-large-v3';
        if (sttLocalModel) sttLocalModel.value = getSetting('settings.sttLocalModel') || 'base';
        if (ttsProvider) ttsProvider.value = savedTtsProvider;
        if (ttsVoiceEdge) ttsVoiceEdge.value = getSetting('settings.ttsVoiceEdge') || 'en-US-AriaNeural';
        if (ttsVoiceElevenlabs) ttsVoiceElevenlabs.value = getSetting('settings.ttsVoiceElevenlabs') || '21m00Tcm4TlvDq8ikWAM';
        if (ttsVoiceOpenAI) ttsVoiceOpenAI.value = getSetting('settings.ttsVoiceOpenAI') || 'nova';
        if (ttsEnabled) ttsEnabled.checked = getSetting('settings.ttsEnabled') !== false;

        // Load custom ElevenLabs voice ID if set
        const ttsVoiceElevenlabsCustom = document.getElementById('setting-tts-voice-elevenlabs-custom');
        if (ttsVoiceElevenlabsCustom) {
            ttsVoiceElevenlabsCustom.value = getSetting('settings.ttsVoiceElevenlabsCustom') || '';
        }

        // Update voice UI visibility based on loaded providers
        const { updateVoiceProviderUI, updateElevenLabsCustomVoiceVisibility } = await import('../components/settings/tabs/voice.js');
        updateVoiceProviderUI();
        updateElevenLabsCustomVoiceVisibility();

        // Update thinking preview
        const { updateThinkingPreview } = await import('../components/settings/tabs/model.js');
        updateThinkingPreview(state.currentActiveModelId);

        // Interface Tab
        const settingTrayDash = document.getElementById('setting-tray');
        const settingAdvancedDash = document.getElementById('setting-advanced-mode');
        if (settingTrayDash) settingTrayDash.checked = getSetting('settings.minimizeToTray') || false;
        if (settingAdvancedDash) {
            const advanced = getSetting('settings.advancedMode') || false;
            settingAdvancedDash.checked = advanced;
            updateAdvancedModeUI(advanced);
        }

        // Load fallbacks
        await loadFallbackChainIntoUI();

        // Load skills
        const skillsMount = document.getElementById('skills-content-mount');
        if (skillsMount) {
            try {
                const skills = await window.dram.util.getSkills();
                const { updateSkillsList } = await import('../components/settings/tabs/skills.js');
                updateSkillsList(skills);
            } catch (err) {
                console.error('Failed to load skills:', err);
            }
        }

        // Load plugins
        const pluginRegistry = document.getElementById('plugin-registry') || document.getElementById('plugin-empty');
        if (pluginRegistry) {
            try {
                const plugins = await window.dram.util.getPlugins();
                if (plugins && plugins.length > 0) {
                    const { updatePluginsList } = await import('../components/settings/tabs/plugins.js');
                    updatePluginsList(plugins);
                }
            } catch (err) {
                console.error('Failed to load plugins:', err);
            }
        }
    } catch (err) {
        console.error('Failed to sync settings:', err);
    }
}

/**
 * Load saved connection settings
 */
export async function loadSavedConnection() {
    try {
        const connection = await window.dram.gateway.getConnection();
        if (connection.url && elements.gatewayUrl) elements.gatewayUrl.value = connection.url;
        if (connection.token && elements.gatewayToken) elements.gatewayToken.value = connection.token;

        if (elements.settingGatewayUrl) elements.settingGatewayUrl.value = connection.url || 'ws://127.0.0.1:18789';
        syncSecureKeyUI('setting-gateway-token-dash', connection.token);
    } catch (err) {
        console.error('Failed to load saved connection:', err);
    }
}
/**
 * Update the UI based on Advanced Mode setting
 */
export function updateAdvancedModeUI(enabled) {
    const settingsRoot = document.querySelector('.settings-shell');
    if (settingsRoot) {
        if (enabled) {
            settingsRoot.classList.remove('advanced-mode-disabled');
        } else {
            settingsRoot.classList.add('advanced-mode-disabled');

            // If active tab is advanced-only, switch to Workspace
            const activeTab = settingsRoot.querySelector('.dashboard-nav-item.active');
            if (activeTab && activeTab.classList.contains('advanced-only')) {
                const workspaceTab = settingsRoot.querySelector('.dashboard-nav-item[data-tab="tab-workspace"]');
                if (workspaceTab) workspaceTab.click();
            }
        }
    }
}
/**
 * Sync logic for renderSecureKey components
 */
export function syncSecureKeyUI(id, value) {
    const input = document.getElementById(id);
    if (!input) return;

    const container = input.closest('.key-field-container');
    if (!container) return;

    const dots = container.querySelector('.key-status-dots');
    const editBtn = container.querySelector('.btn-edit-key');
    const saveBtn = container.querySelector('.btn-save-key');

    if (value) {
        input.value = ''; // Don't show real value in input
        input.dataset.realValue = value;
        input.readOnly = true;
        input.classList.add('hidden');
        if (dots) dots.classList.remove('hidden');
        if (editBtn) {
            editBtn.classList.remove('hidden');
            editBtn.textContent = 'Change';
        }
        if (saveBtn) saveBtn.classList.add('hidden');
    } else {
        input.value = '';
        input.dataset.realValue = '';
        input.readOnly = false;
        input.classList.remove('hidden');
        if (dots) dots.classList.add('hidden');
        if (editBtn) editBtn.classList.add('hidden');
        if (saveBtn) saveBtn.classList.remove('hidden');
    }
}






