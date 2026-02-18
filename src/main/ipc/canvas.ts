/**
 * DRAM IPC - Canvas Handlers
 * Manages Canvas/A2UI integration with the embedded engine
 */

import { getDramEngine } from '../engine/core.js';

const MAX_CANVAS_TEXT_CHARS = 200_000;
const MAX_CANVAS_HTML_CHARS = 400_000;
const MAX_CANVAS_JSONL_CHARS = 1_000_000;

function buildA2UITextJsonl(text = '') {
    const safeText = String(text ?? '');
    const surfaceId = 'main';
    const rootId = 'root';
    const textId = 'text';
    return [
        {
            surfaceUpdate: {
                surfaceId,
                components: [
                    {
                        id: rootId,
                        component: {
                            Column: {
                                children: { explicitList: [textId] }
                            }
                        }
                    },
                    {
                        id: textId,
                        component: {
                            Text: {
                                text: { literalString: safeText },
                                usageHint: 'body'
                            }
                        }
                    }
                ]
            }
        },
        {
            beginRendering: {
                surfaceId,
                root: rootId
            }
        }
    ].map((payload) => JSON.stringify(payload)).join('\n');
}

function normalizeTextFromHtml(html) {
    if (typeof html !== 'string') return '';
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizePushOptions(rawOptions) {
    const options = (rawOptions && typeof rawOptions === 'object') ? rawOptions : {};
    const html = typeof options.html === 'string'
        ? options.html.slice(0, MAX_CANVAS_HTML_CHARS)
        : '';
    const text = typeof options.text === 'string'
        ? options.text.slice(0, MAX_CANVAS_TEXT_CHARS)
        : '';
    const jsonl = typeof options.jsonl === 'string'
        ? options.jsonl.slice(0, MAX_CANVAS_JSONL_CHARS)
        : '';
    const evalScript = typeof options.evalScript === 'string' ? options.evalScript : '';
    const evalInline = typeof options.eval === 'string' ? options.eval : '';
    const reset = options.reset === true;
    return { html, evalScript, evalInline, text, jsonl, reset };
}

function gatewayOriginFromConnection(connectionUrl = 'ws://127.0.0.1:18789') {
    const raw = String(connectionUrl || '').trim() || 'ws://127.0.0.1:18789';
    const normalized = raw
        .replace(/^ws:\/\//i, 'http://')
        .replace(/^wss:\/\//i, 'https://');
    try {
        return new URL(normalized).origin;
    } catch {
        return 'http://127.0.0.1:18789';
    }
}

async function probeCanvasUrl(origin) {
    const candidates = [
        `${origin}/__openclaw__/canvas/`,
        `${origin}/__openclaw__/canvas/index.html`
    ];

    for (const candidate of candidates) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(candidate, {
                method: 'GET',
                redirect: 'follow',
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (res.ok) {
                const xfo = String(res.headers.get('x-frame-options') || '').toLowerCase();
                const csp = String(res.headers.get('content-security-policy') || '').toLowerCase();
                const frameDenied = xfo.includes('deny') || xfo.includes('sameorigin')
                    || (csp.includes('frame-ancestors') && (csp.includes("'none'") || csp.includes('none')));
                if (frameDenied) {
                    continue;
                }
                return { ok: true, url: candidate, status: res.status };
            }
        } catch {
            // Try next candidate
        }
    }
    return { ok: false, url: candidates[0], status: 0 };
}

/**
 * Register canvas-related IPC handlers
 */
export function registerCanvasHandlers(ipc, secureStorage, windowManager, debugLog) {
    const dramEngine = getDramEngine(windowManager, debugLog);
    let a2uiPushJsonlSupported = null;
    let a2uiPushJsonlUnsupportedLogged = false;
    const requestCanvasMethod = (method, params = {}): Promise<any> => new Promise<any>((resolve) => {
        dramEngine.handleRequest({
            type: 'req',
            id: `canvas-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            method,
            params
        }, (ok, data, error) => {
            resolve({ ok, data, error });
        });
    });

    /**
     * Get Canvas status and URL
     */
    ipc.handle('canvas:getStatus', async () => {
        try {
            const connection = await secureStorage.get('gateway.url') || 'ws://127.0.0.1:18789';
            const gatewayOrigin = gatewayOriginFromConnection(connection);
            const probe = await probeCanvasUrl(gatewayOrigin);

            return {
                available: probe.ok,
                url: probe.url,
                status: probe.status,
                a2uiUrl: `${gatewayOrigin}/__openclaw__/a2ui`,
                gatewayUrl: connection,
                a2uiPushJsonlSupported
            };
        } catch (err: any) {
            debugLog('[Canvas] getStatus error:', err.message);
            return {
                available: false,
                error: err.message
            };
        }
    });

    /**
     * Send A2UI action to engine
     */
    ipc.handle('canvas:sendA2UIAction', async (_event, action) => {
        try {
            // Desktop canvas uses the hosted web UI; native A2UI action bridge is mobile-only.
            const actionName = (action && typeof action === 'object' && typeof action.name === 'string')
                ? action.name
                : 'unknown';
            debugLog('[Canvas] A2UI action received (desktop noop):', actionName);
            return { ok: true, data: { forwarded: false } };
        } catch (err: any) {
            debugLog('[Canvas] sendA2UIAction error:', err.message);
            return { ok: false, error: err.message };
        }
    });

    /**
     * Push A2UI content to canvas
     */
    ipc.handle('canvas:pushA2UI', async (_event, options: any = {}) => {
        try {
            const { html, evalScript, evalInline, text, jsonl, reset } = normalizePushOptions(options);
            if (a2uiPushJsonlSupported === false) {
                return { ok: true, data: { forwarded: false, unsupported: true, cached: true } };
            }

            debugLog('[Canvas] Pushing A2UI content');

            if (reset) {
                const resetResult = await requestCanvasMethod('canvas.a2ui.reset');
                if (!resetResult.ok) return resetResult;
            }

            const javaScript = [evalScript, evalInline].find((value) => typeof value === 'string' && value.trim().length > 0);
            if (javaScript) {
                return requestCanvasMethod('canvas.eval', { javaScript });
            }

            const explicitJsonl = typeof jsonl === 'string' && jsonl.trim().length > 0 ? jsonl : null;
            const resolvedText = typeof text === 'string'
                ? text
                : normalizeTextFromHtml(html);

            const payloadJsonl = explicitJsonl || buildA2UITextJsonl(resolvedText || 'Canvas updated');
            const pushResult = await requestCanvasMethod('canvas.a2ui.pushJSONL', { jsonl: payloadJsonl });
            if (!pushResult?.ok) {
                const errorText = String(pushResult?.error?.message || pushResult?.error || '').toLowerCase();
                if (errorText.includes('unknown method') || errorText.includes('method not found')) {
                    a2uiPushJsonlSupported = false;
                    if (!a2uiPushJsonlUnsupportedLogged) {
                        debugLog('[Canvas] canvas.a2ui.pushJSONL unsupported by engine; skipping remote push');
                        a2uiPushJsonlUnsupportedLogged = true;
                    }
                    return { ok: true, data: { forwarded: false, unsupported: true } };
                }
            } else {
                a2uiPushJsonlSupported = true;
            }
            return pushResult;
        } catch (err: any) {
            debugLog('[Canvas] pushA2UI error:', err.message);
            return { ok: false, error: err.message };
        }
    });

    /**
     * Reset canvas to default state
     */
    ipc.handle('canvas:reset', async () => {
        try {
            debugLog('[Canvas] Resetting canvas');
            return requestCanvasMethod('canvas.a2ui.reset');
        } catch (err: any) {
            debugLog('[Canvas] reset error:', err.message);
            return { ok: false, error: err.message };
        }
    });

    /**
     * Get canvas snapshot/image
     */
    ipc.handle('canvas:snapshot', async () => {
        try {
            debugLog('[Canvas] Taking snapshot');
            return requestCanvasMethod('canvas.snapshot');
        } catch (err: any) {
            debugLog('[Canvas] snapshot error:', err.message);
            return { ok: false, error: err.message };
        }
    });

    debugLog('[Canvas] IPC handlers registered');
}






