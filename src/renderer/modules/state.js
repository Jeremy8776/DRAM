/**
 * DRAM State Management
 */
const rawState = {
    connected: false,
    connecting: false,

    // Multi-session support
    sessions: [
        {
            id: 'main',
            name: 'Original Chat',
            messages: [],
            sessionCost: 0,
            sessionInputTokens: 0,
            sessionOutputTokens: 0,
            localRequestCount: 0,
            localProviderRequests: {},
            localModelUsage: {},
            sessionStartedAt: Date.now()
        }
    ],
    currentSessionId: 'main',

    attachments: [],
    sessionKey: 'main', // Key identifier for the active session
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    model: null,
    rateLimit: '100',
    rateLimitResetAt: null,
    models: {
        'primary': { id: 'anthropic/claude-opus-4-5', name: 'Claude Opus', limit: 100, active: true, cooldown: 0, resetAt: null },
        'fallback': { id: 'none', name: 'None', limit: 100, active: false, cooldown: 0, resetAt: null }
    },
    currentActiveModelId: 'anthropic/claude-opus-4-5',
    modelRoutingMode: 'auto',
    manualModelId: null,
    fallbackChain: [],
    lastRequestCost: null,
    gatewayRunning: false,
    voiceStreamSupported: false,
    voiceStreamCapabilityChecked: false,
    lastError: null
};

export const state = new Proxy(rawState, {
    get(target, prop) {
        if (prop === 'messages' || prop === 'sessionCost' || prop === 'sessionInputTokens' || prop === 'sessionOutputTokens' || prop === 'localRequestCount' || prop === 'localProviderRequests' || prop === 'localModelUsage' || prop === 'sessionStartedAt') {
            const session = target.sessions.find(s => s.id === target.currentSessionId);
            if (!session) {
                if (prop === 'messages') return [];
                if (prop === 'localProviderRequests') return {};
                if (prop === 'localModelUsage') return {};
                if (prop === 'sessionStartedAt') return Date.now();
                return 0;
            }
            return session[prop];
        }
        return target[prop];
    },
    set(target, prop, value) {
        if (prop === 'messages' || prop === 'sessionCost' || prop === 'sessionInputTokens' || prop === 'sessionOutputTokens' || prop === 'localRequestCount' || prop === 'localProviderRequests' || prop === 'localModelUsage' || prop === 'sessionStartedAt') {
            const session = target.sessions.find(s => s.id === target.currentSessionId);
            if (session) session[prop] = value;
            return true;
        }
        // Direct assignment to sessions array or currentSessionId
        target[prop] = value;
        return true;
    }
});

// Expose to window for global access (using a safe name)
window.__DRAM_STATE__ = state;
