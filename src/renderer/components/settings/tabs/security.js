/**
 * Security Settings Tab
 */
import { renderSection, renderActionButton } from '../../../modules/ui-components.js';

export function renderSecurityTab() {
    const vaultContent = `
        <div class="settings-control">
            <div class="control-label">
                <span class="label-text">Vault Encryption</span>
                <span id="encryption-status" class="label-description">VERIFYING CRYPTOGRAPHY...</span>
            </div>
        </div>
    `;

    const dangerContent = `
        ${renderActionButton({
        id: 'btn-clear-all',
        label: 'Factory Reset',
        description: 'Deep wipe all storage, session data, and DRAM configs. Irreversible.',
        actionLabel: 'Deep Wipe',
        color: 'btn-danger'
    })}
    `;

    return `
        <div id="tab-security" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Vault Systems',
        subtitle: 'Manage secure credential storage and encryption.',
        content: vaultContent
    })}
            ${renderSection({
        title: 'Danger Zone',
        subtitle: 'Destructive system operations.',
        content: dangerContent,
        className: 'danger-section border-red'
    })}
        </div>
    `;
}
