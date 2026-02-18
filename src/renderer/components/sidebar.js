/**
 * DRAM Desktop - Sidebar Component
 */
export function renderSidebar() {
    return `
    <div class="brand" id="connection-trigger">
        <span class="indicator" id="status-indicator"></span>
        <div class="connection-popover">
            <div class="popover-header">
                <span id="popover-status">Disconnected</span>
            </div>
            <div class="popover-error" id="popover-error"></div>
            <div class="popover-content">
                <div class="status-metric">
                    <span>Protocol</span>
                    <span class="mono">DRAM/2026</span>
                </div>
                <div class="status-metric">
                    <span>Gateway</span>
                    <span class="mono" id="gateway-status">Offline</span>
                </div>
            </div>
            <button id="btn-launch-gateway" class="popover-btn">Launch Gateway</button>
        </div>
    </div>

    <nav class="tool-nav">
        <button class="nav-item active" id="btn-show-chat" title="Chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path>
            </svg>
        </button>
        <button class="nav-item" id="btn-show-usage" title="Usage & Costs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20V10M18 20V4M6 20v-4"></path>
            </svg>
        </button>
        <button class="nav-item" id="btn-show-memory" title="Memory (Soul/Agents)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
            </svg>
        </button>
    </nav>

    <div class="sidebar-footer">
        <button class="nav-item" id="btn-show-settings" title="System Control">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"></path>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
            </svg>
        </button>
    </div>
    `;
}


