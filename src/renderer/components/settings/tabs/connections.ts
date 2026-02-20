/**
 * Connections Settings Tab
 * Centralizes runtime connectivity controls that were previously buried.
 */
import { renderSection, renderSelect, renderSwitch } from '../../../modules/ui-components.js';
import { renderDevicesGrid } from './devices.js';
import { renderChannelsGrid } from './channels.js';
import { escapeHtml } from '../utils.js';

export function renderConnectionsTab(channels, devices) {
    return `
        <div id="tab-connections" class="settings-tab-content hidden">
            ${renderSection({
                title: 'Network Access',
                subtitle: 'Define internet reach and web search behavior.',
                content: `
                    ${renderSelect({
                        id: 'setting-internet-access-mode',
                        label: 'Internet Mode',
                        description: 'Open = cloud + web, Limited = cloud only, Offline = local-only routing.',
                        options: [
                            { value: 'open', text: 'Open (Cloud + Web Tools)' },
                            { value: 'limited', text: 'Limited (Cloud Only, Web Off)' },
                            { value: 'offline', text: 'Offline (Local Models Only)' }
                        ],
                        value: 'open'
                    })}
                    ${renderSelect({
                        id: 'setting-web-search-provider',
                        label: 'Search Provider',
                        description: 'Brave uses BRAVE_API_KEY. Perplexity uses PERPLEXITY_API_KEY.',
                        options: [
                            { value: 'brave', text: 'Brave Search' },
                            { value: 'perplexity', text: 'Perplexity Sonar' }
                        ],
                        value: 'brave'
                    })}
                    <div class="setting-status-indicator" id="internet-access-status"></div>
                    <div class="setting-status-indicator" id="web-search-status"></div>
                `
            })}

            ${renderSection({
                title: 'Messaging Safety',
                subtitle: 'Control inbound and outbound WhatsApp behavior.',
                content: `
                    ${renderSelect({
                        id: 'setting-dm-policy',
                        label: 'Direct Message Policy',
                        description: 'Set to Open to stop pairing-code prompts for inbound WhatsApp messages.',
                        options: [
                            { value: 'open', text: 'Open (Allow all inbound DMs)' },
                            { value: 'allowlist', text: 'Allowlist (Only allowed senders)' },
                            { value: 'pairing', text: 'Pairing (Require approval code)' },
                            { value: 'disabled', text: 'Disabled (Block all inbound DMs)' }
                        ],
                        value: 'open'
                    })}
                    ${renderSwitch({
                        id: 'setting-whatsapp-outbound-enabled',
                        label: 'Allow WhatsApp Outbound Replies',
                        description: 'Turn off to block OpenClaw from auto-sending replies on WhatsApp.',
                        checked: false
                    })}
                    <div class="setting-status-indicator" id="dm-policy-status"></div>
                    <div class="setting-status-indicator" id="whatsapp-outbound-status"></div>
                `
            })}

            ${renderSection({
                title: 'Pairing Policy',
                subtitle: 'Set how new device requests are handled.',
                content: `
                    ${renderSelect({
                        id: 'setting-device-access-policy',
                        label: 'Pairing Policy',
                        description: 'Auto Allow approves pending requests, Manual requires review, Block auto-rejects.',
                        options: [
                            { value: 'manual', text: 'Manual (Require Review)' },
                            { value: 'auto-allow', text: 'Auto Allow (Approve Pending)' },
                            { value: 'block', text: 'Block (Reject Pending)' }
                        ],
                        value: 'manual'
                    })}
                    <div class="setting-status-indicator" id="device-access-status"></div>
                `
            })}

            ${renderSection({
                title: 'Connected Channels',
                subtitle: 'Messaging accounts and channel links.',
                content: renderChannelsGrid(channels)
            })}

            ${renderSection({
                title: 'Connected Devices',
                subtitle: 'Authorized hardware nodes and remote interfaces.',
                content: renderDevicesGrid(devices)
            })}

            <div class="section-subtitle" style="margin-top: 6px;">Install and configure plugins in <strong>${escapeHtml('Integrations')}</strong>.</div>
        </div>
    `;
}

export function updateConnectionsDevicesList(devices) {
    const container = document.getElementById('device-registry') || document.getElementById('device-empty');
    if (!container) return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderDevicesGrid(Array.isArray(devices) ? devices : []);
    const newGrid = tempDiv.querySelector('.device-grid') || tempDiv.querySelector('.plugin-grid') || tempDiv.querySelector('.empty-state');
    if (newGrid) {
        container.replaceWith(newGrid);
    }
}

export function updateConnectionsChannelsList(channels) {
    const container = document.getElementById('channel-registry') || document.getElementById('channel-empty');
    if (!container) return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderChannelsGrid(Array.isArray(channels) ? channels : []);
    const newGrid = tempDiv.querySelector('.plugin-grid') || tempDiv.querySelector('.empty-state');
    if (newGrid) {
        container.replaceWith(newGrid);
    }
}
