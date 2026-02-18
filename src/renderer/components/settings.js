/**
 * DRAM Desktop - Settings Page Component (Modular)
 */
import { renderModelOptions, escapeHtml } from './settings/utils.js';
import { renderSkillsTab } from './settings/tabs/skills.js';
import { renderIntegrationsTab } from './settings/tabs/integrations.js'; // Merged tab
import { renderFallbacksTab } from './settings/tabs/fallbacks.js';
import { renderCronTab } from './settings/tabs/cron.js';
import { renderMemoryTabContent } from './settings/tabs/memory.js';
import { renderHealthTab } from './settings/tabs/health.js';
import { renderWorkspaceTab } from './settings/tabs/workspace.js';
import { renderModelTab } from './settings/tabs/model.js';
import { renderApiVaultTab } from './settings/tabs/apivault.js';
import { renderGatewayTab } from './settings/tabs/gateway.js';
import { renderLogsTab } from './settings/tabs/logs.js';
import { renderDaemonTab } from './settings/tabs/daemon.js';
import { renderHardwareTab } from './settings/tabs/hardware.js';
import { renderSecurityTab } from './settings/tabs/security.js';
import { renderVoiceTab } from './settings/tabs/voice.js';

export function renderSettingsPage({
    models = [],
    plugins = [],
    channels = [],
    skills = [],
    devices = [],
    cronJobs = [],
    memoryStatus = {},
    healthChecks = []
} = {}) {

    // Ensure we don't show skills in the plugins list as they are handled separately
    const filteredPlugins = plugins.filter(p => p.kind !== 'skill');
    const modelOptionsHtml = renderModelOptions(models);

    return `
    <div class="settings-shell">
        <nav class="dashboard-sidebar">
            <div class="sidebar-label">General</div>
            <div class="dashboard-nav-item active" data-tab="tab-workspace">Workspace</div>
            <div class="dashboard-nav-item" data-tab="tab-hardware">Interface</div>

            <div class="sidebar-label">Intelligence</div>
            <div class="dashboard-nav-item" data-tab="tab-model">Models</div>
            <div class="dashboard-nav-item" data-tab="tab-apivault">API Keys</div>
            <div class="dashboard-nav-item" data-tab="tab-voice">Voice & Audio</div>
            <div class="dashboard-nav-item" data-tab="tab-fallbacks">Fallbacks</div>

            <div class="sidebar-label">Extensions</div>
            <div class="dashboard-nav-item" data-tab="tab-skills">Skills</div>
            <div class="dashboard-nav-item" data-tab="tab-integrations">Integrations</div>

            <div class="sidebar-label">System</div>
            <div class="dashboard-nav-item" data-tab="tab-gateway">Gateway</div>
            <div class="dashboard-nav-item" data-tab="tab-cron">Scheduled Tasks</div>
            <div class="dashboard-nav-item" data-tab="tab-security">Security</div>
            <div class="dashboard-nav-item" data-tab="tab-memory">Memory DB</div>
            <div class="dashboard-nav-item advanced-only" data-tab="tab-health">Health</div>
            <div class="dashboard-nav-item advanced-only" data-tab="tab-logs">Logs</div>

            <div class="sidebar-label advanced-only">Advanced</div>
            <div class="dashboard-nav-item advanced-only" data-tab="tab-daemon">Daemon</div>

            <div class="dashboard-sidebar-footer">
                <span class="sidebar-footer-label">System</span>
                <span class="sidebar-footer-value" id="app-version">DRAM // SYSTEM CORE v0.1.5</span>
            </div>
        </nav>

        <div class="dashboard-main">
            <div class="settings-scroll">
                <header class="settings-header">
                    <div>
                        <h1 id="dashboard-title">Workspace</h1>
                        <p>Configuration</p>
                    </div>
                </header>

                <div class="settings-content">
                    ${renderWorkspaceTab()}
                    ${renderModelTab(modelOptionsHtml)}
                    ${renderFallbacksTab(models)}
                    ${renderVoiceTab()}
                    ${renderApiVaultTab()}
                    ${renderIntegrationsTab(filteredPlugins, channels, devices)}
                    ${renderSkillsTab(skills)}
                    ${renderGatewayTab()}
                    ${renderDaemonTab()}
                    ${renderCronTab(cronJobs)}
                    ${renderLogsTab()}
                    ${renderMemoryTabContent(memoryStatus)}
                    ${renderHealthTab(healthChecks)}
                    ${renderHardwareTab()}
                    ${renderSecurityTab()}
                </div>
            </div>

        </div>
    </div>
    `;
}

/**
 * Update health diagnostics display
 * @param {Array} checks - Health check results
 */
export function updateHealthDiagnostics(checks) {
    const container = document.getElementById('health-diagnostics-container');
    if (!container) return;

    if (!checks || checks.length === 0) {
        container.innerHTML = '<div class="muted">No diagnostics available</div>';
        return;
    }

    container.innerHTML = checks.map(check => `
        <div class="health-check-item ${escapeHtml(check.status)}">
            <div class="health-check-name">${escapeHtml(check.name)}</div>
            <div class="health-check-status">${escapeHtml(String(check.status || 'unknown').toUpperCase())}</div>
            <div class="health-check-message">${escapeHtml(check.message || '')}</div>
        </div>
    `).join('');
}

/**
 * Update memory search results
 * @param {Array} results - Memory search results
 */
export function updateMemoryResults(results) {
    const container = document.getElementById('memory-search-results');
    if (!container) return;

    if (!results || results.length === 0) {
        container.innerHTML = '<div class="muted">No memories found</div>';
        return;
    }

    container.innerHTML = results.map(result => `
        <div class="memory-result-item">
            <div class="memory-result-content">${escapeHtml(result.content || (typeof result === 'string' ? result : JSON.stringify(result)))}</div>
        </div>
    `).join('');
}


