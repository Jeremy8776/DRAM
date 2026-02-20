/**
 * DRAM Listeners - Settings
 * Main settings module - imports specialized handlers from sub-modules
 */
import { state } from '../state.js';
import { elements } from '../elements.js';
import { loadMemoryFiles, loadFallbacksIntoUI, syncSettingsPageUI, refreshModelsUI } from '../settings.js';
import { addSystemMessage } from '../utils.js';
import { refreshMainDisplay } from '../rate-limits.js';
import { showConfirmDialog, showToast } from '../../components/dialog.js';

// Import specialized listener modules
import { setupVoiceSettingsListeners, populateAudioDevices } from './voice-settings-listeners.js';
import { setupApiKeyListeners, setupTokenRotationListener, setupGatewayUrlListener, setupClearCredsListener, setupOllamaTestListener } from './api-key-listeners.js';
import { setupSkillListeners } from './skill-listeners.js';

const normalizeHealthChecks = (health) => {
    if (!health) return [];
    if (Array.isArray(health)) return health;
    if (typeof health !== 'object') return [];

    const checks = [];
    if (health.status) {
        checks.push({
            name: 'System',
            status: health.status,
            message: health.uptime ? `Uptime ${Math.round(health.uptime)}s` : 'System status'
        });
    }

    const components = health.components || {};
    if (components.engine) {
        checks.push({
            name: 'Engine',
            status: components.engine,
            message: 'Core runtime'
        });
    }
    if (components.memory) {
        const memoryDetail = health.memory
            ? `RSS ${health.memory.rss || 'n/a'} - Heap ${health.memory.heapUsed || 'n/a'}`
            : 'Memory usage';
        checks.push({
            name: 'Memory',
            status: components.memory,
            message: memoryDetail
        });
    }

    return checks;
};

const INTERNET_ACCESS_MODES = new Set(['open', 'limited', 'offline']);
const WEB_SEARCH_PROVIDERS = new Set(['brave', 'perplexity']);
const DEVICE_ACCESS_POLICIES = new Set(['manual', 'auto-allow', 'block']);
let deviceAccessPollHandle: ReturnType<typeof setInterval> | null = null;
let enforcingDeviceAccessPolicy = false;

function showInternetAccessStatus(message: string, type = 'info') {
    const el = document.getElementById('internet-access-status');
    if (!el) return;
    el.textContent = message;
    el.className = `setting-status-indicator ${type}`;
    el.style.opacity = '1';
    setTimeout(() => {
        el.style.opacity = '0';
    }, 3500);
}

function showDmPolicyStatus(message: string, type = 'info') {
    const el = document.getElementById('dm-policy-status');
    if (!el) return;
    el.textContent = message;
    el.className = `setting-status-indicator ${type}`;
    el.style.opacity = '1';
    setTimeout(() => {
        el.style.opacity = '0';
    }, 3500);
}

function showWebSearchStatus(message: string, type = 'info') {
    const el = document.getElementById('web-search-status');
    if (!el) return;
    el.textContent = message;
    el.className = `setting-status-indicator ${type}`;
    el.style.opacity = '1';
    setTimeout(() => {
        el.style.opacity = '0';
    }, 3500);
}

function showWhatsappOutboundStatus(message: string, type = 'info') {
    const el = document.getElementById('whatsapp-outbound-status');
    if (!el) return;
    el.textContent = message;
    el.className = `setting-status-indicator ${type}`;
    el.style.opacity = '1';
    setTimeout(() => {
        el.style.opacity = '0';
    }, 3500);
}

function showDeviceAccessStatus(message: string, type = 'info') {
    const el = document.getElementById('device-access-status');
    if (!el) return;
    el.textContent = message;
    el.className = `setting-status-indicator ${type}`;
    el.style.opacity = '1';
    setTimeout(() => {
        el.style.opacity = '0';
    }, 3500);
}

function resolveInternetAccessMode(rawMode: string, primaryModeLocal: boolean, webToolsSetting: unknown) {
    const normalized = String(rawMode || '').trim().toLowerCase();
    if (INTERNET_ACCESS_MODES.has(normalized)) return normalized;
    if (primaryModeLocal) return 'offline';
    if (typeof webToolsSetting === 'boolean') return webToolsSetting ? 'open' : 'limited';
    return 'open';
}

async function applyInternetAccessMode(mode: string) {
    const normalizedMode = resolveInternetAccessMode(mode, false, true);
    await window.dram.storage.set('settings.internetAccessMode', normalizedMode);

    const primaryModeToggle = document.getElementById('setting-primary-mode-local') as HTMLInputElement | null;
    const shouldUseLocalPrimary = normalizedMode === 'offline';
    if (primaryModeToggle && primaryModeToggle.checked !== shouldUseLocalPrimary) {
        primaryModeToggle.checked = shouldUseLocalPrimary;
        primaryModeToggle.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        await window.dram.storage.set('settings.primaryModeLocal', shouldUseLocalPrimary);
    }

    const webToolsEnabled = normalizedMode === 'open';
    await window.dram.storage.set('settings.webTools', webToolsEnabled);
    if (elements.settingWebTools) elements.settingWebTools.checked = webToolsEnabled;

    if (normalizedMode === 'open') {
        showInternetAccessStatus('Internet mode: Open (cloud + web tools)', 'success');
    } else if (normalizedMode === 'limited') {
        showInternetAccessStatus('Internet mode: Limited (cloud only, web tools off)', 'info');
    } else {
        showInternetAccessStatus('Internet mode: Offline (local model routing)', 'warning');
    }
}

function normalizeDeviceAccessPolicy(rawPolicy: string) {
    const normalized = String(rawPolicy || '').trim().toLowerCase();
    return DEVICE_ACCESS_POLICIES.has(normalized) ? normalized : 'manual';
}

function isPendingDeviceStatus(rawStatus: string) {
    const status = String(rawStatus || '').trim().toLowerCase();
    return status === 'pending' || status === 'requested' || status === 'awaiting_approval';
}

async function syncDeviceAccessPolicyControl() {
    const select = document.getElementById('setting-device-access-policy') as HTMLSelectElement | null;
    if (!select) return 'manual';
    const storedPolicy = normalizeDeviceAccessPolicy(String(await window.dram.storage.get('settings.deviceAccessPolicy') || 'manual'));
    select.value = storedPolicy;
    return storedPolicy;
}

async function enforceDeviceAccessPolicy(silent = true) {
    if (enforcingDeviceAccessPolicy) return;
    enforcingDeviceAccessPolicy = true;
    try {
        const policy = normalizeDeviceAccessPolicy(String(await window.dram.storage.get('settings.deviceAccessPolicy') || 'manual'));
        if (policy === 'manual') return;

        const devices = await window.dram.util.getDevices();
        const pendingDevices = (Array.isArray(devices) ? devices : []).filter((device) => isPendingDeviceStatus(device?.status));
        if (pendingDevices.length === 0) return;

        let processedCount = 0;
        for (const device of pendingDevices) {
            const deviceId = String(device?.id || '').trim();
            if (!deviceId) continue;
            try {
                if (policy === 'auto-allow') {
                    await window.dram.util.approveDevice(deviceId);
                } else if (policy === 'block') {
                    await window.dram.util.rejectDevice(deviceId);
                }
                processedCount += 1;
            } catch (err) {
                console.warn('Device access policy action failed:', err);
            }
        }

        if (processedCount > 0) {
            if (policy === 'auto-allow') {
                showDeviceAccessStatus(`Auto-approved ${processedCount} pending device request${processedCount > 1 ? 's' : ''}.`, 'success');
            } else {
                showDeviceAccessStatus(`Blocked ${processedCount} pending device request${processedCount > 1 ? 's' : ''}.`, 'warning');
            }
            try {
                const refreshedDevices = await window.dram.util.getDevices();
                const { updateConnectionsDevicesList } = await import('../../components/settings/tabs/connections.js');
                updateConnectionsDevicesList(Array.isArray(refreshedDevices) ? refreshedDevices : []);
            } catch (refreshErr) {
                console.warn('Failed to refresh device list after policy action:', refreshErr);
            }
            if (!silent) {
                showToast({
                    message: policy === 'auto-allow'
                        ? `Approved ${processedCount} pending device request${processedCount > 1 ? 's' : ''}`
                        : `Blocked ${processedCount} pending device request${processedCount > 1 ? 's' : ''}`,
                    type: policy === 'auto-allow' ? 'success' : 'warning'
                });
            }
        }
    } catch (err) {
        console.warn('Failed to enforce device access policy:', err);
    } finally {
        enforcingDeviceAccessPolicy = false;
    }
}

function ensureDeviceAccessPolicyPolling() {
    if (deviceAccessPollHandle) return;
    deviceAccessPollHandle = setInterval(() => {
        void enforceDeviceAccessPolicy(true);
    }, 7000);
}

async function syncInternetAccessModeControl() {
    const accessModeSelect = document.getElementById('setting-internet-access-mode') as HTMLSelectElement | null;
    if (!accessModeSelect) return;

    const primaryModeLocal = Boolean((document.getElementById('setting-primary-mode-local') as HTMLInputElement | null)?.checked);
    const webToolsSetting = await window.dram.storage.get('settings.webTools');
    const storedMode = String(await window.dram.storage.get('settings.internetAccessMode') || '').trim().toLowerCase();
    const nextMode = resolveInternetAccessMode(storedMode, primaryModeLocal, webToolsSetting);
    accessModeSelect.value = nextMode;
    if (nextMode !== storedMode) {
        await window.dram.storage.set('settings.internetAccessMode', nextMode);
    }
}

function applyPrimaryModelState(modelId: string, modelName: string) {
    const id = String(modelId || '').trim();
    if (!id) return;
    const name = String(modelName || id).trim() || id;

    state.modelRoutingMode = 'auto';
    state.manualModelId = null;
    state.models.primary.id = id;
    state.models.primary.name = name;
    state.currentActiveModelId = id;
    state.model = id;
    if (elements.currentModel) elements.currentModel.textContent = name;
    refreshMainDisplay();

    void import('../model-capabilities.js').then((m) => {
        m.invalidateModelCapabilityCache?.();
        m.refreshAttachButtonCapabilityHint?.(true);
    });
}

async function syncPrimaryModelToGateway() {
    const primaryModeLocal = Boolean((document.getElementById('setting-primary-mode-local') as HTMLInputElement | null)?.checked);
    const cloudSelect = document.getElementById('setting-model') as HTMLSelectElement | null;
    const localSelect = document.getElementById('setting-model-local') as HTMLSelectElement | null;

    const cloudModelId = String(cloudSelect?.value || '').trim();
    const localModelId = String(localSelect?.value || '').trim();
    const nextPrimaryModel = primaryModeLocal ? localModelId : cloudModelId;
    if (!nextPrimaryModel) return;

    const patch: any = {
        agents: { defaults: { model: { primary: nextPrimaryModel } } }
    };
    if (primaryModeLocal) {
        // Prevent local mode from silently falling back to cloud providers.
        patch.agents.defaults.model.fallbacks = [];
    }

    try {
        await window.dram.gateway.patchConfig(patch);
        return true;
    } catch (err) {
        console.warn('Failed to sync primary model to gateway:', err);
        return false;
    }
}

export function setupSettingsListeners(on) {
    const navItems: HTMLElement[] = Array.from((elements.toolNavItems || []) as HTMLElement[]);
    if (elements.btnSettings && !navItems.includes(elements.btnSettings)) {
        navItems.push(elements.btnSettings);
    }

    const setActiveNav = (activeId) => {
        navItems.forEach(b => b.classList.remove('active'));
        const activeBtn = navItems.find(b => b.id === activeId);
        if (activeBtn) activeBtn.classList.add('active');
    };

    const hideAllViews = () => {
        if (elements.viewChatContainer) elements.viewChatContainer.classList.remove('active');
        if (elements.viewMemory) elements.viewMemory.classList.remove('active');
        if (elements.viewSettings) elements.viewSettings.classList.remove('active');
        const usageView = document.getElementById('usage-view');
        if (usageView) usageView.classList.remove('active');
    };

    navItems.forEach((btn) => {
        on(btn, 'click', async () => {
            const id = btn.id;

            setActiveNav(id);
            hideAllViews();

            if (id === 'btn-show-chat') {
                if (elements.viewChatContainer) elements.viewChatContainer.classList.add('active');
                if (elements.inputZone) elements.inputZone.classList.remove('hidden');
                if (elements.chatCanvasContainer) elements.chatCanvasContainer.classList.remove('hidden');

                import('../voice-mode.js').then(m => {
                    if (m.isVoiceActive) m.restoreVoiceMode?.();
                });
            } else if (id === 'btn-show-memory') {
                if (elements.viewMemory) elements.viewMemory.classList.add('active');
                if (elements.inputZone) elements.inputZone.classList.add('hidden');
                if (elements.chatCanvasContainer) elements.chatCanvasContainer.classList.add('hidden');

                await loadMemoryFiles();
                import('../voice-mode.js').then(m => {
                    if (m.isVoiceActive) m.minimizeVoiceMode?.();
                });
            } else if (id === 'btn-show-usage') {
                const usageView = document.getElementById('usage-view');
                if (usageView) usageView.classList.add('active');
                if (elements.inputZone) elements.inputZone.classList.add('hidden');
                if (elements.chatCanvasContainer) elements.chatCanvasContainer.classList.add('hidden');

                import('../voice-mode.js').then(m => {
                    if (m.isVoiceActive) m.minimizeVoiceMode?.();
                });
                import('../usage-data.js').then(m => m.startUsageRefresh());
            } else if (id === 'btn-show-settings') {
                if (elements.viewSettings) elements.viewSettings.classList.add('active');
                if (elements.inputZone) elements.inputZone.classList.add('hidden');
                if (elements.chatCanvasContainer) elements.chatCanvasContainer.classList.add('hidden');

                await syncSettingsPageUI();
                import('../voice-mode.js').then(m => {
                    if (m.isVoiceActive) m.minimizeVoiceMode?.();
                });
            } else if (id === 'btn-show-canvas') {
                import('../canvas.js').then(m => m.toggleCanvas());
            }
        });
    });

    on(elements.btnCloseSettings, 'click', () => {
        const chatBtn = document.getElementById('btn-show-chat');
        if (chatBtn) chatBtn.click();
    });

    elements.navItems?.forEach(item => {
        on(item, 'click', async () => {
            const tabId = item.getAttribute('data-tab');
            elements.navItems.forEach(i => i.classList.remove('active'));
            elements.tabContents.forEach(t => t.classList.add('hidden'));
            item.classList.add('active');
            const target = document.getElementById(tabId);
            if (target) target.classList.remove('hidden');
            if (elements.dashboardTitle) elements.dashboardTitle.textContent = item.textContent;

            if (tabId === 'tab-fallbacks') {
                await refreshModelsUI({ force: true });
                await loadFallbacksIntoUI();
            }

            if (tabId === 'tab-model') {
                await refreshModelsUI({ force: true });
            }

            if (tabId === 'tab-hardware' || tabId === 'tab-voice') {
                await populateAudioDevices();
            }

            if (tabId === 'tab-connections') {
                try {
                    const channels = await window.dram.util.getChannels();
                    const devices = await window.dram.util.getDevices();
                    const { updateConnectionsChannelsList, updateConnectionsDevicesList } = await import('../../components/settings/tabs/connections.js');
                    updateConnectionsChannelsList(Array.isArray(channels) ? channels : []);
                    updateConnectionsDevicesList(Array.isArray(devices) ? devices : []);
                    await syncInternetAccessModeControl();
                    const outboundEnabled = (await window.dram.storage.get('settings.whatsappOutboundEnabled')) === true;
                    if (outboundEnabled) {
                        showWhatsappOutboundStatus('WhatsApp outbound replies are enabled.', 'success');
                    } else {
                        showWhatsappOutboundStatus('WhatsApp outbound replies are blocked.', 'warning');
                    }
                    const policy = await syncDeviceAccessPolicyControl();
                    if (policy === 'manual') {
                        showDeviceAccessStatus('Device policy: Manual review', 'info');
                    } else if (policy === 'auto-allow') {
                        showDeviceAccessStatus('Device policy: Auto Allow enabled', 'success');
                    } else {
                        showDeviceAccessStatus('Device policy: Block enabled', 'warning');
                    }
                    await enforceDeviceAccessPolicy(true);
                } catch (err) {
                    console.warn('Failed to refresh connected channels/devices:', err);
                }
            }

            if (tabId === 'tab-logs') {
                const btnStartLogs = document.getElementById('btn-start-logs');
                if (btnStartLogs && !btnStartLogs.disabled) btnStartLogs.click();
            }

            // Dispatch tab change event for dynamic content loading
            document.dispatchEvent(new CustomEvent('settingsTabChanged', { detail: { tab: tabId.replace('tab-', '') } }));

            if (tabId === 'tab-memory') {
                try {
                    const status = await window.dram.util.getMemoryStatus();
                    const { updateMemoryStatus } = await import('../../components/settings/tabs/memory.js');
                    updateMemoryStatus(status || {});
                } catch (err) {
                    console.warn('Failed to refresh memory status:', err);
                }
            }

            if (tabId === 'tab-health') {
                try {
                    const health = await window.dram.util.getHealth();
                    const checks = normalizeHealthChecks(health);
                    const { renderHealthDiagnostics } = await import('../../components/settings/tabs/health.js');
                    const container = document.getElementById('health-diagnostics-container');
                    if (container) container.innerHTML = renderHealthDiagnostics(checks);
                } catch (err) {
                    console.warn('Failed to refresh health diagnostics:', err);
                }
            }
        });
    });

    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-audio-input') {
            await window.dram.storage.set('settings.audioInputDeviceId', e.target.value);
            showToast({ message: 'Input device updated', type: 'info' });
        }
    });

    on(elements.settingWorkspacePath, 'change', async (e) => {
        const nextPath = e.target.value.trim();
        await window.dram.storage.set('settings.workspacePath', nextPath);
        document.dispatchEvent(new CustomEvent('workspace:path-changed', { detail: { path: nextPath } }));
    });

    on(elements.btnBrowseWorkspace, 'click', async () => {
        const result = await window.dram.dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (!result.canceled && result.filePaths.length > 0) {
            if (elements.settingWorkspacePath) elements.settingWorkspacePath.value = result.filePaths[0];
            await window.dram.storage.set('settings.workspacePath', result.filePaths[0]);
            document.dispatchEvent(new CustomEvent('workspace:path-changed', { detail: { path: result.filePaths[0] } }));
        }
    });

    on(elements.settingSessionKey, 'change', async (e) => {
        await window.dram.storage.set('settings.sessionKey', e.target.value.trim());
    });

    // API Vault persistence
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-ollama-host') {
            const host = e.target.value.trim();
            await window.dram.storage.set('settings.ollamaHost', host);
        }
    });

    // Daemon persistence
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-daemon-active') {
            await window.dram.storage.set('settings.daemonActive', e.target.checked);
            showToast({ message: `Daemon background service: ${e.target.checked ? 'Enabled' : 'Disabled'}`, type: 'info' });
        }
    });

    // Connections: internet/device access mode
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-internet-access-mode') {
            try {
                await applyInternetAccessMode(e.target.value);
                showToast({ message: `Internet mode updated: ${e.target.options[e.target.selectedIndex]?.text || e.target.value}`, type: 'success' });
            } catch (err) {
                console.error('Failed to apply internet access mode:', err);
                showInternetAccessStatus(`Failed to apply internet mode: ${err?.message || err}`, 'error');
                showToast({ message: 'Failed to apply internet mode', type: 'error' });
            }
        }
    });

    // Connections: web search provider
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-web-search-provider') {
            try {
                const providerRaw = String(e.target.value || '').trim().toLowerCase();
                const provider = WEB_SEARCH_PROVIDERS.has(providerRaw) ? providerRaw : 'brave';
                await window.dram.storage.set('settings.webSearchProvider', provider);
                const providerLabel = provider === 'perplexity' ? 'Perplexity' : 'Brave';
                showWebSearchStatus(`Web search provider set to ${providerLabel}.`, 'success');
                showToast({ message: `Web search provider updated: ${providerLabel}`, type: 'success' });
            } catch (err) {
                console.error('Failed to update web search provider:', err);
                showWebSearchStatus(`Failed to update web search provider: ${err?.message || err}`, 'error');
                showToast({ message: 'Failed to update web search provider', type: 'error' });
            }
        }
    });

    // Connections: device pairing access mode
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-device-access-policy') {
            try {
                const policy = normalizeDeviceAccessPolicy(e.target.value);
                await window.dram.storage.set('settings.deviceAccessPolicy', policy);
                await syncDeviceAccessPolicyControl();
                if (policy === 'manual') {
                    showDeviceAccessStatus('Device policy set to Manual review.', 'info');
                    showToast({ message: 'Device access policy updated: Manual', type: 'info' });
                } else if (policy === 'auto-allow') {
                    showDeviceAccessStatus('Device policy set to Auto Allow.', 'success');
                    showToast({ message: 'Device access policy updated: Auto Allow', type: 'success' });
                } else {
                    showDeviceAccessStatus('Device policy set to Block.', 'warning');
                    showToast({ message: 'Device access policy updated: Block', type: 'warning' });
                }
                await enforceDeviceAccessPolicy(false);
            } catch (err) {
                console.error('Failed to apply device access policy:', err);
                showDeviceAccessStatus(`Failed to apply device policy: ${err?.message || err}`, 'error');
                showToast({ message: 'Failed to apply device access policy', type: 'error' });
            }
        }
    });

    // Connections: WhatsApp DM policy
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-dm-policy') {
            try {
                const policy = String(e.target.value || '').trim().toLowerCase() || 'open';
                await window.dram.storage.set('settings.dmPolicy', policy);
                if (policy === 'open') {
                    showDmPolicyStatus('DM policy set to Open. Pairing prompts are disabled.', 'success');
                } else if (policy === 'pairing') {
                    showDmPolicyStatus('DM policy set to Pairing. Unknown senders will receive approval codes.', 'warning');
                } else if (policy === 'allowlist') {
                    showDmPolicyStatus('DM policy set to Allowlist. Configure WhatsApp allowFrom entries.', 'info');
                } else {
                    showDmPolicyStatus('DM policy set to Disabled. Inbound WhatsApp DMs are blocked.', 'warning');
                }
                showToast({ message: `WhatsApp DM policy updated: ${policy}`, type: 'info' });
            } catch (err) {
                console.error('Failed to update DM policy:', err);
                showDmPolicyStatus(`Failed to update DM policy: ${err?.message || err}`, 'error');
                showToast({ message: 'Failed to update DM policy', type: 'error' });
            }
        }
    });

    // Connections: WhatsApp outbound reply policy
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-whatsapp-outbound-enabled') {
            try {
                const enabled = Boolean(e.target.checked);
                await window.dram.storage.set('settings.whatsappOutboundEnabled', enabled);
                if (enabled) {
                    showWhatsappOutboundStatus('WhatsApp outbound replies are enabled.', 'success');
                    showToast({ message: 'WhatsApp outbound replies enabled', type: 'success' });
                } else {
                    showWhatsappOutboundStatus('WhatsApp outbound replies are blocked.', 'warning');
                    showToast({ message: 'WhatsApp outbound replies blocked', type: 'warning' });
                }
            } catch (err) {
                console.error('Failed to update WhatsApp outbound policy:', err);
                showWhatsappOutboundStatus(`Failed to update outbound policy: ${err?.message || err}`, 'error');
                showToast({ message: 'Failed to update WhatsApp outbound policy', type: 'error' });
            }
        }
    });

    on(elements.settingModel, 'change', async (e) => {
        const modelId = e.target.value;
        const modelName = e.target.options[e.target.selectedIndex].text;
        await window.dram.storage.set('settings.model', modelId);
        const synced = await syncPrimaryModelToGateway();
        if (!synced) {
            showToast({ message: 'Cloud model saved, but gateway sync failed', type: 'warning' });
            return;
        }

        const isLocalPrimary = document.getElementById('setting-primary-mode-local')?.checked || false;
        if (!isLocalPrimary) {
            applyPrimaryModelState(modelId, modelName);
        }
        const { updateThinkingPreview } = await import('../../components/settings/tabs/model.js');
        updateThinkingPreview(modelId);
        showToast({ message: `Cloud model updated to ${modelName}`, type: 'success' });

        const { showModelStatus } = await import('../../components/settings/tabs/model.js');
        showModelStatus(`Cloud model updated to ${modelName}`, 'success');
    });

    // Primary Mode & Local Model listeners
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-primary-mode-local') {
            const enabled = e.target.checked;
            await window.dram.storage.set('settings.primaryModeLocal', enabled);
            if (enabled) {
                await refreshModelsUI({ force: true });
            }

            const { updatePrimaryModeUI } = await import('../../components/settings/tabs/model.js');
            updatePrimaryModeUI();

            // Refresh footer model display
            const targetSelect = enabled ? document.getElementById('setting-model-local') : document.getElementById('setting-model');
            if (targetSelect && targetSelect.options[targetSelect.selectedIndex]) {
                const modelId = targetSelect.value;
                const modelName = targetSelect.options[targetSelect.selectedIndex].text;
                applyPrimaryModelState(modelId, modelName);
                const { updateThinkingPreview } = await import('../../components/settings/tabs/model.js');
                updateThinkingPreview(modelId);
            }
            const synced = await syncPrimaryModelToGateway();
            if (!synced) {
                showToast({ message: 'Primary mode saved, but gateway sync failed', type: 'warning' });
                return;
            }
            await syncInternetAccessModeControl();

            showToast({ message: `Primary mode: ${enabled ? 'Local' : 'Cloud'}`, type: 'info' });
        }

        if (e.target.id === 'setting-model-local') {
            const modelId = e.target.value;
            const modelName = e.target.options[e.target.selectedIndex].text;
            await window.dram.storage.set('settings.modelLocal', modelId);
            const synced = await syncPrimaryModelToGateway();
            if (!synced) {
                showToast({ message: 'Local model saved, but gateway sync failed', type: 'warning' });
                return;
            }

            const isLocalPrimary = document.getElementById('setting-primary-mode-local')?.checked || false;
            if (isLocalPrimary) {
                applyPrimaryModelState(modelId, modelName);
            }
            const { updateThinkingPreview } = await import('../../components/settings/tabs/model.js');
            updateThinkingPreview(modelId);
            showToast({ message: `Local model updated to ${modelName}`, type: 'success' });
        }
    });

    on(elements.settingTemp, 'input', async (e) => {
        const value = e.target.value;
        const display = document.getElementById('setting-temp-value');
        if (display) display.textContent = value;
    });

    on(elements.settingTemp, 'change', async (e) => {
        const value = e.target.value;
        await window.dram.storage.set('settings.temperature', value);
        showToast({ message: `Temperature set to ${value}`, type: 'info' });
    });

    on(elements.settingThink, 'change', async (e) => {
        const rawValue = String(e.target.value || '').trim().toLowerCase();
        const value = rawValue === 'high' || rawValue === '3' ? 'high'
            : rawValue === 'low' || rawValue === '1' ? 'low'
                : 'medium';
        await window.dram.storage.set('settings.thinkLevel', value);

        const { updateThinkingPreview } = await import('../../components/settings/tabs/model.js');
        updateThinkingPreview(state.currentActiveModelId);

        const levelNames = { low: 'Low', medium: 'Medium', high: 'High' };
        showToast({ message: `Reasoning depth: ${levelNames[value] || value}`, type: 'info' });
    });

    on(elements.settingAutoConnect, 'change', async (e) => {
        await window.dram.storage.set('settings.autoConnect', e.target.checked);
    });

    on(elements.settingTray, 'change', async (e) => {
        await window.dram.storage.set('settings.minimizeToTray', e.target.checked);
    });

    on(elements.settingAdvancedMode, 'change', async (e) => {
        const enabled = e.target.checked;
        await window.dram.storage.set('settings.advancedMode', enabled);
        const { updateAdvancedModeUI } = await import('../settings.js');
        updateAdvancedModeUI(enabled);
    });

    on(elements.btnClearAll, 'click', async () => {
        const confirmed = await showConfirmDialog({
            type: 'danger',
            title: 'FACTORY RESET',
            message: 'This will destroy ALL local configuration, API keys, and onboarding status.',
            detail: 'This action cannot be undone. Your neural vault and all cached data will be permanently erased.',
            confirmText: 'Wipe All Data',
            cancelText: 'Cancel'
        });

        if (confirmed) {
            showToast({ message: 'Initiating system wipe...', type: 'warning' });
            addSystemMessage(elements, 'INITIATING DEEP WIPE...');
            await window.dram.storage.wipe();
            showToast({ message: 'System wipe complete. Reloading...', type: 'success', duration: 2000 });
            addSystemMessage(elements, 'SYSTEM WIPE COMPLETE... REBOOTING');
            setTimeout(() => location.reload(), 1500);
        }
    });

    ensureDeviceAccessPolicyPolling();
    void syncDeviceAccessPolicyControl();
    void enforceDeviceAccessPolicy(true);

    // API Keys & Gateway
    setupApiKeyListeners();
    setupGatewayUrlListener(on);
    setupTokenRotationListener(on);
    setupClearCredsListener(on);
    setupOllamaTestListener();

    // Voice & Audio Settings
    setupVoiceSettingsListeners(on);

    // Skill/Plugin Management
    setupSkillListeners();
}






