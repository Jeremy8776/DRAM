/**
 * DRAM Desktop - Preload Script (CommonJS version for maximum compatibility)
 * Note: In sandboxed preload, only 'electron' module is available via require.
 * Path utilities are implemented in pure JS.
 */
/** @typedef {import('../shared/types/preload.js').DramBridgeApi} DramBridgeApi */
const { contextBridge, ipcRenderer } = require('electron');

// Pure JS path utilities (Node's path module isn't available in sandbox)
const isWindows = process.platform === 'win32';
const pathUtils = {
    join: (...parts) => {
        if (isWindows) {
            // Windows: Use backslashes
            return parts.filter(Boolean).join('\\').replace(/[\\/]+/g, '\\').replace(/\\$/, '') || '\\';
        }
        // POSIX: Use forward slashes
        return parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    },
    basename: (p, ext) => {
        const sep = isWindows ? '\\' : '/';
        const name = p.replace(/[\\/]/g, sep).split(sep).pop() || '';
        if (ext && name.endsWith(ext)) return name.slice(0, -ext.length);
        return name;
    },
    dirname: (p) => {
        const sep = isWindows ? '\\' : '/';
        const normalized = p.replace(/[\\/]/g, sep);
        const parts = normalized.split(sep);
        parts.pop();
        return parts.join(sep) || (isWindows ? '\\' : '/');
    },
    extname: (p) => {
        const base = pathUtils.basename(p);
        const idx = base.lastIndexOf('.');
        return idx > 0 ? base.slice(idx) : '';
    },
    normalize: (p) => {
        return p.replace(/\\/g, '/').replace(/\/+/g, '/');
    },
    isAbsolute: (p) => {
        return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/');
    }
};

const CHANNEL_RE = /^[a-zA-Z0-9:._-]{1,96}$/;

/**
 * Helper to wrap IPC calls with error handling
 */
const safeInvoke = async (channel, ...args) => {
    if (typeof channel !== 'string' || !CHANNEL_RE.test(channel)) {
        throw new Error(`Invalid IPC channel: ${String(channel)}`);
    }
    try {
        return await ipcRenderer.invoke(channel, ...args);
    } catch (err) {
        console.error(`[Preload] IPC error on ${channel}:`, err);
        throw err;
    }
};

/** @type {DramBridgeApi} */
const dramApi = {
    storage: {
        get: (key) => safeInvoke('storage:get', key),
        set: (key, value) => safeInvoke('storage:set', key, value),
        delete: (key) => safeInvoke('storage:delete', key),
        getAll: () => safeInvoke('storage:getAll'),
        isEncrypted: () => safeInvoke('storage:isEncrypted'),
        wipe: () => safeInvoke('storage:wipe')
    },
    gateway: {
        saveConnection: (config) => safeInvoke('gateway:saveConnection', config),
        getConnection: () => safeInvoke('gateway:getConnection'),
        getToken: () => safeInvoke('gateway:getToken'),
        getPassword: () => safeInvoke('gateway:getPassword'),
        launchGateway: () => safeInvoke('app:launchGateway'),
        writeConfig: (config) => safeInvoke('dram:writeConfig', config),
        patchConfig: (patch) => safeInvoke('gateway:patchConfig', patch),
        saveFallbackChain: (chain) => safeInvoke('gateway:saveFallbackChain', chain),
        getFallbackChain: () => safeInvoke('gateway:getFallbackChain')
    },
    window: {
        minimize: () => safeInvoke('window:minimize'),
        toggleFullscreen: () => safeInvoke('window:toggleFullscreen')
    },
    shell: {
        openExternal: (url) => safeInvoke('shell:openExternal', url),
        executeCLI: (command, options) => safeInvoke('shell:executeCLI', command, options),
        openTerminal: (dirPath) => safeInvoke('shell:openTerminal', dirPath)
    },
    dialog: {
        showMessage: (options) => safeInvoke('dialog:showMessage', options),
        showOpenDialog: (options) => safeInvoke('dialog:showOpenDialog', options)
    },
    app: {
        getInfo: () => safeInvoke('app:getInfo'),
        getPath: (name) => safeInvoke('app:getPath', name),
        newWindow: (options) => safeInvoke('app:newWindow', options),
        detectLegacyConfig: () => safeInvoke('app:detectLegacyConfig'),
        migrateLegacyConfig: (config) => safeInvoke('app:migrateLegacyConfig', config),
        // OpenClaw Discovery & Management
        discoverOpenClaw: () => safeInvoke('openclaw:discover'),
        installOpenClaw: (version) => safeInvoke('openclaw:install', version),
        initializeEngine: () => safeInvoke('openclaw:initializeEngine'),
        getOpenClawVersions: () => safeInvoke('openclaw:getVersions'),
        readOpenClawConfig: () => safeInvoke('openclaw:readConfig'),
        writeOpenClawConfig: (config) => safeInvoke('openclaw:writeConfig', config),
        createOpenClawBackup: () => safeInvoke('openclaw:createBackup'),
        listOpenClawBackups: () => safeInvoke('openclaw:listBackups'),
        restoreOpenClawBackup: (backupPath) => safeInvoke('openclaw:restoreBackup', backupPath),
        onOpenClawConfigChange: (callback) => {
            const handler = (event, data) => callback(data);
            ipcRenderer.on('openclaw:configChanged', handler);
            return () => ipcRenderer.removeListener('openclaw:configChanged', handler);
        }
    },
    fs: {
        read: (filePath) => safeInvoke('fs:read', filePath),
        write: (filePath, content) => safeInvoke('fs:write', filePath, content),
        list: (dirPath) => safeInvoke('fs:list', dirPath),
        initWorkspace: (workspacePath) => safeInvoke('fs:initWorkspace', workspacePath)
    },
    canvas: {
        getStatus: () => safeInvoke('canvas:getStatus'),
        sendA2UIAction: (action) => safeInvoke('canvas:sendA2UIAction', action),
        pushA2UI: (options) => safeInvoke('canvas:pushA2UI', options),
        reset: () => safeInvoke('canvas:reset'),
        snapshot: () => safeInvoke('canvas:snapshot')
    },
    util: {
        // Existing
        getModels: (options) => safeInvoke('util:getModels', options),
        getPlugins: () => safeInvoke('util:getPlugins'),
        // New data fetchers
        getChannels: () => safeInvoke('util:getChannels'),
        getSkills: () => safeInvoke('util:getSkills'),
        getDevices: () => safeInvoke('util:getDevices'),
        getCronJobs: () => safeInvoke('util:getCronJobs'),
        getMemoryStatus: () => safeInvoke('util:getMemoryStatus'),
        searchMemory: (query) => safeInvoke('util:searchMemory', query),
        getDaemonStatus: () => safeInvoke('util:getDaemonStatus'),
        runDoctor: () => safeInvoke('util:runDoctor'),
        // Plugin management
        enablePlugin: (pluginId) => safeInvoke('util:enablePlugin', pluginId),
        disablePlugin: (pluginId) => safeInvoke('util:disablePlugin', pluginId),
        // Skill management
        installSkill: (skillId) => safeInvoke('util:installSkill', skillId),
        updateSkill: (skillId) => safeInvoke('util:updateSkill', skillId),
        toggleSkill: (skillId, enabled) => safeInvoke('util:toggleSkill', skillId, enabled),
        getSkillBins: () => safeInvoke('util:getSkillBins'),
        getSkillStatusRaw: () => safeInvoke('util:getSkillStatusRaw'),
        // Device management
        approveDevice: (deviceId) => safeInvoke('util:approveDevice', deviceId),
        rejectDevice: (deviceId) => safeInvoke('util:rejectDevice', deviceId),
        unpairDevice: (deviceId) => safeInvoke('util:unpairDevice', deviceId),
        // Cron management
        toggleCronJob: (jobId, enabled) => safeInvoke('util:toggleCronJob', jobId, enabled),
        // Log streaming
        startLogStream: () => safeInvoke('util:startLogStream'),
        stopLogStream: () => safeInvoke('util:stopLogStream'),
        onLogData: (callback) => {
            const handler = (event, data) => callback(data);
            ipcRenderer.on('log:data', handler);
            return () => ipcRenderer.removeListener('log:data', handler);
        },
        onLogClosed: (callback) => {
            const handler = (event, code) => callback(code);
            ipcRenderer.on('log:closed', handler);
            return () => ipcRenderer.removeListener('log:closed', handler);
        },
        // OAuth
        startOAuth: (pluginId, provider) => ipcRenderer.invoke('util:startOAuth', pluginId, provider),
        respondPrompt: (payload) => safeInvoke('ui:promptResponse', payload),
        // API Key validation
        validateApiKey: (provider, apiKey) => safeInvoke('util:validateApiKey', provider, apiKey),
        // TTS
        generateTTS: (text, options) => safeInvoke('util:generateTTS', text, options),
        setTtsProvider: (provider) => safeInvoke('util:setTtsProvider', provider),
        transcribeAudio: (audioBase64, options) => safeInvoke('util:transcribeAudio', audioBase64, options),
        // WhatsApp Login
        whatsappStartLogin: (opts) => safeInvoke('util:whatsappStartLogin', opts),
        whatsappPollLogin: (opts) => safeInvoke('util:whatsappPollLogin', opts),
        // Generic QR Login
        webLoginStart: (opts) => safeInvoke('util:webLoginStart', opts),
        webLoginWait: (opts) => safeInvoke('util:webLoginWait', opts),
        // Health check
        getHealth: () => safeInvoke('util:getHealth'),
        // Local Voice Setup
        setupLocalVoice: () => safeInvoke('util:setupLocalVoice'),
        // Test Ollama Connection
        testOllamaConnection: (url) => safeInvoke('util:testOllamaConnection', url)
    },
    socket: {
        connect: (url, token) => ipcRenderer.send('socket:connect', { url, token }),
        send: (payload) => ipcRenderer.send('socket:send', payload),
        onStatus: (callback) => {
            const handler = (event, status) => callback(status);
            ipcRenderer.on('socket:status', handler);
            return () => ipcRenderer.removeListener('socket:status', handler);
        },
        onData: (callback) => {
            const handler = (event, data) => callback(data);
            ipcRenderer.on('socket:data', handler);
            return () => ipcRenderer.removeListener('socket:data', handler);
        }
    },
    on: (channel, callback) => {
        const validChannels = ['state:changed', 'chat:new', 'hot-update-css', 'engine:event', 'ui:open-settings', 'ui:prompt'];
        if (validChannels.includes(channel)) {
            const handler = (event, ...args) => callback(...args);
            ipcRenderer.on(channel, handler);
            return () => ipcRenderer.removeListener(channel, handler);
        }
        return () => { };
    },
    platform: typeof process !== 'undefined' ? process.platform : 'unknown',
    path: pathUtils
};

contextBridge.exposeInMainWorld('dram', dramApi);
