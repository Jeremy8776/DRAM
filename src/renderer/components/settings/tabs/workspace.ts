/**
 * Workspace Settings Tab
 */
import { renderInputWithAction, renderInput, renderSection } from '../../../modules/ui-components.js';

export function renderWorkspaceTab() {
    const environmentContent = `
        ${renderInputWithAction({
        id: 'setting-workspace-path',
        label: 'Workspace Root Path',
        description: 'Directory containing AGENTS.md, SOUL.md and local data.',
        placeholder: '[Documents]/DRAM or /home/user/DRAM',
        actionId: 'btn-browse-workspace',
        actionLabel: 'Browse'
    })}
    `;

    const sessionContent = `
        ${renderInput({
        id: 'setting-session-key',
        label: 'Main Session Key',
        description: 'Primary persistent identifier for conversation history.',
        placeholder: 'main'
    })}
    `;

    return `
        <div id="tab-workspace" class="settings-tab-content">
            ${renderSection({
        title: 'Project Environment',
        subtitle: 'Define the physical location of your AI soul.',
        content: environmentContent
    })}
            ${renderSection({
        title: 'Session Matrix',
        subtitle: 'Manage identity isolation and history persistent.',
        content: sessionContent
    })}
        </div>
    `;
}




