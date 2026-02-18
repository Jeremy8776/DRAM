/**
 * Gateway Settings Tab (OpenClaw Management)
 */
import { renderInput, renderSecureKey, renderSwitch, renderSection } from '../../../modules/ui-components.js';

export function renderGatewayTab() {
    const handshakeContent = `
        ${renderInput({
        id: 'setting-gateway-url-dash',
        label: 'Gateway Endpoint',
        description: 'Primary Secure WebSocket URI.',
        placeholder: 'ws://127.0.0.1:18789',
        className: 'vertical'
    })}
        ${renderSecureKey({
        id: 'setting-gateway-token-dash',
        label: 'Authentication Token',
        description: 'System-level handshake credentials.',
        placeholder: '••••••••••••••••'
    })}
    <div style="margin: -12px 0 24px 0; padding-right: 2px; text-align: right;">
        <button class="tactile-btn sm secondary" id="btn-rotate-token" style="font-size: 0.75rem; padding: 4px 10px; opacity: 0.8;">
            Rotate Token
        </button>
    </div>
        <div class="settings-control">
            <div class="control-label">
                <span class="label-text">Vault Credentials</span>
                <span class="label-description">Purge saved gateway tokens from secure storage.</span>
            </div>
            <div class="key-actions">
                <button class="tactile-btn sm secondary" id="btn-clear-creds">Clear Tokens</button>
            </div>
        </div>
        ${renderSwitch({
        id: 'setting-autoconnect',
        label: 'Automatic Handshake',
        description: 'Link to gateway on application init.'
    })}
    `;

    const openclawContent = `
        <div class="settings-control">
            <div class="control-label">
                <span class="label-text">OpenClaw Version</span>
                <span class="label-description" id="openclaw-version-display">Detecting...</span>
            </div>
            <div class="key-actions">
                <select id="openclaw-version-select" class="mono-input sm" style="min-width: 150px;">
                    <option value="latest">latest</option>
                </select>
                <button class="tactile-btn sm secondary" id="btn-install-openclaw">Install/Update</button>
            </div>
        </div>
        <div class="settings-control">
            <div class="control-label">
                <span class="label-text">Configuration Backup</span>
                <span class="label-description">Create or restore OpenClaw config backups.</span>
            </div>
            <div class="key-actions">
                <button class="tactile-btn sm secondary" id="btn-create-backup">Create Backup</button>
                <button class="tactile-btn sm secondary" id="btn-restore-backup">Restore...</button>
            </div>
        </div>
        <div id="backups-list" class="backups-list" style="margin-top: 12px; font-size: 12px; color: var(--text-tertiary);">
            <!-- Backups will be listed here -->
        </div>
    `;

    return `
        <div id="tab-gateway" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Handshake Architecture',
        subtitle: 'Configure how DRAM establishes its neural uplink.',
        content: handshakeContent
    })}
            ${renderSection({
        title: 'OpenClaw Engine',
        subtitle: 'Manage the OpenClaw AI gateway installation.',
        content: openclawContent
    })}
        </div>
    `;
}
