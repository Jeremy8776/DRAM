/**
 * DRAM Event Listener Orchestrator
 * Modularized for Golden Rule compliance.
 */
import { elements } from './elements.js';
import { handleConnectionStatus, setupGatewayListeners, shutdownGatewayListeners } from './listeners/gateway-listeners.js';
import { setupChatListeners } from './listeners/chat-listeners.js';
import { setupSettingsListeners } from './listeners/settings-listeners.js';
import { setupUtilListeners } from './listeners/util-listeners.js';
import { setupMemoryListeners } from './listeners/memory-listeners.js';
import { setupUiPromptListeners } from './listeners/ui-prompt-listeners.js';
import { setupOpenClawManagementListeners } from './listeners/api-key-listeners.js';

export { resetConnectionRetries, shutdownGatewayListeners, clearPendingRetries } from './listeners/gateway-listeners.js';

/**
 * Shutdown all listeners and cleanup resources
 * Call this when app is closing to prevent memory leaks and hanging processes
 */
export function shutdownAllListeners() {
    shutdownGatewayListeners();
    // Add other cleanup as needed
}

export function setupEventListeners() {
    const on = (el, type, fn) => { if (el) el.addEventListener(type, fn); };

    // Refresh dynamic collections
    elements.toolNavItems = document.querySelectorAll('.tool-nav .nav-item');
    elements.navItems = document.querySelectorAll('.dashboard-nav-item');
    elements.btnSettings = document.getElementById('btn-show-settings');

    // Setup modular listeners
    setupGatewayListeners(on);
    setupChatListeners(on);
    setupSettingsListeners(on);
    setupUtilListeners(on);
    setupMemoryListeners(on);

    // Setup usage page listeners
    import('./usage-data.js').then(m => {
        m.setupUsageListeners();
    });
}

export function setupIpcListeners() {
    window.dram.socket.onData((data) => {
        import('./socket.js').then(m => m.handleMessage(data));
    });

    window.dram.socket.onStatus((status) => {
        handleConnectionStatus(status);
    });

    if (typeof window.dram.on === 'function') {
        window.dram.on('ui:open-settings', () => {
            const btn = document.getElementById('btn-show-settings');
            if (btn) btn.click();
        });

        window.dram.on('chat:new', () => {
            import('./tabs.js').then(m => m.createNewTab());
        });
    }

    setupUiPromptListeners();
    setupOpenClawManagementListeners();
}
