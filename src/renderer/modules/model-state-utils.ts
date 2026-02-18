/**
 * Shared model state helper functions for rate-limit/routing logic.
 */

export const DEFAULT_MODEL_STATUS = Object.freeze({ limit: 100, cooldown: 0, resetAt: null });

export function normalizeModelId(rawId) {
    const id = String(rawId || '').trim();
    return id || null;
}

/**
 * Compare two model IDs, handling optional provider prefixes.
 */
export function isSameModel(id1, id2) {
    const left = normalizeModelId(id1);
    const right = normalizeModelId(id2);
    if (!left || !right) return false;
    if (left === right) return true;

    const leftShort = left.includes('/') ? left.split('/').pop() : left;
    const rightShort = right.includes('/') ? right.split('/').pop() : right;
    return leftShort === rightShort;
}

export function findMatchingModelId(candidates, targetId) {
    const target = normalizeModelId(targetId);
    if (!target) return null;
    if (Array.isArray(candidates) && candidates.includes(target)) return target;
    return (candidates || []).find((candidate) => isSameModel(candidate, target)) || null;
}

export function parseResetAtMs(value) {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric > 1e12 ? Math.floor(numeric) : Math.floor(numeric * 1000);
}

export function clampPercent(value, fallback = 100) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function toCooldownSeconds(value, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.floor(numeric));
}

export function normalizeModelStatus(status: any = {}) {
    if (!status || typeof status !== 'object') return { ...DEFAULT_MODEL_STATUS };
    return {
        limit: clampPercent(
            status.limit
            ?? status.rateLimitRemainingPercent
            ?? status.rate_limit_remaining_percent
            ?? status.remainingPercent
            ?? 100
        ),
        cooldown: toCooldownSeconds(
            status.cooldown
            ?? status.cooldownSeconds
            ?? status.cooldown_seconds
            ?? 0
        ),
        resetAt: parseResetAtMs(status.resetAt ?? status.reset_at)
    };
}

export function formatResetSummary(resetAt) {
    const resetMs = parseResetAtMs(resetAt);
    if (!resetMs) return null;

    const now = Date.now();
    const deltaMs = resetMs - now;
    if (deltaMs <= 0) {
        return {
            relative: 'reset now',
            absolute: new Date(resetMs).toLocaleString()
        };
    }

    const minutes = Math.ceil(deltaMs / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const relative = hours > 0 ? `reset in ${hours}h ${mins}m` : `reset in ${minutes}m`;

    return {
        relative,
        absolute: new Date(resetMs).toLocaleString()
    };
}

export function getModelStatusFromGateway(gatewayModels: any, rawModelId: any) {
    const modelId = normalizeModelId(rawModelId);
    if (!modelId || !gatewayModels || typeof gatewayModels !== 'object') {
        return { ...DEFAULT_MODEL_STATUS };
    }

    if (gatewayModels[modelId]) {
        return normalizeModelStatus(gatewayModels[modelId]);
    }

    const matchedKey = findMatchingModelId(Object.keys(gatewayModels), modelId);
    if (matchedKey && gatewayModels[matchedKey]) {
        return normalizeModelStatus(gatewayModels[matchedKey]);
    }

    return { ...DEFAULT_MODEL_STATUS };
}






