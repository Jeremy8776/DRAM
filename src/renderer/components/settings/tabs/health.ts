/**
 * Health Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';

/**
 * Render health diagnostics
 */
export function renderHealthDiagnostics(checks) {
    // Ensure checks is an array
    if (!checks || !Array.isArray(checks) || checks.length === 0) {
        return renderEmptyState({
            id: 'health-empty',
            icon: 'HEALTH',
            title: 'No diagnostic data',
            description: 'Run a deep diagnostic to verify system integrity.'
        });
    }

    return `
        <div class="health-grid">
            ${checks.map(check => {
        const statusStr = String(check.status || 'unknown');
        const safeStatus = statusStr.toUpperCase();
        const statusClass = statusStr.toLowerCase();
        return `
                <div class="premium-card health-card ${escapeHtml(statusClass)}">
                    <div class="health-header" style="display: flex; justify-content: space-between; width: 100%;">
                        <div class="health-name" style="font-weight: 600; font-size: 13px;">${escapeHtml(check.name)}</div>
                        <div class="health-status-badge ${escapeHtml(statusClass)}" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: var(--bg-surface); border: 1px solid var(--border);">${escapeHtml(safeStatus)}</div>
                    </div>
                    <div class="health-message" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(check.message || '')}</div>
                </div>
            `;
    }).join('')}
        </div>
    `;
}

/**
 * Render health tab
 */
export function renderHealthTab(checks) {
    const html = renderHealthDiagnostics(checks);
    const actionContent = `
        <div id="health-diagnostics-container">${html}</div>
        <div style="margin-top: 16px;">
            <button class="tactile-btn primary w-full" id="btn-run-doctor">Run Deep Diagnostic</button>
        </div>
    `;

    return `
        <div id="tab-health" class="settings-tab-content hidden advanced-only">
            ${renderSection({
        title: 'Diagnostic Matrix',
        subtitle: 'Real-time telemetry and subsystem validation.',
        content: actionContent
    })}
        </div>
    `;
}




