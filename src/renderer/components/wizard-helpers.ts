import { PLUGIN_SETUP_REQUIREMENTS, PLUGIN_INSTALL_ACTIONS } from '../data/plugin-metadata.js';
import { getIcon } from '../modules/icons.js';
import { escapeHtml } from '../modules/utils.js';

export function generateModelOptions(availableModels, selectedId) {
    let html = (!selectedId || selectedId === '')
        ? '<option value="" disabled selected>Select a model...</option>'
        : '<option value="none">None</option>';

    if (!availableModels || availableModels.length === 0) {
        const options = [
            { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash' },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Groq)' },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'ollama', name: 'Local (Ollama)' }
        ];
        html += options.map((option) =>
            `<option value="${escapeHtml(option.id)}" ${option.id === selectedId ? 'selected' : ''}>${escapeHtml(option.name)}</option>`
        ).join('');
        return html;
    }

    const grouped = {};
    availableModels.forEach((model) => {
        let provider = model.provider || 'unknown';
        if (provider === 'unknown' && model.id && model.id.includes('/')) {
            provider = model.id.split('/')[0];
        }
        if (!grouped[provider]) grouped[provider] = [];
        grouped[provider].push(model);
    });

    const priority = ['anthropic', 'openai', 'google', 'groq', 'ollama'];
    const providers = Object.keys(grouped).sort((a, b) => {
        const idxA = priority.indexOf(a);
        const idxB = priority.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    providers.forEach((provider) => {
        html += `<optgroup label="${escapeHtml(provider.toUpperCase())}">`;
        grouped[provider].forEach((model) => {
            html += `<option value="${escapeHtml(model.id)}" ${model.id === selectedId ? 'selected' : ''}>${escapeHtml(model.name || model.id)}</option>`;
        });
        html += '</optgroup>';
    });

    return html;
}

export function renderFallbackRows(wizardState, availableModels) {
    if (!wizardState.fallbacks || wizardState.fallbacks.length === 0) {
        return '<div class="wizard-fallback-empty">No fallbacks configured. Add one to ensure resilience.</div>';
    }
    return wizardState.fallbacks.map((fb, index) => `
        <div class="wizard-fallback-row">
            <select class="mono-input fallback-model-select" data-index="${index}">
                ${generateModelOptions(availableModels, fb.model)}
            </select>
            <input type="password" class="mono-input fallback-api-key" data-index="${index}" placeholder="API Key for ${escapeHtml(String(fb.model || '').split('-')[0].toUpperCase())}..." value="${escapeHtml(fb.apiKey || '')}">
            <button class="tactile-btn sm danger btn-remove-fallback" data-index="${index}">${getIcon('REMOVE')}</button>
        </div>
    `).join('');
}

export function renderPluginList(availablePlugins, wizardState, isEngineReady) {
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

    return sortedPlugins.map((plugin) => {
        const isActive = activePlugins.includes(plugin.id);
        const needsSetup = PLUGIN_SETUP_REQUIREMENTS[plugin.id];
        const isMissing = plugin.status === 'missing';
        const installAction = PLUGIN_INSTALL_ACTIONS && PLUGIN_INSTALL_ACTIONS[plugin.id];
        const canInstall = isMissing && installAction;
        const badge = isMissing ? 'MISSING' : (needsSetup ? 'SETUP' : '');
        const installBtn = canInstall
            ? `<button class="tactile-btn sm secondary wizard-install-btn" data-plugin-id="${escapeHtml(plugin.id)}" data-install-command="${escapeHtml(installAction.command || '')}">Install</button>`
            : '';
        const statusClass = isActive ? 'enabled' : (isMissing ? 'missing' : 'disabled');
        const statusLabel = isMissing ? 'UNSUPPORTED' : (isActive ? 'ENABLED' : 'DISABLED');

        return `
        <div class="plugin-card premium-card ${isActive ? 'active' : ''} ${isMissing ? 'unsupported' : ''} ${isEngineReady ? '' : 'engine-offline'}" data-id="${escapeHtml(plugin.id)}">
            <div class="plugin-card-header">
                <div class="plugin-info">
                    <div class="plugin-name">${escapeHtml(plugin.name)} ${badge ? `<span class="setup-badge">${badge}</span>` : ''}</div>
                    <div class="plugin-version">${escapeHtml(plugin.version || '1.0.0')}</div>
                </div>
                <div class="plugin-controls">
                    ${installBtn}
                    <label class="switch sm">
                        <input type="checkbox" class="plugin-toggle" data-id="${escapeHtml(plugin.id)}" ${isActive ? 'checked' : ''} ${isEngineReady && !isMissing ? '' : 'disabled'}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <div class="plugin-description">${escapeHtml(plugin.description || 'Neural interface extension.')}</div>
            <div class="plugin-footer">
                <div class="plugin-status ${statusClass}">
                    ${statusLabel}
                    ${!isEngineReady ? ' <span class="offline-hint">(OFFLINE)</span>' : ''}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

export function renderSkillsList(availableSkills, wizardState, isEngineReady) {
    if (!availableSkills || availableSkills.length === 0) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">O</div>
                <div class="empty-state-title">Neural Core Isolation</div>
                <div class="empty-state-description">Embedded cognitive toolkits are currently unreachable by the synaptic interface.</div>
            </div>
        `;
    }
    const skillsMap = wizardState.skills || {};
    return availableSkills.map((skill) => {
        const isEnabled = skillsMap[skill.id] !== false;
        return `
        <div class="plugin-card premium-card ${isEnabled ? 'active' : ''} ${isEngineReady ? '' : 'engine-offline'}" data-skill-id="${escapeHtml(skill.id)}">
            <div class="plugin-card-header">
                <div class="plugin-info">
                    <div class="plugin-name">${escapeHtml(skill.name)}</div>
                    <div class="plugin-version">${escapeHtml(skill.version ? `v${skill.version}` : '1.0.0')}</div>
                </div>
                <label class="switch sm">
                    <input type="checkbox" class="skill-toggle" data-skill-id="${escapeHtml(skill.id)}" ${isEnabled ? 'checked' : ''} ${isEngineReady ? '' : 'disabled'}>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="plugin-description">${escapeHtml(skill.description || 'Neural capability extension.')}</div>
            <div class="plugin-footer">
                <div class="plugin-status ${isEnabled ? 'enabled' : 'disabled'}">
                    ${isEnabled ? 'ENABLED' : 'DISABLED'}
                    ${!isEngineReady ? ' <span class="offline-hint">(OFFLINE)</span>' : ''}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

export function getPluginsNeedingSetup(wizardState) {
    const activePlugins = wizardState.plugins || [];
    return activePlugins.filter((id) => PLUGIN_SETUP_REQUIREMENTS[id]);
}

export function hasPluginsNeedingSetup(wizardState) {
    return getPluginsNeedingSetup(wizardState).length > 0;
}

export function renderPluginSetup(wizardState, availablePlugins) {
    const pluginsNeedingSetup = getPluginsNeedingSetup(wizardState);
    if (pluginsNeedingSetup.length === 0) {
        return `<div class="wizard-setup-complete">
            <div class="setup-check">OK</div>
            <div class="setup-message">All selected plugins are ready to use!</div>
            <div class="setup-hint">No additional configuration required.</div>
        </div>`;
    }

    const pluginConfigs = wizardState.pluginConfigs || {};
    return pluginsNeedingSetup.map((pluginId) => {
        const req = PLUGIN_SETUP_REQUIREMENTS[pluginId];
        const plugin = availablePlugins.find((p) => p.id === pluginId) || { name: pluginId };
        const config = pluginConfigs[pluginId] || {};
        const safeId = String(pluginId).replace(/[^a-z0-9_-]/gi, '-');

        let fieldsHtml = '';
        if (req.type === 'oauth') {
            fieldsHtml = `
                <button class="tactile-btn secondary oauth-btn" data-plugin="${escapeHtml(pluginId)}" data-provider="${escapeHtml(req.provider)}">
                    Connect ${escapeHtml(req.provider)}
                </button>
                <div class="oauth-status ${config.connected ? 'connected' : ''}" id="oauth-status-${escapeHtml(pluginId)}">
                    ${config.connected ? '[OK] Connected' : '[--] Not connected'}
                </div>
            `;
        } else if (req.type === 'token') {
            const value = config.token || '';
            fieldsHtml = `
                <input type="password" class="mono-input plugin-config-input"
                       data-plugin="${escapeHtml(pluginId)}" data-field="token"
                       placeholder="${escapeHtml(req.placeholder)}" value="${escapeHtml(value)}">
            `;
        } else if (req.type === 'multi') {
            fieldsHtml = req.fields.map((field) => {
                const value = config[field.key] || '';
                const inputType = field.isSecret ? 'password' : 'text';
                return `
                    <div class="plugin-field">
                        <label class="mono-label sm">${escapeHtml(field.label)}</label>
                        <input type="${inputType}" class="mono-input plugin-config-input"
                               data-plugin="${escapeHtml(pluginId)}" data-field="${escapeHtml(field.key)}"
                               placeholder="${escapeHtml(field.placeholder)}" value="${escapeHtml(value)}">
                    </div>
                `;
            }).join('');
        } else if (req.type === 'file') {
            const extraFields = Array.isArray(req.fields)
                ? req.fields.map((field) => {
                    const value = config[field.key] || '';
                    const inputType = field.isSecret ? 'password' : 'text';
                    return `
                    <div class="plugin-field">
                        <label class="mono-label sm">${escapeHtml(field.label)}</label>
                        <input type="${inputType}" class="mono-input plugin-config-input"
                               data-plugin="${escapeHtml(pluginId)}" data-field="${escapeHtml(field.key)}"
                               placeholder="${escapeHtml(field.placeholder || '')}" value="${escapeHtml(value)}">
                    </div>
                    `;
                }).join('')
                : '';
            fieldsHtml = `
                <button class="tactile-btn secondary wizard-file-upload-btn" data-plugin="${escapeHtml(pluginId)}">
                    Upload ${escapeHtml(req.label)}
                </button>
                <div class="file-status" id="wizard-file-status-${escapeHtml(safeId)}">
                    ${config.fileName ? `[OK] ${escapeHtml(config.fileName)}` : '[--] No file selected'}
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
}

export function renderOpenClawSummary(openClawDiscovery) {
    if (!openClawDiscovery || !openClawDiscovery.found) {
        return '';
    }

    const cfg = openClawDiscovery.config || {};
    const defaults = cfg.agents?.defaults || {};
    const model = defaults.model || {};
    const envVars = cfg.env?.vars || {};
    const plugins = cfg.plugins?.entries || {};

    const hasKeys = Object.keys(envVars).some((key) => key.includes('API_KEY'));
    const pluginCount = Object.keys(plugins).filter((key) => plugins[key].enabled !== false).length;
    const fallbackCount = (model.fallbacks || []).length;

    return `
        <div class="openclaw-summary">
            <div class="summary-header">
                <div class="summary-icon">OC</div>
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
                    <div class="section-value ${hasKeys ? 'success' : 'warning'}">${hasKeys ? 'Configured' : 'Not configured'}</div>
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
}







