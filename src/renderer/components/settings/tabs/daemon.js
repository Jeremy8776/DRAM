/**
 * Daemon Settings Tab
 */
import { renderSwitch, renderSection } from '../../../modules/ui-components.js';

export function renderDaemonTab() {
    const daemonContent = `
        ${renderSwitch({
        id: 'setting-daemon-active',
        label: 'Keepalive Background Service',
        description: 'Core DRAM Engine remains active even when main window is closed.'
    })}
    `;

    return `
        <div id="tab-daemon" class="settings-tab-content hidden advanced-only">
            ${renderSection({
        title: 'Process Lifecycle',
        subtitle: 'Manage the underlying DRAM Engine daemon.',
        content: daemonContent
    })}
        </div>
    `;
}
