import { PLUGIN_SETUP_REQUIREMENTS, PLUGIN_INSTALL_ACTIONS } from '../../data/plugin-metadata.js';
import { getIcon } from '../modules/icons.js';
import { escapeHtml } from '../modules/utils.js';

export function renderWizard(step = 1, availableModels = [], wizardState = {}, availablePlugins = [], availableSkills = [], isEngineReady = true, openClawDiscovery = null) {

    const generateModelOptions = (selectedId) => {
        // If no model selected, show placeholder, otherwise include None option
        let html = (!selectedId || selectedId === '')
            ? '<option value="" disabled selected>Select a model...</option>'
            : '<option value="none">None</option>';
        if (!availableModels || availableModels.length === 0) {
            // Static options if dynamic load fails
            const options = [
                { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
                { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash' },
                { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Groq)' },
                { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
                { id: 'gpt-4o', name: 'GPT-4o' },
                { id: 'ollama', name: 'Local (Ollama)' }
            ];
            html += options.map(o => `<option value="${escapeHtml(o.id)}" ${o.id === selectedId ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('');
            return html;
        }

        // Group by provider
        const grouped = {};
        availableModels.forEach(m => {
            let p = m.provider || 'unknown';
            if (p === 'unknown' && m.id && m.id.includes('/')) {
                p = m.id.split('/')[0];
            }
            if (!grouped[p]) grouped[p] = [];
            grouped[p].push(m);
        });

        // specific provider order
        const priority = ['anthropic', 'openai', 'google', 'groq', 'ollama'];
        const providers = Object.keys(grouped).sort((a, b) => {
            const idxA = priority.indexOf(a);
            const idxB = priority.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        providers.forEach(p => {
            html += `<optgroup label="${escapeHtml(p.toUpperCase())}">`;
            grouped[p].forEach(m => {
                html += `<option value="${escapeHtml(m.id)}" ${m.id === selectedId ? 'selected' : ''}>${escapeHtml(m.name || m.id)}</option>`;
            });
            html += '</optgroup>';
        });

        return html;
    };

    const renderFallbackRows = () => {
        if (!wizardState.fallbacks || wizardState.fallbacks.length === 0) {
            return '<div class="wizard-fallback-empty">No fallbacks configured. Add one to ensure resilience.</div>';
        }
        return wizardState.fallbacks.map((fb, index) => `
            <div class="wizard-fallback-row">
                <select class="mono-input fallback-model-select" data-index="${index}">
                    ${generateModelOptions(fb.model)}
                </select>
                <input type="password" class="mono-input fallback-api-key" data-index="${index}" placeholder="API Key for ${escapeHtml(String(fb.model || '').split('-')[0].toUpperCase())}..." value="${escapeHtml(fb.apiKey || '')}">
                <button class="tactile-btn sm danger btn-remove-fallback" data-index="${index}">${getIcon('REMOVE')}</button>
            </div>
        `).join('');
    };

    const renderPluginList = () => {
        if (!availablePlugins || availablePlugins.length === 0) {
            return '<div class="muted">No plugins found.</div>';
        }
        const activePlugins = wizardState.plugins || [];
        const sortedPlugins = [...availablePlugins].sort((a, b) => {
            const aActive = activePlugins.includes(a.id);
            const bActive = activePlugins.includes(b.id);
            if (aActive !== bActive) return aActive ? -1 : 1;
            const aName = (a.name || a.id || '').toLowerCase();
            const bName = (b.name || b.id || '').toLowerCase();
            return aName.localeCompare(bName);
        });
        return sortedPlugins.map(p => {
            const isActive = activePlugins.includes(p.id);
            const needsSetup = PLUGIN_SETUP_REQUIREMENTS[p.id];
            const isMissing = p.status === 'missing';
            const installAction = PLUGIN_INSTALL_ACTIONS && PLUGIN_INSTALL_ACTIONS[p.id];
            const canInstall = isMissing && installAction;
            const badge = isMissing ? 'MISSING' : (needsSetup ? 'SETUP' : '');
            const installBtn = canInstall
                ? `<button class="tactile-btn sm secondary wizard-install-btn" data-plugin-id="${escapeHtml(p.id)}" data-install-command="${escapeHtml(installAction.command || '')}">Install</button>`
                : '';
            const statusClass = isActive ? 'enabled' : (isMissing ? 'missing' : 'disabled');
            const statusLabel = isMissing ? 'UNSUPPORTED' : (isActive ? 'ENABLED' : 'DISABLED');
            return `
            <div class="plugin-card premium-card ${isActive ? 'active' : ''} ${isMissing ? 'unsupported' : ''} ${isEngineReady ? '' : 'engine-offline'}" data-id="${escapeHtml(p.id)}">
                <div class="plugin-card-header">
                    <div class="plugin-info">
                        <div class="plugin-name">${escapeHtml(p.name)} ${badge ? `<span class="setup-badge">${badge}</span>` : ''}</div>
                        <div class="plugin-version">${escapeHtml(p.version || '1.0.0')}</div>
                    </div>
                    <div class="plugin-controls">
                        ${installBtn}
                        <label class="switch sm">
                            <input type="checkbox" class="plugin-toggle" data-id="${escapeHtml(p.id)}" ${isActive ? 'checked' : ''} ${isEngineReady && !isMissing ? '' : 'disabled'}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                <div class="plugin-description">${escapeHtml(p.description || 'Neural interface extension.')}</div>
                <div class="plugin-footer">
                    <div class="plugin-status ${statusClass}">
                        ${statusLabel}
                        ${!isEngineReady ? ' <span class="offline-hint">(OFFLINE)</span>' : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    };

    const renderSkillsList = () => {
        if (!availableSkills || availableSkills.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">Ø</div>
                    <div class="empty-state-title">Neural Core Isolation</div>
                    <div class="empty-state-description">Embedded cognitive toolkits are currently unreachable by the synaptic interface.</div>
                </div>
            `;
        }
        const skillsMap = wizardState.skills || {};
        return availableSkills.map(sk => {
            const isEnabled = skillsMap[sk.id] !== false; // Default to true if not explicitly false
            return `
            <div class="plugin-card premium-card ${isEnabled ? 'active' : ''} ${isEngineReady ? '' : 'engine-offline'}" data-skill-id="${escapeHtml(sk.id)}">
                <div class="plugin-card-header">
                    <div class="plugin-info">
                        <div class="plugin-name">${escapeHtml(sk.name)}</div>
                        <div class="plugin-version">${escapeHtml(sk.version ? `v${sk.version}` : '1.0.0')}</div>
                    </div>
                    <label class="switch sm">
                        <input type="checkbox" class="skill-toggle" data-skill-id="${escapeHtml(sk.id)}" ${isEnabled ? 'checked' : ''} ${isEngineReady ? '' : 'disabled'}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="plugin-description">${escapeHtml(sk.description || 'Neural capability extension.')}</div>
                <div class="plugin-footer">
                    <div class="plugin-status ${isEnabled ? 'enabled' : 'disabled'}">
                        ${isEnabled ? 'ENABLED' : 'DISABLED'}
                        ${!isEngineReady ? ' <span class="offline-hint">(OFFLINE)</span>' : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    };

    // Get plugins that need setup from selected plugins
    const getPluginsNeedingSetup = () => {
        const activePlugins = wizardState.plugins || [];
        return activePlugins.filter(id => PLUGIN_SETUP_REQUIREMENTS[id]);
    };

    const renderPluginSetup = () => {
        const pluginsNeedingSetup = getPluginsNeedingSetup();

        if (pluginsNeedingSetup.length === 0) {
            return `<div class="wizard-setup-complete">
                <div class="setup-check">?</div>
                <div class="setup-message">All selected plugins are ready to use!</div>
                <div class="setup-hint">No additional configuration required.</div>
            </div>`;
        }

        const pluginConfigs = wizardState.pluginConfigs || {};

        return pluginsNeedingSetup.map(pluginId => {
            const req = PLUGIN_SETUP_REQUIREMENTS[pluginId];
            const plugin = availablePlugins.find(p => p.id === pluginId) || { name: pluginId };
            const config = pluginConfigs[pluginId] || {};
            const safeId = String(pluginId).replace(/[^a-z0-9_-]/gi, '-');

            let fieldsHtml = '';

            if (req.type === 'oauth') {
                fieldsHtml = `
                    <button class="tactile-btn secondary oauth-btn" data-plugin="${escapeHtml(pluginId)}" data-provider="${escapeHtml(req.provider)}">
                        Connect ${escapeHtml(req.provider)}
                    </button>
                    <div class="oauth-status ${config.connected ? 'connected' : ''}" id="oauth-status-${escapeHtml(pluginId)}">
                        ${config.connected ? '[?] Connected' : '[--] Not connected'}
                    </div>
                `;
            } else if (req.type === 'token') {
                const val = config.token || '';
                fieldsHtml = `
                    <input type="password" class="mono-input plugin-config-input"
                           data-plugin="${escapeHtml(pluginId)}" data-field="token"
                           placeholder="${escapeHtml(req.placeholder)}" value="${escapeHtml(val)}">
                `;
            } else if (req.type === 'multi') {
                fieldsHtml = req.fields.map(field => {
                    const val = config[field.key] || '';
                    const inputType = field.isSecret ? 'password' : 'text';
                    return `
                        <div class="plugin-field">
                            <label class="mono-label sm">${escapeHtml(field.label)}</label>
                            <input type="${inputType}" class="mono-input plugin-config-input"
                                   data-plugin="${escapeHtml(pluginId)}" data-field="${escapeHtml(field.key)}"
                                   placeholder="${escapeHtml(field.placeholder)}" value="${escapeHtml(val)}">
                        </div>
                    `;
                }).join('');
            } else if (req.type === 'file') {
                const extraFields = Array.isArray(req.fields)
                    ? req.fields.map(field => {
                        const val = config[field.key] || '';
                        const inputType = field.isSecret ? 'password' : 'text';
                        return `
                        <div class="plugin-field">
                            <label class="mono-label sm">${escapeHtml(field.label)}</label>
                            <input type="${inputType}" class="mono-input plugin-config-input"
                                   data-plugin="${escapeHtml(pluginId)}" data-field="${escapeHtml(field.key)}"
                                   placeholder="${escapeHtml(field.placeholder || '')}" value="${escapeHtml(val)}">
                        </div>
                        `;
                    }).join('')
                    : '';
                fieldsHtml = `
                    <button class="tactile-btn secondary wizard-file-upload-btn" data-plugin="${escapeHtml(pluginId)}">
                        Upload ${escapeHtml(req.label)}
                    </button>
                    <div class="file-status" id="wizard-file-status-${escapeHtml(safeId)}">
                        ${config.fileName ? `[?] ${escapeHtml(config.fileName)}` : '[--] No file selected'}
                    </div>
                    ${extraFields}
                `;
            } else if (req.type === 'qrcode') {
                fieldsHtml = `
                    <div class="wizard-qr-wrap" data-plugin="${escapeHtml(pluginId)}">
                        <div class="wizard-qr-container" id="wizard-qr-${escapeHtml(safeId)}">
                            <span class="muted">Click "Generate QR" to link</span>
                        </div>
                        <div class="wizard-qr-status" id="wizard-qr-status-${escapeHtml(safeId)}"></div>
                        <button class="tactile-btn secondary wizard-qr-btn" data-plugin="${escapeHtml(pluginId)}">Generate QR</button>
                    </div>
                `;
            } else if (req.type === 'cli') {
                const cliBtn = req.cliCommand
                    ? `
                        <button class="tactile-btn secondary wizard-cli-btn"
                                data-plugin="${escapeHtml(pluginId)}"
                                data-cli-command="${escapeHtml(req.cliCommand)}">
                            ${escapeHtml(req.cliLabel || 'Run Setup')}
                        </button>
                        <div class="wizard-cli-status" id="wizard-cli-status-${escapeHtml(safeId)}"></div>
                    `
                    : '';
                fieldsHtml = `
                    <div class="cli-setup-notice">
                        <div class="cli-notice-icon">${getIcon('FILE_TEXT')}</div>
                        <div class="cli-notice-text">External Setup</div>
                    </div>
                    ${cliBtn}
                `;
            }

            return `
                <div class="plugin-setup-card" data-plugin="${escapeHtml(pluginId)}">
                    <div class="plugin-setup-header">
                        <div class="plugin-setup-name">${escapeHtml(plugin.name)}</div>
                    </div>
                    <div class="plugin-setup-instructions">${escapeHtml(req.instructions)}</div>
                    <div class="plugin-setup-fields">
                        ${fieldsHtml}
                    </div>
                </div>
            `;
        }).join('');
    };

    // Check if we should show the plugin setup step
    const hasPluginsNeedingSetup = () => getPluginsNeedingSetup().length > 0;

    // Helper to render OpenClaw discovery summary
    const renderOpenClawSummary = () => {
        if (!openClawDiscovery || !openClawDiscovery.found) return '';

        const cfg = openClawDiscovery.config || {};
        const defaults = cfg.agents?.defaults || {};
        const model = defaults.model || {};
        const envVars = cfg.env?.vars || {};
        const plugins = cfg.plugins?.entries || {};

        const hasKeys = Object.keys(envVars).some(k => k.includes('API_KEY'));
        const pluginCount = Object.keys(plugins).filter(k => plugins[k].enabled !== false).length;
        const fallbackCount = (model.fallbacks || []).length;

        return `
            <div class="openclaw-summary">
                <div class="summary-header">
                    <div class="summary-icon">◈</div>
                    <div class="summary-title">OpenClaw Detected</div>
                    <div class="summary-version">v${escapeHtml(openClawDiscovery.version || 'unknown')}</div>
                </div>
                <div class="summary-location">${escapeHtml(openClawDiscovery.configPath || '')}</div>
                
                <div class="summary-sections">
                    <div class="summary-section">
                        <div class="section-label">MODEL</div>
                        <div class="section-value primary">${escapeHtml(model.primary || 'Not set')}</div>
                        ${fallbackCount > 0 ? `<div class="section-value secondary">+ ${fallbackCount} fallback${fallbackCount > 1 ? 's' : ''}</div>` : ''}
                    </div>
                    
                    <div class="summary-section">
                        <div class="section-label">API KEYS</div>
                        <div class="section-value ${hasKeys ? 'success' : 'warning'}">${hasKeys ? '● Configured' : '○ Not configured'}</div>
                    </div>
                    
                    <div class="summary-section">
                        <div class="section-label">PLUGINS</div>
                        <div class="section-value">${pluginCount} enabled</div>
                    </div>
                    
                    <div class="summary-section">
                        <div class="section-label">WORKSPACE</div>
                        <div class="section-value truncate">${escapeHtml(defaults.workspace || 'Not set')}</div>
                    </div>
                </div>
            </div>
        `;
    };

    const steps = [
        // Step 0: OpenClaw Detection (shown only when detected)
        ...(openClawDiscovery?.found ? [{
            title: 'OPENCLAW // DETECTED',
            subtitle: 'Existing Installation Found',
            content: 'We found an existing OpenClaw installation on your system. You can import these settings or start fresh.',
            btn: 'Import & Enhance',
            html: `
            ${renderOpenClawSummary()}
            <div class="wizard-migration-choices">
                <button class="tactile-btn block secondary" id="btn-wizard-fresh">Start Fresh (Ignore Existing)</button>
            </div>
            `
        }] : []),
        // Step 0.5: Legacy Migration (old Moltbot/Clawdbot)
        {
            title: 'MIGRATION // DETECTED',
            subtitle: 'Previous Configuration',
            content: `A configuration from ${escapeHtml(wizardState.legacyName || 'a previous installation')} has been detected. Would you like to migrate these settings?`,
            btn: 'Migrate Settings',
            skip: !wizardState.foundLegacy,
            html: `
            <div class="wizard-migration-choices">
                <div class="migration-summary">
                    <div class="summary-item"><span>MODEL:</span> <strong>${escapeHtml(wizardState.model || 'Detected')}</strong></div>
                    <div class="summary-item"><span>WORKSPACE:</span> <strong>${escapeHtml(wizardState.workspacePath || 'Detected')}</strong></div>
                    <div class="summary-item"><span>PLUGINS:</span> <strong>${(wizardState.plugins || []).length} Detected</strong></div>
                </div>
                <button class="tactile-btn block secondary" id="btn-wizard-fresh">No, start with a fresh install</button>
            </div>
            `
        },
        {
            title: 'GENERAL // SYSTEM',
            subtitle: 'Neural Link Initialization',
            content: 'Establish your neural link. DRAM will connect to the local OpenClaw gateway to enable AI capabilities.',
            layout: 'handshake',
            btn: 'Initialize Protocol',
            html: `
            <div class="wizard-sync-shell premium-card">
                <div class="wizard-sync-shell__header">
                    <div class="wizard-sync-shell__title">Gateway Link</div>
                    <div class="wizard-sync-shell__state offline" id="wizard-sync-state">Offline</div>
                </div>
                <div class="wizard-sync-status" id="wizard-sync-status">
                    <div class="sync-indicator offline" id="wizard-indicator"></div>
                    <div class="sync-msg" id="wizard-sync-msg">Awaiting Handshake...</div>
                </div>
                <div class="wizard-sync-shell__hint">Waiting for local OpenClaw gateway on <span>ws://127.0.0.1:18789</span></div>
            </div>
            `
        },
        {
            title: 'INTELLIGENCE // MODEL',
            subtitle: 'Primary Intelligence Core',
            content: 'Select your main intelligence core. This engine will handle the majority of reasoning tasks and tool orchestrations.',
            html: `
            <div class="wizard-input-group">
                <label class="mono-label">PRIMARY MODEL</label>
                <select id="wizard-model-select" class="mono-input">
                    ${generateModelOptions(wizardState.model)}
                </select>
            </div>
            `,
            btn: 'Confirm Primary'
        },
        {
            title: 'INTELLIGENCE // AUTH',
            subtitle: 'Primary Access Key',
            content: 'Enter credentials for your primary engine. Your data is protected in the local encrypted neural vault.',
            html: `
            <div class="wizard-input-group">
                <label class="mono-label" id="wizard-key-label">API KEY</label>
                
                <div class="setting-control wide key-field-container" data-target="wizard-api-key" style="margin-top: 8px;">
                    <div class="key-input-wrapper">
                        <input type="password" id="wizard-api-key" class="mono-input secure-key-input ${wizardState.apiKey ? 'hidden' : ''}" placeholder="sk-..." value="${wizardState.apiKey ? '' : ''}" ${wizardState.apiKey ? 'readonly' : ''}>
                        <div class="key-status-dots ${wizardState.apiKey ? '' : 'hidden'}">••••••••••••••••••••••••</div>
                    </div>
                    <div class="key-actions">
                        <button class="tactile-btn sm secondary btn-edit-key ${wizardState.apiKey ? '' : 'hidden'}" data-target="wizard-api-key">Change</button>
                        <button class="tactile-btn sm primary btn-save-key ${wizardState.apiKey ? 'hidden' : ''}" data-target="wizard-api-key">Validate</button>
                    </div>
                </div>
                
                <div class="api-key-status" id="api-key-status" style="margin-top: 8px;"></div>
            </div>
            `,
            btn: 'Continue to Fallbacks'
        },
        {
            title: 'INTELLIGENCE // FALLBACKS',
            subtitle: 'Fallback Matrix',
            content: 'Configure a chain of fallback engines. DRAM will attempt to use these sequentially if the primary core fails or is rate-limited.',
            html: `
            <div class="wizard-input-group">
                <label class="mono-label">FALLBACK CHAIN</label>
                <div id="wizard-fallbacks-container">
                    ${renderFallbackRows()}
                </div>
                <button class="tactile-btn block secondary" id="btn-add-fallback">+ Add Fallback Engine</button>
            </div>
            `,
            btn: 'Configure Workspace'
        },
        {
            title: 'GENERAL // WORKSPACE',
            subtitle: 'Memory Layer',
            content: 'Point DRAM to your workspace. This folder should contain your SOUL.md and AGENTS.md files for personalized context.',
            html: `
            <div class="wizard-input-group">
                <label class="mono-label">WORKSPACE ROOT</label>
                <div class="input-with-btn">
                    <input type="text" id="wizard-workspace-path" class="mono-input" placeholder="[Documents Folder]/DRAM" value="${escapeHtml(wizardState.workspacePath || '')}">
                    <button class="tactile-btn sm" id="btn-wizard-browse">Browse</button>
                </div>
            </div>
            `,
            btn: 'Launch & Connect'
        },
        // Step 7: Security (previously step 8)
        {
            title: 'SYSTEM // SECURITY',
            subtitle: 'Gateway Protection',
            content: 'Your DRAM engine is protected by a cryptographically secure token. This ensures only authorized local clients can access the neural core.',
            html: `
            <div class="wizard-input-group">
                <div class="label-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <label class="mono-label" style="margin: 0;">SECURE TOKEN</label>
                    <span class="security-badge-sm" style="color: var(--success); font-size: 10px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        ${getIcon('CHECK')}
                        ENCRYPTED VAULT
                    </span>
                </div>
                <div class="api-key-input-wrapper" style="position: relative; display: flex; align-items: center;">
                    <div class="input-icon-left" style="position: absolute; left: 12px; color: var(--success);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <input type="password" id="wizard-gateway-token" class="mono-input" readonly value="${escapeHtml(wizardState.gatewayToken || 'Generating...')}" style="padding-left: 36px; padding-right: 50px; font-family: var(--font-mono); letter-spacing: 1px; font-size: 12px; height: 42px;">
                    <button type="button" id="btn-toggle-token" class="toggle-visibility-btn" style="position: absolute; right: 0; top: 0; bottom: 0; padding: 0 12px; background: none; border: none; color: var(--text-tertiary); cursor: pointer; font-size: 11px; font-weight: 500;">SHOW</button>
                </div>
                <div class="muted sm" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                     <div style="width: 4px; height: 4px; background: var(--text-tertiary); border-radius: 50%;"></div>
                     <span>Stored securely in operating system keychain</span>
                </div>
            </div>
            `,
            btn: 'Configure Extensions'
        },
        // Step 8: Integrations
        {
            title: 'EXTENSIONS // INTEGRATIONS',
            subtitle: 'Integration Registry',
            content: 'Enable external connections for your agent. These integrations provide communication channels and platform access.',
            html: `
            <div class="plugin-grid compact wizard-plugin-grid" id="wizard-plugin-list">
                ${renderPluginList()}
            </div>
            `,
            btn: 'Continue Setup'
        },
        // Step 9: Setup
        {
            title: 'EXTENSIONS // SETUP',
            subtitle: 'Channel Configuration',
            content: 'Configure the plugins you selected. Some integrations require authentication or API credentials.',
            html: `
            <div class="wizard-plugin-setup" id="wizard-plugin-setup">
                ${renderPluginSetup()}
            </div>
            `,
            btn: 'Configure Skills',
            skip: !hasPluginsNeedingSetup()
        },
        // Step 10: Skills
        {
            title: 'EXTENSIONS // SKILLS',
            subtitle: 'Neural Skills',
            content: "Enable specialized skills to extend DRAM's capabilities. These provide additional tools and behaviors.",
            html: `
            <div class="plugin-grid compact wizard-plugin-grid" id="wizard-skills-list">
                ${renderSkillsList()}
            </div>
            `,
            btn: 'Finalize Setup'
        },
        // Step 11: Local Voice
        {
            title: 'SYSTEM // VOICE',
            subtitle: 'Local Neural Transcription',
            content: 'DRAM can use a local neural engine for private, real-time voice transcription. This avoids sending your voice data to external APIs.',
            html: `
            <div class="wizard-setup-status" id="voice-setup-status">
                <div class="status-indicator" id="voice-indicator">
                    <div class="spinner"></div>
                </div>
                <div class="status-msg" id="voice-setup-msg">Initializing local voice engine...</div>
                <div class="status-detail" id="voice-setup-detail">This may take a minute to download models (approx 150MB).</div>
            </div>
            `,
            btn: 'Complete Onboarding'
        }
    ];

    const s = steps[step - 1];

    // Add connectivity warning to extension steps if offline
    // Dynamic offset based on OpenClaw step presence
    const offset = (openClawDiscovery?.found) ? 1 : 0;
    const extensionSteps = [8 + offset, 9 + offset, 10 + offset]; // Integrations, Setup, Skills

    if (!isEngineReady && extensionSteps.includes(step)) {
        s.html = `
        <div class="wizard-engine-warning">
            <div class="warning-icon">${getIcon('WARNING')}</div>
            <div class="warning-text">Extension management is disabled because the neural gateway is offline. You can proceed to finish the setup and enable these later.</div>
        </div>
        ` + s.html;
    }

    const totalSteps = steps.length;
    const isExtensionLayoutStep = extensionSteps.includes(step);
    const isHandshakeLayoutStep = s.layout === 'handshake';
    const contentClass = `wizard-content${isExtensionLayoutStep ? ' wizard-content-wide' : ''}${isHandshakeLayoutStep ? ' wizard-content-handshake' : ''}`;
    const bodyClass = `wizard-body${isExtensionLayoutStep ? ' wizard-body-expanded' : ''}${isHandshakeLayoutStep ? ' wizard-body-center' : ''}`;
    const headerClass = `wizard-header${isHandshakeLayoutStep ? ' wizard-header-handshake' : ''}`;
    const footerClass = `wizard-footer${isExtensionLayoutStep ? ' wizard-footer-compact' : ''}${isHandshakeLayoutStep ? ' wizard-footer-handshake' : ''}`;

    return `
    <div class="setup-drag-region"></div>
    <div class="wizard-modal">
        <div class="${contentClass}">
            <div class="${headerClass}">
                <div class="wizard-step-indicator">STEP ${String(step).padStart(2, '0')} // ${String(totalSteps).padStart(2, '0')}</div>
                <h1 class="wizard-title">${s.title.split(' // ').map((part, i) => i === 1 ? `<span class="accent">${part}</span>` : part).join(' <span class="sep">//</span> ')}</h1>
                <p class="wizard-subtitle">${s.subtitle}</p>
            </div>
            <div class="${bodyClass}">
                <p class="wizard-text">${s.content}</p>
                ${s.html || ''}
            </div>
            <div class="${footerClass}">
                <div class="wizard-progress">
                    ${steps.map((_, i) => `<div class="progress-dot ${step === (i + 1) ? 'active' : ''}"></div>`).join('')}
                </div>
                <button class="tactile-btn primary" id="btn-wizard-next" data-step="${step}">${s.btn}</button>
            </div>
        </div>
    </div>
    `;
}




/**
 * Render a loading state for the wizard
 * Used during OpenClaw discovery and installation
 */
export function renderLoadingStep(title, subtitle = '', progressText = '') {
    return `
    <div class="setup-drag-region"></div>
    <div class="wizard-modal">
        <div class="wizard-content">
            <div class="wizard-body" style="display: flex; align-items: center; justify-content: center;">
                <div class="wizard-loading-state">
                    <div class="wizard-spinner"></div>
                    <div class="wizard-loading-title">${escapeHtml(title)}</div>
                    ${subtitle ? `<div class="wizard-loading-subtitle">${escapeHtml(subtitle)}</div>` : ''}
                    ${progressText ? `<div class="wizard-loading-progress-text" id="loading-progress-text">${escapeHtml(progressText)}</div>` : '<div class="wizard-loading-progress-text" id="loading-progress-text" style="display: none;"></div>'}
                </div>
            </div>
        </div>
    </div>
    `;
}
