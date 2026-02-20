/**
 * DRAM IPC - System Handlers
 * Cron, memory, health, logs, and system status.
 */
import { validateString } from '../ipc-validation.js';
import crypto from 'crypto';
import { subscribeLogStream } from '../log-bus.js';

/**
 * Register system-related IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('../window-manager.js').WindowManager} windowManager
 * @param {Function} internalRequest - Helper to make internal requests to DramEngine
 * @param {Object} dramEngine - The DRAM engine instance
 * @param {Function} debugLog - Debug logging function
 */
export function registerSystemHandlers(ipc, windowManager, internalRequest, dramEngine, debugLog) {
    const pendingUiPrompts = new Map();
    const UI_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

    const requestUiPrompt = (payload: any): Promise<any> => {
        const requestId = crypto.randomUUID();
        const mainWindow = windowManager?.getMainWindow?.();
        if (!mainWindow || mainWindow.isDestroyed()) {
            return Promise.reject(new Error('UI not available'));
        }

        return new Promise<any>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                pendingUiPrompts.delete(requestId);
                reject(new Error('UI prompt timed out'));
            }, UI_PROMPT_TIMEOUT_MS);

            pendingUiPrompts.set(requestId, { resolve, reject, timeoutId });
            windowManager.sendToRenderer('ui:prompt', { requestId, ...payload });
        });
    };

    ipc.handle('ui:promptResponse', async (_event, payload: any) => {
        const requestId = payload?.requestId;
        if (!requestId) return { ok: false };

        const entry = pendingUiPrompts.get(requestId);
        if (!entry) return { ok: false };

        clearTimeout(entry.timeoutId);
        pendingUiPrompts.delete(requestId);

        if (payload?.error) {
            entry.reject(new Error(payload.error));
        } else {
            entry.resolve({ value: payload?.value, cancelled: Boolean(payload?.cancelled), confirmed: Boolean(payload?.confirmed) });
        }

        return { ok: true };
    });

    const createUiPrompter = () => ({
        note: async (message, title) => {
            await requestUiPrompt({
                kind: 'note',
                title: title || 'Notice',
                message: String(message ?? '')
            });
        },
        confirm: async ({ message, initialValue, confirmText, cancelText, title }: any = {}) => {
            const res = await requestUiPrompt({
                kind: 'confirm',
                title: title || 'Confirm',
                message: String(message ?? ''),
                confirmText: confirmText || 'Continue',
                cancelText: cancelText || 'Cancel',
                initialValue: Boolean(initialValue)
            });
            if (res.cancelled) return false;
            if (typeof res.confirmed === 'boolean') return res.confirmed;
            return true;
        },
        text: async ({ message, placeholder, initialValue, validate, title, confirmText, cancelText }: any = {}) => {
            while (true) {
                const res = await requestUiPrompt({
                    kind: 'text',
                    title: title || 'Input Required',
                    message: String(message ?? ''),
                    placeholder: placeholder ? String(placeholder) : '',
                    initialValue: initialValue ? String(initialValue) : '',
                    confirmText: confirmText || 'Continue',
                    cancelText: cancelText || 'Cancel'
                });
                if (res.cancelled) {
                    throw new Error('OAuth cancelled by user');
                }
                const value = String(res.value ?? '');
                if (typeof validate === 'function') {
                    const validation = validate(value);
                    if (validation) {
                        await requestUiPrompt({
                            kind: 'note',
                            title: 'Invalid Input',
                            message: String(validation)
                        });
                        continue;
                    }
                }
                return value;
            }
        },
        progress: (label) => {
            debugLog(`[OAuth] ${label}`);
            return {
                update: (msg) => debugLog(`[OAuth] ${msg}`),
                stop: (msg) => debugLog(`[OAuth] ${msg || 'done'}`)
            };
        }
    });

    /**
     * Get scheduled cron jobs
     */
    ipc.handle('util:getCronJobs', async () => {
        try {
            const result = await internalRequest('cron.list');
            if (!result?.ok) {
                throw new Error(result?.error?.message || 'Failed to fetch cron jobs');
            }
            const data = result.data;
            // Handle various response formats
            const jobs = data?.jobs || data?.cronJobs || data || [];
            if (!Array.isArray(jobs)) return [];

            return jobs.map(j => ({
                id: j.id || j.jobId || 'unknown',
                name: j.name || j.jobName || j.id || 'Unknown',
                schedule: j.schedule || j.cron || '',
                command: j.command || j.cmd || '',
                enabled: j.enabled !== false,
                lastRun: j.lastRun || j.lastRunAt || null,
                nextRun: j.nextRun || j.nextRunAt || null
            }));
        } catch (err) {
            console.error('util:getCronJobs error:', err);
            return { error: err.message, jobs: [] };
        }
    });

    ipc.handle('util:toggleCronJob', async (_event, jobId, enabled) => {
        try {
            validateString(jobId, 100);
            if (enabled) {
                const runResult = await internalRequest('cron.run', { id: jobId });
                if (!runResult?.ok) {
                    throw new Error(runResult?.error?.message || 'Failed to run cron job');
                }
            }
            return true;
        } catch (err) {
            console.error('util:toggleCronJob error:', err);
            throw err;
        }
    });

    /**
     * Get memory index status
     */
    ipc.handle('util:getMemoryStatus', async () => {
        try {
            const result = await internalRequest('status');
            if (!result?.ok) {
                throw new Error(result?.error?.message || 'Failed to fetch memory status');
            }
            const data = result.data;
            return {
                totalMemories: data?.memoryCount || data?.memories?.length || 0,
                indexSize: data?.memorySize || data?.indexSize || '0 KB',
                lastIndexed: data?.lastIndexed || data?.lastIndexTime || null,
                categories: data?.categories || [],
                sources: data?.sources || []
            };
        } catch (err) {
            console.error('util:getMemoryStatus error:', err);
            return { error: err.message, totalMemories: 0, indexSize: '0 KB', lastIndexed: null, categories: [], sources: [] };
        }
    });

    /**
     * Search memories
     */
    ipc.handle('util:searchMemory', async (_event, query) => {
        try {
            validateString(query, 500);
            const result = await internalRequest('sessions.list', {
                search: query,
                includeDerivedTitles: true,
                includeLastMessage: true,
                limit: 30
            });
            if (!result?.ok) {
                return [];
            }

            const sessions = Array.isArray(result.data?.sessions) ? result.data.sessions : [];
            return sessions.map(session => ({
                content: [
                    session.displayName || session.label || session.derivedTitle || 'Session',
                    session.lastMessagePreview || session.key || ''
                ].filter(Boolean).join(' - ')
            }));
        } catch (err) {
            console.error('util:searchMemory error:', err);
            return [];
        }
    });

    ipc.handle('util:runDoctor', async () => {
        try {
            const result = await internalRequest('health');
            if (!result?.ok) {
                throw new Error(result?.error?.message || 'Failed to run health check');
            }
            const data = result.data;
            return data?.checks || [{ name: 'Embedded Health', status: 'pass', message: 'Internal core is running' }];
        } catch (err) {
            console.error('util:runDoctor error:', err);
            return [{ name: 'Doctor Internal', status: 'fail', message: 'Could not execute health check' }];
        }
    });

    /**
     * Log Streaming Handlers
     */
    let activeLogCallback = null;
    let activeLogUnsubscribe = null;

    // Safe send helper to prevent EPIPE errors
    function safeSendToWindow(channel, data) {
        try {
            const mainWindow = windowManager?.getMainWindow?.();
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send(channel, data);
            }
        } catch (err: any) {
            // Silently ignore EPIPE errors - renderer may be closing
            if (err.code !== 'EPIPE' && !err.message?.includes('EPIPE')) {
                debugLog('Log stream send error:', err.message);
            }
        }
    }

    ipc.handle('util:startLogStream', async () => {
        debugLog('IPC: Starting embedded log stream.');
        if (activeLogUnsubscribe) {
            activeLogUnsubscribe();
            activeLogUnsubscribe = null;
        }
        if (activeLogCallback) {
            dramEngine.onLog(null);
            activeLogCallback = null;
        }

        activeLogUnsubscribe = subscribeLogStream((line) => {
            safeSendToWindow('log:data', line);
        });

        activeLogCallback = (data) => {
            safeSendToWindow('log:data', data);
        };
        dramEngine.onLog(activeLogCallback);
        return true;
    });

    ipc.handle('util:stopLogStream', async () => {
        debugLog('IPC: Stopping embedded log stream.');
        if (activeLogUnsubscribe) {
            activeLogUnsubscribe();
            activeLogUnsubscribe = null;
        }
        dramEngine.onLog(null);
        activeLogCallback = null;
        safeSendToWindow('log:closed', 0);
        return true;
    });

    ipc.handle('util:getDaemonStatus', async () => {
        return dramEngine.initialized ? 'online' : 'offline';
    });

    /**
     * Health check endpoint for system monitoring
     */
    ipc.handle('util:getHealth', async (_event) => {
        try {
            const engineHealth = dramEngine.initialized ? 'healthy' : 'unavailable';
            const memoryUsage = process.memoryUsage();

            return {
                status: engineHealth === 'healthy' ? 'healthy' : 'degraded',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                components: {
                    engine: engineHealth,
                    memory: memoryUsage.rss > 500 * 1024 * 1024 ? 'warning' : 'healthy'
                },
                memory: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
                }
            };
        } catch (err) {
            return { status: 'error', error: err.message };
        }
    });

    /**
     * Test Ollama connectivity and list available models.
     */
    ipc.handle('util:testOllamaConnection', async (_event, rawUrl) => {
        const normalizeBase = (value: string) => String(value || '').trim().toLowerCase().replace(/\/+$/, '');
        const defaultOllamaBases = new Set([
            'http://localhost:11434',
            'http://127.0.0.1:11434'
        ]);

        const collectCompatibleLocalModels = async () => {
            try {
                const modelsResult = await internalRequest('models.list', {}, 12000, { dedupe: false });
                if (!modelsResult?.ok) return [];

                const payload = modelsResult?.data?.models || modelsResult?.data || [];
                if (!Array.isArray(payload)) return [];

                const seen = new Set<string>();
                const compatible = [];

                for (const entry of payload) {
                    if (!entry || typeof entry !== 'object') continue;
                    const provider = String(entry.provider || '').trim().toLowerCase();
                    const rawId = String(entry.key || entry.id || entry.model || '').trim();
                    if (!rawId) continue;
                    const normalizedId = rawId.includes('/') ? rawId : `${provider || 'unknown'}/${rawId}`;
                    const isLocal = provider === 'ollama' || normalizedId.toLowerCase().startsWith('ollama/');
                    if (!isLocal) continue;
                    const dedupeKey = normalizedId.toLowerCase();
                    if (seen.has(dedupeKey)) continue;
                    seen.add(dedupeKey);
                    compatible.push({
                        id: normalizedId,
                        name: String(entry.name || rawId).trim() || rawId
                    });
                }

                return compatible;
            } catch {
                return [];
            }
        };

        const finalizeSuccess = async (installedModels: Array<{ name: string; size: number }>, base: string) => {
            const compatibleModels = await collectCompatibleLocalModels();
            const installedCount = installedModels.length;
            const compatibleCount = compatibleModels.length;
            const normalizedBase = normalizeBase(base);
            const isDefaultLocalEndpoint = defaultOllamaBases.has(normalizedBase);

            const warnings = [];
            if (installedCount > 0 && compatibleCount === 0) {
                warnings.push('Ollama is reachable, but no tool-capable models are available to OpenClaw.');
            }
            if (!isDefaultLocalEndpoint) {
                warnings.push('Custom endpoint is verified, but runtime local discovery uses 127.0.0.1:11434 unless explicit provider config is added.');
            }

            return {
                ok: true,
                endpoint: base,
                installedModels,
                compatibleModels,
                installedCount,
                compatibleCount,
                warning: warnings.join(' ')
            };
        };

        const input = typeof rawUrl === 'string' ? rawUrl.trim() : '';
        const withProtocol = input
            ? (/^https?:\/\//i.test(input) ? input : `http://${input}`)
            : 'http://localhost:11434';

        let base;
        try {
            const parsed = new URL(withProtocol);
            base = `${parsed.protocol}//${parsed.host}`;
        } catch {
            return { ok: false, error: 'Invalid Ollama URL' };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        try {
            const tagsRes = await fetch(`${base}/api/tags`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            });

            if (tagsRes.ok) {
                const tagsJson = await tagsRes.json().catch(() => ({}));
                const installedModels = Array.isArray(tagsJson?.models)
                    ? tagsJson.models.map((m) => ({
                        name: m?.name || m?.model || 'unknown',
                        size: m?.size || 0
                    }))
                    : [];
                return finalizeSuccess(installedModels, base);
            }

            // Fallback for OpenAI-compatible endpoint.
            const modelsRes = await fetch(`${base}/v1/models`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            });

            if (!modelsRes.ok) {
                return { ok: false, error: `HTTP ${modelsRes.status}` };
            }

            const modelsJson = await modelsRes.json().catch(() => ({}));
            const installedModels = Array.isArray(modelsJson?.data)
                ? modelsJson.data.map((m) => ({
                    name: m?.id || m?.name || 'unknown',
                    size: 0
                }))
                : [];
            return finalizeSuccess(installedModels, base);
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                return { ok: false, error: 'Connection timed out' };
            }
            return { ok: false, error: err?.message || 'Connection failed' };
        } finally {
            clearTimeout(timeout);
        }
    });

    /**
     * API Key Validation
     */
    ipc.handle('util:validateApiKey', async (_event, provider, key) => {
        const value = typeof key === 'string' ? key.trim() : '';
        if (!value) return { valid: false };

        // Allow env var references like ${OPENAI_API_KEY}
        if (/^\$\{[A-Z0-9_]+\}$/.test(value)) return { valid: true };

        const providerAliases = {
            'openai-codex': 'openai',
            'google-antigravity': 'google',
            'google-gemini-cli': 'google',
            'google-generative-ai': 'google'
        };
        const normalizedProvider = String(provider || '').toLowerCase();
        const p = providerAliases[normalizedProvider] || normalizedProvider;
        const patterns = {
            anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
            openai: /^sk-(proj-)?[A-Za-z0-9_-]{20,}$/,
            google: /^AIza[0-9A-Za-z_-]{20,}$/,
            groq: /^gsk_[A-Za-z0-9]{20,}$/,
            elevenlabs: /^sk_[A-Za-z0-9]{20,}$/
        };

        const regex = patterns[p];
        if (regex) return { valid: regex.test(value) };

        return { valid: value.length >= 20 };
    });

    /**
     * OAuth Handlers
     */
    ipc.handle('util:startOAuth', async (_event, pluginId) => {
        try {
            validateString(pluginId, 100);

            const oauthMap = {
                'google-antigravity-auth': { authChoice: 'google-antigravity', label: 'Google Antigravity' },
                'google-gemini-cli-auth': { authChoice: 'google-gemini-cli', label: 'Google Gemini CLI' },
                'copilot-proxy': { authChoice: 'copilot-proxy', label: 'Copilot Proxy' },
                'qwen-portal-auth': { authChoice: 'qwen-portal', label: 'Qwen' }
            };

            let entry = oauthMap[pluginId];
            const prompter = createUiPrompter();

            if (!entry && pluginId === 'minimax-portal-auth') {
                const useLightning = await prompter.confirm({
                    title: 'MiniMax Setup',
                    message: 'Use MiniMax M2.1 Lightning (faster, higher output cost)?',
                    confirmText: 'Use Lightning',
                    cancelText: 'Use Standard'
                });
                entry = {
                    authChoice: useLightning ? 'minimax-api-lightning' : 'minimax-api',
                    label: useLightning ? 'MiniMax M2.1 Lightning' : 'MiniMax M2.1'
                };
            }

            if (!entry) {
                return { success: false, error: `OAuth not supported for ${pluginId}` };
            }

            const cfgSnapshot = await internalRequest('config.get', {});
            if (!cfgSnapshot.ok) {
                return { success: false, error: cfgSnapshot.error?.message || 'Failed to load config' };
            }

            const snapshot = cfgSnapshot.data || {};
            const baseConfig = snapshot.config || (snapshot.raw ? JSON.parse(snapshot.raw) : {});

            await dramEngine.initialize();
            const runtime = dramEngine.runtime;
            await runtime.checkInstallation();

            const { applyAuthChoice } = await runtime.import('./dist/commands/auth-choice.apply.js');

            const authResult = await applyAuthChoice({
                authChoice: entry.authChoice,
                config: baseConfig,
                prompter,
                runtime: {
                    log: (...args) => debugLog('[OAuth]', ...args),
                    error: (...args) => debugLog('[OAuth]', ...args),
                    exit: (code) => {
                        throw new Error(`OAuth requested exit: ${code}`);
                    }
                },
                setDefaultModel: true,
                opts: {}
            });

            const nextConfig = authResult?.config || baseConfig;
            const saveResult = await internalRequest('config.set', {
                raw: JSON.stringify(nextConfig),
                baseHash: snapshot.hash
            });

            if (!saveResult.ok) {
                return { success: false, error: saveResult.error?.message || 'Failed to save config' };
            }

            return { success: true, label: entry.label };
        } catch (err: any) {
            return { success: false, error: err.message || 'OAuth failed' };
        }
    });
}






