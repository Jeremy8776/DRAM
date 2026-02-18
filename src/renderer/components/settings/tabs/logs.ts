/**
 * Log Viewer Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';

export function renderLogsTab() {
    const logViewerContent = `
        <div class="log-viewer">
            <div class="log-controls" style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px; padding: 8px; background: var(--bg-base); border: 1px solid var(--border); border-radius: 4px;">
                <button class="tactile-btn sm primary" id="btn-start-logs">Start Stream</button>
                <button class="tactile-btn sm secondary" id="btn-stop-logs" disabled>Stop</button>
                <button class="tactile-btn sm secondary" id="btn-clear-logs">Clear</button>
                <div class="log-status" id="log-status" style="margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 10px; font-family: var(--font-mono); color: var(--text-tertiary); text-transform: uppercase;">
                    <span class="indicator" style="width: 8px; height: 8px; border-radius: 50%; background: var(--text-tertiary);"></span>
                    <span>Stopped</span>
                </div>
            </div>
            <div class="log-output premium-card" id="log-output" style="height: 380px; overflow-y: auto; background: #020202; border: 1px solid var(--border); border-radius: 4px; padding: 12px; font-family: var(--font-mono); font-size: 11px; line-height: 1.5; color: #eee;">
                ${renderEmptyState({
        id: 'log-empty',
        icon: 'LOG',
        title: 'Diagnostic Feed Ready',
        description: 'Click "Start Stream" to monitor real-time engine telemetry.'
    })}
            </div>
        </div>
    `;

    return `
        <div id="tab-logs" class="settings-tab-content hidden advanced-only">
            ${renderSection({
        title: 'Real-time Telemetry',
        subtitle: 'Monitor low-level engine operations and handshake events.',
        content: logViewerContent
    })}
        </div>
    `;
}




