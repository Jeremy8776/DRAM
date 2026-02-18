/**
 * Plugins Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';
import { PLUGIN_SETUP_REQUIREMENTS, PLUGIN_INSTALL_ACTIONS } from '../../../data/plugin-metadata.js';

/**
 * Render plugins grid with toggle switches
 */
export function renderPluginsGrid(plugins, configMap = {}) {
    if (!plugins || plugins.length === 0) {
        return renderEmptyState({
            id: 'plugin-empty',
            icon: '∑',
            title: 'Neural Matrix Isolated',
            description: 'External communication uplink modules are currently disconnected.'
        });
    }

    const sortedPlugins = [...plugins].sort((a, b) => {
        const aEnabled = a.enabled === true;
        const bEnabled = b.enabled === true;
        if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
        const aName = (a.name || a.id || '').toLowerCase();
        const bName = (b.name || b.id || '').toLowerCase();
        return aName.localeCompare(bName);
    });

    return `
        <div class="plugin-grid compact" id="plugin-registry">
            ${sortedPlugins.map(pl => {
        const isEnabled = pl.enabled;
        const isMissing = pl.status === 'missing';
        const hasSetup = PLUGIN_SETUP_REQUIREMENTS && PLUGIN_SETUP_REQUIREMENTS[pl.id];
        const installAction = PLUGIN_INSTALL_ACTIONS && PLUGIN_INSTALL_ACTIONS[pl.id];
        const canInstall = isMissing && installAction;
        const configured = hasSetup ? configMap[pl.id] === true : false;
        // In embedded mode, plugins are available via IPC even without WebSocket
        // Check if engine is actually initialized rather than just WebSocket state
        const isOffline = false; // Plugins work via IPC bridge regardless of WebSocket

        return `
                    <div class="plugin-card premium-card ${isEnabled ? 'active' : ''} ${isMissing ? 'unsupported' : ''} ${isOffline ? 'engine-offline' : ''}" data-plugin-id="${escapeHtml(pl.id)}">
                        <div class="plugin-card-header">
                            <div class="plugin-info">
                                <div class="plugin-name">${escapeHtml(pl.name)}</div>
                                <div class="plugin-version">${escapeHtml(pl.version || '1.0.0')}</div>
                            </div>
                                <div class="plugin-controls">
                                ${canInstall
                ? `<button class="tactile-btn sm secondary plugin-install-btn" data-plugin-id="${escapeHtml(pl.id)}" data-install-command="${escapeHtml(installAction.command || '')}">Install</button>`
                : ''}
                                ${hasSetup && !isMissing ?
                `<button class="tactile-btn sm secondary plugin-config-btn ${configured ? 'configured' : ''}" data-plugin-id="${escapeHtml(pl.id)}" ${isOffline ? 'disabled' : ''} title="${configured ? 'Configured — click to reconfigure' : 'Configure this plugin'}">${configured ? 'Configured' : 'Configure'}</button>`
                : ''}
                                <label class="switch sm">
                                    <input type="checkbox" class="plugin-toggle" data-plugin-id="${escapeHtml(pl.id)}" ${isEnabled ? 'checked' : ''} ${isOffline || isMissing ? 'disabled' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>
                        <div class="plugin-description">${escapeHtml(pl.description || 'Neural interface extension.')}</div>
                        <div class="plugin-footer">
                            <div class="plugin-status ${isEnabled ? 'enabled' : (isMissing ? 'missing' : 'disabled')}">
                                ${isMissing ? 'UNSUPPORTED' : (isEnabled ? 'ENABLED' : 'DISABLED')}
                                ${isOffline ? ' <span class="offline-hint">(OFFLINE)</span>' : ''}
                            </div>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

/**
 * Render plugins tab
 */
export function renderPluginsTab(plugins) {
    return `
        <div id="tab-plugins" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Neural Integrations',
        subtitle: 'Synergize DRAM with external communication networks.',
        content: renderPluginsGrid(plugins)
    })}
        </div>
    `;
}

/**
 * Update plugins grid in DOM
 */
export async function updatePluginsList(plugins) {
    const container = document.getElementById('plugin-registry') || document.getElementById('plugin-empty');
    if (!container) return;

    let configMap = {};
    try {
        configMap = await buildPluginConfigMap(plugins);
    } catch (err) {
        console.error('Failed to load plugin configuration status', err);
    }
    const newHtml = renderPluginsGrid(plugins, configMap);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtml;

    const newGrid = tempDiv.querySelector('.plugin-grid') || tempDiv.querySelector('.empty-state');
    if (newGrid) {
        container.replaceWith(newGrid);
    }
}

async function buildPluginConfigMap(plugins) {
    const configMap = {};
    if (!plugins || plugins.length === 0) return configMap;

    let store = {};
    try {
        store = await window.dram.storage.getAll();
    } catch (err) {
        console.warn('Failed to load plugin config store snapshot', err);
    }

    const getValue = (path) => {
        if (!path) return undefined;
        if (store[path] !== undefined) return store[path];
        const parts = String(path).split('.');
        let current = store;
        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }
        return current;
    };
    const getFlag = (id) => getValue(`plugins.configured.${id}`);

    for (const pl of plugins) {
        const req = PLUGIN_SETUP_REQUIREMENTS && PLUGIN_SETUP_REQUIREMENTS[pl.id];
        if (!req || pl.status === 'missing') continue;

        const flag = getFlag(pl.id);
        if (flag === true) {
            configMap[pl.id] = true;
            continue;
        }
        if (flag === false) {
            configMap[pl.id] = false;
            continue;
        }

        if (req.type === 'token' && req.configPath) {
            const val = getValue(req.configPath);
            configMap[pl.id] = Boolean(val);
            continue;
        }

        if (req.type === 'multi' && Array.isArray(req.fields)) {
            let ok = true;
            for (const field of req.fields) {
                if (field.optional) continue;
                const path = field.configPath || `channels.${pl.id}.${field.key}`;
                const val = getValue(path);
                if (field.type === 'number') {
                    if (!Number.isFinite(val)) { ok = false; break; }
                } else if (field.type === 'boolean') {
                    if (typeof val !== 'boolean') { ok = false; break; }
                } else if (field.type === 'list') {
                    if (!Array.isArray(val) || val.length === 0) { ok = false; break; }
                } else if (!val) {
                    ok = false; break;
                }
            }
            configMap[pl.id] = ok;
            continue;
        }

        if (req.type === 'file' && req.configPath) {
            const val = getValue(req.configPath);
            configMap[pl.id] = Boolean(val);
            continue;
        }

        if (req.type === 'oauth' && req.configPath) {
            const val = getValue(req.configPath);
            configMap[pl.id] = Boolean(val);
            continue;
        }

        if (configMap[pl.id] === undefined) {
            configMap[pl.id] = false;
        }
    }

    return configMap;
}




