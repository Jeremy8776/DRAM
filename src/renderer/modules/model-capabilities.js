/**
 * DRAM Model Capability Helpers
 * Determines whether the active model can accept image attachments.
 */
import { state } from './state.js';
import { elements } from './elements.js';
import { getActiveModelInfo } from './rate-limits.js';

const MODEL_CACHE_TTL_MS = 60 * 1000;
const ATTACH_HINT_REFRESH_MS = 3000;
const DEFAULT_MAX_ATTACHMENTS = 6;
const DEFAULT_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_DIMENSION = 2048;
const MIN_REASONABLE_IMAGE_BYTES = 256 * 1024;
const MAX_REASONABLE_IMAGE_BYTES = 30 * 1024 * 1024;
const MIN_REASONABLE_IMAGE_DIMENSION = 512;
const MAX_REASONABLE_IMAGE_DIMENSION = 4096;

let modelCatalog = [];
let modelCatalogLoadedAt = 0;
let modelCatalogPromise = null;
let attachHintPromise = null;
let lastAttachHintAt = 0;

function normalizeModelId(rawId) {
    const id = String(rawId || '').trim();
    return id || null;
}

function shortModelId(rawId) {
    const id = normalizeModelId(rawId);
    if (!id) return null;
    return id.includes('/') ? id.split('/').pop() : id;
}

function isSameModelId(leftRaw, rightRaw) {
    const left = normalizeModelId(leftRaw);
    const right = normalizeModelId(rightRaw);
    if (!left || !right) return false;
    if (left === right) return true;
    return shortModelId(left) === shortModelId(right);
}

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', 'yes', 'y', '1', 'enabled', 'on'].includes(normalized)) return true;
        if (['false', 'no', 'n', '0', 'disabled', 'off'].includes(normalized)) return false;
    }
    return null;
}

function parsePositiveNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
}

function flattenStrings(value, depth = 0, output = []) {
    if (depth > 6 || value == null) return output;

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized) output.push(normalized);
        return output;
    }

    if (Array.isArray(value)) {
        value.forEach((entry) => flattenStrings(entry, depth + 1, output));
        return output;
    }

    if (typeof value === 'object') {
        Object.entries(value).forEach(([key, entry]) => {
            flattenStrings(key, depth + 1, output);
            flattenStrings(entry, depth + 1, output);
        });
    }

    return output;
}

function collectNumericEntries(value, depth = 0, path = '', output = []) {
    if (depth > 7 || value == null) return output;
    const parsed = parsePositiveNumber(value);
    if (parsed != null) {
        output.push({ path: String(path || '').toLowerCase(), value: parsed });
        return output;
    }

    if (Array.isArray(value)) {
        value.forEach((entry, index) => {
            collectNumericEntries(entry, depth + 1, `${path}[${index}]`, output);
        });
        return output;
    }

    if (typeof value === 'object') {
        Object.entries(value).forEach(([key, entry]) => {
            const nextPath = path ? `${path}.${key}` : key;
            collectNumericEntries(entry, depth + 1, nextPath, output);
        });
    }
    return output;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function defaultUploadPolicyForModel(modelId = '') {
    const lower = String(modelId || '').toLowerCase();
    const policy = {
        maxImageBytes: DEFAULT_IMAGE_BYTES,
        maxTotalImageBytes: DEFAULT_TOTAL_IMAGE_BYTES,
        maxAttachments: DEFAULT_MAX_ATTACHMENTS,
        maxImageDimension: DEFAULT_MAX_IMAGE_DIMENSION
    };

    if (lower.startsWith('google/')) {
        policy.maxImageBytes = 8 * 1024 * 1024;
        policy.maxTotalImageBytes = 20 * 1024 * 1024;
        policy.maxImageDimension = 3072;
    } else if (lower.startsWith('openai/')) {
        policy.maxImageBytes = 6 * 1024 * 1024;
        policy.maxTotalImageBytes = 18 * 1024 * 1024;
        policy.maxImageDimension = 2048;
    } else if (lower.startsWith('anthropic/')) {
        policy.maxImageBytes = 5 * 1024 * 1024;
        policy.maxTotalImageBytes = 15 * 1024 * 1024;
        policy.maxImageDimension = 2048;
    }

    return policy;
}

function detectImageByteLimitFromCatalogEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const numeric = collectNumericEntries([entry.limits, entry.capabilities, entry]);
    const candidates = numeric
        .filter((item) => item.path.includes('image'))
        .filter((item) => item.path.includes('byte') || item.path.includes('size') || item.path.includes('upload'))
        .map((item) => item.value)
        .filter((value) => value >= MIN_REASONABLE_IMAGE_BYTES && value <= MAX_REASONABLE_IMAGE_BYTES);
    if (!candidates.length) return null;
    return Math.min(...candidates);
}

function detectTotalImageByteLimitFromCatalogEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const numeric = collectNumericEntries([entry.limits, entry.capabilities, entry]);
    const candidates = numeric
        .filter((item) => item.path.includes('image'))
        .filter((item) => item.path.includes('total') || item.path.includes('combined') || item.path.includes('batch'))
        .filter((item) => item.path.includes('byte') || item.path.includes('size') || item.path.includes('upload'))
        .map((item) => item.value)
        .filter((value) => value >= MIN_REASONABLE_IMAGE_BYTES && value <= (MAX_REASONABLE_IMAGE_BYTES * 2));
    if (!candidates.length) return null;
    return Math.min(...candidates);
}

function detectImageAttachmentLimitFromCatalogEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const numeric = collectNumericEntries([entry.limits, entry.capabilities, entry]);
    const candidates = numeric
        .filter((item) => item.path.includes('image'))
        .filter((item) => item.path.includes('count') || item.path.includes('attachment') || item.path.includes('max'))
        .map((item) => Math.floor(item.value))
        .filter((value) => value >= 1 && value <= 20);
    if (!candidates.length) return null;
    return Math.min(...candidates);
}

function detectImageDimensionLimitFromCatalogEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const numeric = collectNumericEntries([entry.limits, entry.capabilities, entry]);
    const candidates = numeric
        .filter((item) => item.path.includes('image'))
        .filter((item) => item.path.includes('dimension') || item.path.includes('width') || item.path.includes('height') || item.path.includes('resolution') || item.path.includes('pixel') || item.path.includes('longest'))
        .map((item) => Math.floor(item.value))
        .filter((value) => value >= MIN_REASONABLE_IMAGE_DIMENSION && value <= MAX_REASONABLE_IMAGE_DIMENSION);
    if (!candidates.length) return null;
    return Math.min(...candidates);
}

function detectImageCapabilityFromCatalogEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const explicitTrueFields = [
        entry.supportsImages,
        entry.supportsImageInput,
        entry.supportsVision,
        entry.supportsMultimodal,
        entry.vision,
        entry.multimodal,
        entry?.capabilities?.supportsImages,
        entry?.capabilities?.supportsImageInput,
        entry?.capabilities?.supportsVision,
        entry?.capabilities?.supportsMultimodal,
        entry?.capabilities?.vision,
        entry?.capabilities?.multimodal
    ];
    for (const field of explicitTrueFields) {
        const parsed = parseBoolean(field);
        if (parsed === true) return true;
    }

    const explicitFalseFields = [
        entry.supportsImages,
        entry.supportsImageInput,
        entry.supportsVision,
        entry.supportsMultimodal,
        entry.vision,
        entry.multimodal,
        entry?.capabilities?.supportsImages,
        entry?.capabilities?.supportsImageInput,
        entry?.capabilities?.supportsVision,
        entry?.capabilities?.supportsMultimodal,
        entry?.capabilities?.vision,
        entry?.capabilities?.multimodal
    ];
    for (const field of explicitFalseFields) {
        const parsed = parseBoolean(field);
        if (parsed === false) return false;
    }

    const tokens = flattenStrings([
        entry.modalities,
        entry.input_modalities,
        entry.inputModalities,
        entry.output_modalities,
        entry.outputModalities,
        entry.capabilities,
        entry.features
    ]);

    const joined = ` ${tokens.join(' ')} `;
    if (
        joined.includes(' image ')
        || joined.includes(' images ')
        || joined.includes(' vision ')
        || joined.includes(' multimodal ')
        || joined.includes(' visual ')
    ) {
        return true;
    }

    return null;
}

function inferImageSupportFromModelId(rawModelId) {
    const modelId = normalizeModelId(rawModelId);
    if (!modelId) return null;
    const lower = modelId.toLowerCase();

    const obviousTextOnly = [
        'embedding',
        'rerank',
        'whisper',
        'transcribe',
        'tts'
    ];
    if (obviousTextOnly.some((token) => lower.includes(token))) return false;

    const knownVisionPatterns = [
        'gemini',
        'gpt-4o',
        'gpt-4.1',
        'gpt-4-turbo',
        'claude-3',
        'claude-sonnet-4',
        'claude-opus-4',
        'vision',
        'multimodal',
        'llava',
        'qwen-vl',
        'qwen2-vl',
        'pixtral',
        'moondream',
        'minicpm-v',
        'phi-3-vision'
    ];
    if (knownVisionPatterns.some((token) => lower.includes(token))) return true;

    if (lower.startsWith('google/')) return true;
    if (lower.startsWith('anthropic/') && lower.includes('claude')) return true;

    if (lower.startsWith('openai/')) {
        if (lower.includes('gpt-4')) return true;
        return false;
    }

    return null;
}

async function loadModelCatalog(force = false) {
    const now = Date.now();
    if (!force && modelCatalog.length > 0 && (now - modelCatalogLoadedAt) < MODEL_CACHE_TTL_MS) {
        return modelCatalog;
    }
    if (modelCatalogPromise) return modelCatalogPromise;

    modelCatalogPromise = (async () => {
        try {
            const models = await window.dram.util.getModels({ force: false });
            if (Array.isArray(models)) {
                modelCatalog = models;
                modelCatalogLoadedAt = Date.now();
                return modelCatalog;
            }
        } catch (err) {
            console.warn('[Capabilities] Failed to load model catalog:', err?.message || err);
        }
        return modelCatalog;
    })().finally(() => {
        modelCatalogPromise = null;
    });

    return modelCatalogPromise;
}

function resolveActiveModel() {
    const active = getActiveModelInfo?.() || {};
    const fallbackId = state.currentActiveModelId || state.model || state.models?.primary?.id || '';
    const modelId = normalizeModelId(active.id || fallbackId);
    const modelName = String(active.name || modelId || 'current model');
    return { modelId, modelName };
}

function findCatalogEntryForModel(models, modelId) {
    if (!modelId || !Array.isArray(models) || models.length === 0) return null;
    return models.find((entry) => isSameModelId(entry?.id, modelId)) || null;
}

export async function getActiveModelImageCapability() {
    const policy = await getActiveModelUploadPolicy();
    return {
        supportsImages: Boolean(policy.supportsImages),
        modelId: policy.modelId,
        modelName: policy.modelName,
        source: policy.source
    };
}

export async function getActiveModelUploadPolicy() {
    const { modelId, modelName } = resolveActiveModel();
    if (!modelId) {
        return {
            supportsImages: false,
            modelId: null,
            modelName,
            source: 'none',
            maxImageBytes: DEFAULT_IMAGE_BYTES,
            maxTotalImageBytes: DEFAULT_TOTAL_IMAGE_BYTES,
            maxAttachments: DEFAULT_MAX_ATTACHMENTS,
            maxImageDimension: DEFAULT_MAX_IMAGE_DIMENSION
        };
    }

    const providerDefaults = defaultUploadPolicyForModel(modelId);
    const models = await loadModelCatalog(false);
    const entry = findCatalogEntryForModel(models, modelId);
    const fromCatalog = detectImageCapabilityFromCatalogEntry(entry);
    const fromId = inferImageSupportFromModelId(modelId);

    const supportsImages = fromCatalog !== null
        ? fromCatalog
        : (fromId !== null ? fromId : false);

    const maxImageBytesDetected = detectImageByteLimitFromCatalogEntry(entry);
    const maxTotalImageBytesDetected = detectTotalImageByteLimitFromCatalogEntry(entry);
    const maxAttachmentsDetected = detectImageAttachmentLimitFromCatalogEntry(entry);
    const maxImageDimensionDetected = detectImageDimensionLimitFromCatalogEntry(entry);

    const maxImageBytes = clamp(
        Math.floor(maxImageBytesDetected || providerDefaults.maxImageBytes),
        MIN_REASONABLE_IMAGE_BYTES,
        MAX_REASONABLE_IMAGE_BYTES
    );
    const maxTotalImageBytes = clamp(
        Math.floor(maxTotalImageBytesDetected || Math.max(providerDefaults.maxTotalImageBytes, maxImageBytes * 2)),
        maxImageBytes,
        MAX_REASONABLE_IMAGE_BYTES * 3
    );
    const maxAttachments = clamp(
        Math.floor(maxAttachmentsDetected || providerDefaults.maxAttachments),
        1,
        10
    );
    const maxImageDimension = clamp(
        Math.floor(maxImageDimensionDetected || providerDefaults.maxImageDimension),
        MIN_REASONABLE_IMAGE_DIMENSION,
        MAX_REASONABLE_IMAGE_DIMENSION
    );

    return {
        supportsImages,
        modelId,
        modelName,
        source: fromCatalog !== null ? 'catalog' : (fromId !== null ? 'heuristic' : 'default'),
        maxImageBytes,
        maxTotalImageBytes,
        maxAttachments,
        maxImageDimension
    };
}

export function imageUploadBlockedMessage(capability) {
    const label = capability?.modelName || capability?.modelId || 'the active model';
    return `Image upload is disabled for ${label}. You can still attach code/text files, or switch to a multimodal model (for example GPT-4o, Gemini, or Claude 3).`;
}

export function invalidateModelCapabilityCache() {
    modelCatalogLoadedAt = 0;
}

export async function refreshAttachButtonCapabilityHint(force = false) {
    const btn = elements.btnAttach;
    const badge = elements.attachCapabilityBadge || document.getElementById('attach-capability-badge');
    if (!btn) return;

    const now = Date.now();
    if (!force && (now - lastAttachHintAt) < ATTACH_HINT_REFRESH_MS) return;
    if (attachHintPromise) return attachHintPromise;

    lastAttachHintAt = now;
    attachHintPromise = (async () => {
        const capability = await getActiveModelImageCapability();
        if (capability.supportsImages) {
            btn.dataset.uploadCapability = 'supported';
            btn.title = 'Attach files or images';
            if (badge) {
                badge.dataset.uploadCapability = 'supported';
                badge.textContent = 'Vision';
                badge.title = 'Active model supports image input';
            }
        } else {
            btn.dataset.uploadCapability = 'unsupported';
            btn.title = 'Attach files (images require a multimodal model)';
            if (badge) {
                badge.dataset.uploadCapability = 'unsupported';
                badge.textContent = 'Text-only';
                badge.title = 'Image upload disabled for this model, file upload still available';
            }
        }
    })().finally(() => {
        attachHintPromise = null;
    });

    return attachHintPromise;
}
