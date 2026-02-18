/**
 * DRAM State Bridge (Renderer Process)
 * Synchronizes the renderer state object with the main process StateManager.
 */
import { state } from './state.js';
import { redactObject } from './logger.js';

export function setupStateBridge() {
    // 1. Listen for changes from main
    // Note: In our preload, window.dram.on is a function: on(channel, callback)
    if (typeof window.dram.on === 'function') {
        window.dram.on('state:changed', ({ key, value }) => {
            const displayValue = (typeof key === 'string' && /key|token|secret|password|passwd/i.test(key))
                ? (typeof value === 'string' ? '***' : redactObject(value))
                : value;
            console.log(`[StateBridge] State changed: ${key} =`, displayValue);

            // Handle nested keys or direct assignment
            if (key.includes('.')) {
                const parts = key.split('.');
                let current = state;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) current[parts[i]] = {};
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = value;
            } else {
                state[key] = value;
            }

            // Side-effect: Toggle advanced mode class on body
            if (key === 'settings.advancedMode') {
                document.body.classList.toggle('advanced-mode-enabled', !!value);
            }

            // Side-effect: Handle engine status changes
            if (key === 'engine.status') {
                import('./connection-ui.js').then(m => {
                    const error = state.engine?.lastError;
                    import('./errors.js').then(errMod => {
                        const humanError = error ? errMod.humanizeError(error) : null;
                        m.updateConnectionUI(value, humanError);
                    });
                });
            }

            if (key === 'engine.connected') {
                document.body.classList.toggle('engine-connected', !!value);
                document.body.classList.toggle('engine-offline', !value);
            }

            // Also fire a custom event for components to listen to if needed
            const event = new CustomEvent('dram:state:changed', { detail: { key, value } });
            window.dispatchEvent(event);
        });

        console.log('[StateBridge] Listening for state changes from main');

        // 2. Initial sync for body classes
        window.dram.storage.get('settings.advancedMode').then(val => {
            if (val) document.body.classList.add('advanced-mode-enabled');
        });
    }
}

/**
 * Update state and persist it to main
 * @param {string} key 
 * @param {*} value 
 */
export async function setState(key, value) {
    // Note: We don't update local state here because the loopback from 
    // StateManager -> IPC -> StateBridge will handle it consistently.
    // This ensures the main process is ALWAY the source of truth.
    return await window.dram.storage.set(key, value);
}






