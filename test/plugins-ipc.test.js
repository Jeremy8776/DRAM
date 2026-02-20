import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { registerModelHandlers } from '../runtime/main/ipc/models.js';
import { registerPluginHandlers } from '../runtime/main/ipc/plugins.js';

function createIpcHarness() {
    const handlers = new Map();
    return {
        ipc: {
            handle(channel, handler) {
                handlers.set(channel, handler);
            }
        },
        invoke(channel, ...args) {
            const handler = handlers.get(channel);
            if (!handler) {
                throw new Error(`Missing handler: ${channel}`);
            }
            return handler({}, ...args);
        }
    };
}

test('util:getModels returns OpenClaw model list when available', async () => {
    const harness = createIpcHarness();
    registerModelHandlers(harness.ipc, async (method) => {
        assert.equal(method, 'models.list');
        return {
            ok: true,
            data: {
                models: [
                    { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o' },
                    { id: 'anthropic/claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet' }
                ]
            }
        };
    });

    const models = await harness.invoke('util:getModels', { force: true });
    const compact = models.map(({ id, name, provider }) => ({ id, name, provider }));
    assert.deepEqual(compact, [
        { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai' },
        { id: 'anthropic/claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', provider: 'anthropic' }
    ]);
});

test('util:getModels falls back when OpenClaw model request fails', async () => {
    const harness = createIpcHarness();
    registerModelHandlers(harness.ipc, async () => ({ ok: false, error: { message: 'offline' } }));

    const models = await harness.invoke('util:getModels', { force: true });
    assert.ok(Array.isArray(models));
    assert.equal(models.length > 0, true);
    assert.equal(models.some((model) => model.id === 'gpt-4o'), true);
});

test('util:whatsappStartLogin proxies to web.login.start and normalizes qr payload', async () => {
    const harness = createIpcHarness();
    const calls = [];

    registerPluginHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'web.login.start') {
            return { ok: true, data: { dataUrl: 'data:image/png;base64,AAA', status: 'ready' } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:whatsappStartLogin', { force: true });
    assert.equal(result.qrDataUrl, 'data:image/png;base64,AAA');
    assert.equal(result.message, 'ready');
    assert.deepEqual(calls, [
        { method: 'web.login.start', params: { force: true } }
    ]);
});

test('util:whatsappPollLogin proxies to web.login.wait and normalizes connected state', async () => {
    const harness = createIpcHarness();
    const calls = [];

    registerPluginHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'web.login.wait') {
            return { ok: true, data: { status: 'connected' } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:whatsappPollLogin', { timeoutMs: 5000 });
    assert.equal(result.connected, true);
    assert.equal(result.message, 'connected');
    assert.deepEqual(calls, [
        { method: 'web.login.wait', params: { timeoutMs: 5000 } }
    ]);
});

test('util:getPlugins merges runtime plugin health with config state', async () => {
    const harness = createIpcHarness();
    registerPluginHandlers(harness.ipc, async (method) => {
        if (method === 'config.get') {
            return {
                ok: true,
                data: {
                    raw: JSON.stringify({
                        plugins: {
                            entries: {
                                discord: { enabled: true },
                                'diagnostics-otel': { enabled: false }
                            }
                        }
                    }),
                    hash: 'abc123'
                }
            };
        }
        if (method === 'plugins.list') {
            return {
                ok: true,
                data: {
                    plugins: [
                        { id: 'discord', status: 'enabled', version: '1.2.3' },
                        { id: 'diagnostics-otel', status: 'error', error: { message: 'Cannot find module @opentelemetry/api' } },
                        { id: 'custom-runtime-plugin', status: 'enabled', version: '0.0.1' }
                    ]
                }
            };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const plugins = await harness.invoke('util:getPlugins');
    const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));

    assert.equal(byId.get('discord')?.status, 'enabled');
    assert.equal(byId.get('discord')?.enabled, true);
    assert.equal(byId.get('discord')?.version, '1.2.3');

    assert.equal(byId.get('diagnostics-otel')?.status, 'error');
    assert.match(byId.get('diagnostics-otel')?.loadError || '', /@opentelemetry\/api/i);

    assert.equal(byId.get('custom-runtime-plugin')?.enabled, true);
    assert.equal(byId.get('custom-runtime-plugin')?.status, 'enabled');
});

test('util:enablePlugin fails early when runtime reports missing plugin', async () => {
    const harness = createIpcHarness();
    registerPluginHandlers(harness.ipc, async (method) => {
        if (method === 'plugins.list') {
            return { ok: true, data: { plugins: [{ id: 'telegram', status: 'missing' }] } };
        }
        if (method === 'config.get') {
            return { ok: true, data: { raw: '{}', hash: 'h1' } };
        }
        if (method === 'config.patch') {
            throw new Error('config.patch should not be called for missing plugins');
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:enablePlugin', 'telegram');
    assert.equal(result.ok, false);
    assert.match(result.error || '', /not available/i);
});

test('util:enablePlugin supports runtime plugins not present in static metadata', async () => {
    const harness = createIpcHarness();
    const calls = [];
    registerPluginHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'plugins.list') {
            return { ok: true, data: { plugins: [{ id: 'custom-runtime-plugin', status: 'disabled' }] } };
        }
        if (method === 'config.get') {
            return { ok: true, data: { raw: '{}', hash: 'h2' } };
        }
        if (method === 'config.patch') {
            return { ok: true, data: { ok: true } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:enablePlugin', 'custom-runtime-plugin');
    assert.equal(result.ok, true);
    assert.match(result.warning || '', /untrusted/i);
    assert.equal(calls.some((call) => call.method === 'config.patch'), true);
});

test('util:enablePlugin blocks plugins explicitly marked as blocked', async () => {
    const harness = createIpcHarness();
    registerPluginHandlers(harness.ipc, async (method) => {
        if (method === 'plugins.list') {
            return { ok: true, data: { plugins: [{ id: 'custom-runtime-plugin', status: 'disabled' }] } };
        }
        if (method === 'config.get') {
            return { ok: true, data: { raw: '{}', hash: 'h3' } };
        }
        if (method === 'config.patch') {
            throw new Error('config.patch should not be called for blocked plugins');
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const trustResult = await harness.invoke('util:setPluginTrust', 'custom-runtime-plugin', 'blocked');
    assert.equal(trustResult.ok, true);

    const result = await harness.invoke('util:enablePlugin', 'custom-runtime-plugin');
    assert.equal(result.ok, false);
    assert.match(result.error || '', /blocked/i);
});

test('util:setPluginTrust persists trust policy and util:getPluginVetting reads it', async () => {
    const harness = createIpcHarness();
    registerPluginHandlers(harness.ipc, async (method) => {
        if (method === 'config.get') return { ok: true, data: { raw: '{}', hash: 'h4' } };
        if (method === 'plugins.list') return { ok: true, data: { plugins: [] } };
        throw new Error(`Unexpected method ${method}`);
    });

    const setResult = await harness.invoke('util:setPluginTrust', 'discord', 'blocked');
    assert.equal(setResult.ok, true);
    assert.equal(setResult.trustStatus, 'blocked');

    const vetting = await harness.invoke('util:getPluginVetting');
    assert.equal(vetting.discord, 'blocked');
});

test('util:repairPlugin disables diagnostics-otel when optional otel dependency is missing', async () => {
    const harness = createIpcHarness();
    const calls = [];
    registerPluginHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'plugins.list') {
            return {
                ok: true,
                data: {
                    plugins: [
                        {
                            id: 'diagnostics-otel',
                            status: 'error',
                            error: { message: 'Cannot find module @opentelemetry/api' }
                        }
                    ]
                }
            };
        }
        if (method === 'config.get') {
            return {
                ok: true,
                data: {
                    raw: JSON.stringify({ plugins: { entries: { 'diagnostics-otel': { enabled: true } } } }),
                    hash: 'h-otel'
                }
            };
        }
        if (method === 'config.patch') {
            return { ok: true, data: { ok: true } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:repairPlugin', 'diagnostics-otel');
    assert.equal(result.ok, true);
    assert.match(result.message || '', /Disabled diagnostics-otel/i);

    const patchCall = calls.find((call) => call.method === 'config.patch');
    assert.ok(patchCall);
    const patch = JSON.parse(patchCall.params.raw);
    assert.equal(patch?.plugins?.entries?.['diagnostics-otel']?.enabled, false);
});

test('util:getPlugins auto-remediates known diagnostics-otel dependency failure', async () => {
    const harness = createIpcHarness();
    const calls = [];
    registerPluginHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'config.get') {
            return {
                ok: true,
                data: {
                    raw: JSON.stringify({ plugins: { entries: { 'diagnostics-otel': { enabled: true } } } }),
                    hash: 'h-auto'
                }
            };
        }
        if (method === 'plugins.list') {
            return {
                ok: true,
                data: {
                    plugins: [
                        {
                            id: 'diagnostics-otel',
                            status: 'error',
                            error: { message: 'Cannot find module @opentelemetry/api' }
                        }
                    ]
                }
            };
        }
        if (method === 'config.patch') {
            return { ok: true, data: { ok: true } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const plugins = await harness.invoke('util:getPlugins');
    const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
    assert.equal(byId.get('diagnostics-otel')?.enabled, false);
    assert.equal(byId.get('diagnostics-otel')?.status, 'disabled');
    assert.equal(calls.some((call) => call.method === 'config.patch'), true);
});

test('plugin metadata IDs remain backed by bundled extension manifests', async () => {
    const harness = createIpcHarness();
    registerPluginHandlers(harness.ipc, async (method) => {
        if (method === 'config.get') return { ok: true, data: { raw: '{}', hash: 'h1' } };
        if (method === 'plugins.list') return { ok: false, error: { message: 'offline' } };
        throw new Error(`Unexpected method ${method}`);
    });

    const plugins = await harness.invoke('util:getPlugins');
    const metadataIds = new Set(plugins.map((plugin) => plugin.id));

    const extensionsDir = path.join(process.cwd(), 'resources', 'engine', 'extensions');
    const extensionEntries = await fs.readdir(extensionsDir, { withFileTypes: true });
    const manifestIds = new Set();

    for (const entry of extensionEntries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(extensionsDir, entry.name, 'openclaw.plugin.json');
        try {
            const raw = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(raw);
            if (typeof manifest?.id === 'string' && manifest.id.trim()) {
                manifestIds.add(manifest.id.trim());
            }
        } catch {
            // Ignore non-plugin folders.
        }
    }

    const missingManifestBackings = [...metadataIds].filter((id) => !manifestIds.has(id)).sort();
    assert.deepEqual(missingManifestBackings, []);
});
