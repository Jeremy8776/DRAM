/**
 * DRAM Desktop - Usage View Component
 * Standalone page for API usage, costs, and rate limits
 */

export function renderUsageView() {
    return `
    <div id="usage-view" class="view usage-viewport">
        <div class="usage-scroll">
            <div class="usage-toolbar">
                <div class="usage-toolbar-left">
                    <h1>API USAGE // DASHBOARD</h1>
                    <p>Historical costs and rate limits</p>
                </div>
                <div class="usage-actions">
                    <select id="usage-time-range" class="usage-time-select">
                        <option value="1">Last 24 Hours</option>
                        <option value="7">Last 7 Days</option>
                        <option value="30" selected>Last 30 Days</option>
                        <option value="90">Last 90 Days</option>
                    </select>
                    <button class="tactile-btn sm secondary" id="btn-refresh-usage" title="Refresh Stats">[R] Refresh</button>
                </div>
            </div>

            <div class="usage-content">
                <!-- Summary Cards -->
                <div class="usage-summary-grid">
                    <div class="usage-card total">
                        <div class="usage-card-header">
                            <span class="usage-icon">$</span>
                            <span class="usage-label">Total Spend (Period)</span>
                        </div>
                        <div class="usage-value" id="usage-total-cost">$0.00</div>
                        <div class="usage-subtext" id="usage-time-period">Period: Last 30 days</div>
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

                <!-- Daily Breakdown -->
                <div class="usage-section">
                    <div class="usage-section-header">
                        <h2>Daily Breakdown</h2>
                        <p class="muted">Cost trend over selected period</p>
                    </div>
                    <div class="usage-chart-container" id="usage-chart-container">
                        <canvas id="usage-chart" width="800" height="200"></canvas>
                    </div>
                </div>

                <!-- Provider Section -->
                <div class="usage-section">
                    <div class="usage-section-header">
                        <h2>Model / Provider Breakdown</h2>
                        <p class="muted">Entries for the selected period only, sorted by spend</p>
                    </div>

                    <div class="provider-usage-list" id="provider-usage-list">
                        <!-- Dynamically populated by usage-data.js -->
                        <div class="muted" style="padding: 20px; text-align: center;">Loading usage statistics...</div>
                    </div>
                </div>

                <!-- Pricing Reference -->
                <div class="usage-section">
                    <div class="usage-section-header">
                        <h2>Cost Reference</h2>
                        <p class="muted">Pricing for common models (per 1M tokens)</p>
                    </div>

                    <div class="pricing-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Model</th>
                                    <th>Input</th>
                                    <th>Output</th>
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
            </div>
        </div>
    </div>
    `;
}




