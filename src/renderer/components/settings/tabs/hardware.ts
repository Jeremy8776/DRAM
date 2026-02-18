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
        subtitle: 'Control how DRAM manifests on your system.',
        content: uxContent
    })}
            ${renderSection({
        title: 'Audio Hardware',
        subtitle: 'Configure neural voice input sources.',
        content: `
                    <div class="setting-group-v">
                        <label class="setting-label-sm">Microphone Input</label>
                        <div class="select-wrapper">
                            <select id="setting-audio-input" class="mono-select">
                                <option value="">Default System Device</option>
                            </select>
                        </div>
                        <p class="setting-desc">Select the specific input device for Voice Mode.</p>
                    </div>
                `
    })}
        </div>
    `;
}




