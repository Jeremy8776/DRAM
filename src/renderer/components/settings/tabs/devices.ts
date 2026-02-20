/**
 * Devices Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';

function formatDeviceMeta(device, statusText) {
    const type = String(device?.type || 'node').trim();
    const lastSeen = String(device?.lastSeen || device?.last_seen || '').trim();
    if (lastSeen) {
        return `${type} | last seen ${lastSeen}`;
    }
    return type === 'node' ? statusText.toLowerCase() : type;
}

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
        <div class="device-grid" id="device-registry">
            ${devices.map((dev) => {
        const typeKey = String(dev?.type || '').toLowerCase();
        const icon = deviceIcons[typeKey] || 'ND';
        const rawStatus = String(dev?.status || 'unknown').toLowerCase();
        const statusClass = rawStatus === 'paired' ? 'paired' : rawStatus === 'pending' ? 'pending' : 'offline';
        const statusText = rawStatus === 'paired' ? 'Connected' : rawStatus === 'pending' ? 'Needs Approval' : 'Offline';
        const isPending = rawStatus === 'pending';
        const meta = formatDeviceMeta(dev, statusText);
        const deviceId = escapeHtml(dev?.id || '');
        const deviceName = escapeHtml(dev?.name || dev?.id || 'Unknown node');

        return `
            <article class="device-card ${statusClass}" data-device-id="${deviceId}">
                <div class="device-header">
                    <div class="device-icon">${icon}</div>
                    <div class="device-info">
                        <div class="device-name-row">
                            <div class="device-name">${deviceName}</div>
                            <div class="device-status ${statusClass}">${escapeHtml(statusText)}</div>
                        </div>
                        <div class="device-meta">${escapeHtml(meta)}</div>
                    </div>
                </div>
                <div class="device-actions">
                    ${isPending ? `
                        <button class="tactile-btn sm primary btn-approve" data-device-id="${deviceId}" data-device-name="${deviceName}">Allow</button>
                        <button class="tactile-btn sm secondary btn-reject" data-device-id="${deviceId}" data-device-name="${deviceName}">Block</button>
                    ` : `
                        <button class="tactile-btn sm secondary btn-unpair" data-device-id="${deviceId}" data-device-name="${deviceName}">Disconnect</button>
                    `}
                </div>
            </article>
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
        title: 'Device Nodes',
        subtitle: 'Connected and pending nodes.',
        content: renderDevicesGrid(devices)
    })}
        </div>
    `;
}
