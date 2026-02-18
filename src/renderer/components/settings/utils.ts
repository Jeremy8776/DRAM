/**
 * DRAM Settings - Utility Functions
 */

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const safeStr = String(str);
    return safeStr
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Render model select options grouped by provider
 */
export function renderModelOptions(models) {
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
            <optgroup label="Local">
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
            const fullId = m.id.includes('/') ? m.id : `${m.provider}/${m.id}`;
            html += `<option value="${escapeHtml(fullId)}">${escapeHtml(m.name || m.id)}</option>`;
        });
        html += '</optgroup>';
    });

    return html;
}

/**
 * Render only local model options
 */
export function renderLocalModelOptions(models) {
    if (!models) return '<option value="">Searching for local models...</option>';
    const localModels = models.filter(m => m.provider === 'ollama');
    if (localModels.length === 0) return '<option value="">No local models found</option>';

    return localModels.map(m => `
        <option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.id)}</option>
    `).join('');
}




