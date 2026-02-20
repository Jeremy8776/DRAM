/**
 * DRAM IPC - Model Handlers (Symbiotic Mode)
 * Fetches available AI models from OpenClaw or fallback list.
 */

const FALLBACK_MODELS = [
    { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash', provider: 'google' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', provider: 'groq' },
    { id: 'ollama/llama3:latest', name: 'Local llama3:latest', provider: 'ollama' }
];

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedModels = null;
let cachedModelsAt = 0;

const isCacheFresh = (force) => {
    if (force) return false;
    if (!cachedModels || cachedModels.length === 0) return false;
    if (!cachedModelsAt) return false;
    return (Date.now() - cachedModelsAt) < MODEL_CACHE_TTL_MS;
};

const inferProvider = (modelId) => {
    if (typeof modelId !== 'string') return 'unknown';
    const id = modelId.toLowerCase();
    if (id.includes('/')) return id.split('/')[0];
    if (id.includes('claude') || id.includes('anthropic')) return 'anthropic';
    if (id.includes('gpt') || id.includes('o1') || id.includes('o3') || id.includes('openai')) return 'openai';
    if (id.includes('gemini') || id.includes('google')) return 'google';
    if (id.includes('groq')) return 'groq';
    if (id.includes('ollama') || id.includes(':')) return 'ollama';
    return 'unknown';
};

const normalizeGatewayModels = (rawModels) => {
    if (!Array.isArray(rawModels)) return [];

    return rawModels
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const provider = entry.provider
                || (entry.local === true ? 'ollama' : inferProvider(entry.id || entry.model || entry.key || ''));
            const rawId = entry.id || entry.model || entry.key || entry.name;
            if (!rawId || typeof rawId !== 'string') return null;
            const id = rawId.includes('/') || !provider || provider === 'unknown'
                ? rawId
                : `${provider}/${rawId}`;

            const defaultName = id.includes('/') ? id.split('/')[1] : id;

            const capabilities = (entry.capabilities && typeof entry.capabilities === 'object')
                ? entry.capabilities
                : null;

            return {
                id,
                name: entry.name || entry.label || defaultName,
                provider,
                // Preserve common multimodal capability hints for renderer-side gating.
                supportsImages: entry.supportsImages ?? entry.supportsImageInput ?? capabilities?.supportsImages ?? capabilities?.supportsImageInput ?? null,
                supportsVision: entry.supportsVision ?? entry.vision ?? capabilities?.supportsVision ?? capabilities?.vision ?? null,
                supportsMultimodal: entry.supportsMultimodal ?? entry.multimodal ?? capabilities?.supportsMultimodal ?? capabilities?.multimodal ?? null,
                modalities: entry.modalities ?? capabilities?.modalities ?? null,
                input_modalities: entry.input_modalities ?? entry.inputModalities ?? capabilities?.input_modalities ?? capabilities?.inputModalities ?? null,
                output_modalities: entry.output_modalities ?? entry.outputModalities ?? capabilities?.output_modalities ?? capabilities?.outputModalities ?? null,
                capabilities
            };
        })
        .filter(Boolean);
};

function normalizeModelRequestOptions(options) {
    if (!options || typeof options !== 'object') return { force: false };
    return { force: options.force === true };
}

export function registerModelHandlers(ipc, internalRequest = null) {
    /**
     * Get all supported models
     * In symbiotic mode, query OpenClaw first and fallback if unavailable.
     */
    ipc.handle('util:getModels', async (_event, options = {}) => {
        const { force } = normalizeModelRequestOptions(options);

        if (isCacheFresh(force)) {
            console.log(`util:getModels: Returning ${cachedModels.length} cached models`);
            return cachedModels;
        }

        if (typeof internalRequest === 'function') {
            try {
                const result = await internalRequest('models.list', {});
                const payload = result?.data?.models || result?.data || [];
                const normalized = normalizeGatewayModels(payload);
                if (result?.ok && normalized.length > 0) {
                    cachedModels = normalized;
                    cachedModelsAt = Date.now();
                    console.log(`util:getModels: Loaded ${normalized.length} models from OpenClaw`);
                    return normalized;
                }
            } catch (err) {
                console.warn('util:getModels: OpenClaw query failed, using fallback models:', err.message);
            }
        }

        console.log('util:getModels: Using fallback model list');
        cachedModels = FALLBACK_MODELS;
        cachedModelsAt = Date.now();
        return FALLBACK_MODELS;
    });
}




