/**
 * DRAM Listeners - Gateway
 */
import { state } from '../state.js';
import { elements } from '../elements.js';
import { connect } from '../socket.js';
import { updateConnectionUI } from '../connection-ui.js';
import { humanizeError } from '../errors.js';

let connectionRetries = 0;
let retryTimeoutId = null;
let isShuttingDown = false;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

/**
 * Calculate exponential backoff delay with jitter
 */
function getRetryDelay() {
    const exponentialDelay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, connectionRetries), MAX_RETRY_DELAY);
    const jitter = Math.random() * 1000; // Add up to 1s jitter
    return exponentialDelay + jitter;
}

/**
 * Clear any pending retry timeout
 */
export function clearPendingRetries() {
    if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
    }
}

/**
 * Shutdown handler - call when app is closing
 */
export function shutdownGatewayListeners() {
    isShuttingDown = true;
    clearPendingRetries();
}

export function resetConnectionRetries() {
    connectionRetries = 0;
}

export function setupGatewayListeners(on) {
    isShuttingDown = false;
    clearPendingRetries();
    connectionRetries = 0;

    const btnLaunch = document.getElementById('btn-launch-gateway');
    on(btnLaunch, 'click', async () => {
        const onboardingComplete = await window.dram.storage.get('dram.onboardingComplete');
        const wsPath = await window.dram.storage.get('settings.workspacePath');

        if (!onboardingComplete || !wsPath) {
            const { wizardState } = await import('../wizard.js');
            const startStep = wizardState.foundLegacy ? 1 : 2;

            if (typeof window.showDramWizardStep === 'function') {
                window.showDramWizardStep(startStep);
            }
            return;
        }

        if (state.gatewayRunning && !state.connected) {
            updateConnectionUI('connecting');
            connect();
            return;
        }

        updateConnectionUI('launching');
        btnLaunch.disabled = true;

        try {
            const success = await window.dram.gateway.launchGateway();
            if (success) {
                state.gatewayRunning = true;
                connectionRetries = 0;
                updateConnectionUI('connecting');
                setTimeout(() => { connect(); }, 2500);
            } else {
                updateConnectionUI('error', 'Launch failed');
            }
        } catch (e) {
            updateConnectionUI('error', humanizeError(e));
        } finally {
            btnLaunch.disabled = false;
        }
    });

    on(elements.connectionForm, 'submit', (e) => { e.preventDefault(); connect(); });
}

export function handleConnectionStatus(status) {
    if (isShuttingDown) return;
    state.connecting = false;

    if (status === 'disconnected') {
        import('../usage-data.js').then(m => m.cancelPendingUsageRequests()).catch(() => { });
        state.connected = false;
        // Main process handles gateway restarts/reconnects; keep renderer passive here.
        updateConnectionUI('connecting');
        clearPendingRetries();
    } else if (status === 'error') {
        import('../usage-data.js').then(m => m.cancelPendingUsageRequests()).catch(() => { });
        state.connected = false;
        if (connectionRetries < MAX_RETRIES) {
            connectionRetries++;
            const delay = getRetryDelay();
            console.log(`[Gateway] Retrying after error in ${Math.round(delay)}ms (attempt ${connectionRetries}/${MAX_RETRIES})`);
            retryTimeoutId = setTimeout(() => {
                if (!isShuttingDown) {
                    updateConnectionUI('connecting');
                    connect();
                }
            }, delay);
        } else {
            updateConnectionUI('error', 'Connection failed');
        }
    } else if (status === 'connected') {
        connectionRetries = 0;
        state.connected = true;
        updateConnectionUI('connected');
        import('../usage-data.js').then(m => m.loadUsageData()).catch(() => { });
    }
}






