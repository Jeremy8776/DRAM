/**
 * Hardware / Desktop Settings Tab
 */
import { renderSwitch, renderSection } from '../../../modules/ui-components.js';

export function renderHardwareTab() {
    const uxContent = `
        ${renderSwitch({
        id: 'setting-advanced-mode',
        label: 'Advanced Mode',
        description: 'Disclose technical configurations and engine internals.'
    })}
        ${renderSwitch({
        id: 'setting-tray',
        label: 'System Tray Presence',
        description: 'Minimize application to notification area on close.'
    })}
    `;

    return `
        <div id="tab-hardware" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Interface Directives',
        subtitle: 'Control how DRAM behaves in the desktop shell.',
        content: uxContent
    })}
        </div>
    `;
}




