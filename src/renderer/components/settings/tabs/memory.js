/**
 * Memory Settings Tab
 */
import { renderSection, renderInputWithAction, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';

/**
 * Render memory tab content
 */
export function renderMemoryTabContent(status) {
    const statusContent = `
        <div class="memory-status-grid">
            <div class="premium-card status-item">
                <div class="status-label">Total Memories</div>
                <div class="status-value accent" id="memory-total">${escapeHtml(String(status.totalMemories || 0))}</div>
            </div>
            <div class="premium-card status-item">
                <div class="status-label">Index Size</div>
                <div class="status-value accent" id="memory-size">${escapeHtml(String(status.indexSize || '0 KB'))}</div>
            </div>
            <div class="premium-card status-item">
                <div class="status-label">Last Indexed</div>
                <div class="status-value" id="memory-last">${escapeHtml(String(status.lastIndexed || 'Never'))}</div>
            </div>
        </div>
    `;

    const searchContent = `
        ${renderInputWithAction({
        id: 'memory-search-input',
        label: 'Vector Search',
        description: 'Query the underlying RAG index for semantic fragments.',
        placeholder: 'Search long-term memory...',
        actionId: 'btn-memory-search',
        actionLabel: 'Search'
    })}
        <div id="memory-search-results" class="memory-results-container" style="margin-top: 16px; max-height: 250px; overflow-y: auto;">
             ${renderEmptyState({
        id: 'memory-empty',
        icon: 'MEM',
        title: 'Cognitive Archive',
        description: 'Stored interactions and vectorized knowledge will appear here.'
    })}
        </div>
    `;

    return `
        <div id="tab-memory" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Memory Index',
        subtitle: 'Manage persistent long-term storage and semantic associations.',
        content: statusContent
    })}
            ${renderSection({
        title: 'Neural Retrieval',
        subtitle: 'Interrogate the archive for specific knowledge fragments.',
        content: searchContent
    })}
        </div>
    `;
}

export function updateMemoryStatus(status = {}) {
    const totalEl = document.getElementById('memory-total');
    const sizeEl = document.getElementById('memory-size');
    const lastEl = document.getElementById('memory-last');

    if (totalEl) totalEl.textContent = String(status.totalMemories || 0);
    if (sizeEl) sizeEl.textContent = String(status.indexSize || '0 KB');
    if (lastEl) lastEl.textContent = String(status.lastIndexed || 'Never');
}
