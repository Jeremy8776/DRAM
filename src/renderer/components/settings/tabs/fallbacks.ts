/**
 * Fallback Settings Tab
 * Enhanced with organized model list matching main model selector
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';

function getFallbackModelLabel(modelId) {
    const value = String(modelId || '').trim();
    if (!value) return 'unknown';
    if (!value.includes('/')) return value;
    const parts = value.split('/');
    return parts[1] || value;
}

/**
 * Render fallback chain editor with organized model options
 */
export function renderFallbacksList(models) {
    // Generate grouped model options matching the main model selector
    const modelOptionsHtml = renderGroupedModelOptions(models);

    const addFallbackContent = `
        <div class="fallback-add-control">
            <div class="settings-control">
                <div class="control-label">
                    <span class="label-text">Add Fallback Model</span>
                    <span class="label-description">Select a backup model to add to the failover chain.</span>
                </div>
                <div class="select-wrapper">
                    <select id="fallback-model-select">
                        <option value="">Select a model...</option>
                        ${modelOptionsHtml}
                    </select>
                </div>
            </div>
            <div class="control-action" style="margin-top: 12px;">
                <button class="tactile-btn primary w-full" id="btn-add-fallback">+ Add to Chain</button>
            </div>
            <div id="fallback-add-status" class="setting-status-indicator" style="margin-top: 8px;"></div>
        </div>
    `;

    return `
        <div class="fallback-status" id="fallback-status" style="margin: 16px 0 12px; font-size: 11px; color: var(--text-tertiary);">
            Loading fallback configuration...
        </div>
        
        <div class="fallback-list-container">
            <div class="fallback-list" id="fallback-list">
                ${renderEmptyState({
        id: 'fallback-empty',
        icon: 'FB',
        title: 'No fallbacks configured',
        description: 'Add backup models to ensure resilience when primary fails.'
    })}
            </div>
        </div>

        ${renderSection({
        title: 'Resilience Uplink',
        subtitle: 'Expand the failover chain.',
        content: addFallbackContent,
        className: 'add-fallback-section',
        infoTooltip: 'When your primary model hits rate limits or fails, DRAM automatically switches to the first available fallback. The fallback chain is tried in order until a successful response is received.'
    })}
    `;
}

/**
 * Render grouped model options (matching main model selector)
 */
function renderGroupedModelOptions(models) {
    if (!models || models.length === 0) {
        return `
            <optgroup label="Anthropic">
                <option value="anthropic/claude-opus-4-5">Claude Opus 4.5</option>
                <option value="anthropic/claude-opus-4">Claude Opus 4</option>
                <option value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5</option>
                <option value="anthropic/claude-3-7-sonnet-latest">Claude 3.7 Sonnet</option>
                <option value="anthropic/claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="anthropic/claude-3-5-haiku-latest">Claude 3.5 Haiku</option>
            </optgroup>
            <optgroup label="OpenAI">
                <option value="openai/o1-preview">o1-preview (Reasoning)</option>
                <option value="openai/gpt-4o">GPT-4o</option>
                <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
            </optgroup>
            <optgroup label="Google">
                <option value="google/gemini-1.5-pro-latest">Gemini 1.5 Pro</option>
                <option value="google/gemini-1.5-flash-latest">Gemini 1.5 Flash</option>
            </optgroup>
            <optgroup label="Groq">
                <option value="groq/llama-3.1-70b-versatile">Llama 3.1 70B</option>
                <option value="groq/llama-3.1-8b-instant">Llama 3.1 8B</option>
            </optgroup>
            <optgroup label="Local (Ollama)">
                <option value="ollama/ollama">Local ollama-host</option>
            </optgroup>
        `;
    }

    const grouped = {};
    models.forEach(m => {
        const p = m.provider || 'unknown';
        if (!grouped[p]) grouped[p] = [];
        grouped[p].push(m);
    });

    const priority = ['anthropic', 'openai', 'google', 'groq', 'ollama'];
    const providers = Object.keys(grouped).sort((a, b) => {
        const idxA = priority.indexOf(a);
        const idxB = priority.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    let html = '';
    providers.forEach(p => {
        const label = p === 'ollama' ? 'Local (Ollama)' : p.toUpperCase();
        html += `<optgroup label="${escapeHtml(label)}">`;
        grouped[p].forEach(m => {
            const fullId = m.id.includes('/') ? m.id : `${m.provider || p}/${m.id}`;
            html += `<option value="${escapeHtml(fullId)}">${escapeHtml(m.name || m.id)}</option>`;
        });
        html += '</optgroup>';
    });

    return html;
}

/**
 * Render fallbacks tab
 */
export function renderFallbacksTab(models) {
    return `
        <div id="tab-fallbacks" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Fallback Matrix',
        subtitle: 'Configure a chain of fallback engines for autonomous failover.',
        content: renderFallbacksList(models)
    })}
        </div>
    `;
}

/**
 * Update fallback status display
 */
export function updateFallbackStatus(primaryModel, fallbackCount) {
    const statusEl = document.getElementById('fallback-status');
    if (!statusEl) return;

    if (fallbackCount === 0) {
        statusEl.innerHTML = '<span style="color: var(--warning);">[!]</span> No fallbacks - single point of failure';
    } else {
        statusEl.innerHTML = `<span style="color: var(--success);">[?]</span> ${fallbackCount} fallback(s) configured for ${escapeHtml(getFallbackModelLabel(primaryModel))}`;
    }
}

/**
 * Show add fallback status
 */
export function showFallbackStatus(message, type = 'success') {
    const el = document.getElementById('fallback-add-status');
    if (!el) return;

    el.textContent = message;
    el.className = `setting-status-indicator ${type}`;
    el.style.opacity = '1';

    setTimeout(() => {
        el.style.opacity = '0';
    }, 3000);
}

/**
 * Add a fallback row to the list
 */
export function addFallbackRow(modelId, index) {
    const list = document.getElementById('fallback-list');
    if (!list) return;

    // Remove empty state if present
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = 'fallback-row premium-card';
    row.dataset.modelId = modelId;
    row.dataset.index = index;

    row.innerHTML = `
        <div class="fallback-number">${index + 1}</div>
        <div class="fallback-model" title="${escapeHtml(modelId)}">${escapeHtml(getFallbackModelLabel(modelId))}</div>
        <button class="fallback-btn remove" title="Remove fallback">×</button>
    `;

    list.appendChild(row);

    // Update status
    const primaryModel = document.getElementById('setting-model')?.value || 'primary';
    updateFallbackStatus(primaryModel, list.querySelectorAll('.fallback-row').length);

    // Show confirmation
    showFallbackStatus(`Added ${getFallbackModelLabel(modelId)} to fallback chain`, 'success');
}

/**
 * Remove a fallback row
 */
export function removeFallbackRow(row) {
    const list = document.getElementById('fallback-list');
    if (!list) return;

    const modelId = row.dataset.modelId;
    row.remove();

    // Renumber remaining rows
    const rows = list.querySelectorAll('.fallback-row');
    rows.forEach((r, i) => {
        const num = r.querySelector('.fallback-number');
        if (num) num.textContent = String(i + 1);
        r.dataset.index = String(i);
    });

    // Show empty state if no rows left
    if (rows.length === 0) {
        list.innerHTML = renderEmptyState({
            id: 'fallback-empty',
            icon: 'FB',
            title: 'No fallbacks configured',
            description: 'Add backup models to ensure resilience when primary fails.'
        });
    }

    // Update status
    const primaryModel = document.getElementById('setting-model')?.value || 'primary';
    updateFallbackStatus(primaryModel, rows.length);

    // Show confirmation
    if (modelId) {
        showFallbackStatus(`Removed ${getFallbackModelLabel(modelId)} from fallback chain`, 'info');
    }
}






