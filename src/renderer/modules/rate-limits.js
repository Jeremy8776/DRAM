/**
 * DRAM Rate Limit UI Manager
 */
import { state } from './state.js';
import { elements } from './elements.js';
import { escapeHtml } from './utils.js';

const DEFAULT_MODEL_STATUS = Object.freeze({ limit: 100, cooldown: 0, resetAt: null });

function normalizeModelId(rawId) {
    const id = String(rawId || '').trim();
    return id || null;
}

/**
 * Compare two model IDs, handling optional provider prefixes.
 */
function isSameModel(id1, id2) {
    const left = normalizeModelId(id1);
    const right = normalizeModelId(id2);
    if (!left || !right) return false;
    if (left === right) return true;

    const leftShort = left.includes('/') ? left.split('/').pop() : left;
    const rightShort = right.includes('/') ? right.split('/').pop() : right;
    return leftShort === rightShort;
}

function findMatchingModelId(candidates, targetId) {
    const target = normalizeModelId(targetId);
    if (!target) return null;
    if (Array.isArray(candidates) && candidates.includes(target)) return target;
    return (candidates || []).find((candidate) => isSameModel(candidate, target)) || null;
}

function parseResetAtMs(value) {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric > 1e12 ? Math.floor(numeric) : Math.floor(numeric * 1000);
}

function clampPercent(value, fallback = 100) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function toCooldownSeconds(value, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.floor(numeric));
}

function normalizeModelStatus(status = {}) {
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

function formatResetSummary(resetAt) {
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

function getModelStatusFromGateway(gatewayModels, rawModelId) {
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

function canonicalizeModelId(rawModelId, gatewayModels) {
    const modelId = normalizeModelId(rawModelId);
    if (!modelId || modelId === 'none') return null;

    if (isSameModel(modelId, state.models.primary.id)) {
        return state.models.primary.id;
    }

    const gatewayMatch = findMatchingModelId(
        gatewayModels && typeof gatewayModels === 'object' ? Object.keys(gatewayModels) : [],
        modelId
    );
    if (gatewayMatch) return gatewayMatch;

    const dynamicModelKeys = Object.keys(state.models).filter((key) => key !== 'primary' && key !== 'fallback');
    const stateMatch = findMatchingModelId(dynamicModelKeys, modelId);
    if (stateMatch) return stateMatch;

    return modelId;
}

function ensureModelEntry(rawModelId, preferredName = null) {
    const modelId = canonicalizeModelId(rawModelId);
    if (!modelId || modelId === 'none') return null;

    if (isSameModel(modelId, state.models.primary.id)) {
        if (preferredName && String(preferredName).trim()) {
            state.models.primary.name = String(preferredName).trim();
        }
        return state.models.primary;
    }

    const dynamicModelKeys = Object.keys(state.models).filter((key) => key !== 'primary' && key !== 'fallback');
    const existingKey = findMatchingModelId(dynamicModelKeys, modelId);
    const entryKey = existingKey || modelId;

    if (!state.models[entryKey]) {
        state.models[entryKey] = {
            id: entryKey,
            name: getModelShortName(entryKey),
            limit: 100,
            active: false,
            cooldown: 0,
            resetAt: null
        };
    }

    if (preferredName && String(preferredName).trim()) {
        state.models[entryKey].name = String(preferredName).trim();
    } else if (!state.models[entryKey].name) {
        state.models[entryKey].name = getModelShortName(entryKey);
    }

    state.models[entryKey].id = entryKey;
    return state.models[entryKey];
}

function isModelAvailable(status) {
    const normalized = normalizeModelStatus(status);
    return normalized.cooldown <= 0 && normalized.limit > 0;
}

function normalizeFallbackChain(gatewayModels) {
    const nextChain = [];
    const seen = new Set();

    for (const rawId of state.fallbackChain || []) {
        const canonicalId = canonicalizeModelId(rawId, gatewayModels);
        if (!canonicalId) continue;
        if (isSameModel(canonicalId, state.models.primary.id)) continue;

        const dedupeKey = canonicalId.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        nextChain.push(canonicalId);
        ensureModelEntry(canonicalId);
    }

    const changed = nextChain.length !== state.fallbackChain.length
        || nextChain.some((id, idx) => !isSameModel(id, state.fallbackChain[idx]));

    if (changed) {
        state.fallbackChain = nextChain;
    }

    return nextChain;
}

function getSelectableModelIds() {
    const ids = [];
    const seen = new Set();
    const pushUnique = (rawId) => {
        const id = normalizeModelId(rawId);
        if (!id || id === 'none') return;
        const key = id.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        ids.push(id);
    };

    pushUnique(state.models.primary.id);
    (state.fallbackChain || []).forEach(pushUnique);
    if (state.models.fallback?.id && state.models.fallback.id !== 'none') {
        pushUnique(state.models.fallback.id);
    }
    return ids;
}

function resolveManualModelId(gatewayModels = null) {
    const selectableIds = getSelectableModelIds();
    if (selectableIds.length === 0) return null;
    const manualCandidate = canonicalizeModelId(state.manualModelId, gatewayModels);
    const matched = findMatchingModelId(selectableIds, manualCandidate);
    return matched || null;
}

function getActiveModelDetailsUnsafe() {
    const activeId = canonicalizeModelId(state.currentActiveModelId) || state.models.primary.id;
    const isPrimary = isSameModel(activeId, state.models.primary.id);
    const details = isPrimary
        ? state.models.primary
        : (state.models[activeId] || ensureModelEntry(activeId) || state.models.primary);

    return {
        id: details?.id || activeId,
        name: details?.name || getModelShortName(activeId),
        limit: clampPercent(details?.limit, clampPercent(state.rateLimit, 100)),
        cooldown: toCooldownSeconds(details?.cooldown, 0),
        resetAt: parseResetAtMs(details?.resetAt || state.rateLimitResetAt),
        isPrimary
    };
}

export function getActiveModelInfo() {
    return getActiveModelDetailsUnsafe();
}

export function setManualModelSelection(rawModelId) {
    const modelId = canonicalizeModelId(rawModelId);
    const selectable = findMatchingModelId(getSelectableModelIds(), modelId);
    if (!selectable) return false;

    state.modelRoutingMode = 'manual';
    state.manualModelId = selectable;
    state.currentActiveModelId = selectable;
    refreshMainDisplay();
    if (elements.ratePanel && !elements.ratePanel.classList.contains('hidden')) {
        renderRatePanel();
    }
    return true;
}

export function clearManualModelSelection() {
    state.modelRoutingMode = 'auto';
    state.manualModelId = null;
    refreshMainDisplay();
    if (elements.ratePanel && !elements.ratePanel.classList.contains('hidden')) {
        renderRatePanel();
    }
}

export function initRateLimitUI() {
    if (!elements.ratePanelTrigger) return;

    elements.ratePanelTrigger.addEventListener('mouseenter', () => {
        renderRatePanel();
        elements.ratePanel.classList.remove('hidden');
    });

    elements.ratePanelTrigger.addEventListener('mouseleave', () => {
        setTimeout(() => {
            if (!elements.ratePanel.matches(':hover') && !elements.ratePanelTrigger.matches(':hover')) {
                elements.ratePanel.classList.add('hidden');
            }
        }, 100);
    });

    if (elements.ratePanel) {
        elements.ratePanel.addEventListener('mouseleave', () => {
            elements.ratePanel.classList.add('hidden');
        });

        elements.ratePanel.addEventListener('mouseenter', () => {
            elements.ratePanel.classList.remove('hidden');
        });
    }

    if (elements.ratePanelContent && !elements.ratePanelContent.dataset.routingBound) {
        elements.ratePanelContent.dataset.routingBound = '1';
        elements.ratePanelContent.addEventListener('click', (event) => {
            const autoButton = event.target.closest('#model-route-auto');
            if (autoButton) {
                clearManualModelSelection();
                return;
            }

            const routeButton = event.target.closest('.model-route-btn');
            if (!routeButton) return;
            const modelId = routeButton.dataset.modelId;
            if (!modelId) return;
            setManualModelSelection(modelId);
        });
    }
}

export function updateModelStats(metadata = {}) {
    const gatewayModels = (metadata.models && typeof metadata.models === 'object') ? metadata.models : null;

    const primaryStatus = getModelStatusFromGateway(gatewayModels, state.models.primary.id);
    state.models.primary.limit = primaryStatus.limit;
    state.models.primary.cooldown = primaryStatus.cooldown;
    state.models.primary.resetAt = primaryStatus.resetAt;

    const normalizedFallbackChain = normalizeFallbackChain(gatewayModels);
    for (const fallbackId of normalizedFallbackChain) {
        const entry = ensureModelEntry(fallbackId);
        const status = getModelStatusFromGateway(gatewayModels, fallbackId);
        entry.limit = status.limit;
        entry.cooldown = status.cooldown;
        entry.resetAt = status.resetAt;
    }

    if (state.models.fallback?.id && state.models.fallback.id !== 'none') {
        const legacyId = canonicalizeModelId(state.models.fallback.id, gatewayModels);
        if (legacyId) {
            state.models.fallback.id = legacyId;
            state.models.fallback.name = state.models.fallback.name || getModelShortName(legacyId);
            const legacyStatus = getModelStatusFromGateway(gatewayModels, legacyId);
            state.models.fallback.limit = legacyStatus.limit;
            state.models.fallback.cooldown = legacyStatus.cooldown;
            state.models.fallback.resetAt = legacyStatus.resetAt;
        }
    }

    const explicitModelId = canonicalizeModelId(metadata.model, gatewayModels);
    const currentActiveModelId = canonicalizeModelId(state.currentActiveModelId, gatewayModels) || state.models.primary.id;
    const primaryIsAvailable = isModelAvailable(primaryStatus);
    const manualModelId = resolveManualModelId(gatewayModels);

    if (state.modelRoutingMode === 'manual' && !manualModelId) {
        state.modelRoutingMode = 'auto';
        state.manualModelId = null;
    }

    let nextActiveModelId = currentActiveModelId;
    if (state.modelRoutingMode === 'manual' && manualModelId) {
        nextActiveModelId = manualModelId;
        state.manualModelId = manualModelId;
        ensureModelEntry(nextActiveModelId);
    } else if (explicitModelId) {
        nextActiveModelId = explicitModelId;
        ensureModelEntry(nextActiveModelId);
    } else {
        const currentIsFallback = normalizedFallbackChain.some((id) => isSameModel(id, currentActiveModelId));
        const currentStatus = getModelStatusFromGateway(gatewayModels, currentActiveModelId);
        const currentIsAvailable = isModelAvailable(currentStatus);

        if (currentIsFallback && currentIsAvailable && !primaryIsAvailable) {
            nextActiveModelId = currentActiveModelId;
        } else if (primaryIsAvailable) {
            nextActiveModelId = state.models.primary.id;
        } else {
            const firstAvailableFallback = normalizedFallbackChain.find((fallbackId) => {
                const fallbackStatus = getModelStatusFromGateway(gatewayModels, fallbackId);
                return isModelAvailable(fallbackStatus);
            });
            if (firstAvailableFallback) {
                nextActiveModelId = firstAvailableFallback;
            }
        }
    }

    state.currentActiveModelId = nextActiveModelId || state.models.primary.id;

    Object.keys(state.models).forEach((key) => {
        if (!state.models[key] || typeof state.models[key] !== 'object') return;
        state.models[key].active = false;
    });

    state.models.primary.active = isSameModel(state.currentActiveModelId, state.models.primary.id);

    for (const fallbackId of normalizedFallbackChain) {
        const entry = ensureModelEntry(fallbackId);
        if (entry) {
            entry.active = isSameModel(state.currentActiveModelId, fallbackId);
        }
    }

    if (state.models.fallback?.id && state.models.fallback.id !== 'none') {
        state.models.fallback.active = isSameModel(state.currentActiveModelId, state.models.fallback.id);
    }

    const usage = metadata.usage;
    if (usage && typeof usage === 'object') {
        const usageTargetId = canonicalizeModelId(
            metadata.model || state.currentActiveModelId || state.models.primary.id,
            gatewayModels
        ) || state.models.primary.id;
        const usageTargetEntry = isSameModel(usageTargetId, state.models.primary.id)
            ? state.models.primary
            : ensureModelEntry(usageTargetId);

        if (usageTargetEntry) {
            const usageLimit = clampPercent(usage.rateLimitRemainingPercent, usageTargetEntry.limit ?? 100);
            const usageResetAt = parseResetAtMs(usage.resetAt);
            const usageName = typeof usage.name === 'string' ? usage.name.trim() : '';

            usageTargetEntry.limit = usageLimit;
            if (usageResetAt !== null) usageTargetEntry.resetAt = usageResetAt;
            if (usageName) usageTargetEntry.name = usageName;
        }
    }

    const active = getActiveModelDetailsUnsafe();
    state.model = active.id;
    state.rateLimit = active.limit;
    state.rateLimitResetAt = active.resetAt || null;

    refreshMainDisplay();
    if (elements.ratePanel && !elements.ratePanel.classList.contains('hidden')) {
        renderRatePanel();
    }
}

export function refreshMainDisplay() {
    if (!elements.displayModelName) return;

    const details = getActiveModelDetailsUnsafe();
    const isFallbackActive = !details.isPrimary && details.id !== 'none';
    const isManualRouting = state.modelRoutingMode === 'manual';
    const fallbackBadge = isFallbackActive
        ? '<span style="color: var(--warning); font-size: 9px; margin-left: 4px;">[FB]</span>'
        : '';
    const manualBadge = isManualRouting
        ? '<span style="color: var(--accent); font-size: 9px; margin-left: 4px;">[MANUAL]</span>'
        : '';

    const safeModelName = escapeHtml(details.name);
    const safeLimit = escapeHtml(String(details.limit));
    const resetSummary = formatResetSummary(details.resetAt || state.rateLimitResetAt);
    const resetMarkup = resetSummary
        ? ` <span class="rate-reset-info" title="${escapeHtml(resetSummary.absolute)}">| ${escapeHtml(resetSummary.relative)}</span>`
        : '';

    elements.displayModelName.innerHTML = `${safeModelName}${fallbackBadge}${manualBadge} <span class="rate-info" id="display-rate-limit">${safeLimit}%${resetMarkup}</span>`;

    if (isFallbackActive) {
        elements.displayModelName.style.color = 'var(--warning)';
    } else {
        elements.displayModelName.style.color = '';
    }

    const typingLabel = document.querySelector('#typing-indicator .system-label');
    if (typingLabel) {
        typingLabel.textContent = `${details.name} // `;
    }

    elements.displayRateLimit = document.getElementById('display-rate-limit');

    // Keep attachment affordance aligned with active model capability.
    void import('./model-capabilities.js')
        .then((m) => m.refreshAttachButtonCapabilityHint?.())
        .catch(() => { });
}

export function renderRatePanel() {
    if (!elements.ratePanelContent) return;

    const rows = [];
    rows.push(state.models.primary);

    for (const fallbackId of state.fallbackChain || []) {
        if (isSameModel(fallbackId, state.models.primary.id)) continue;
        const modelInfo = ensureModelEntry(fallbackId) || {
            id: fallbackId,
            name: getModelShortName(fallbackId),
            limit: 100,
            active: false,
            cooldown: 0,
            resetAt: null
        };
        rows.push(modelInfo);
    }

    if (
        state.models.fallback?.id
        && state.models.fallback.id !== 'none'
        && !isSameModel(state.models.fallback.id, state.models.primary.id)
        && !(state.fallbackChain || []).some((id) => isSameModel(id, state.models.fallback.id))
    ) {
        rows.push(state.models.fallback);
    }

    rows.forEach((model) => {
        model.active = isSameModel(model.id, state.currentActiveModelId);
    });

    const isManualRouting = state.modelRoutingMode === 'manual';
    const manualTargetId = resolveManualModelId() || state.manualModelId;

    let html = `
        <div class="rate-panel-header" style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-tertiary);">
                    Model Status // ${rows.length > 1 ? `PRIMARY + ${rows.length - 1} FALLBACK${rows.length > 2 ? 'S' : ''}` : 'SINGLE'}
                </div>
                <button id="model-route-auto" class="model-route-mode-btn" style="font-size: 10px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; background: ${isManualRouting ? 'var(--bg-base)' : 'var(--accent)20'}; color: ${isManualRouting ? 'var(--text-secondary)' : 'var(--accent)'};" ${isManualRouting ? '' : 'disabled'}>
                    ${isManualRouting ? 'Switch to Auto' : 'Auto Routing'}
                </button>
            </div>
        </div>
    `;

    html += rows.map((model) => {
        const limit = clampPercent(model.limit, 100);
        const isWarning = limit < 30;
        const isCritical = limit < 10;
        const statusClass = isCritical ? 'critical' : (isWarning ? 'warning' : '');
        const isPrimaryInPanel = isSameModel(model.id, state.models.primary.id);
        const cooldown = toCooldownSeconds(model.cooldown, 0);
        const cooldownText = cooldown > 0 ? formatCooldown(cooldown) : 'Ready';
        const resetSummary = formatResetSummary(model.resetAt);
        const roleLabel = isPrimaryInPanel ? 'PRIMARY' : 'FALLBACK';
        const roleColor = isPrimaryInPanel ? 'var(--accent)' : 'var(--text-tertiary)';
        const isManualTarget = isManualRouting && manualTargetId && isSameModel(model.id, manualTargetId);
        const routeButtonText = isManualTarget ? 'Pinned' : 'Use';
        const routeButtonDisabled = isManualTarget ? 'disabled' : '';

        return `
            <div class="model-row" style="margin-bottom: 16px; padding: 12px; background: var(--bg-base); border-radius: 4px; ${model.active ? 'border: 1px solid var(--accent);' : ''}">
                <div class="model-row-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div>
                        <span class="model-row-name ${model.active ? 'active' : ''}" style="font-weight: 600;">${escapeHtml(model.name || getModelShortName(model.id))}</span>
                        <span style="font-size: 9px; color: ${roleColor}; margin-left: 8px; padding: 2px 6px; background: ${roleColor}20; border-radius: 3px;">${roleLabel}</span>
                        ${model.active ? '<span style="color: var(--success); margin-left: 8px;">[ACTIVE]</span>' : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="model-row-limit ${statusClass}" style="font-size: 14px; font-weight: 600;">${escapeHtml(String(limit))}%</span>
                        <button class="model-route-btn" data-model-id="${escapeHtml(model.id)}" style="font-size: 10px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; background: ${isManualTarget ? 'var(--accent)20' : 'transparent'}; color: ${isManualTarget ? 'var(--accent)' : 'var(--text-secondary)'};" ${routeButtonDisabled}>${routeButtonText}</button>
                    </div>
                </div>
                <div class="limit-bar-bg" style="background: var(--bg-surface); height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                    <div class="limit-bar-fill ${statusClass}" style="width: ${limit}%; height: 100%; transition: width 0.3s ease;"></div>
                </div>
                <div class="cooldown-info" style="font-size: 10px; color: var(--text-tertiary); font-family: var(--font-mono);">
                    ${cooldown > 0 ? `COOLDOWN: ${escapeHtml(cooldownText)}` : (resetSummary ? `RESET: ${escapeHtml(resetSummary.relative)}` : 'READY FOR REQUESTS')}
                </div>
            </div>
        `;
    }).join('');

    if (isManualRouting && manualTargetId) {
        const target = rows.find((model) => isSameModel(model.id, manualTargetId));
        const label = target?.name || getModelShortName(manualTargetId);
        html += `
            <div style="margin-top: 2px; margin-bottom: 12px; font-size: 10px; color: var(--accent);">
                Manual routing pinned to ${escapeHtml(label)}
            </div>
        `;
    }

    if (rows.length > 1) {
        html += `
            <div class="rate-panel-footer" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-secondary);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="color: var(--accent);">[i]</span>
                    <span>Fallback chain: ${rows.length - 1} backup model${rows.length > 2 ? 's' : ''} configured</span>
                </div>
                <div style="font-size: 10px; color: var(--text-tertiary); margin-left: 16px;">
                    Engine will try each fallback sequentially on failure
                </div>
            </div>
        `;
    }

    elements.ratePanelContent.innerHTML = html;
}

function getModelShortName(modelId) {
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

function formatCooldown(seconds) {
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
