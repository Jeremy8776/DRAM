/**
 * DRAM State Manager (Main Process)
 * The single source of truth for persistent application state.
 */
import { EventEmitter } from 'events';

export class StateManager extends EventEmitter {
    constructor(secureStorage, windowManager) {
        super();
        this.secureStorage = secureStorage;
        this.windowManager = windowManager;
        this.state = {};
        this.initialized = false;
    }

    /**
     * Load initial state from storage
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Load all settings from secure storage
            const allSettings = await this.secureStorage.getDataSnapshot();
            this.state = { ...allSettings };

            this.initialized = true;
            console.log('[StateManager] Initialized with', Object.keys(this.state).length, 'keys');
        } catch (err) {
            console.error('[StateManager] Initialization failed:', err);
            this.state = {};
            this.initialized = true;
        }
    }

    /**
     * Get a value from state (supports dot-notation for nested keys)
     * @param {string} key 
     * @param {*} defaultValue 
     */
    get(key, defaultValue) {
        const parts = key.split('.');
        let current = this.state;

        for (const part of parts) {
            if (current === undefined || current === null) {
                return defaultValue;
            }
            current = current[part];
        }

        return current !== undefined ? current : defaultValue;
    }

    async set(key, value, persist = true) {
        const parts = key.split('.');
        const oldValue = this.get(key);

        // Shallow comparison for speed, could be deep for complex objects
        if (JSON.stringify(oldValue) === JSON.stringify(value)) return true;

        if (persist) {
            try {
                const saved = await this.secureStorage.set(key, value);
                if (!saved) {
                    console.error(`[StateManager] Failed to persist ${key}: save returned false`);
                    return false;
                }
            } catch (err) {
                console.error(`[StateManager] Failed to persist ${key}:`, err);
                return false;
            }
        }

        // Handle nested assignment
        if (parts.length > 1) {
            let current = this.state;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
                    current[part] = {};
                }
                current = current[part];
            }
            current[parts[parts.length - 1]] = value;
        } else {
            this.state[key] = value;
        }

        this.emit('change', { key, value, oldValue });
        this.broadcastChange(key, value);
        return true;
    }

    /**
     * Update state without persisting to storage
     * @param {string} key 
     * @param {*} value 
     */
    async setTransient(key, value) {
        return this.set(key, value, false);
    }

    /**
     * Delete a key from state and storage
     * @param {string} key 
     */
    async delete(key) {
        const parts = key.split('.');
        const oldValue = this.get(key);

        if (parts.length > 1) {
            let current = this.state;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!(part in current)) return true; // Already gone
                current = current[part];
            }
            delete current[parts[parts.length - 1]];
        } else {
            delete this.state[key];
        }

        try {
            const success = await this.secureStorage.delete(key);
            if (success) {
                this.emit('change', { key, value: undefined, oldValue });
                this.broadcastChange(key, undefined);
            }
            return success;
        } catch (err) {
            console.error(`[StateManager] Failed to delete ${key}:`, err);
            return false;
        }
    }

    /**
     * Broadcast change to renderer
     * @param {string} key 
     * @param {*} value 
     */
    broadcastChange(key, value) {
        if (this.windowManager) {
            this.windowManager.sendToRenderer('state:changed', { key, value });
        }
    }

    /**
     * Get snapshot of all state
     */
    getAll() {
        return { ...this.state };
    }
}

// Global instance helper if needed
let instance = null;
export function getStateManager(secureStorage, windowManager) {
    if (!instance && secureStorage && windowManager) {
        instance = new StateManager(secureStorage, windowManager);
    }
    return instance;
}
