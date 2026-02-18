import assert from 'node:assert/strict';
import test from 'node:test';

import { registerSkillsHandlers } from '../src/main/ipc/skills.js';

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

test('util:getSkillBins unwraps internal request payload', async () => {
    const harness = createIpcHarness();
    registerSkillsHandlers(harness.ipc, async (method) => {
        assert.equal(method, 'skills.bins');
        return { ok: true, data: { bins: ['dram-skill-a', 'dram-skill-b'] } };
    });

    const bins = await harness.invoke('util:getSkillBins');
    assert.deepEqual(bins, ['dram-skill-a', 'dram-skill-b']);
});

test('util:toggleSkill resolves skillKey from status payload', async () => {
    const harness = createIpcHarness();
    const calls = [];
    registerSkillsHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [
                        { skillKey: 'memory-core', id: '@dram/memory/core', name: 'Memory Core' }
                    ]
                }
            };
        }
        if (method === 'skills.update') {
            assert.deepEqual(params, { skillKey: 'memory-core', enabled: true });
            return { ok: true, data: {} };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:toggleSkill', '@dram/memory/core', true);
    assert.deepEqual(result, { success: true });
    assert.deepEqual(calls.map((c) => c.method), ['skills.status', 'skills.update']);
});

test('util:toggleSkill returns failure on status fetch error', async () => {
    const harness = createIpcHarness();
    registerSkillsHandlers(harness.ipc, async (method) => {
        assert.equal(method, 'skills.status');
        return { ok: false, error: { message: 'status unavailable' } };
    });

    const originalError = console.error;
    console.error = () => { };
    try {
        const result = await harness.invoke('util:toggleSkill', 'memory-core', false);
        assert.equal(result.success, false);
        assert.match(result.error, /status unavailable/);
    } finally {
        console.error = originalError;
    }
});
