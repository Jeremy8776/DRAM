/**
 * Skills Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';

/**
 * Render skills grid with toggle switches
 */
export function renderSkillsGrid(skills) {
    if (!skills || skills.length === 0) {
        return renderEmptyState({
            id: 'skill-empty',
            icon: 'Ø',
            title: 'Neural Core Isolation',
            description: 'Embedded cognitive toolkits are currently unreachable by the synaptic interface.'
        });
    }

    return `
        <div class="plugin-grid compact" id="skill-registry">
            ${skills.map(sk => {
        const isEnabled = sk.enabled;
        // In embedded mode, skills work via IPC regardless of WebSocket state  
        const isOffline = false;

        return `
                    <div class="plugin-card premium-card ${isEnabled ? 'active' : ''} ${isOffline ? 'engine-offline' : ''}" data-skill-id="${escapeHtml(sk.id)}">
                        <div class="plugin-card-header">
                            <div class="plugin-info">
                                <div class="plugin-name">${escapeHtml(sk.name)}</div>
                                <div class="plugin-version">${escapeHtml(sk.version ? `v${sk.version}` : '1.0.0')}</div>
                            </div>
                            <label class="switch sm">
                                <input type="checkbox" class="skill-toggle" data-skill-id="${escapeHtml(sk.id)}" ${isEnabled ? 'checked' : ''} ${isOffline ? 'disabled' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="plugin-description">${escapeHtml(sk.description || 'Neural capability extension.')}</div>
                        
                        <div class="plugin-footer">
                            <div class="plugin-status ${isEnabled ? 'enabled' : 'disabled'}">
                                ${isEnabled ? 'ENABLED' : 'DISABLED'}
                                ${isOffline ? ' <span class="offline-hint">(OFFLINE)</span>' : ''}
                            </div>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

/**
 * Render skills tab
 */
export function renderSkillsTab(skills) {
    const content = renderSkillsGrid(skills);

    return `
        <div id="tab-skills" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Neural Capabilities',
        subtitle: 'Embedded cognitive toolkits active by default.',
        content: `<div id="skills-content-mount">${content}</div>`
    })}
        </div>
    `;
}

/**
 * Update skills grid in DOM
 */
export function updateSkillsList(skills) {
    const mount = document.getElementById('skills-content-mount');
    if (!mount) return;

    const newHtml = renderSkillsGrid(skills);
    mount.innerHTML = newHtml;
}
