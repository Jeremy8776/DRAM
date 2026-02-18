/**
 * Devices Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';

/**
 * Render devices grid
 */
export function renderDevicesGrid(devices) {
    if (!devices || devices.length === 0) {
        return renderEmptyState({
            id: 'device-empty',
            icon: 'DV',
            title: 'No devices linked',
            description: 'Remote nodes and mobile clients will appear here when they request pairing.'
        });
    }

    const deviceIcons = {
        mobile: 'MB',
        desktop: 'DT',
        tablet: 'TB',
        browser: 'WB',
        cli: 'CLI'
    };

    return `
        <div class="plugin-grid compact" id="device-registry">
            ${devices.map(dev => {
        const icon = deviceIcons[dev.type?.toLowerCase()] || '❓';
        const statusClass = dev.status === 'paired' ? 'enabled' : dev.status === 'pending' ? 'warning' : 'disabled';
        const isPending = dev.status === 'pending';

        return `
            <div class="plugin-card premium-card" data-device-id="${escapeHtml(dev.id)}">
                <div class="plugin-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div class="plugin-info" style="display: flex; gap: 12px; align-items: center;">
                        <div class="device-icon" style="font-size: 20px;">${icon}</div>
                        <div>
                            <div class="plugin-name" style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${escapeHtml(dev.name)}</div>
                            <div class="plugin-version" style="font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary);">${escapeHtml(dev.type || 'Unknown Device')}</div>
                        </div>
                    </div>
                    <div class="plugin-status ${statusClass}" style="font-size: 9px; font-weight: 700; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; background: var(--bg-surface); border: 1px solid var(--border);">
                        ${escapeHtml((dev.status || 'unknown').toUpperCase())}
                    </div>
                </div>
                <div class="plugin-footer" style="margin-top: 16px; display: flex; gap: 8px; width: 100%;">
                    ${isPending ? `
                        <button class="tactile-btn sm primary btn-approve" data-device-id="${escapeHtml(dev.id)}" data-device-name="${escapeHtml(dev.name)}" style="flex: 1;">Approve</button>
                        <button class="tactile-btn sm secondary btn-reject" data-device-id="${escapeHtml(dev.id)}" data-device-name="${escapeHtml(dev.name)}" style="flex: 1;">Reject</button>
                    ` : `
                        <button class="tactile-btn sm secondary btn-unpair" data-device-id="${escapeHtml(dev.id)}" data-device-name="${escapeHtml(dev.name)}" style="flex: 1;">Unpair Device</button>
                    `}
                </div>
            </div>
                `;
    }).join('')}
        </div>
    `;
}

/**
 * Render devices tab
 */
export function renderDevicesTab(devices) {
    return `
        <div id="tab-devices" class="settings-tab-content hidden advanced-only">
            ${renderSection({
        title: 'Device Matrix',
        subtitle: 'Manage authorized hardware nodes and remote interfaces.',
        content: renderDevicesGrid(devices)
    })}
        </div>
    `;
}




