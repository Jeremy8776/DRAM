import { state } from '../../../modules/state.js';
import { elements } from '../../../modules/elements.js';
import { renderWizard, renderLoadingStep } from '../../../components/wizard.js';
import { addSystemMessage } from '../../../modules/utils.js';
import { wizardState, getProviderFromModel, validateApiKey, finishWizardCore, finishWizardIntegrations, initializeWizardState, collectPluginConfigsFromDOM } from '../../../modules/wizard.js';
import { showToast } from '../../../components/dialog.js';

const normalizeSecretInput = (rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return '';
    if (/^\$\{[A-Z0-9_]+\}$/.test(value)) return value;
    return value.replace(/\s+/g, '');
};

/**
 * Initialize and orchestrate the DRAM Onboarding Wizard.
 * Handles step transitions, data loading, and final configuration persistence.
 */
export function setupWizardLogic() {
    let availableModels = [];
    let availablePlugins = [];
    let availableSkills = [];
    let dataLoaded = false;
    let connectivityInterval = null;
    let isWizardActive = false;
    let wizardClickHandler = null;
    let wizardInputHandler = null;

    /**
     * Stop active wizard intervals and reset internal state.
     */
    const cleanupWizard = () => {
        isWizardActive = false;
        if (connectivityInterval) {
            clearInterval(connectivityInterval);
            connectivityInterval = null;
        }
    };

    /**
     * Close the wizard modal and clean up resources.
     */
    const closeWizard = () => {
        const setupScreen = document.getElementById('setup-screen');
        if (setupScreen) {
            setupScreen.classList.add('hidden');
            setupScreen.style.display = 'none';
            setupScreen.style.pointerEvents = 'none';
            setupScreen.innerHTML = '';
        }
        cleanupWizard();

        // Hide loading screen if it's still visible (setup complete)
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen && !loadingScreen.classList.contains('fade-out')) {
            loadingScreen.classList.add('fade-out');
            const app = document.getElementById('app');
            if (app) {
                app.classList.remove('app-hidden');
                app.classList.add('app-visible');
            }
        }
    };

    // Fallback data constants
    const FALLBACK_MODELS = [
        { id: 'anthropic/claude-3-opus:beta', name: 'Claude 3 Opus', provider: 'anthropic' },
        { id: 'anthropic/claude-3-5-sonnet:beta', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
        { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai' },
        { id: 'google/gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', provider: 'google' },
        { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B', provider: 'groq' }
    ];

    const FALLBACK_PLUGINS = [
        { id: 'filesystem', name: 'File System', description: 'Read and write files', kind: 'plugin' },
        { id: 'browser', name: 'Web Browser', description: 'Search and browse the web', kind: 'plugin' },
        { id: 'terminal', name: 'Terminal', description: 'Execute commands', kind: 'plugin' },
        { id: 'calculator', name: 'Calculator', description: 'Perform calculations', kind: 'plugin' },
        { id: 'memory', name: 'Memory', description: 'Long-term memory', kind: 'plugin' }
    ];

    const FALLBACK_SKILLS = [
        { id: 'coding', name: 'Coding', description: 'Write and debug code' },
        { id: 'research', name: 'Research', description: 'Search and analyze information' },
        { id: 'writing', name: 'Writing', description: 'Creative and technical writing' },
        { id: 'analysis', name: 'Analysis', description: 'Data and text analysis' }
    ];

    /**
     * Fetch initial data (models, plugins, skills) from engine utility bridge.
     * @param {boolean} force - Force refresh of data
     */
    const loadData = async (force = false) => {
        if (dataLoaded && !force) return;
        try {
            // Even if not fully connected, if we are forcing, we try to load
            if ((state.connected || force) && window.dram.util) {
                console.log('Wizard: Loading data (force=' + force + ')...');

                // Use Promise.allSettled but with fallbacks applied immediately on failure/empty
                const [m, p, s] = await Promise.allSettled([
                    window.dram.util.getModels({ force }),
                    window.dram.util.getPlugins(),
                    window.dram.util.getSkills()
                ]);

                // Models
                if (m.status === 'fulfilled' && m.value && m.value.length > 0) {
                    availableModels = m.value;
                } else {
                    console.warn('Wizard: specific fetch failed or empty, using fallbacks for models');
                    availableModels = FALLBACK_MODELS;
                }
                console.log('Wizard: Loaded ' + availableModels.length + ' models including fallbacks');

                // Plugins
                if (p.status === 'fulfilled' && p.value && p.value.length > 0) {
                    availablePlugins = p.value.filter(item => item.kind !== 'plugin' && item.kind !== 'skill' ? true : item.kind !== 'skill');
                } else {
                    console.warn('Wizard: using fallbacks for plugins');
                    availablePlugins = FALLBACK_PLUGINS;
                }

                // Skills
                if (s.status === 'fulfilled' && s.value) {
                    // Normalize skills to array if object
                    let loadedSkills = [];
                    if (Array.isArray(s.value)) loadedSkills = s.value;
                    else if (typeof s.value === 'object') loadedSkills = Object.values(s.value);

                    if (loadedSkills.length > 0) availableSkills = loadedSkills;
                    else availableSkills = FALLBACK_SKILLS;
                } else {
                    console.warn('Wizard: using fallbacks for skills');
                    availableSkills = FALLBACK_SKILLS;
                }

                // Pre-select defaults
                if (!wizardState.skills) wizardState.skills = {};
                availableSkills.forEach(sk => {
                    const id = sk.id || sk.name.toLowerCase();
                    if (wizardState.skills[id] === undefined) {
                        wizardState.skills[id] = true;
                    }
                });

                // If we found OpenClaw during discovery, mark legacy option
                if (openClawDiscovery?.found) {
                    wizardState.foundLegacy = true;
                    wizardState.legacyName = 'OpenClaw (Detected)';
                }

                dataLoaded = true;

                // Force a re-render of the current step if we are on the data steps
                const currentStepVal = parseInt(document.getElementById('wizard-step-counter')?.textContent || '1');
                if (currentStepVal >= 2) renderWizard(currentStepVal);
            }
        } catch (e) {
            console.error('Wizard: Fetch failed, applying all fallbacks', e);
            availableModels = FALLBACK_MODELS;
            availablePlugins = FALLBACK_PLUGINS;
            availableSkills = FALLBACK_SKILLS;
            dataLoaded = true;
            renderWizard(2);
        }
    };

    /**
     * Reads fallback model selections from the DOM and updates the wizard state.
     */
    const updateFallbacksFromDOM = () => {
        const rows = document.querySelectorAll('.wizard-fallback-row');
        wizardState.fallbacks = Array.from(rows).map(row => ({
            model: row.querySelector('.fallback-model-select').value,
            apiKey: normalizeSecretInput(row.querySelector('.fallback-api-key').value)
        }));
    };

    /**
     * Poll connection status for step 2 (Neural Link Initialization).
     * Auto-connects and updates UI, then proceeds to step 3 when ready.
     */
    const startConnectivityPolling = () => {
        isWizardActive = true;

        if (connectivityInterval) {
            clearInterval(connectivityInterval);
            connectivityInterval = null;
        }

        // Start connection attempt - import robustly
        import('../../../modules/socket.js').then(({ connect }) => {
            connect().catch(() => { console.log('Wizard: socket connect init failed'); });
        });

        let waitTime = 0;
        const maxWaitTime = 30000;
        let attempts = 0;

        const updateWizardUI = async () => {
            const indicator = document.getElementById('wizard-indicator');
            const msg = document.getElementById('wizard-sync-msg');
            const syncState = document.getElementById('wizard-sync-state');
            const nextBtn = document.getElementById('btn-wizard-next');

            if (!isWizardActive || !indicator || !msg || !nextBtn) {
                // If we don't have the elements yet, we just wait for next poll
                return;
            }

            const setSyncState = (stateClass, label) => {
                if (!syncState) return;
                syncState.className = `wizard-sync-shell__state ${stateClass}`;
                syncState.textContent = label;
            };

            // Keep connection truth source strict: only socket status/handshake may mark connected.
            // Do not infer connected state from utility RPC probes.

            if (state.connected) {
                indicator.className = 'sync-indicator online';
                msg.textContent = 'HANDSHAKE SUCCESSFUL';
                setSyncState('online', 'Online');
                nextBtn.textContent = 'Continue';
                nextBtn.dataset.connected = 'true';
                nextBtn.disabled = false;

                if (connectivityInterval) {
                    clearInterval(connectivityInterval);
                    connectivityInterval = null;
                }
                loadData(true);
            } else if (state.connecting) {
                indicator.className = 'sync-indicator connecting';
                msg.textContent = 'SYNCHRONIZING...';
                setSyncState('connecting', 'Syncing');
                nextBtn.disabled = true;
            } else {
                indicator.className = 'sync-indicator offline';
                if (waitTime > maxWaitTime) {
                    msg.textContent = 'LINK TIMEOUT - RETRYING...';
                    setSyncState('connecting', 'Retrying');
                    import('../../../modules/socket.js').then(({ connect }) => connect().catch(() => { }));
                    waitTime = 0;
                } else {
                    msg.textContent = 'CONNECTING...';
                    setSyncState('offline', 'Offline');
                }
                nextBtn.disabled = true;
            }
        };

        // Run immediately then start interval if still not connected
        updateWizardUI().then(() => {
            if (isWizardActive && !state.connected && !connectivityInterval) {
                connectivityInterval = setInterval(async () => {
                    waitTime += 500;
                    attempts++;
                    await updateWizardUI();
                }, 500);
            }
        });
    };

    /**
     * Render a specific wizard step into the modal container.
     * @param {number} step - The step number to render (1-based)
     */
    const showStep = (step) => {
        const setupScreen = document.getElementById('setup-screen');
        if (setupScreen) {
            isWizardActive = true;
            setupScreen.classList.remove('hidden');
            setupScreen.style.display = 'flex';
            setupScreen.style.pointerEvents = 'auto';
            setupScreen.innerHTML = renderWizard(step, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);

            // Adjust step indices if OpenClaw detection step is present (it adds 1 step at the start)
            const offset = (openClawDiscovery?.found) ? 1 : 0;

            if (step === 6 + offset) preFillWorkspace();
            if (step === 2 + offset) startConnectivityPolling();
        }
    };

    window.showDramWizardStep = showStep; // Export to window for easy access

    // OpenClaw discovery state
    let openClawDiscovery = null;

    // Auto-init with OpenClaw discovery
    (async () => {
        // Initialize from *current* settings first (ARCH-003)
        await initializeWizardState();

        // Step 1: Detect OpenClaw installation
        try {
            // Only show loading state if wizard is visible AND empty (not already rendered)
            const setupScreen = document.getElementById('setup-screen');
            if (setupScreen && !setupScreen.classList.contains('hidden') && !setupScreen.innerHTML.trim()) {
                setupScreen.innerHTML = renderLoadingStep('Detecting OpenClaw installation...');
            }

            openClawDiscovery = await window.dram.app.discoverOpenClaw();
            console.log('OpenClaw discovery result:', openClawDiscovery);

            // If OpenClaw not found, we need to install it
            if (!openClawDiscovery.found && openClawDiscovery.needsInstall) {
                // Helper to update progress text
                const updateProgress = (text) => {
                    const progressEl = document.getElementById('loading-progress-text');
                    if (progressEl) {
                        progressEl.textContent = text;
                        progressEl.style.display = 'block';
                    }
                };

                // Always show the installing screen (replace the searching screen)
                if (setupScreen) {
                    console.log('Wizard: Showing install screen');
                    setupScreen.innerHTML = renderLoadingStep(
                        'Installing OpenClaw',
                        'Setting up AI engine...',
                        'Starting installation...'
                    );
                } else {
                    console.error('Wizard: setupScreen not found!');
                }

                // Small delay to show initial state
                await new Promise(r => setTimeout(r, 500));
                updateProgress('Downloading from npm...');

                const installResult = await window.dram.app.installOpenClaw('latest');

                if (installResult.success) {
                    updateProgress('Installation complete!');
                    await new Promise(r => setTimeout(r, 500));

                    // Initialize the engine now that OpenClaw is installed
                    updateProgress('Starting engine...');
                    const initResult = await window.dram.app.initializeEngine();
                    if (initResult.success) {
                        console.log('Wizard: Engine initialized after install');
                        await window.dram.storage.set('gateway.url', 'ws://127.0.0.1:18789');
                        wizardState.gatewayToken = await window.dram.gateway.getToken().catch(() => null);
                        // Wait a moment for engine to be fully ready
                        await new Promise(r => setTimeout(r, 1000));
                    } else {
                        console.warn('Wizard: Engine init failed:', initResult.error);
                    }

                    // Re-discover after installation
                    openClawDiscovery = await window.dram.app.discoverOpenClaw();

                    // Now load real data from the engine
                    updateProgress('Loading AI models...');
                    await loadData(true);

                    showToast({ message: 'OpenClaw installed successfully', type: 'success' });
                } else {
                    console.error('OpenClaw installation failed:', installResult.error);
                    showToast({ message: 'OpenClaw installation failed: ' + installResult.error, type: 'error' });
                }
            }

            if (openClawDiscovery.found && openClawDiscovery.config) {
                // Pre-populate wizard state with detected config
                const cfg = openClawDiscovery.config;
                const defaults = cfg.agents?.defaults || {};
                const model = defaults.model || {};

                // Extract primary model and keep canonical provider/model ID.
                if (model.primary) {
                    wizardState.model = model.primary;
                }

                // Extract fallbacks
                if (model.fallbacks && Array.isArray(model.fallbacks)) {
                    wizardState.fallbacks = model.fallbacks.map(fb => ({
                        model: fb,
                        apiKey: ''
                    }));
                }

                // Extract workspace
                if (defaults.workspace) {
                    wizardState.workspacePath = defaults.workspace;
                }

                // Extract enabled plugins
                if (cfg.plugins?.entries) {
                    wizardState.plugins = Object.keys(cfg.plugins.entries)
                        .filter(id => cfg.plugins.entries[id].enabled !== false);
                }

                // Re-render wizard to show OpenClaw detection step (step 1)
                const setupScreen = document.getElementById('setup-screen');
                if (setupScreen && !setupScreen.classList.contains('hidden')) {
                    console.log('Wizard: Re-rendering with OpenClaw detection step');
                    setupScreen.innerHTML = renderWizard(1, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
                }
            }
        } catch (err) {
            console.error('OpenClaw discovery failed:', err);
        }

        // Only load data if OpenClaw is found (not during fresh install flow)
        // For fresh installs, data will be loaded after connection in step 2
        if (openClawDiscovery?.found || openClawDiscovery?.installed) {
            await loadData();
        } else {
            console.log('Wizard: Skipping data load - OpenClaw not found yet (fresh install)');
        }

        // Detect legacy config (Moltbot/Clawdbot - lower priority than OpenClaw)
        if (!openClawDiscovery?.found) {
            try {
                const result = await window.dram.app.detectLegacyConfig();
                if (result.found) {
                    wizardState.foundLegacy = true;
                    wizardState.legacyName = result.name;
                    const summary = await window.dram.app.migrateLegacyConfig(result.config);
                    if (summary) {
                        wizardState.model = summary.model;
                        wizardState.workspacePath = summary.workspacePath;
                        wizardState.plugins = summary.plugins;
                    }
                }
            } catch (err) {
                console.error('Legacy detection failed:', err);
            }
        }
    })();

    wizardClickHandler = async (e) => {
        const setupScreen = document.getElementById('setup-screen');
        if (!setupScreen) return;
        if (!e.target?.closest?.('#setup-screen')) return;

        if (e.target.id === 'btn-wizard-next') {
            const step = parseInt(e.target.dataset.step);

            // Calculate dynamic offset based on whether OpenClaw was found (adds 1 step at start)
            const offset = (openClawDiscovery?.found) ? 1 : 0;

            // Check if we're on the OpenClaw detection step (only exists if openClawDiscovery.found)
            const hasOpenClawStep = openClawDiscovery?.found;
            const isOpenClawStep = hasOpenClawStep && step === 1;
            // Legacy matches if (Found && step 2) OR (NotFound && step 1)
            const isLegacyStep = (hasOpenClawStep && step === 2) || (!hasOpenClawStep && wizardState.foundLegacy && step === 1);

            if (isOpenClawStep) {
                // User clicked "Import & Enhance" on OpenClaw detection step
                // Skip to Fallbacks (Step 6 in Found array)
                setupScreen.innerHTML = renderWizard(6, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
                return;
            } else if (isLegacyStep) {
                // Migrate detected (legacy Moltbot/Clawdbot)
                const result = await window.dram.app.detectLegacyConfig();
                if (result.found) {
                    const migrated = await window.dram.app.migrateLegacyConfig(result.config);
                    if (migrated) {
                        Object.assign(wizardState, migrated);
                        // Jump to Workspace (Step 6+offset)
                        setupScreen.innerHTML = renderWizard(6 + offset, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
                        preFillWorkspace();
                        return;
                    }
                }
                // Fallback - go to next appropriate step (Connection)
                const nextStep = 2 + offset;
                setupScreen.innerHTML = renderWizard(nextStep, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
                if (nextStep === 2 + offset) startConnectivityPolling();
                return;
            } else if (step === 2 + offset) {
                // Connection Established, load real data
                const btn = e.target;
                const isConnected = btn.dataset.connected === 'true';

                btn.textContent = 'Loading Models...';
                btn.disabled = true;

                if (isConnected) {
                    await loadData(true);
                }

                setupScreen.innerHTML = renderWizard(step + 1, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
                return;
            } else if (step === 3 + offset) {
                const modelSelect = document.getElementById('wizard-model-select');
                if (modelSelect) wizardState.model = modelSelect.value;
                if (!wizardState.model || wizardState.model === '' || wizardState.model === 'none') {
                    showToast({ message: 'Please select a model to continue', type: 'warning' });
                    return;
                }
            } else if (step === 4 + offset) {
                const keyInput = document.getElementById('wizard-api-key');
                if (keyInput) wizardState.apiKey = normalizeSecretInput(keyInput.value);
            } else if (step === 5 + offset) {
                updateFallbacksFromDOM();
            } else if (step === 6 + offset) {
                // Step 6+offset: Launch & Connect
                const btn = e.target;
                const isConnected = btn.dataset.connected === 'true';

                if (!isConnected && !state.connected) {
                    btn.textContent = 'Connecting...';
                    btn.disabled = true;

                    const { connect } = await import('../../../modules/socket.js');
                    connect().catch(() => { });

                    let attempts = 0;
                    const maxAttempts = 30;
                    const checkInterval = setInterval(async () => {
                        attempts++;
                        if (state.connected) {
                            clearInterval(checkInterval);
                            btn.dataset.connected = 'true';
                            btn.textContent = 'Continue';
                            btn.disabled = false;
                            await finishWizardCore(wizardState);
                            try {
                                wizardState.gatewayToken = await window.dram.gateway.getToken();
                            } catch (e) {
                                console.error('Wizard: Failed to fetch gateway token', e);
                                wizardState.gatewayToken = 'manual-config';
                            }
                            setupScreen.innerHTML = renderWizard(step + 1, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
                        } else if (attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                            btn.textContent = 'Continue Offline';
                            btn.disabled = false;
                            wizardState.gatewayToken = 'manual-config';
                            await finishWizardCore(wizardState);
                            setupScreen.innerHTML = renderWizard(step + 1, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
                        }
                    }, 500);
                    return;
                }

                await finishWizardCore(wizardState);
                if (state.connected && !wizardState.gatewayToken) {
                    try {
                        wizardState.gatewayToken = await window.dram.gateway.getToken();
                    } catch (e) {
                        wizardState.gatewayToken = 'manual-config';
                    }
                }
            } else if (step === 9 + offset) {
                collectPluginConfigsFromDOM(wizardState);
            } else if (step === 10 + offset) {
                // Defer integration apply until final step to avoid duplicate config.patch
                // (which causes extra gateway restarts during onboarding handoff).
            } else if (step === 11 + offset) {
                await finishWizardIntegrations(wizardState, setupScreen);
                closeWizard();
                return;
            }

            const nextStep = step + 1;

            if (nextStep === 3 + offset) {
                // Ensure data is loaded (soft load)
                await loadData();
            }

            if (nextStep > 11 + offset) {
                await finishWizardIntegrations(wizardState, setupScreen);
                closeWizard();
            } else {
                setupScreen.innerHTML = renderWizard(nextStep, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
                if (nextStep === 6 + offset) preFillWorkspace();
                if (nextStep === 11 + offset) startVoiceSetup();
            }
        }

        if (e.target.id === 'btn-wizard-fresh') {
            // Reset state to ensure fresh defaults
            wizardState.workspacePath = null;
            wizardState.apiKey = null;

            // Determine if OpenClaw is found to set correct connection step
            const offset = (openClawDiscovery?.found) ? 1 : 0;
            const nextStep = 2 + offset;

            setupScreen.innerHTML = renderWizard(nextStep, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
            if (nextStep === 2 + offset) startConnectivityPolling();
        }

        // Plugin interactions (Wizard)
        const pluginCard = e.target.closest('.plugin-card[data-id]');
        if (pluginCard) {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            const id = pluginCard.dataset.id;
            const toggle = pluginCard.querySelector('.plugin-toggle');
            if (toggle) {
                // If clicked card body (not switch), toggle checkbox manually
                if (e.target !== toggle && !e.target.closest('.switch')) {
                    toggle.checked = !toggle.checked;
                }

                // Update state
                if (toggle.checked) {
                    if (!wizardState.plugins.includes(id)) wizardState.plugins.push(id);
                } else {
                    wizardState.plugins = wizardState.plugins.filter(p => p !== id);
                }
                pluginCard.classList.toggle('active', toggle.checked);
            }
        }

        // Skill interactions (Wizard)
        const skillCard = e.target.closest('.plugin-card[data-skill-id]');
        if (skillCard) {
            const skillId = skillCard.dataset.skillId;
            const toggle = skillCard.querySelector('.skill-toggle');

            if (toggle && !toggle.disabled) {
                // If clicked card body, toggle manually
                if (e.target !== toggle && !e.target.closest('.switch')) {
                    toggle.checked = !toggle.checked;
                }

                // Update state (object-based mapping)
                if (!wizardState.skills) wizardState.skills = {};
                wizardState.skills[skillId] = toggle.checked;

                skillCard.classList.toggle('active', toggle.checked);
            }
        }

        if (e.target.id === 'btn-wizard-skip-plugins') {
            await finishWizardIntegrations(wizardState, setupScreen);
            addSystemMessage(elements, 'Core link active. Extension setup deferred.');
            closeWizard();
        }

        if (e.target.id === 'btn-wizard-skip-link') {
            wizardState.gatewayToken = 'manual-config';
            const offset = (openClawDiscovery?.found) ? 1 : 0;
            setupScreen.innerHTML = renderWizard(8 + offset, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
        }

        if (e.target.id === 'btn-toggle-token') {
            const tokenInput = document.getElementById('wizard-gateway-token');
            if (tokenInput) {
                const isHidden = tokenInput.type === 'password';
                tokenInput.type = isHidden ? 'text' : 'password';
                e.target.textContent = isHidden ? 'Hide' : 'Show';
            }
        }

        if (e.target.id === 'btn-wizard-browse') {
            const result = await window.dram.dialog.showOpenDialog({ properties: ['openDirectory'] });
            if (!result.canceled && result.filePaths.length > 0) {
                wizardState.workspacePath = result.filePaths[0];
                const input = document.getElementById('wizard-workspace-path');
                if (input) input.value = wizardState.workspacePath;
            }
        }

        if (e.target.id === 'btn-add-fallback') {
            updateFallbacksFromDOM();
            wizardState.fallbacks.push({ model: 'openai/gpt-4o-mini', apiKey: '' });
            const offset = (openClawDiscovery?.found) ? 1 : 0;
            setupScreen.innerHTML = renderWizard(5 + offset, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
        }

        if (e.target.classList.contains('btn-remove-fallback')) {
            updateFallbacksFromDOM();
            const index = parseInt(e.target.dataset.index);
            wizardState.fallbacks.splice(index, 1);
            const offset = (openClawDiscovery?.found) ? 1 : 0;
            setupScreen.innerHTML = renderWizard(5 + offset, availableModels, wizardState, availablePlugins, availableSkills, state.connected, openClawDiscovery);
        }

        if (e.target.classList.contains('btn-edit-key') && e.target.dataset.target === 'wizard-api-key') {
            const container = e.target.closest('.key-field-container');
            const input = document.getElementById('wizard-api-key');
            const dots = container.querySelector('.key-status-dots');
            const saveBtn = container.querySelector('.btn-save-key');
            e.target.classList.add('hidden');
            saveBtn.classList.remove('hidden');
            dots.classList.add('hidden');
            input.classList.remove('hidden');
            input.readOnly = false;
            input.value = wizardState.apiKey || '';
            input.focus();
        }

        if (e.target.classList.contains('btn-save-key') && e.target.dataset.target === 'wizard-api-key') {
            const container = e.target.closest('.key-field-container');
            const input = document.getElementById('wizard-api-key');
            const dots = container.querySelector('.key-status-dots');
            const editBtn = container.querySelector('.btn-edit-key');
            const newValue = normalizeSecretInput(input.value);
            wizardState.apiKey = newValue;
            if (newValue) {
                e.target.classList.add('hidden');
                editBtn.classList.remove('hidden');
                editBtn.textContent = 'Change';
                input.classList.add('hidden');
                input.readOnly = true;
                dots.classList.remove('hidden');
                const statusEl = document.getElementById('api-key-status');
                if (statusEl) {
                    statusEl.className = 'api-key-status checking';
                    const provider = getProviderFromModel(wizardState.model);
                    const valid = await validateApiKey(provider, wizardState.apiKey);
                    statusEl.className = 'api-key-status ' + (valid ? 'valid' : 'invalid');
                }
            } else {
                e.target.classList.remove('hidden');
                editBtn.classList.add('hidden');
                input.classList.remove('hidden');
                dots.classList.add('hidden');
                const statusEl = document.getElementById('api-key-status');
                if (statusEl) statusEl.className = 'api-key-status';
            }
        }

        if (e.target.classList.contains('wizard-file-upload-btn')) {
            const pluginId = e.target.dataset.plugin;
            if (!pluginId) return;

            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.addEventListener('change', async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const json = JSON.parse(text);
                    if (!wizardState.pluginConfigs[pluginId]) wizardState.pluginConfigs[pluginId] = {};
                    wizardState.pluginConfigs[pluginId].__fileJson = json;
                    wizardState.pluginConfigs[pluginId].__fileName = file.name;
                    const safeId = String(pluginId).replace(/[^a-z0-9_-]/gi, '-');
                    const status = document.getElementById(`wizard-file-status-${safeId}`);
                    if (status) status.textContent = `[?] ${file.name}`;
                } catch (err) {
                    console.error('Wizard file upload error:', err);
                }
            });
            input.click();
        }

        if (e.target.classList.contains('oauth-btn')) {
            const pluginId = e.target.dataset.plugin;
            const provider = e.target.dataset.provider;
            if (!pluginId) return;
            const statusEl = document.getElementById(`oauth-status-${pluginId}`);
            const btn = e.target;
            btn.disabled = true;
            if (statusEl) statusEl.textContent = 'Starting OAuth...';
            try {
                const result = await window.dram.util.startOAuth(pluginId, provider);
                if (result?.success) {
                    if (statusEl) statusEl.textContent = '[?] Connected';
                    await window.dram.storage.set(`plugins.configured.${pluginId}`, true);
                } else {
                    if (statusEl) statusEl.textContent = result?.error || 'OAuth not available';
                }
            } catch (err) {
                if (statusEl) statusEl.textContent = 'OAuth failed';
                console.error(err);
            } finally {
                btn.disabled = false;
            }
        }

        if (e.target.classList.contains('wizard-cli-btn')) {
            const pluginId = e.target.dataset.plugin;
            const command = e.target.dataset.cliCommand;
            if (!pluginId || !command) return;
            const safeId = String(pluginId).replace(/[^a-z0-9_-]/gi, '-');
            const status = document.getElementById(`wizard-cli-status-${safeId}`);
            const btn = e.target;
            btn.disabled = true;
            if (status) status.textContent = 'Launching setup...';
            try {
                const result = await window.dram.shell.executeCLI(command);
                if (result?.ok) {
                    if (status) status.textContent = 'Setup command launched.';
                } else {
                    if (status) status.textContent = result?.error || 'Command blocked';
                }
            } catch (err) {
                if (status) status.textContent = 'Failed to launch setup';
                console.error(err);
            } finally {
                btn.disabled = false;
            }
        }

        const installBtn = e.target.closest('.wizard-install-btn');
        if (installBtn) {
            const command = installBtn.dataset.installCommand;
            if (!command) return;
            const originalText = installBtn.textContent;
            installBtn.disabled = true;
            installBtn.textContent = 'Installing...';
            try {
                const result = await window.dram.shell.executeCLI(command);
                if (result?.ok) {
                    installBtn.textContent = 'Installer launched';
                } else {
                    installBtn.textContent = result?.error || 'Install blocked';
                }
            } catch (err) {
                console.error('Wizard plugin install error:', err);
                installBtn.textContent = 'Install failed';
            } finally {
                setTimeout(() => {
                    installBtn.disabled = false;
                    installBtn.textContent = originalText || 'Install';
                }, 1200);
            }
        }

        if (e.target.classList.contains('wizard-qr-btn')) {
            const pluginId = e.target.dataset.plugin;
            if (!pluginId) return;
            const safeId = String(pluginId).replace(/[^a-z0-9_-]/gi, '-');
            const container = document.getElementById(`wizard-qr-${safeId}`);
            const status = document.getElementById(`wizard-qr-status-${safeId}`);
            const btn = e.target;
            if (!container || !status) return;

            btn.disabled = true;
            btn.textContent = 'Generating...';
            container.innerHTML = '<div class="qr-spinner"></div>';

            try {
                const result = await window.dram.util.whatsappStartLogin({ force: true });
                const isSafeImage = result.qrDataUrl && (
                    result.qrDataUrl.startsWith('data:image/png') ||
                    result.qrDataUrl.startsWith('data:image/jpeg') ||
                    result.qrDataUrl.startsWith('data:image/jpg') ||
                    result.qrDataUrl.startsWith('data:image/webp') ||
                    result.qrDataUrl.startsWith('data:image/gif')
                );
                if (isSafeImage) {
                    container.innerHTML = `<img src="${result.qrDataUrl}" style="width: 100%; height: 100%; image-rendering: pixelated; display: block;">`;
                    status.textContent = 'Scan now...';
                    btn.style.display = 'none';
                    pollWizardWhatsApp(status, container, btn);
                } else {
                    status.textContent = result.message || 'Failed to start login';
                    status.style.color = '#F44336';
                    btn.disabled = false;
                    btn.textContent = 'Try Again';
                    container.innerHTML = '<span style="color: #666; font-size: 11px;">Error</span>';
                }
            } catch (err) {
                status.textContent = 'Failed to generate QR';
                status.style.color = '#F44336';
                btn.disabled = false;
                btn.textContent = 'Try Again';
                container.innerHTML = '<span style="color: #666; font-size: 11px;">Error</span>';
                console.error('Wizard WhatsApp Link Error', err);
            }
        }
    };
    document.body.addEventListener('click', wizardClickHandler);

    /**
     * Start local voice engine setup and update UI progress.
     */
    const startVoiceSetup = async () => {
        const msg = document.getElementById('voice-setup-msg');
        const detail = document.getElementById('voice-setup-detail');
        const indicator = document.getElementById('voice-indicator');
        const nextBtn = document.getElementById('btn-wizard-next');

        if (!msg || !nextBtn) return;

        nextBtn.disabled = true;
        nextBtn.textContent = 'Installing...';

        try {
            const result = await window.dram.util.setupLocalVoice();
            if (result.success) {
                indicator.className = 'status-indicator success';
                indicator.innerHTML = 'OK';
                msg.textContent = 'VOICE ENGINE READY';
                detail.textContent = result.alreadyInstalled ? 'Private local transcription is active.' : 'Successfully installed Whisper. Neural link secured.';
                nextBtn.disabled = false;
                nextBtn.textContent = 'Complete Onboarding';
            } else {
                indicator.className = 'status-indicator error';
                indicator.innerHTML = '!';
                msg.textContent = 'VOICE SETUP DEFERRED';
                detail.textContent = result.error || 'Failed to install local dependencies. You can still use API-based voice or fix this in settings.';
                nextBtn.disabled = false;
                nextBtn.textContent = 'Proceed Anyway';
            }
        } catch (err) {
            console.error('Wizard: Voice setup failed', err);
            msg.textContent = 'SETUP FAILED';
            detail.textContent = 'An unexpected error occurred during installation.';
            nextBtn.disabled = false;
            nextBtn.textContent = 'Skip for Now';
        }
    };

    wizardInputHandler = async (e) => {
        if (!e.target?.closest?.('#setup-screen')) return;
        if (e.target.id === 'wizard-api-key') {
            wizardState.apiKey = normalizeSecretInput(e.target.value);
            const statusEl = document.getElementById('api-key-status');
            if (statusEl) {
                statusEl.className = 'api-key-status checking';
                const provider = getProviderFromModel(wizardState.model);
                const valid = await validateApiKey(provider, wizardState.apiKey);
                statusEl.className = 'api-key-status ' + (valid ? 'valid' : 'invalid');
            }
        }
        if (e.target.id === 'wizard-workspace-path') {
            wizardState.workspacePath = e.target.value.trim();
        }
    };
    document.body.addEventListener('input', wizardInputHandler);
}

async function pollWizardWhatsApp(statusDiv, containerDiv, qrBtn) {
    try {
        const result = await window.dram.util.whatsappPollLogin({ timeoutMs: 5000 });
        if (result.connected) {
            statusDiv.textContent = 'âœ… Linked!';
            statusDiv.style.color = '#4CAF50';
            containerDiv.innerHTML = '<div style="font-size: 64px;">âœ…</div>';
            await window.dram.storage.set('plugins.configured.whatsapp', true);
            return;
        }

        if (result.message && !result.message.includes('waiting')) {
            statusDiv.textContent = result.message;
            statusDiv.style.color = '#F44336';
            if (qrBtn) {
                qrBtn.style.display = 'block';
                qrBtn.disabled = false;
                qrBtn.textContent = 'Retry Linking';
            }
            return;
        }
        setTimeout(() => pollWizardWhatsApp(statusDiv, containerDiv, qrBtn), 1500);
    } catch (e) {
        statusDiv.textContent = 'Polling error';
        console.error(e);
    }
}

/**
 * Calculate and pre-fill the default workspace path based on system documents directory.
 * Prevents usage of legacy paths (previous project names).
 */
async function preFillWorkspace() {
    const docs = await window.dram.app.getPath('documents');
    const isWindows = window.dram.platform === 'win32';

    // Determine if the current path is "stale" or from another machine/user
    let isStale = !wizardState.workspacePath;

    if (wizardState.workspacePath) {
        // 1. Check for legacy names
        if (wizardState.workspacePath.includes('Moltbot') || wizardState.workspacePath.includes('Clawdbot') || wizardState.workspacePath.includes('.clawdbot')) {
            isStale = true;
        }

        // 2. Check if the path contains a username segments that doesn't match current machine
        // (Simplified heuristic: if it contains \Users\ and doesn't exist, it's likely stale)
        if (isWindows && wizardState.workspacePath.includes('\\Users\\')) {
            // We can't easily check for existence synchronously here, 
            // but we can check if the 'documents' path we just got is a prefix of what we have.
            // If the base 'Documents' path has changed (different user), reset it.
            if (!wizardState.workspacePath.startsWith(docs)) {
                isStale = true;
            }
        }
    }

    if (isStale) {
        // Use system dependent path
        wizardState.workspacePath = window.dram.path.join(docs, 'DRAM');
    }

    const input = document.getElementById('wizard-workspace-path');
    if (input) input.value = wizardState.workspacePath;
}
