/**
 * Integrations Settings Tab
 * Focuses on plugin/extension lifecycle.
 */
import { renderSection } from '../../../modules/ui-components.js';
import { renderPluginsGrid } from './plugins.js';

export function renderIntegrationsTab(plugins) {
    return `
        <div id="tab-integrations" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Plugins',
        subtitle: 'Manage external integrations and plugin lifecycle.',
        content: renderPluginsGrid(plugins)
    })}
        </div>
    `;
}




