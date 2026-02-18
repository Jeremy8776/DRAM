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
            ? `RSS ${health.memory.rss || 'n/a'} • Heap ${health.memory.heapUsed || 'n/a'}`
            : 'Memory usage';
        checks.push({
            name: 'Memory',
            status: components.memory,
            message: memoryDetail
        });
    }

    return checks;
};

export function setupSettingsListeners(on) {
    // ═══════════════════════════════════════════
    // NAVIGATION LISTENERS
    // ═══════════════════════════════════════════

    const navItems = Array.from(elements.toolNavItems || []);
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

    // ═══════════════════════════════════════════
    // TAB NAVIGATION
    // ═══════════════════════════════════════════

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

            if (tabId === 'tab-hardware') {
                await populateAudioDevices();
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

    // ═══════════════════════════════════════════
    // GENERAL SETTINGS
    // ═══════════════════════════════════════════

    // Audio Input Handler (delegated)
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
            await window.dram.storage.set('settings.ollamaHost', e.target.value.trim());
            showToast({ message: 'Ollama host updated', type: 'info' });
        }
    });

    // Daemon persistence
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-daemon-active') {
            await window.dram.storage.set('settings.daemonActive', e.target.checked);
            showToast({ message: `Daemon background service: ${e.target.checked ? 'Enabled' : 'Disabled'}`, type: 'info' });
        }
    });

    // ═══════════════════════════════════════════
    // MODEL SETTINGS
    // ═══════════════════════════════════════════

    on(elements.settingModel, 'change', async (e) => {
        const modelId = e.target.value;
        const modelName = e.target.options[e.target.selectedIndex].text;
        await window.dram.storage.set('settings.model', modelId);

        const isLocalPrimary = document.getElementById('setting-primary-mode-local')?.checked || false;
        if (!isLocalPrimary) {
            state.modelRoutingMode = 'auto';
            state.manualModelId = null;
            state.models.primary.id = modelId;
            state.models.primary.name = modelName;
            state.currentActiveModelId = modelId;
            state.model = modelId;
            if (elements.currentModel) elements.currentModel.textContent = modelName;
            refreshMainDisplay();
        }
        showToast({ message: `Cloud model updated to ${modelName}`, type: 'success' });

        const { showModelStatus } = await import('../../components/settings/tabs/model.js');
        showModelStatus(`Cloud model updated to ${modelName}`, 'success');
    });

    // Primary Mode & Local Model listeners
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'setting-primary-mode-local') {
            const enabled = e.target.checked;
            await window.dram.storage.set('settings.primaryModeLocal', enabled);

            const { updatePrimaryModeUI } = await import('../../components/settings/tabs/model.js');
            updatePrimaryModeUI();

            // Refresh footer model display
            const targetSelect = enabled ? document.getElementById('setting-model-local') : document.getElementById('setting-model');
            if (targetSelect && targetSelect.options[targetSelect.selectedIndex]) {
                const modelId = targetSelect.value;
                const modelName = targetSelect.options[targetSelect.selectedIndex].text;
                state.modelRoutingMode = 'auto';
                state.manualModelId = null;
                state.models.primary.id = modelId;
                state.models.primary.name = modelName;
                state.currentActiveModelId = modelId;
                state.model = modelId;
                if (elements.currentModel) elements.currentModel.textContent = modelName;
                refreshMainDisplay();
            }

            showToast({ message: `Primary mode: ${enabled ? 'Local' : 'Cloud'}`, type: 'info' });
        }

        if (e.target.id === 'setting-model-local') {
            const modelId = e.target.value;
            const modelName = e.target.options[e.target.selectedIndex].text;
            await window.dram.storage.set('settings.modelLocal', modelId);

            const isLocalPrimary = document.getElementById('setting-primary-mode-local')?.checked || false;
            if (isLocalPrimary) {
                state.modelRoutingMode = 'auto';
                state.manualModelId = null;
                state.models.primary.id = modelId;
                state.models.primary.name = modelName;
                state.currentActiveModelId = modelId;
                state.model = modelId;
                if (elements.currentModel) elements.currentModel.textContent = modelName;
                refreshMainDisplay();
            }
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
        const value = e.target.value;
        await window.dram.storage.set('settings.thinkLevel', value);

        const { updateThinkingPreview } = await import('../../components/settings/tabs/model.js');
        updateThinkingPreview();

        const levelNames = { '1': 'Direct', '2': 'Balanced', '3': 'Deep Analysis' };
        showToast({ message: `Reasoning depth: ${levelNames[value] || value}`, type: 'info' });
    });

    // ═══════════════════════════════════════════
    // GENERAL APP SETTINGS
    // ═══════════════════════════════════════════

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

    // ═══════════════════════════════════════════
    // FACTORY RESET
    // ═══════════════════════════════════════════

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

    // ═══════════════════════════════════════════
    // SPECIALIZED LISTENERS (from sub-modules)
    // ═══════════════════════════════════════════

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
