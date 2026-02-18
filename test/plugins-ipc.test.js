import assert from 'node:assert/strict';
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
