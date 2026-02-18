/**
 * DRAM Connection UI Helper
 * Centralized UI updates for connection status
 */
import { state } from './state.js';

/**
 * Update all connection-related UI elements
 * @param {string} status - 'offline'|'launching'|'connecting'|'connected'|'disconnected'|'error'
 * @param {string} errorMsg - Optional error message
 */
export function updateConnectionUI(status, errorMsg = null) {
    const indicator = document.getElementById('status-indicator');
    const heroStatus = document.getElementById('hero-status');
    const popoverStatus = document.getElementById('popover-status');
    const popoverError = document.getElementById('popover-error');
    const gatewayStatus = document.getElementById('gateway-status');
    const btnLaunch = document.getElementById('btn-launch-gateway');

    // Clear error if not an error state
    if (status !== 'error' && popoverError) {
        popoverError.textContent = '';
    }

    switch (status) {
        case 'offline':
            if (indicator) indicator.className = 'indicator offline';
            if (heroStatus) heroStatus.textContent = 'Not Connected';
            if (popoverStatus) popoverStatus.textContent = 'Offline';
            if (gatewayStatus) gatewayStatus.textContent = 'Offline';
            if (btnLaunch) btnLaunch.textContent = 'Launch Gateway';
            break;

        case 'launching':
            if (indicator) indicator.className = 'indicator connecting';
            if (heroStatus) heroStatus.textContent = 'Launching Gateway...';
            if (popoverStatus) popoverStatus.textContent = 'Launching...';
            if (gatewayStatus) gatewayStatus.textContent = 'Starting';
            if (btnLaunch) btnLaunch.textContent = 'Launching...';
            break;

        case 'connecting':
            if (indicator) indicator.className = 'indicator connecting';
            if (heroStatus) heroStatus.textContent = 'Connecting...';
            if (popoverStatus) popoverStatus.textContent = 'Connecting...';
            if (gatewayStatus) gatewayStatus.textContent = 'Running';
            if (btnLaunch) btnLaunch.textContent = 'Connecting...';
            break;

        case 'connected':
            state.connected = true;
            state.gatewayRunning = true;
            state.lastError = null;
            if (indicator) indicator.className = 'indicator connected';
            if (heroStatus) heroStatus.textContent = 'Secure Link Active';
            if (popoverStatus) popoverStatus.textContent = 'Connected';
            if (gatewayStatus) gatewayStatus.textContent = 'Running';
            if (btnLaunch) btnLaunch.textContent = 'Connected';
            if (popoverError) popoverError.textContent = '';
            break;

        case 'disconnected':
            state.connected = false;
            if (indicator) indicator.className = 'indicator offline';
            if (heroStatus) heroStatus.textContent = 'Link Offline';
            if (popoverStatus) popoverStatus.textContent = 'Disconnected';
            // Gateway might still be running
            if (gatewayStatus) gatewayStatus.textContent = state.gatewayRunning ? 'Running' : 'Offline';
            if (btnLaunch) btnLaunch.textContent = state.gatewayRunning ? 'Reconnect' : 'Launch Gateway';
            break;

        case 'error':
            state.connected = false;
            state.lastError = errorMsg;
            if (indicator) indicator.className = 'indicator error';
            if (heroStatus) heroStatus.textContent = 'Connection Error';
            if (popoverStatus) popoverStatus.textContent = 'Error';
            if (popoverError && errorMsg) popoverError.textContent = errorMsg;
            if (gatewayStatus) gatewayStatus.textContent = state.gatewayRunning ? 'Running' : 'Failed';
            if (btnLaunch) btnLaunch.textContent = state.gatewayRunning ? 'Reconnect' : 'Launch Gateway';
            break;
    }
}
