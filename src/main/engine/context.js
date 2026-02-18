import path from 'path';
import { app } from 'electron';

/**
 * Builds the gateway context that the DRAM engine handlers expect.
 * @param {Object} modules - The loaded engine modules.
 * @param {Object} config - The engine configuration.
 * @param {Object} windowManager - The Electron window manager.
 * @returns {Object} The complete context object.
 */
export function buildEngineContext(modules, config, windowManager) {
    const m = modules;
    const cfg = config;

    // Create a proper logger for the gateway
    const logGateway = m.createSubsystemLogger('gateway');

    // Create chat run state (registry, buffers, etc.)
    const chatRunState = m.createChatRunState();

    const cronStorePath = path.join(app.getPath('userData'), 'cron-jobs.json');
    // Ensure the engine uses our preferred cron store path by default
    cfg.cron = cfg.cron || {};
    if (!cfg.cron.store) cfg.cron.store = cronStorePath;

    const deps = m.createDefaultDeps();
    const broadcast = (event, payload) => {
        if (!windowManager) return;

        try {
            let socketPayload;

            // Handle standard Gateway Protocol Event Frame
            if (event === 'chat') {
                // Optimization: Create a safe, minimal payload for chat events to avoid IPC overhead
                const chatData = {
                    runId: typeof payload?.runId === 'string' ? payload.runId : undefined,
                    state: typeof payload?.state === 'string' ? payload.state : undefined,
                    seq: typeof payload?.seq === 'number' ? payload.seq : undefined,
                    sessionKey: typeof payload?.sessionKey === 'string' ? payload.sessionKey : undefined,
                };

                if (payload?.content && typeof payload.content === 'string' && payload.content.length < 10000) {
                    chatData.content = payload.content;
                }

                if (payload?.delta?.content && typeof payload.delta.content === 'string') {
                    chatData.delta = { content: payload.delta.content.slice(0, 10000) };
                }

                if (payload?.message) {
                    chatData.message = {
                        role: payload.message.role,
                        content: Array.isArray(payload.message.content)
                            ? payload.message.content.map(c => ({ type: c.type, text: c.text?.slice(0, 5000) }))
                            : payload.message.content
                    };
                }

                if (payload?.errorMessage) {
                    chatData.errorMessage = String(payload.errorMessage).slice(0, 500);
                }

                if (payload?.meta) {
                    chatData.meta = {
                        model: payload.meta.model,
                        usage: payload.meta.usage ? {
                            inputTokens: payload.meta.usage.inputTokens || payload.meta.usage.input_tokens || payload.meta.usage.input || 0,
                            outputTokens: payload.meta.usage.outputTokens || payload.meta.usage.output_tokens || payload.meta.usage.output || 0,
                            totalTokens: payload.meta.usage.totalTokens || payload.meta.usage.total_tokens || 0,
                            cost: payload.meta.usage.cost || 0,
                            rateLimitRemainingPercent: payload.meta.usage.rateLimitRemainingPercent || payload.meta.usage.rate_limit || 100
                        } : undefined
                    };
                }

                socketPayload = {
                    type: 'event',
                    event: 'chat',
                    payload: chatData
                };

                // Legacy compatibility: some renderer parts might still expect type: 'chat'
                // We'll keep sending it as a direct object for now as handleMessage handles both
                // Actually, let's just send the standardized version.
            } else {
                // Generic event handling
                socketPayload = {
                    type: 'event',
                    event: event,
                    payload: payload
                };
            }

            /* Logging for important states
            if (event === 'chat' && (socketPayload.payload.state === 'error' || socketPayload.payload.state === 'final')) {
                console.log(`[DramEngine] Broadcasting ${event}:`, socketPayload.payload.state, 'runId:', socketPayload.payload.runId?.slice?.(0, 20));
            } else if (event !== 'chat' && event !== 'tick') {
                console.log(`[DramEngine] Broadcasting event: ${event}`);
            } */

            // Send to renderer (preload converts it if needed)
            windowManager.sendToRenderer('socket:data', socketPayload);

        } catch (err) {
            console.error('[DramEngine] Broadcast error:', err.message);
        }
    };

    const nodeRegistry = new m.NodeRegistry();
    const refreshGatewayHealthSnapshot =
        typeof m.refreshGatewayHealthSnapshot === 'function'
            ? m.refreshGatewayHealthSnapshot
            : (() => null);
    const nodeSubscriptions = m.createNodeSubscriptionManager();
    const cronService = m.buildGatewayCronService({
        cfg: cfg,
        deps: deps,
        broadcast: broadcast,
    });
    const execApprovalManager = new m.ExecApprovalManager();

    const nodeSendEvent = (opts) => {
        const payload = opts.payloadJSON ? JSON.parse(opts.payloadJSON) : null;
        nodeRegistry.sendEvent(opts.nodeId, opts.event, payload);
    };

    // Create real channel manager
    const logChannels = logGateway.child('channels');
    const channelLogs = {};
    const channelRuntimeEnvs = {};

    // Initialize channel logging and runtimes
    try {
        const plugins = m.listChannelPlugins();
        for (const plugin of plugins) {
            const childLog = logChannels.child(plugin.id);
            channelLogs[plugin.id] = childLog;
            channelRuntimeEnvs[plugin.id] = m.runtimeForLogger(childLog);
        }
    } catch (err) {
        console.error('[DramContext] Failed to init channel logs:', err);
    }

    const channelManager = m.createChannelManager({
        loadConfig: m.loadConfig,
        channelLogs,
        channelRuntimeEnvs
    });

    const context = {
        // Dependencies
        deps: deps,

        // Config
        config: cfg,
        cfg: cfg,

        // Services
        cron: cronService.cron,
        cronStorePath: cronService.storePath,
        nodeRegistry,
        nodeSubscriptions,
        execApprovalManager,

        // Health & Presence
        getHealthCache: m.getHealthCache,
        refreshGatewayHealthSnapshot,
        refreshHealthSnapshot: refreshGatewayHealthSnapshot,
        logHealth: {
            error: (message) => logGateway.error(`[Health] ${message}`)
        },
        incrementPresenceVersion: m.incrementPresenceVersion,
        getPresenceVersion: m.getPresenceVersion,
        getHealthVersion: m.getHealthVersion,

        // Module functions
        loadGatewayModelCatalog: m.loadGatewayModelCatalog,
        listChannelPlugins: m.listChannelPlugins,
        createChannelManager: m.createChannelManager,
        loadConfig: m.loadConfig,
        writeConfigFile: m.writeConfigFile,
        initSubagentRegistry: m.initSubagentRegistry,
        resolveDefaultAgentId: m.resolveDefaultAgentId,
        resolveAgentWorkspaceDir: m.resolveAgentWorkspaceDir,
        listGatewayMethods: m.listGatewayMethods,
        loadGatewayPlugins: m.loadGatewayPlugins,
        createDefaultDeps: m.createDefaultDeps,
        NodeRegistry: m.NodeRegistry,
        createNodeSubscriptionManager: m.createNodeSubscriptionManager,
        createChatRunState: m.createChatRunState,
        createAgentEventHandler: m.createAgentEventHandler,
        buildGatewayCronService: m.buildGatewayCronService,
        createSubsystemLogger: m.createSubsystemLogger,
        onAgentEvent: m.onAgentEvent,
        clearAgentRunContext: m.clearAgentRunContext,
        onHeartbeatEvent: m.onHeartbeatEvent,
        startHeartbeatRunner: m.startHeartbeatRunner,
        runtimeForLogger: m.runtimeForLogger,
        startGatewayMaintenanceTimers: m.startGatewayMaintenanceTimers,
        startGatewaySidecars: m.startGatewaySidecars,
        ExecApprovalManager: m.ExecApprovalManager,
        createExecApprovalHandlers: m.createExecApprovalHandlers,
        createExecApprovalForwarder: m.createExecApprovalForwarder,
        applyGatewayLaneConcurrency: m.applyGatewayLaneConcurrency,
        primeRemoteSkillsCache: m.primeRemoteSkillsCache,
        setSkillsRemoteRegistry: m.setSkillsRemoteRegistry,
        startGatewayDiscovery: m.startGatewayDiscovery,
        startGatewayTailscaleExposure: m.startGatewayTailscaleExposure,
        loadGatewayTlsRuntime: m.loadGatewayTlsRuntime,
        getMachineDisplayName: m.getMachineDisplayName,
        loggingState: m.loggingState,

        // Logging
        logGateway,

        // Chat runtime state (required by chat handlers) - Aliased to chatRunState
        chatRunState,
        chatAbortControllers: new Map(),
        chatRunBuffers: chatRunState.buffers,
        chatDeltaSentAt: chatRunState.deltaSentAt,
        chatAbortedRuns: chatRunState.abortedRuns,
        agentRunSeq: new Map(),

        // Dedupe cache
        dedupe: new Map(),

        // Broadcast functions
        broadcast: broadcast,

        // Node management
        nodeSendToSession: (sessionKey, event, payload) =>
            nodeSubscriptions.sendToSession(sessionKey, event, payload, nodeSendEvent),
        nodeSendToAllSubscribed: (event, payload) =>
            nodeSubscriptions.sendToAllSubscribed(event, payload, nodeSendEvent),
        nodeSubscribe: (nodeId, sessionKey) => nodeSubscriptions.subscribe(nodeId, sessionKey),
        nodeUnsubscribe: (nodeId, sessionKey) => nodeSubscriptions.unsubscribe(nodeId, sessionKey),
        nodeUnsubscribeAll: (nodeId) => nodeSubscriptions.unsubscribeAll(nodeId),
        hasConnectedMobileNode: () => false,

        // Chat run helpers
        addChatRun: chatRunState.registry.add,
        removeChatRun: (sessionId, clientRunId, sessionKey) => {
            const res = chatRunState.registry.remove(sessionId, clientRunId, sessionKey);
            context.chatAbortControllers.delete(clientRunId);
            context.chatRunBuffers.delete(clientRunId);
            context.chatDeltaSentAt.delete(clientRunId);
            context.agentRunSeq.delete(clientRunId);
            return res;
        },

        // Wizard & Session life-cycle
        wizardSessions: new Map(),
        findRunningWizard: () => null,
        purgeWizardSession: (_id) => { },
        getRuntimeSnapshot: channelManager.getRuntimeSnapshot,
        startChannel: channelManager.startChannel,
        stopChannel: channelManager.stopChannel,
        markChannelLoggedOut: channelManager.markChannelLoggedOut,
        startChannels: channelManager.startChannels,

        wizardRunner: async () => {
            logGateway.warn('wizardRunner called in embedded mode - not fully implemented');
        },
        broadcastVoiceWakeChanged: (triggers) => {
            context.broadcast('voice:wake_changed', { triggers });
        },

        // Session registry & state
        sessions: new Map(),
    };

    return context;
}
