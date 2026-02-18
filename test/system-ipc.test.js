import assert from 'node:assert/strict';
import test from 'node:test';

import { registerSystemHandlers } from '../runtime/main/ipc/system.js';
import { clearLogBusForTests, emitLogLine } from '../runtime/main/log-bus.js';

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

function createSystemFixture(internalRequest, options = {}) {
    const harness = createIpcHarness();
    const sentMessages = [];
    const mainWindow = {
        isDestroyed: () => false,
        webContents: {
            isDestroyed: () => false,
            send: (channel, data) => {
                sentMessages.push({ channel, data });
            }
        }
    };
    const windowManager = {
        getMainWindow: () => options.withWindow === false ? null : mainWindow,
        sendToRenderer: () => { }
    };
    let onLogCallback = null;
    const dramEngine = {
        initialized: true,
        onLog: (callback) => {
            onLogCallback = callback;
        },
        runtime: {}
    };
    registerSystemHandlers(harness.ipc, windowManager, internalRequest, dramEngine, () => { });
    return { harness, sentMessages, emitEngineLog: (line) => onLogCallback?.(line) };
}

test('util:searchMemory maps sessions into user-facing entries', async () => {
    const { harness } = createSystemFixture(async (method, params) => {
        assert.equal(method, 'sessions.list');
        assert.equal(params.search, 'billing');
        return {
            ok: true,
            data: {
                sessions: [
                    { displayName: 'Ops Room', lastMessagePreview: 'Billing API key rotation done' },
                    { label: 'Fallback Debug', key: 'session-abc' }
                ]
            }
        };
    });

    const results = await harness.invoke('util:searchMemory', 'billing');
    assert.deepEqual(results, [
        { content: 'Ops Room - Billing API key rotation done' },
        { content: 'Fallback Debug - session-abc' }
    ]);
});

test('util:searchMemory returns empty array on internal request failure', async () => {
    const { harness } = createSystemFixture(async () => ({ ok: false, error: { message: 'down' } }));
    const results = await harness.invoke('util:searchMemory', 'anything');
    assert.deepEqual(results, []);
});

test('util:getCronJobs normalizes cron list payload', async () => {
    const { harness } = createSystemFixture(async (method) => {
        assert.equal(method, 'cron.list');
        return {
            ok: true,
            data: {
                jobs: [
                    {
                        jobId: 'nightly',
                        jobName: 'Nightly Check',
                        cron: '0 2 * * *',
                        cmd: 'status',
                        enabled: true,
                        lastRunAt: '2026-02-10T02:00:00.000Z',
                        nextRunAt: '2026-02-11T02:00:00.000Z'
                    }
                ]
            }
        };
    });

    const jobs = await harness.invoke('util:getCronJobs');
    assert.deepEqual(jobs, [
        {
            id: 'nightly',
            name: 'Nightly Check',
            schedule: '0 2 * * *',
            command: 'status',
            enabled: true,
            lastRun: '2026-02-10T02:00:00.000Z',
            nextRun: '2026-02-11T02:00:00.000Z'
        }
    ]);
});

test('util:getMemoryStatus returns fallback values when backend fails', async () => {
    const { harness } = createSystemFixture(async () => ({ ok: false, error: { message: 'offline' } }));
    const originalError = console.error;
    console.error = () => { };
    try {
        const status = await harness.invoke('util:getMemoryStatus');
        assert.equal(status.totalMemories, 0);
        assert.equal(status.indexSize, '0 KB');
        assert.equal(status.lastIndexed, null);
        assert.deepEqual(status.categories, []);
        assert.deepEqual(status.sources, []);
    } finally {
        console.error = originalError;
    }
});

test('util:runDoctor returns health checks from backend', async () => {
    const checks = [{ name: 'Gateway', status: 'pass', message: 'ok' }];
    const { harness } = createSystemFixture(async (method) => {
        assert.equal(method, 'health');
        return { ok: true, data: { checks } };
    });

    const result = await harness.invoke('util:runDoctor');
    assert.deepEqual(result, checks);
});

test('util:startLogStream forwards log bus and engine lines', async () => {
    clearLogBusForTests();
    const { harness, sentMessages, emitEngineLog } = createSystemFixture(async () => ({ ok: true }));

    await harness.invoke('util:startLogStream');
    emitLogLine('from-bus');
    emitEngineLog('from-engine');

    assert.deepEqual(sentMessages, [
        { channel: 'log:data', data: 'from-bus' },
        { channel: 'log:data', data: 'from-engine' }
    ]);
});

test('util:stopLogStream unsubscribes from bus and emits close signal', async () => {
    clearLogBusForTests();
    const { harness, sentMessages } = createSystemFixture(async () => ({ ok: true }));

    await harness.invoke('util:startLogStream');
    await harness.invoke('util:stopLogStream');
    emitLogLine('after-stop');

    assert.deepEqual(sentMessages, [{ channel: 'log:closed', data: 0 }]);
});
