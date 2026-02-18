/**
 * Model display formatting helpers.
 */

export function getModelShortName(modelId) {
    if (!modelId || modelId === 'none') return 'DRAM Agent';

    const id = modelId.includes('/') ? modelId.split('/').pop() : modelId;
    if (id.includes(' ') || id.includes('(')) return id;

    const lowerId = id.toLowerCase().replace(/\./g, '-');
    if (lowerId.includes('opus-4-5')) return 'Claude 4.5 Opus';
    if (lowerId.includes('sonnet-4-5')) return 'Claude 4.5 Sonnet';
    if (lowerId.includes('sonnet')) return 'Claude Sonnet';
    if (lowerId.includes('opus')) return 'Claude Opus';
    if (lowerId.includes('haiku')) return 'Claude Haiku';
    if (lowerId.includes('gpt-4o-mini')) return 'GPT-4o Mini';
    if (lowerId.includes('gpt-4o') || lowerId.includes('gpt-4')) return 'GPT-4o';
    if (lowerId.includes('o1')) return 'o1';
    if (lowerId.includes('gemini')) return 'Gemini';
    if (lowerId.includes('llama')) return 'Llama';
    if (lowerId.includes('antigravity')) return 'Antigravity';

    const part = id.split('-')[0];
    return part.charAt(0).toUpperCase() + part.slice(1);
}

export function formatCooldown(seconds) {
    if (seconds <= 0) return 'Ready';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}




