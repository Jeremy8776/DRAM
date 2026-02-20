/**
 * DRAM DOM Element Registry
 * Provides access to UI elements. 
 * Call refreshElements() after dynamic content injection.
 */
export const elements: Record<string, any> = {};

export function refreshElements() {
    elements.currentModel = document.getElementById('current-model');

    // Core Chat Elements
    elements.connectionPanel = document.getElementById('connection-panel');
    elements.connectionForm = document.getElementById('connection-form'); // Note: This might be missing if I replaced with a simple div
    elements.gatewayUrl = document.getElementById('gateway-url');
    elements.gatewayToken = document.getElementById('gateway-token');
    // elements.saveCredentials = document.getElementById('save-credentials'); // Removed from UI
    elements.connectionStatus = document.getElementById('status-indicator'); // matched with index.html
    elements.messages = document.getElementById('message-container'); // matched with index.html
    elements.messageInput = document.getElementById('message-input');
    elements.btnSend = document.getElementById('btn-send');
    elements.btnAttach = document.getElementById('btn-attach');
    elements.attachCapabilityBadge = document.getElementById('attach-capability-badge');
    elements.fileInput = document.getElementById('file-input');
    elements.previewArea = document.getElementById('preview-area'); // matched with index.html
    elements.canvasContextChip = document.getElementById('canvas-context-chip');
    elements.displayModelName = document.getElementById('display-model-name');
    elements.displayRateLimit = document.getElementById('display-rate-limit');
    elements.ratePanel = document.getElementById('rate-panel');
    elements.ratePanelContent = document.getElementById('rate-panel-content');
    elements.ratePanelTrigger = document.getElementById('model-info-trigger');

    // Views
    elements.viewChat = document.getElementById('message-container');
    elements.viewChatContainer = document.getElementById('chat-view');
    elements.toolNavItems = document.querySelectorAll('.tool-nav .nav-item');
    elements.btnSettings = document.getElementById('btn-show-settings');
    // Memory Editor View (DAM Style)
    elements.viewMemory = document.getElementById('memory-view');
    elements.memoryAssetList = document.getElementById('memory-asset-list');
    elements.editorMemory = document.getElementById('editor-memory');
    elements.btnSaveMemory = document.getElementById('btn-save-memory');
    elements.btnReloadMemory = document.getElementById('btn-reload-memory');
    elements.editorFileIcon = document.getElementById('editor-file-icon');
    elements.editorFileName = document.getElementById('editor-file-name');
    elements.editorFileDesc = document.getElementById('editor-file-desc');
    elements.displayWorkspacePath = document.getElementById('display-workspace-path');

    // Dashboard UI
    elements.viewSettings = document.getElementById('settings-view');
    elements.btnCloseSettings = document.getElementById('btn-close-settings');
    elements.dashboardTitle = document.getElementById('dashboard-title');
    elements.navItems = document.querySelectorAll('.dashboard-nav-item');
    elements.tabContents = document.querySelectorAll('.settings-tab-content');

    // Config Modules
    elements.settingWorkspacePath = document.getElementById('setting-workspace-path');
    elements.btnBrowseWorkspace = document.getElementById('btn-browse-workspace');
    elements.settingSessionKey = document.getElementById('setting-session-key');
    elements.settingModel = document.getElementById('setting-model');
    elements.settingTemp = document.getElementById('setting-temp');
    elements.settingThink = document.getElementById('chat-thinking-select') || document.getElementById('setting-think');

    // API Vault
    elements.settingKeyAnthropic = document.getElementById('setting-key-anthropic');
    elements.settingKeyOpenAI = document.getElementById('setting-key-openai');
    elements.settingKeyGoogle = document.getElementById('setting-key-google');
    elements.settingKeyGroq = document.getElementById('setting-key-groq');
    elements.settingOllamaHost = document.getElementById('setting-ollama-host');
    elements.settingKeyOllama = document.getElementById('setting-key-ollama');

    elements.settingWebTools = document.getElementById('setting-web-tools');
    elements.settingWebHeadless = document.getElementById('setting-web-headless');
    elements.settingGatewayUrl = document.getElementById('setting-gateway-url-dash');
    elements.settingGatewayToken = document.getElementById('setting-gateway-token-dash');
    elements.settingAutoConnect = document.getElementById('setting-autoconnect');
    elements.settingDaemonActive = document.getElementById('setting-daemon-active');
    elements.settingTray = document.getElementById('setting-tray');
    elements.settingAdvancedMode = document.getElementById('setting-advanced-mode');
    elements.settingHaptics = document.getElementById('setting-haptics');
    elements.settingDmPolicy = document.getElementById('setting-dm-policy');
    elements.settingWebSearchProvider = document.getElementById('setting-web-search-provider');
    elements.settingWhatsappOutboundEnabled = document.getElementById('setting-whatsapp-outbound-enabled');
    elements.settingDeviceAccessPolicy = document.getElementById('setting-device-access-policy');

    // Actions & Status
    elements.btnRotateToken = document.getElementById('btn-rotate-token');
    elements.btnClearCreds = document.getElementById('btn-clear-creds');
    elements.btnClearAll = document.getElementById('btn-clear-all');
    elements.encryptionStatus = document.getElementById('encryption-status');
    elements.appVersion = document.getElementById('app-version');

    // Add btn-connect since it's used in socket.js/settings.js
    elements.btnConnect = document.getElementById('btn-connect');

    // ===== New Settings Tabs Elements =====

    // Plugins Tab
    elements.pluginRegistry = document.getElementById('plugin-registry');

    // Fallbacks Tab
    elements.fallbackList = document.getElementById('fallback-list');
    elements.fallbackModelSelect = document.getElementById('fallback-model-select');
    elements.btnAddFallback = document.getElementById('btn-add-fallback');

    // Devices Tab
    elements.deviceRegistry = document.getElementById('device-registry');

    // Cron Tab
    elements.cronRegistry = document.getElementById('cron-registry');

    // Logs Tab
    elements.btnStartLogs = document.getElementById('btn-start-logs');
    elements.btnStopLogs = document.getElementById('btn-stop-logs');
    elements.btnClearLogs = document.getElementById('btn-clear-logs');
    elements.logOutput = document.getElementById('log-output');
    elements.logStatus = document.getElementById('log-status');

    // Memory Tab
    elements.memorySearchInput = document.getElementById('memory-search-input');
    elements.btnSearchMemory = document.getElementById('btn-search-memory');
    elements.memoryResults = document.getElementById('memory-results');

    // Health Tab
    elements.healthDiagnosticsContainer = document.getElementById('health-diagnostics-container');
    elements.btnRunDoctor = document.getElementById('btn-run-doctor');

    // Daemon Tab
    elements.daemonStatusContainer = document.getElementById('daemon-status-container');

    // Wizard
    elements.setupScreen = document.getElementById('setup-screen');

    // Voice Mode
    // Voice Mode
    elements.btnVoiceToggle = document.getElementById('btn-voice-toggle');
    elements.btnVoiceContinuous = document.getElementById('btn-voice-continuous');
    elements.voiceInlineUi = document.getElementById('voice-inline-ui');
    elements.voiceWaveformInline = document.getElementById('voice-waveform-inline');
    elements.voiceTranscriptInline = document.getElementById('voice-transcript-inline');
    elements.btnVoiceCancel = document.getElementById('btn-voice-cancel');
    elements.voiceStatusText = document.getElementById('voice-status-text');
    elements.voiceOverlay = document.getElementById('voice-mode-overlay');
    elements.voiceWaveform = document.getElementById('voice-waveform');
    elements.voiceTranscript = document.getElementById('voice-transcript');
    elements.voiceStatus = document.getElementById('voice-status');
    elements.btnVoiceOverlayClose = document.getElementById('btn-voice-close');

    elements.btnShowUsage = document.getElementById('btn-show-usage');
    elements.btnShowCanvas = document.getElementById('btn-show-canvas');

    // Canvas Panel (Side Panel)
    elements.canvasPanel = document.getElementById('canvas-panel');
    elements.canvasFrame = document.getElementById('canvas-frame');
    elements.canvasEmptyState = document.getElementById('canvas-empty-state');
    elements.btnCanvasToggle = document.getElementById('btn-canvas-toggle');
    elements.btnCanvasClose = document.getElementById('btn-canvas-close');
    elements.btnCanvasPopout = document.getElementById('btn-canvas-popout');
    elements.canvasResizeHandle = document.getElementById('canvas-resize-handle');
    elements.inputZone = document.querySelector('.input-zone');

    // Usage View
    elements.chatCanvasContainer = document.querySelector('.chat-canvas-container');
    elements.viewUsage = document.getElementById('usage-view');
    elements.btnRefreshUsage = document.getElementById('btn-refresh-usage');
    elements.btnResetSession = document.getElementById('btn-reset-session');

    // Thinking Drawer
    elements.thinkingDrawer = document.getElementById('thinking-drawer');
    elements.thinkingStatusText = document.getElementById('thinking-status-text');
    elements.thinkingContent = document.getElementById('thinking-content');
    elements.btnToggleThinking = document.getElementById('btn-toggle-thinking');
    elements.btnCloseThinking = document.getElementById('btn-close-thinking');
    elements.thinkingHeader = document.querySelector('.thinking-drawer-header');
}






