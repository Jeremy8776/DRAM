/**
 * DRAM Desktop - Usage Data Management
 * Handles fetching and updating API usage statistics
 */

import { state } from '../../../modules/state.js';
import { updateUsageStats } from '../../../components/settings/tabs/usage.js';
import { updateModelStats } from '../../../modules/rate-limits.js';
import { logger } from '../../../modules/logger.js';

// Create context-specific logger (debug logs hidden in production)
const log = logger('Usage');

let usageRefreshInterval = null;
const REFRESH_INTERVAL = 30000; // 30 seconds
let currentTimeRange = 30; // Default to 30 days
let isFetching = false; // Prevent concurrent fetches

// Store pending RPC requests
const pendingRpcRequests = new Map();

function isDisconnectedError(err) {
    const message = err?.message || '';
    return message === 'Gateway disconnected' || message.includes('not connected');
}

/**
 * Make an RPC call to the gateway and wait for response
 */
function makeRpcCall(method, params = {}) {
    return new Promise((resolve, reject) => {
        if (!state.connected) {
            reject(new Error('Gateway disconnected'));
            return;
        }

        const requestId = `${method.replace('.', '-')}-${Date.now()}`;

        log.debug(` Making RPC call: ${method}`, {
            id: requestId,
            params
        });

        const timeoutId = setTimeout(() => {
            log.error(` Request timeout for ${method}`);
            pendingRpcRequests.delete(requestId);
            reject(new Error(`${method} request timeout`));
        }, 30000); // Increased from 10s to 30s for slow operations

        // Store the request handlers
        pendingRpcRequests.set(requestId, {
            resolve,
            reject,
            timeoutId,
            method
        });

        log.debug(' Sending request via socket:', requestId);

        // Send the request
        try {
            window.dram.socket.send({
                type: 'req',
                id: requestId,
                method,
                params
            });
            log.debug(' Request sent successfully:', requestId);
        } catch (err) {
            log.error(' Failed to send request:', err);
            clearTimeout(timeoutId);
            pendingRpcRequests.delete(requestId);
            reject(err);
        }
    });
}

/**
 * Handle incoming RPC responses
 * This should be called from the socket message handler
 */
export function handleUsageRpcResponse(data) {
    log.debug(' RPC Response received:', data);

    if (data.type !== 'res') {
        log.warn(' Not a response message:', data.type);
        return;
    }

    const requestId = data.id;
    const pending = pendingRpcRequests.get(requestId);

    if (!pending) {
        log.debug(' No pending request found for:', requestId);
        return;
    }

    log.debug(' Processing response for:', pending.method);
    clearTimeout(pending.timeoutId);
    pendingRpcRequests.delete(requestId);

    if (data.ok) {
        log.debug(' Response payload:', data.payload);
        pending.resolve(data.payload);
    } else {
        const errorMessage = String(data.error?.message || '').toLowerCase();
        const isDisconnect = errorMessage.includes('disconnected') || errorMessage.includes('not connected');
        if (isDisconnect) {
            log.debug(' Ignoring disconnected usage response:', data.id, data.error?.message);
        } else {
            log.error(' Request failed:', data.error);
        }
        pending.reject(new Error(data.error?.message || `${pending.method} request failed`));
    }
}

/**
 * Fetch usage statistics from the gateway
 */
export async function fetchUsageData(days = currentTimeRange) {
    if (!state.connected) {
        return null;
    }

    // Prevent concurrent fetches
    if (isFetching) {
        log.debug(' Fetch already in progress, skipping');
        return null;
    }

    isFetching = true;

    try {
        log.debug(` Fetching data for last ${days} days...`);

        // Fetch provider usage status (rate limits, current usage)
        const statusPromise = makeRpcCall('usage.status', {});

        // Fetch cost summary for the specified time range
        const costPromise = makeRpcCall('usage.cost', { days: parseInt(days) });

        // Wait for both requests
        const [statusData, costData] = await Promise.all([statusPromise, costPromise]);

        log.debug(' ===== RAW DATA =====');
        log.debug(' Cost data:', JSON.stringify(costData, null, 2));
        log.debug(' Status data:', JSON.stringify(statusData, null, 2));
        log.debug(' ========================');

        // Combine and transform the data
        const usageStats = transformUsageData(statusData, costData);

        log.debug(' ===== TRANSFORMED DATA =====');
        log.debug(' Stats:', JSON.stringify(usageStats, null, 2));
        log.debug(' ============================');

        return usageStats;
    } catch (err) {
        if (isDisconnectedError(err)) {
            log.debug(' Usage fetch skipped: gateway disconnected');
            return null;
        }
        log.error(' Failed to fetch usage data:', err);
        return null;
    } finally {
        isFetching = false;
    }
}

/**
 * Map provider IDs to UI-friendly names
 */
const PROVIDER_NAME_MAP = {
    'anthropic': 'anthropic',
    'openai': 'openai',
    'openai-codex': 'openai',
    'google': 'google',
    'google-gemini-cli': 'google',
    'google-antigravity': 'google',
    'groq': 'groq',
    'minimax': 'minimax',
    'elevenlabs': 'elevenlabs',
    'github-copilot': 'github',
    'zai': 'zai'
};

const LOCAL_PROVIDER_IDS = new Set(['ollama', 'local', 'lmstudio', 'llamacpp', 'vllm']);

/**
 * Normalize provider ID to UI name
 */
function normalizeProviderId(providerId) {
    if (!providerId) return null;
    const id = providerId.toLowerCase();

    // Check direct map first
    if (PROVIDER_NAME_MAP[id]) return PROVIDER_NAME_MAP[id];

    // Handle slash formats (anthropic/claude-3 -> anthropic)
    if (id.includes('/')) {
        const root = id.split('/')[0];
        if (PROVIDER_NAME_MAP[root]) return PROVIDER_NAME_MAP[root];
        return root;
    }

    // Fallback to hyphen split (openai-codex -> openai)
    const hyphenRoot = id.split('-')[0];
    return PROVIDER_NAME_MAP[hyphenRoot] || hyphenRoot || id;
}

function isLocalProvider(providerId) {
    const normalized = normalizeProviderId(providerId);
    if (!normalized) return false;
    return LOCAL_PROVIDER_IDS.has(normalized);
}

function isLocalModelIdentifier(modelId, providerId) {
    if (isLocalProvider(providerId)) return true;
    const value = String(modelId || '').toLowerCase();
    if (!value) return false;
    return value.startsWith('ollama/')
        || value.startsWith('local/')
        || value.includes('/local')
        || value.includes('ollama')
        || value.includes('lmstudio')
        || value.includes('llama.cpp')
        || value.includes('llamacpp')
        || value.includes('vllm');
}

function normalizeLocalUsageEntry(rawValue) {
    if (rawValue && typeof rawValue === 'object') {
        return {
            requests: Number(rawValue.requests || 0),
            inputTokens: Number(rawValue.inputTokens || 0),
            outputTokens: Number(rawValue.outputTokens || 0),
            provider: String(rawValue.provider || '')
        };
    }
    return {
        requests: Number(rawValue || 0),
        inputTokens: 0,
        outputTokens: 0,
        provider: ''
    };
}

function buildLocalBreakdownKey(entry) {
    const provider = String(entry?.provider || 'local').toLowerCase();
    const modelId = String(entry?.modelId || '').trim().toLowerCase();
    const label = String(entry?.label || '').trim().toLowerCase();
    return `${provider}::${modelId || label || 'local'}`;
}

function collectSessionLocalBreakdown() {
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const localMap = new Map();

    for (const session of sessions) {
        if (!session || typeof session !== 'object') continue;

        const localModelUsage = (session.localModelUsage && typeof session.localModelUsage === 'object')
            ? session.localModelUsage
            : null;

        if (localModelUsage && Object.keys(localModelUsage).length > 0) {
            for (const [modelIdRaw, usageRaw] of Object.entries(localModelUsage)) {
                const modelId = String(modelIdRaw || '').trim();
                const usage = normalizeLocalUsageEntry(usageRaw);
                const provider = normalizeProviderId(usage.provider || getProviderForModel(modelId)) || 'local';
                if (!isLocalModelIdentifier(modelId, provider)) continue;
                const entry = {
                    id: `local-session:${provider}:${modelId || 'local'}`,
                    provider,
                    label: getModelDisplayName(modelId, provider),
                    modelId,
                    cost: 0,
                    requests: usage.requests,
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    isLocal: true,
                    source: 'session'
                };
                const key = buildLocalBreakdownKey(entry);
                if (!localMap.has(key)) {
                    localMap.set(key, entry);
                    continue;
                }
                const existing = localMap.get(key);
                existing.requests += entry.requests;
                existing.inputTokens += entry.inputTokens;
                existing.outputTokens += entry.outputTokens;
            }
            continue;
        }

        // Backward-compatibility: old sessions used provider counters only.
        const providerRequests = (session.localProviderRequests && typeof session.localProviderRequests === 'object')
            ? session.localProviderRequests
            : {};
        for (const [providerRaw, usageRaw] of Object.entries(providerRequests)) {
            const provider = normalizeProviderId(providerRaw) || providerRaw;
            if (!isLocalProvider(provider)) continue;
            const usage = normalizeLocalUsageEntry(usageRaw);
            const entry = {
                id: `local-session:${provider}:provider`,
                provider,
                label: `${provider} (local)`,
                modelId: '',
                cost: 0,
                requests: usage.requests,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                isLocal: true,
                source: 'session'
            };
            const key = buildLocalBreakdownKey(entry);
            if (!localMap.has(key)) {
                localMap.set(key, entry);
                continue;
            }
            const existing = localMap.get(key);
            existing.requests += entry.requests;
            existing.inputTokens += entry.inputTokens;
            existing.outputTokens += entry.outputTokens;
        }
    }

    return Array.from(localMap.values());
}

function extractModelIdentifier(entry, normalizedProvider) {
    if (!entry || typeof entry !== 'object') return '';
    const candidates = [
        entry.model,
        entry.modelId,
        entry.model_id,
        entry.agentModel,
        entry.targetModel,
        entry.id
    ];
    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const value = candidate.trim();
        if (!value) continue;
        if (value.includes('/')) return value;
        if (normalizedProvider) return `${normalizedProvider}/${value}`;
        return value;
    }
    return '';
}

function getModelDisplayName(modelId, fallbackProvider) {
    if (typeof modelId !== 'string' || !modelId.trim()) {
        if (fallbackProvider) return fallbackProvider.charAt(0).toUpperCase() + fallbackProvider.slice(1);
        return 'Unknown';
    }
    const value = modelId.trim();
    if (value.includes('/')) return value.split('/')[1] || value;
    return value;
}

/**
 * Transform raw gateway data into UI-friendly format
 */
function transformUsageData(statusData, costData) {
    const stats = {
        totalCost: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalRequests: 0,
        providers: {},
        breakdown: [],
        localBreakdown: [],
        localTotals: {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0
        },
        daily: []
    };
    const breakdownMap = new Map();

    // Process cost data - this comes from session-cost-usage
    if (costData) {
        log.debug(' Processing cost data:', costData);

        // Handle totals
        if (costData.totals) {
            stats.totalCost = costData.totals.totalCost || 0;
            stats.inputTokens = costData.totals.input || 0;
            stats.outputTokens = costData.totals.output || 0;
            stats.totalTokens = stats.inputTokens + stats.outputTokens;
            stats.totalRequests = costData.totals.requests || 0;
        }

        // Store daily breakdown for chart
        if (costData.daily && Array.isArray(costData.daily)) {
            stats.daily = costData.daily.map(day => ({
                date: day.date,
                cost: day.totalCost || 0,
                tokens: day.totalTokens || 0
            }));

            log.debug(' Daily data:', stats.daily.length, 'days');

            // Recalculate totals if not provided
            if (!costData.totals) {
                stats.totalCost = 0;
                stats.inputTokens = 0;
                stats.outputTokens = 0;
                stats.totalRequests = 0;

                for (const dayEntry of costData.daily) {
                    stats.totalCost += dayEntry.totalCost || 0;
                    stats.inputTokens += dayEntry.input || 0;
                    stats.outputTokens += dayEntry.output || 0;
                    stats.totalRequests += dayEntry.requests || 0;
                }
                stats.totalTokens = stats.inputTokens + stats.outputTokens;
            }
        }

        // Extract per-provider cost data from session logs
        if (costData.providers && Array.isArray(costData.providers)) {
            log.debug(' Processing', costData.providers.length, 'provider cost entries');
            for (const providerCost of costData.providers) {
                const providerId = providerCost.provider;
                const name = normalizeProviderId(providerId);

                if (!name) {
                    log.warn(' Could not normalize provider ID from cost data:', providerId);
                    continue;
                }

                if (!stats.providers[name]) {
                    stats.providers[name] = {
                        cost: 0,
                        requests: 0,
                        inputTokens: 0,
                        outputTokens: 0
                    };
                }

                // Aggregate cost data into provider stats
                stats.providers[name].cost += (providerCost.totalCost || 0);
                stats.providers[name].inputTokens += (providerCost.input || 0);
                stats.providers[name].outputTokens += (providerCost.output || 0);
                stats.providers[name].requests += (providerCost.requests || 0);

                log.debug(' Provider aggregated data for', name, ':', stats.providers[name]);

                // Build model-first breakdown when model identifiers are present.
                const modelId = extractModelIdentifier(providerCost, name);
                const breakdownId = modelId || name;
                const isLocalEntry = isLocalModelIdentifier(modelId, name);
                if (!breakdownMap.has(breakdownId)) {
                    breakdownMap.set(breakdownId, {
                        id: breakdownId,
                        provider: name,
                        label: getModelDisplayName(modelId, name),
                        modelId: modelId || '',
                        cost: 0,
                        requests: 0,
                        inputTokens: 0,
                        outputTokens: 0,
                        isLocal: isLocalEntry
                    });
                }
                const entry = breakdownMap.get(breakdownId);
                entry.cost += (providerCost.totalCost || 0);
                entry.inputTokens += (providerCost.input || 0);
                entry.outputTokens += (providerCost.output || 0);
                entry.requests += (providerCost.requests || 0);
                entry.isLocal = Boolean(entry.isLocal || isLocalEntry);
            }
        }

        // If totalRequests is still 0 but we have provider data, sum it up
        if (stats.totalRequests === 0) {
            stats.totalRequests = Object.values(stats.providers).reduce((sum, p) => sum + (p.requests || 0), 0);
        }

        stats.days = costData.days || currentTimeRange;
        stats.updatedAt = costData.updatedAt || Date.now();
    }

    // Process status data (rate limits) - this comes from provider-usage
    if (statusData) {
        log.debug(' Status data structure:', statusData);

        if (statusData.providers && Array.isArray(statusData.providers)) {
            log.debug(' Processing', statusData.providers.length, 'providers');

            for (const provider of statusData.providers) {
                log.debug(' Raw provider data:', provider);

                const providerId = provider.provider || provider.id;
                const name = normalizeProviderId(providerId);

                if (!name) {
                    log.warn(' Could not normalize provider ID:', providerId);
                    continue;
                }

                log.debug(' Normalized provider name:', name);

                if (!stats.providers[name]) {
                    stats.providers[name] = {
                        cost: 0,
                        requests: 0,
                        inputTokens: 0,
                        outputTokens: 0
                    };
                }

                // Extract usage info from provider status if available
                if (provider.displayName) {
                    stats.providers[name].displayName = provider.displayName;
                }

                // Aggregate requests if present in status data AND not already set from cost data
                // This prevents double counting while allowing fallbacks if cost data is missing
                if (provider.statistics?.requests && stats.providers[name].requests === 0) {
                    stats.providers[name].requests = (provider.statistics.requests || 0);
                }

                // Add rate limit information
                if (provider.windows && Array.isArray(provider.windows) && provider.windows.length > 0) {
                    log.debug(' Processing', provider.windows.length, 'windows for', name);

                    // Use the most restrictive window (highest used percentage)
                    let mostRestrictive = provider.windows[0];
                    for (const window of provider.windows) {
                        if (window.usedPercent > mostRestrictive.usedPercent) {
                            mostRestrictive = window;
                        }
                    }

                    const remainingPercent = Math.max(0, Math.min(100, 100 - (mostRestrictive.usedPercent || 0)));

                    // If multiple provider IDs collapse to same name, take the most restrictive rate limit
                    if (stats.providers[name].rateLimit === undefined || remainingPercent < stats.providers[name].rateLimit) {
                        stats.providers[name].rateLimit = remainingPercent;
                        stats.providers[name].rateLimitLabel = mostRestrictive.label || 'Rate Limit';
                        stats.providers[name].resetAt = mostRestrictive.resetAt;
                    }

                    log.debug(' Rate limit for', name, ':', remainingPercent, '% remaining (used:', mostRestrictive.usedPercent, '%)');
                } else {
                    log.debug(' No rate limit windows for', name);
                }
            }
        } else {
            log.debug(' Status data does not have providers array:', statusData);
        }
    } else {
        log.debug(' No status data received');
    }

    log.debug(' ===== FINAL STATS =====');
    log.debug(' Providers:', Object.keys(stats.providers));
    const periodBreakdown = [];
    const localBreakdownByKey = new Map();
    for (const entry of breakdownMap.values()) {
        const providerMeta = stats.providers[entry.provider];
        if (providerMeta && providerMeta.rateLimit !== undefined) {
            entry.rateLimit = providerMeta.rateLimit;
            entry.rateLimitLabel = providerMeta.rateLimitLabel;
            entry.resetAt = providerMeta.resetAt;
        }

        if (entry.isLocal) {
            const localEntry = {
                ...entry,
                cost: 0,
                source: 'selected_period'
            };
            localBreakdownByKey.set(buildLocalBreakdownKey(localEntry), localEntry);
            continue;
        }
        periodBreakdown.push(entry);
    }

    // Add session-local metrics only when no selected-period local entry exists for the same model/provider.
    for (const localEntry of collectSessionLocalBreakdown()) {
        const key = buildLocalBreakdownKey(localEntry);
        if (!localBreakdownByKey.has(key)) {
            localBreakdownByKey.set(key, localEntry);
        }
    }

    for (const localEntry of localBreakdownByKey.values()) {
        stats.localTotals.requests += Number(localEntry.requests || 0);
        stats.localTotals.inputTokens += Number(localEntry.inputTokens || 0);
        stats.localTotals.outputTokens += Number(localEntry.outputTokens || 0);
    }

    stats.breakdown = periodBreakdown;
    stats.localBreakdown = Array.from(localBreakdownByKey.values());
    log.debug(' Breakdown entries:', stats.breakdown.length);
    log.debug(' Local breakdown entries:', stats.localBreakdown.length);
    log.debug(' Full stats:', stats);
    log.debug(' ==========================');

    return stats;
}

/**
 * Load and display usage data in the UI
 */
export async function loadUsageData(days = currentTimeRange) {
    if (!state.connected) {
        return;
    }

    log.debug(' Loading usage data for', days, 'days');

    const stats = await fetchUsageData(days);

    if (!stats) {
        log.debug(' No usage stats available for current refresh');
        return;
    }

    log.debug(' Transformed stats:', stats);
    updateUsageStats(stats);
    updateTimePeriodDisplay(days);

    // Update global rate limit UI for the currently active model
    const activeModelId = state.currentActiveModelId || state.models.primary.id;
    if (activeModelId) {
        const providerName = getProviderForModel(activeModelId);
        const providerStats = stats.providers[providerName];
        if (providerStats && providerStats.rateLimit !== undefined) {
            updateModelStats({
                model: activeModelId,
                usage: {
                    rateLimitRemainingPercent: providerStats.rateLimit,
                    resetAt: providerStats.resetAt,
                    label: providerStats.rateLimitLabel
                }
            });
        }
    }

    const dailySeries = Array.isArray(stats.daily) ? stats.daily : [];
    renderUsageChart(dailySeries);
    if (dailySeries.length === 0) {
        log.debug(' No daily data - rendered zero baseline');
    }
}

import { renderUsageChart } from '../../../modules/usage-chart.js';

/**
 * Update time period display
 */
function updateTimePeriodDisplay(days) {
    const ids = ['usage-range-period', 'usage-time-period'];
    let text = '';

    if (days === 1) text = 'Period: Last 24 hours';
    else if (days === 7) text = 'Period: Last 7 days';
    else if (days === 30) text = 'Period: Last 30 days';
    else if (days === 90) text = 'Period: Last 90 days';
    else text = `Period: Last ${days} days`;

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });
}

/**
 * Start auto-refresh of usage data
 */
export function startUsageRefresh() {
    stopUsageRefresh();
    if (state.connected) {
        loadUsageData(); // Load immediately when connected
    }
    usageRefreshInterval = setInterval(() => {
        if (!state.connected) return;
        loadUsageData();
    }, REFRESH_INTERVAL);
}

/**
 * Stop auto-refresh of usage data
 */
export function stopUsageRefresh() {
    if (usageRefreshInterval) {
        clearInterval(usageRefreshInterval);
        usageRefreshInterval = null;
    }
}

/**
 * Cancel in-flight usage RPC requests (e.g., on socket disconnect).
 */
export function cancelPendingUsageRequests() {
    if (pendingRpcRequests.size === 0) return;
    for (const pending of pendingRpcRequests.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Gateway disconnected'));
    }
    pendingRpcRequests.clear();
}

/**
 * Setup event listeners for usage page controls
 */
export function setupUsageListeners() {
    const btnRefresh = document.getElementById('btn-refresh-usage');
    const timeRangeSelect = document.getElementById('usage-time-range');

    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            btnRefresh.disabled = true;
            btnRefresh.textContent = 'Refreshing...';
            await loadUsageData(currentTimeRange);
            btnRefresh.textContent = '[R] Refresh';
            btnRefresh.disabled = false;
        });
    }

    if (timeRangeSelect) {
        timeRangeSelect.addEventListener('change', async (e) => {
            currentTimeRange = parseInt(e.target.value);
            log.debug(` Time range changed to ${currentTimeRange} days`);
            await loadUsageData(currentTimeRange);
        });
    }

    const btnReset = document.getElementById('btn-reset-usage');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            log.debug(' Resetting session usage stats');
            state.sessionCost = 0;
            state.localRequestCount = 0;
            state.localProviderRequests = {};
            state.localModelUsage = {};
            state.sessionInputTokens = 0;
            state.sessionOutputTokens = 0;
            state.sessionStartedAt = Date.now();

            // Refresh UI immediately
            loadUsageData(currentTimeRange);

            import('../../components/dialog.js').then(d => {
                d.showToast({ message: 'Session counters reset', type: 'info' });
            });
        });
    }

    // Keyboard shortcut for refresh
    document.addEventListener('keydown', (e) => {
        const usageView = document.getElementById('usage-view');
        if (usageView && usageView.classList.contains('active') && e.key === 'r' && !e.ctrlKey && !e.metaKey) {
            const activeElement = document.activeElement;
            if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA' && activeElement.tagName !== 'SELECT') {
                e.preventDefault();
                loadUsageData(currentTimeRange);
            }
        }
    });
}

/**
 * Determine provider ID from model ID
 */
export function getProviderForModel(modelId) {
    if (!modelId) return 'unknown';
    const id = modelId.toLowerCase();

    // Check for slash prefix first (anthropic/claude-3 -> anthropic)
    if (id.includes('/')) {
        const root = id.split('/')[0];
        if (root.includes('anthropic')) return 'anthropic';
        if (root.includes('openai')) return 'openai';
        if (root.includes('google')) return 'google';
        if (root.includes('groq')) return 'groq';
        if (root.includes('github')) return 'github';
        if (root.includes('minimax')) return 'minimax';
        if (root.includes('elevenlabs')) return 'elevenlabs';
    }

    if (id.includes('claude')) return 'anthropic';
    if (id.includes('gpt') || id.includes('o1') || id.includes('o3')) return 'openai';
    if (id.includes('antigravity')) return 'google';
    if (id.includes('gemini')) return 'google';
    if (id.includes('llama') || id.includes('mixtral')) return 'groq';
    if (id.includes('eleven')) return 'elevenlabs';
    if (id === 'ollama' || id.includes('local')) return 'ollama';
    return id.split('/')[0] || 'unknown';
}
