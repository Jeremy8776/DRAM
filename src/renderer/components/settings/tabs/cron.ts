/**
 * Cron Jobs Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';

/**
 * Render cron jobs list
 */
export function renderCronList(jobs) {
    // Ensure jobs is an array
    if (!Array.isArray(jobs) || jobs.length === 0) {
        return renderEmptyState({
            id: 'cron-empty',
            icon: 'CLOCK',
            title: 'No scheduled tasks',
            description: 'Add automated tasks to run on a schedule from your AGENTS.md.'
        });
    }

    return `
        <div class="cron-list-container" id="cron-registry">
            ${jobs.map(job => `
                <div class="premium-card cron-item" data-job-id="${job.id}">
                    <div class="cron-info" style="flex: 1;">
                        <div class="cron-name" style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${escapeHtml(job.name)}</div>
                        <div class="cron-meta" style="display: flex; gap: 12px; margin-top: 4px;">
                            <span class="cron-schedule" style="font-family: var(--font-mono); font-size: 10px; color: var(--accent); background: var(--accent-subtle); padding: 1px 6px; border-radius: 3px;">${escapeHtml(job.schedule)}</span>
                            ${job.lastRun ? `<span class="cron-last-run" style="font-size: 10px; color: var(--text-tertiary);">Last: ${new Date(job.lastRun).toLocaleTimeString()}</span>` : ''}
                        </div>
                    </div>
                    <div class="cron-controls">
                        <label class="switch">
                            <input type="checkbox" class="cron-toggle" data-job-id="${job.id}" ${job.enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Render cron tab
 */
export function renderCronTab(jobs) {
    return `
        <div id="tab-cron" class="settings-tab-content hidden advanced-only">
            ${renderSection({
        title: 'Automation Schedule',
        subtitle: 'Manage recurring tasks and background synchronization.',
        content: renderCronList(jobs)
    })}
        </div>
    `;
}




