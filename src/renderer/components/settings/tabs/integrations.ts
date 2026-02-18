/**
 * Integrations Settings Tab
 * Merges Plugins, Channels, and Devices into a single view.
 */
import { renderSection } from '../../../modules/ui-components.js';
import { renderPluginsGrid } from './plugins.js';
import { renderChannelsGrid } from './channels.js';
import { renderDevicesGrid } from './devices.js';

export function renderIntegrationsTab(plugins, channels, devices) {
    return `
        <div id="tab-integrations" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Neural Extensions',
        subtitle: 'Manage system capabilities and plugins.',
        content: renderPluginsGrid(plugins)
    })}
            
            ${renderSection({
        title: 'Communication Channels',
        subtitle: 'Active communication uplinks and messaging platforms.',
        content: renderChannelsGrid(channels)
    })}

            ${renderSection({
        title: 'Connected Devices',
        subtitle: 'Authorized hardware nodes and remote interfaces.',
        content: renderDevicesGrid(devices)
    })}
        </div>
    `;
}




