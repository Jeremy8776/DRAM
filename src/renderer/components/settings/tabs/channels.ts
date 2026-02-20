/**
 * Channels Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';
import { PLUGIN_SETUP_REQUIREMENTS } from '../../../data/plugin-metadata.js';

/**
 * Render channels grid
 */
export function renderChannelsGrid(channels) {
    if (!channels || channels.length === 0) {
        return renderEmptyState({
            id: 'channel-empty',
            icon: 'CH',
            title: 'No channels configured',
            description: 'Connect messaging platforms to activate remote presence.',
            className: 'w-full'
        }) + `
            <div style="text-align: center; margin-top: 16px;">
                <button id="btn-add-channel" class="tactile-btn primary">Manage Channels</button>
            </div>
        `;
    }

    return `
        <div class="plugin-grid compact" id="channel-registry">
            ${channels.map(ch => {
        const isActive = ch.status === 'active' || ch.status === 'linked';
        const statusText = String(ch.status || 'unknown').toUpperCase();
        const hasSetup = PLUGIN_SETUP_REQUIREMENTS && PLUGIN_SETUP_REQUIREMENTS[ch.id];
        // In embedded mode, channels work via IPC regardless of WebSocket state
        const isOffline = false;

        return `
                    <div class="plugin-card ${isActive ? 'active' : ''}" data-channel-id="${escapeHtml(ch.id)}">
                        <div class="plugin-card-header">
                            <div class="plugin-info">
                                <div class="plugin-name">${escapeHtml(ch.name)}</div>
                                <div class="plugin-version">${escapeHtml(ch.account || 'System Channel')}</div>
                            </div>
                            <div class="plugin-status ${isActive ? 'enabled' : 'disabled'}">
                                ${escapeHtml(statusText)}
                            </div>
                        </div>
                        <div class="plugin-footer">
                            ${hasSetup ? `<button class="tactile-btn sm w-full secondary plugin-config-btn" data-plugin-id="${escapeHtml(ch.id)}" ${isOffline ? 'disabled' : ''}>${isActive ? 'Configure' : 'Initialize'}</button>` : ''}
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

/**
 * Render channels tab
 */
export function renderChannelsTab(channels) {
    return `
        <div id="tab-channels" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Communication Matrix',
        subtitle: 'Manage active uplinks and remote conversation channels.',
        content: renderChannelsGrid(channels)
    })}
        </div>
    `;
}




