/**
 * DRAM Desktop - Usage & Costs Tab
 * Displays API usage, costs, and rate limits
 */
import { escapeHtml } from '../utils.js';

type UsageBreakdownItem = {
    id?: string;
    provider?: string;
    label?: string;
    displayName?: string;
    cost?: number;
    requests?: number;
    inputTokens?: number;
    outputTokens?: number;
    rateLimit?: number;
    chars?: number;
    audio?: number;
    isLocal?: boolean;
};

type UsageStats = {
    totalCost?: number;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalRequests?: number;
    days?: number;
    breakdown?: UsageBreakdownItem[];
    localBreakdown?: UsageBreakdownItem[];
    providers?: Record<string, UsageBreakdownItem>;
};

export function renderUsageTab() {
    return `
    <div id="tab-usage" class="tab-content hidden">
        <div class="settings-section">
            <div class="section-header">
                <h2>API Usage Dashboard</h2>
                <p class="muted">Monitor your API consumption and costs across all providers</p>
            </div>

            <!-- Summary Cards -->
            <div class="usage-summary-grid">
                <div class="usage-card total">
                    <div class="usage-card-header">
                        <span class="usage-icon">$</span>
                        <span class="usage-label">Total Spend (Period)</span>
                    </div>
                    <div class="usage-value" id="usage-total-cost">$0.00</div>
                    <div class="usage-subtext" id="usage-range-period">Period: Last 30 days</div>
                </div>
                <div class="usage-card tokens">
                    <div class="usage-card-header">
                        <span class="usage-icon">T</span>
                        <span class="usage-label">Range Tokens</span>
                    </div>
                    <div class="usage-value" id="usage-total-tokens">0</div>
                    <div class="usage-subtext"><span id="usage-input-tokens">0</span> in / <span id="usage-output-tokens">0</span> out</div>
                </div>
                <div class="usage-card requests">
                    <div class="usage-card-header">
                        <span class="usage-icon">#</span>
                        <span class="usage-label">Range Requests</span>
                    </div>
                    <div class="usage-value" id="usage-total-requests">0</div>
                    <div class="usage-subtext" id="usage-request-rate">0.0 req/day</div>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <div class="section-header">
                <h2>Model / Provider Breakdown</h2>
                <p class="muted">Selected-period usage and spend, sorted by highest cost</p>
            </div>

            <div class="provider-usage-list" id="provider-usage-list">
                <!-- Dynamically populated by updateUsageStats -->
                <div class="muted" style="padding: 20px; text-align: center;">Loading usage data...</div>
            </div>
        </div>

        <div class="settings-section">
            <div class="section-header">
                <h2>Cost Estimation</h2>
                <p class="muted">Pricing reference for common models</p>
            </div>

            <div class="pricing-table">
                <table>
                    <thead>
                        <tr>
                            <th>Model</th>
                            <th>Input (per 1M tokens)</th>
                            <th>Output (per 1M tokens)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Claude Opus 4.5</td>
                            <td>$15.00</td>
                            <td>$75.00</td>
                        </tr>
                        <tr>
                            <td>Claude Sonnet 3.7</td>
                            <td>$3.00</td>
                            <td>$15.00</td>
                        </tr>
                        <tr>
                            <td>GPT-4o</td>
                            <td>$2.50</td>
                            <td>$10.00</td>
                        </tr>
                        <tr>
                            <td>GPT-4o Mini</td>
                            <td>$0.15</td>
                            <td>$0.60</td>
                        </tr>
                        <tr>
                            <td>Gemini 1.5 Flash</td>
                            <td>$0.075</td>
                            <td>$0.30</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="settings-actions">
            <button class="tactile-btn secondary" id="btn-refresh-usage">Refresh Stats</button>
            <button class="tactile-btn secondary" id="btn-reset-usage">Reset Session Counters</button>
        </div>
    </div>
    `;
}

/**
 * Update usage statistics in the UI
 * @param {Object} stats - Usage statistics object
 */
export function updateUsageStats(stats: UsageStats | null | undefined) {
    console.log('[Usage UI] Updating stats:', stats);

    if (!stats) {
        console.warn('[Usage UI] No stats provided');
        return;
    }

    // Update totals
    const totalCost = document.getElementById('usage-total-cost');
    const totalTokens = document.getElementById('usage-total-tokens');
    const inputTokens = document.getElementById('usage-input-tokens');
    const outputTokens = document.getElementById('usage-output-tokens');
    const totalRequests = document.getElementById('usage-total-requests');

    if (totalCost) {
        const cost = stats.totalCost || 0;
        totalCost.textContent = `$${cost.toFixed(4)}`;
    }

    if (totalTokens) {
        totalTokens.textContent = formatNumber(stats.totalTokens || 0);
    }

    if (inputTokens) inputTokens.textContent = formatNumber(stats.inputTokens || 0);
    if (outputTokens) outputTokens.textContent = formatNumber(stats.outputTokens || 0);
    if (totalRequests) {
        const reqCount = stats.totalRequests || 0;
        totalRequests.textContent = formatNumber(reqCount);

        // Calculate request rate (req/day) based on range
        const days = stats.days || 30;
        const rate = reqCount / days;
        const rateEl = document.getElementById('usage-request-rate');
        if (rateEl) {
            rateEl.textContent = `${rate.toFixed(1)} req/day`;
        }
    }

    // Update dynamic model/provider breakdown (sorted by highest spend)
    const listContainer = document.getElementById('provider-usage-list');
    if (listContainer) {
        const paidBreakdown: UsageBreakdownItem[] = Array.isArray(stats.breakdown)
            ? stats.breakdown
            : Object.entries((stats.providers || {}) as Record<string, UsageBreakdownItem>).map(([id, data]) => ({
                id,
                provider: id,
                label: data?.displayName || id,
                ...data
            }));
        const localBreakdown: UsageBreakdownItem[] = Array.isArray(stats.localBreakdown) ? stats.localBreakdown : [];

        const hasUsage = (item) => Number(item?.cost || 0) > 0
            || Number(item?.requests || 0) > 0
            || Number(item?.inputTokens || 0) > 0
            || Number(item?.outputTokens || 0) > 0;

        const sortedBreakdown = paidBreakdown
            .filter(hasUsage)
            .sort((a, b) => (b.cost || 0) - (a.cost || 0));
        const sortedLocalBreakdown = localBreakdown
            .filter(hasUsage)
            .sort((a, b) => (Number(b.requests || 0) - Number(a.requests || 0))
                || (Number(b.inputTokens || 0) + Number(b.outputTokens || 0))
                - (Number(a.inputTokens || 0) + Number(a.outputTokens || 0)));

        const sections = [];
        if (sortedBreakdown.length > 0) {
            sections.push(`
                <div class="usage-breakdown-section">
                    <div class="usage-breakdown-title">Paid Usage (Selected Period)</div>
                    <div class="provider-usage-grid">
                        ${sortedBreakdown.map(item => renderBreakdownCard(item, { local: false })).join('')}
                    </div>
                </div>
            `);
        }
        if (sortedLocalBreakdown.length > 0) {
            sections.push(`
                <div class="usage-breakdown-section">
                    <div class="usage-breakdown-title">Local Usage (No Spend Tracked)</div>
                    <div class="usage-breakdown-note">Session-local counters are shown separately from provider spend.</div>
                    <div class="provider-usage-grid">
                        ${sortedLocalBreakdown.map(item => renderBreakdownCard(item, { local: true })).join('')}
                    </div>
                </div>
            `);
        }

        listContainer.innerHTML = sections.length === 0
            ? '<div class="muted" style="padding: 20px; text-align: center;">No usage data for selected period</div>'
            : sections.join('');
    }
}

/**
 * Render a single dynamic usage breakdown card
 */
function renderBreakdownCard(item: UsageBreakdownItem, options: { local?: boolean } = {}) {
    const safeId = String(item?.id || item?.provider || 'unknown');
    const provider = String(item?.provider || '').toLowerCase();
    const label = String(item?.label || safeId);
    const isLocal = Boolean(options.local || item?.isLocal);
    const headerName = provider && label.toLowerCase() !== provider
        ? `${label} (${provider})`
        : label;

    const cost = Number(item?.cost || 0);
    const inputTokens = Number(item?.inputTokens || 0);
    const outputTokens = Number(item?.outputTokens || 0);
    const requests = Number(item?.requests || 0);

    // Determine active status: active if we have rate limits OR if we have spent/usage
    const hasUsage = (cost > 0 || inputTokens > 0 || outputTokens > 0 || requests > 0);
    const hasRateLimit = item?.rateLimit !== undefined && item?.rateLimit !== null;
    const isActive = hasRateLimit || hasUsage;

    const statusClass = isLocal ? 'active local' : (isActive ? 'active' : 'inactive');
    const statusText = isLocal ? 'Local' : (isActive ? 'Active' : 'Inactive');
    const costDisplay = isLocal ? 'No spend' : `$${cost.toFixed(4)}`;

    // Rate Limit Logic
    let ratePercentDisplay = 'N/A';
    let rateWidth = 0;
    let rateClass = '';

    if (isLocal) {
        ratePercentDisplay = 'Tracked separately';
        rateWidth = 0;
        rateClass = 'unmetered';
    } else if (hasRateLimit) {
        const percent = Number(item.rateLimit || 0);
        ratePercentDisplay = `${Math.round(percent)}%`;
        rateWidth = Math.max(0, Math.min(100, percent));
        if (percent < 20) rateClass = 'critical';
        else if (percent < 50) rateClass = 'warning';
    } else if (isActive) {
        // Active but no rate limit data (likely unlimited or not reported)
        ratePercentDisplay = 'Unmetered';
        rateWidth = 100;
        rateClass = 'unmetered';
    }

    // ElevenLabs specific fields
    const isVoice = provider === 'elevenlabs';
    const stat1Label = isVoice ? 'Characters' : 'Input Tokens';
    const stat1Value = isVoice ? Number(item?.chars || 0) : inputTokens;
    const stat2Label = isVoice ? 'Audio (sec)' : 'Output Tokens';
    const stat2Value = isVoice ? Number(item?.audio || 0) : outputTokens;

    return `
    <div class="provider-usage-card ${isLocal ? 'local-usage' : ''}" data-provider="${escapeHtml(safeId)}">
        <div class="provider-header">
            <div class="provider-info">
                <span class="provider-name">${escapeHtml(headerName)}</span>
                <span class="provider-status ${escapeHtml(statusClass)}">${escapeHtml(statusText)}</span>
            </div>
            <div class="provider-cost">${escapeHtml(costDisplay)}</div>
        </div>
        <div class="provider-stats">
            <div class="stat">
                <span class="stat-label">Requests</span>
                <span class="stat-value">${escapeHtml(String(requests))}</span>
            </div>
            <div class="stat">
                <span class="stat-label">${escapeHtml(stat1Label)}</span>
                <span class="stat-value">${escapeHtml(formatNumber(stat1Value))}</span>
            </div>
            <div class="stat">
                <span class="stat-label">${escapeHtml(stat2Label)}</span>
                <span class="stat-value">${escapeHtml(formatNumber(stat2Value))}</span>
            </div>
        </div>
        ${isLocal
            ? '<div class="usage-local-note">Local runtime usage is tracked without dollar spend.</div>'
            : `
        <div class="rate-limit-bar">
            <div class="rate-limit-label">
                <span>${isVoice ? 'Monthly Quota' : 'Rate Limit'}</span>
                <span>${escapeHtml(ratePercentDisplay)}</span>
            </div>
            <div class="rate-limit-track">
                <div class="rate-limit-fill ${escapeHtml(rateClass)}" style="width: ${rateWidth}%"></div>
            </div>
        </div>
        `}
    </div>
    `;
}

/**
 * Format large numbers with K/M suffixes
 */
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}






