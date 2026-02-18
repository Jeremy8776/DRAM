/**
 * DRAM Desktop - UI Loader
 * Dynamically injects components into the DOM
 */
import { renderWizard, renderLoadingStep } from '../components/wizard.js';
import { redactObject } from './logger.js';
import { renderSidebar } from '../components/sidebar.js';
import { renderSettingsPage } from '../components/settings.js';
import { renderConnectionPanel } from '../components/connection.js';
import { renderUsageView } from '../components/usage-view.js';
import { updateHeroCapabilities } from './renderer.js';
import { escapeHtml } from './utils.js';
import { state } from './state.js';

// Fallback data for when engine is not available (fresh install)
function getFallbackModels() {
    return [
        { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
        { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
        { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash', provider: 'google' },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', provider: 'groq' },
        { id: 'ollama', name: 'Local (Ollama)', provider: 'ollama' }
    ];
}

function getFallbackPlugins() {
    return [
        { id: 'slack', name: 'Slack', description: 'Send messages and interact with Slack workspaces', kind: 'plugin' },
        { id: 'discord', name: 'Discord', description: 'Send messages to Discord channels', kind: 'plugin' },
        { id: 'telegram', name: 'Telegram', description: 'Send messages via Telegram Bot API', kind: 'plugin' },
        { id: 'email', name: 'Email', description: 'Send emails via SMTP', kind: 'plugin' },
        { id: 'calendar', name: 'Calendar', description: 'Read and create calendar events', kind: 'plugin' },
        { id: 'github', name: 'GitHub', description: 'Interact with GitHub repositories', kind: 'plugin' }
    ];
}

function getFallbackSkills() {
    return [
        { id: 'web-search', name: 'Web Search', description: 'Search the web for information', enabled: true },
        { id: 'file-operations', name: 'File Operations', description: 'Read and write files', enabled: true },
        { id: 'code-execution', name: 'Code Execution', description: 'Execute code in sandboxed environment', enabled: false },
        { id: 'image-generation', name: 'Image Generation', description: 'Generate images using AI models', enabled: false }
    ];
}

// Progress callback for loading screen
let onProgress = null;
export function setProgressCallback(cb) {
    onProgress = cb;
}

function progress(percent, status) {
    if (onProgress) onProgress(percent, status);
}

// Wrap a promise with a timeout
function withTimeout(promise, ms, fallback) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
}

async function waitForGatewayConnected(timeoutMs = 10000) {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
        if (state.connected) return true;
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
}

function normalizeHealthChecks(health) {
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
}

export async function loadUiComponents() {
    const sidebarContainer = document.getElementById('sidebar-container');
    const settingsContainer = document.getElementById('settings-view');
    const connectionContainer = document.getElementById('connection-panel');
    const setupScreen = document.getElementById('setup-screen');

    progress(10, 'Loading sidebar...');

    // Inject sidebar immediately (no async)
    if (sidebarContainer) sidebarContainer.innerHTML = renderSidebar();

    // Inject usage view into viewport (after memory-view)
    const memoryView = document.getElementById('memory-view');
    const settingsView = document.getElementById('settings-view');
    const usageAnchor = settingsView || memoryView;
    if (usageAnchor && !document.getElementById('usage-view')) {
        usageAnchor.insertAdjacentHTML('afterend', renderUsageView());
    }

    progress(20, 'Loading panels...');
    if (connectionContainer) connectionContainer.innerHTML = renderConnectionPanel();

    // Settings data with fast timeouts
    const settingsData = {
        models: [],
        plugins: [],
        channels: [],
        skills: [],
        devices: [],
        cronJobs: [],
        memoryStatus: {},
        healthChecks: []
    };

    progress(30, 'Checking configuration...');

    // Check onboarding status early so fresh users do not trigger heavy engine fetches yet.
    const onboardingComplete = await window.dram.storage.get('dram.onboardingComplete');
    const wsPath = await window.dram.storage.get('settings.workspacePath');

    // Check for ANY configured API key (not just Anthropic)
    const apiKeyAnthropic = await window.dram.storage.get('settings.apiKeyAnthropic');
    const apiKeyOpenAI = await window.dram.storage.get('settings.apiKeyOpenAI');
    const apiKeyGoogle = await window.dram.storage.get('settings.apiKeyGoogle');
    const apiKeyGroq = await window.dram.storage.get('settings.apiKeyGroq');
    const hasApiKey = !!(apiKeyAnthropic || apiKeyOpenAI || apiKeyGoogle || apiKeyGroq);

    console.log('UI: Onboarding check:', redactObject({ onboardingComplete, wsPath, hasApiKey }));

    // Show wizard if onboarding incomplete OR workspace path missing.
    // For fresh users, skip early heavy util fetch and use fallback catalog until setup progresses.
    const needsWizard = !onboardingComplete || !wsPath;

    if (needsWizard) {
        settingsData.models = getFallbackModels();
        settingsData.plugins = getFallbackPlugins();
        settingsData.skills = getFallbackSkills();
        console.log('UI: Fresh onboarding mode - using fallback wizard catalog');
    } else {
        progress(40, 'Fetching configuration...');

        try {
            if (window.dram.util) {
                // Models and Plugins can take time on Windows - give them 15s+
                const results = await Promise.allSettled([
                    withTimeout(window.dram.util.getModels(), 15000, []),
                    withTimeout(window.dram.util.getPlugins(), 15000, []),
                    withTimeout(window.dram.util.getSkills(), 15000, []),
                    withTimeout(window.dram.util.getChannels(), 5000, []),
                    withTimeout(window.dram.util.getDevices(), 5000, []),
                    withTimeout(window.dram.util.getCronJobs(), 5000, []),
                    withTimeout(window.dram.util.getMemoryStatus(), 5000, {}),
                    withTimeout(window.dram.util.getHealth(), 5000, [])
                ]);
                progress(50, 'Loading core data...');
                settingsData.models = results[0].status === 'fulfilled' ? (results[0].value || []) : [];
                settingsData.plugins = results[1].status === 'fulfilled' ? (results[1].value || []) : [];
                settingsData.skills = results[2].status === 'fulfilled' ? (results[2].value || []) : [];
                settingsData.channels = results[3].status === 'fulfilled' ? (results[3].value || []) : [];
                settingsData.devices = results[4].status === 'fulfilled' ? (results[4].value || []) : [];
                settingsData.cronJobs = results[5].status === 'fulfilled' ? (results[5].value || []) : [];
                settingsData.memoryStatus = results[6].status === 'fulfilled' ? (results[6].value || {}) : {};
                const rawHealth = results[7].status === 'fulfilled' ? results[7].value : null;
                settingsData.healthChecks = normalizeHealthChecks(rawHealth);

                console.log('UI: Data fetch complete:', {
                    models: settingsData.models.length,
                    plugins: settingsData.plugins.length,
                    skills: settingsData.skills.length
                });

                // If we got empty results (engine not ready), use fallback data
                if (settingsData.plugins.length === 0) {
                    settingsData.plugins = getFallbackPlugins();
                    console.log('UI: Using fallback plugins:', settingsData.plugins.length);
                }
                if (settingsData.skills.length === 0) {
                    settingsData.skills = getFallbackSkills();
                    console.log('UI: Using fallback skills:', settingsData.skills.length);
                }
            } else {
                console.warn('UI Loader: window.dram.util not available!');
                // Use fallback data
                settingsData.models = getFallbackModels();
                settingsData.plugins = getFallbackPlugins();
                settingsData.skills = getFallbackSkills();
            }
        } catch (e) {
            console.warn('UI: Deferred loading failed, using defaults:', e);
            // Use fallback data
            settingsData.models = getFallbackModels();
            settingsData.plugins = getFallbackPlugins();
            settingsData.skills = getFallbackSkills();
        }
    }

    progress(60, 'Rendering settings...');
    if (settingsContainer) {
        try {
            settingsContainer.innerHTML = renderSettingsPage(settingsData);
        } catch (err) {
            console.error('UI: Failed to render settings page:', err);
            // Fallback to error message in settings view
            settingsContainer.innerHTML = `<div class="modal-error"><h1>Settings Error</h1><pre>${escapeHtml(err.message)}</pre></div>`;
        }
    }

    // Show active skills in hero welcome
    // updateHeroCapabilities(settingsData.skills);

    progress(80, 'Finalizing...');

    if (needsWizard && setupScreen) {
        console.log('UI: Showing wizard - missing config detected');
        try {
            // Step 0: Show "Searching" screen while we check for existing configs
            setupScreen.innerHTML = renderLoadingStep(
                'Searching',
                'Checking for existing configurations...',
                'Scanning system...'
            );
            setupScreen.classList.remove('hidden');
            setupScreen.style.display = 'flex';

            let startStep = 2;
            let wizardState = {};
            let openClawDiscovery = null;

            // Do discovery checks (while showing searching screen)
            const discoveryStart = Date.now();

            // Check for OpenClaw discovery
            try {
                openClawDiscovery = await window.dram.app.discoverOpenClaw();
                console.log('UI: OpenClaw discovery for wizard:', openClawDiscovery);
            } catch (err) {
                console.warn('UI: OpenClaw discovery failed', err);
            }

            // Check for legacy configs
            try {
                const legacyCheck = await window.dram.app.detectLegacyConfig();
                if (legacyCheck.found) {
                    startStep = 1;
                    wizardState = { foundLegacy: true, legacyName: legacyCheck.name };
                }
            } catch (err) {
                console.warn('UI: Legacy check failed', err);
            }

            // Handle OpenClaw installation if needed
            if (openClawDiscovery?.needsInstall) {
                console.log('UI: OpenClaw needs installation');

                // Helper to update progress text
                const updateProgress = (text) => {
                    const progressEl = document.getElementById('loading-progress-text');
                    if (progressEl) {
                        progressEl.textContent = text;
                        progressEl.style.display = 'block';
                    }
                };

                // Show installing screen
                setupScreen.innerHTML = renderLoadingStep(
                    'Installing OpenClaw',
                    'Setting up AI engine...',
                    'Starting installation...'
                );

                await new Promise(r => setTimeout(r, 500));
                updateProgress('Downloading from npm...');

                const installResult = await window.dram.app.installOpenClaw('latest');

                if (installResult.success) {
                    updateProgress('Installation complete!');
                    await new Promise(r => setTimeout(r, 500));

                    // Initialize the engine
                    updateProgress('Starting engine...');
                    const initResult = await window.dram.app.initializeEngine();
                    if (initResult.success) {
                        console.log('UI: Engine initialized after install');
                        await new Promise(r => setTimeout(r, 1500));

                        // Re-discover now that OpenClaw is installed
                        openClawDiscovery = await window.dram.app.discoverOpenClaw();
                        console.log('UI: Re-discovered after install:', openClawDiscovery);

                        // Connect to the gateway so we can fetch real data
                        updateProgress('Connecting to AI engine...');
                        const { connect } = await import('./socket.js');
                        try {
                            await connect();
                            const connected = await waitForGatewayConnected(10000);
                            if (connected) {
                                console.log('UI: Connected to gateway after install');
                            } else {
                                console.warn('UI: Gateway connection still pending after install; continuing with fallback-capable data load');
                            }
                        } catch (connErr) {
                            console.warn('UI: Connection attempt failed:', connErr.message);
                        }

                        // Reload real data from the engine (now connected)
                        updateProgress('Loading AI models...');
                        if (window.dram.util) {
                            const results = await Promise.allSettled([
                                withTimeout(window.dram.util.getModels({ force: true }), 10000, []),
                                withTimeout(window.dram.util.getPlugins(), 10000, []),
                                withTimeout(window.dram.util.getSkills(), 10000, [])
                            ]);
                            settingsData.models = results[0].status === 'fulfilled' ? (results[0].value || []) : [];
                            settingsData.plugins = results[1].status === 'fulfilled' ? (results[1].value || []) : [];
                            settingsData.skills = results[2].status === 'fulfilled' ? (results[2].value || []) : [];
                            console.log('UI: Loaded real data after install:', {
                                models: settingsData.models.length,
                                plugins: settingsData.plugins.length,
                                skills: settingsData.skills.length
                            });
                        }
                    }
                } else {
                    console.error('UI: OpenClaw installation failed:', installResult.error);
                }
            }

            // Ensure minimum "searching" time for UX
            const discoveryTime = Date.now() - discoveryStart;
            const minSearchTime = 1500;
            if (discoveryTime < minSearchTime) {
                console.log('UI: Waiting', minSearchTime - discoveryTime, 'ms');
                await new Promise(r => setTimeout(r, minSearchTime - discoveryTime));
            }

            // Now show the actual first step using centralized logic
            console.log('UI: Launching wizard logic for step', startStep);
            if (typeof window.showDramWizardStep === 'function') {
                window.showDramWizardStep(startStep);
            } else {
                console.error('UI: Wizard logic not available, falling back to manual render');
                const wizardHtml = renderWizard(startStep, settingsData.models, wizardState, settingsData.plugins, settingsData.skills, false, openClawDiscovery);
                setupScreen.innerHTML = wizardHtml;
            }
            console.log('UI: Wizard displayed');
        } catch (err) {
            console.error('UI: Failed to render wizard:', err);
        }
    } else {
        if (setupScreen) {
            setupScreen.classList.add('hidden');
            setupScreen.style.display = 'none';
        }
    }

    progress(90, 'Ready');
    console.log('UI Components injected');
}
