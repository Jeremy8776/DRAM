import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { registerSkillsHandlers } from '../runtime/main/ipc/skills.js';

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
        if (method === 'skills.check') {
            return { ok: false, error: { message: 'unsupported' } };
        }
        if (method === 'skills.update') {
            assert.deepEqual(params, { skillKey: 'memory-core', enabled: true });
            return { ok: true, data: {} };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:toggleSkill', '@dram/memory/core', true);
    assert.deepEqual(result, { success: true });
    assert.deepEqual(calls.map((c) => c.method), ['skills.status', 'skills.check', 'skills.update']);
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

test('util:getSkills normalizes object-map payload and eligibility metadata', async () => {
    const harness = createIpcHarness();
    registerSkillsHandlers(harness.ipc, async (method) => {
        if (method === 'skills.check') {
            return { ok: false, error: { message: 'unsupported' } };
        }
        assert.equal(method, 'skills.status');
        return {
            ok: true,
            data: {
                skills: {
                    'coding-agent': {
                        skillKey: 'coding-agent',
                        name: 'Coding Agent',
                        enabled: true,
                        eligible: false,
                        requirements: [{ message: 'missing binary: rg' }],
                        rpcMethods: ['tools.run']
                    },
                    weather: {
                        id: 'weather',
                        description: 'Weather lookups',
                        enabled: false,
                        eligible: true
                    }
                }
            }
        };
    });

    const skills = await harness.invoke('util:getSkills');
    const byId = new Map(skills.map((skill) => [skill.id, skill]));

    assert.equal(byId.get('coding-agent')?.eligible, false);
    assert.equal(byId.get('coding-agent')?.enabled, false);
    assert.deepEqual(byId.get('coding-agent')?.requirements, ['missing binary: rg']);
    assert.deepEqual(byId.get('coding-agent')?.methods, ['tools.run']);

    assert.equal(byId.get('weather')?.enabled, false);
    assert.equal(byId.get('weather')?.eligible, true);
});

test('util:getSkills treats disabled skills with no missing requirements as available', async () => {
    const harness = createIpcHarness();
    registerSkillsHandlers(harness.ipc, async (method) => {
        if (method === 'skills.check') {
            return { ok: false, error: { message: 'unsupported' } };
        }
        assert.equal(method, 'skills.status');
        return {
            ok: true,
            data: {
                skills: [
                    {
                        id: 'clawhub',
                        skillKey: 'clawhub',
                        name: 'clawhub',
                        eligible: false,
                        disabled: true,
                        requirements: { bins: ['clawhub'], env: [], config: [], os: [], anyBins: [] },
                        missing: { bins: [], env: [], config: [], os: [], anyBins: [] }
                    }
                ]
            }
        };
    });

    const skills = await harness.invoke('util:getSkills');
    assert.equal(skills.length, 1);
    assert.equal(skills[0].id, 'clawhub');
    assert.equal(skills[0].eligible, true);
    assert.equal(skills[0].enabled, false);
    assert.deepEqual(skills[0].requirements, []);
});

test('util:toggleSkill blocks enabling skills that require setup', async () => {
    const harness = createIpcHarness();
    const calls = [];
    registerSkillsHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [
                        {
                            skillKey: 'coding-agent',
                            id: 'coding-agent',
                            name: 'Coding Agent',
                            enabled: false,
                            eligible: false,
                            requirements: [{ message: 'missing binary: rg' }]
                        }
                    ]
                }
            };
        }
        if (method === 'skills.check') {
            return { ok: false, error: { message: 'unsupported' } };
        }
        if (method === 'skills.update') {
            throw new Error('skills.update should not be called for setup-required enable attempts');
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:toggleSkill', 'coding-agent', true);
    assert.equal(result.success, false);
    assert.match(result.error || '', /requires setup/i);
    assert.deepEqual(calls.map((c) => c.method), ['skills.status', 'skills.check']);
});

test('util:toggleSkill allows enabling disabled skills with no missing requirements', async () => {
    const harness = createIpcHarness();
    const calls = [];
    registerSkillsHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [
                        {
                            id: 'clawhub',
                            skillKey: 'clawhub',
                            name: 'clawhub',
                            eligible: false,
                            disabled: true,
                            requirements: { bins: ['clawhub'], env: [], config: [], os: [], anyBins: [] },
                            missing: { bins: [], env: [], config: [], os: [], anyBins: [] }
                        }
                    ]
                }
            };
        }
        if (method === 'skills.check') {
            return { ok: false, error: { message: 'unsupported' } };
        }
        if (method === 'skills.update') {
            assert.deepEqual(params, { skillKey: 'clawhub', enabled: true });
            return { ok: true, data: {} };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:toggleSkill', 'clawhub', true);
    assert.equal(result.success, true);
    assert.deepEqual(calls.map((c) => c.method), ['skills.status', 'skills.check', 'skills.update']);
});

test('util:toggleSkill blocks enabling skills explicitly marked as blocked', async () => {
    const harness = createIpcHarness();
    const calls = [];
    registerSkillsHandlers(harness.ipc, async (method, params) => {
        calls.push({ method, params });
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [
                        {
                            skillKey: 'weather',
                            id: 'weather',
                            name: 'Weather',
                            enabled: false,
                            eligible: true
                        }
                    ]
                }
            };
        }
        if (method === 'skills.check') {
            return { ok: false, error: { message: 'unsupported' } };
        }
        if (method === 'skills.update') {
            throw new Error('skills.update should not be called for blocked skills');
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const trustResult = await harness.invoke('util:setSkillTrust', 'weather', 'blocked');
    assert.equal(trustResult.ok, true);

    const result = await harness.invoke('util:toggleSkill', 'weather', true);
    assert.equal(result.success, false);
    assert.match(result.error || '', /blocked/i);
    assert.deepEqual(calls.map((c) => c.method), ['skills.status', 'skills.check']);
});

test('util:setSkillTrust persists trust policy and util:getSkillVetting reads it', async () => {
    const harness = createIpcHarness();
    registerSkillsHandlers(harness.ipc, async (method) => {
        if (method === 'skills.status') {
            return { ok: true, data: { skills: [] } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const setResult = await harness.invoke('util:setSkillTrust', 'weather', 'blocked');
    assert.equal(setResult.ok, true);
    assert.equal(setResult.trustStatus, 'blocked');

    const vetting = await harness.invoke('util:getSkillVetting');
    assert.equal(vetting.weather, 'blocked');
});

test('util:installSkill returns installer_missing when runtime installer does not exist', async () => {
    const harness = createIpcHarness();
    registerSkillsHandlers(harness.ipc, async (method, params) => {
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [{ id: 'clawhub', skillKey: 'clawhub', name: 'clawhub' }]
                }
            };
        }
        if (method === 'skills.install') {
            return {
                ok: false,
                error: { message: `Installer not found: ${params?.installId || params?.name || 'clawhub'}` }
            };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:installSkill', 'clawhub');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'installer_missing');
    assert.match(result.error || '', /installer not found/i);
});

test('util:installSkill prefers OpenClaw installer ids with skill name pairing', async () => {
    const harness = createIpcHarness();
    const installCalls = [];
    registerSkillsHandlers(harness.ipc, async (method, params) => {
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [
                        {
                            id: 'clawhub',
                            skillKey: 'clawhub',
                            name: 'clawhub',
                            install: [{ id: 'node', kind: 'node', label: 'Install clawhub (npm)' }]
                        }
                    ]
                }
            };
        }
        if (method === 'skills.install') {
            installCalls.push(params);
            if (params?.installId === 'node' && params?.name === 'clawhub') {
                return { ok: true, data: { installed: true } };
            }
            return { ok: false, error: { message: 'unexpected params' } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:installSkill', 'clawhub');
    assert.equal(result.success, true);
    assert.deepEqual(installCalls[0], { installId: 'node', name: 'clawhub' });
});

test('util:installSkill uses installId metadata and avoids treating skill ids as installers', async () => {
    const harness = createIpcHarness();
    const installCalls = [];
    registerSkillsHandlers(harness.ipc, async (method, params) => {
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [
                        {
                            id: 'clawhub',
                            skillKey: 'clawhub',
                            name: 'clawhub',
                            install: [{ id: 'clawhub', installId: 'node', package: 'clawhub', label: 'Install clawhub (npm)' }]
                        }
                    ]
                }
            };
        }
        if (method === 'skills.install') {
            installCalls.push(params);
            if (params?.installId === 'node' && params?.name === 'clawhub') {
                return { ok: true, data: { installed: true } };
            }
            return { ok: false, error: { message: 'unexpected params' } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:installSkill', 'clawhub');
    assert.equal(result.success, true);
    assert.equal(installCalls.length, 1);
    assert.deepEqual(installCalls[0], { installId: 'node', name: 'clawhub' });
});

test('util:installSkill handles brew-only installer metadata by platform', async () => {
    const harness = createIpcHarness();
    const installCalls = [];
    registerSkillsHandlers(harness.ipc, async (method, params) => {
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [
                        {
                            id: 'nano-banana-pro',
                            skillKey: 'nano-banana-pro',
                            name: 'nano-banana-pro',
                            install: [{ installId: 'brew', package: 'banana-cli', label: 'Install with brew' }]
                        }
                    ]
                }
            };
        }
        if (method === 'skills.install') {
            installCalls.push(params);
            return { ok: false, error: { message: 'brew not installed - Homebrew is not installed. Install it from https://brew.sh' } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:installSkill', 'nano-banana-pro');
    assert.equal(result.success, false);
    assert.equal(result.installer, 'brew');
    if (process.platform === 'win32') {
        assert.equal(result.reason, 'unsupported_platform');
        assert.equal(installCalls.length, 0);
    } else {
        assert.equal(result.reason, 'tool_missing');
        assert.equal(installCalls.length, 1);
        assert.deepEqual(installCalls[0], { installId: 'brew', name: 'nano-banana-pro' });
    }
});

test('util:getSkills merges installer metadata from skills.check per skill', async () => {
    const harness = createIpcHarness();
    registerSkillsHandlers(harness.ipc, async (method) => {
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [
                        {
                            id: 'blucli',
                            skillKey: 'blucli',
                            name: 'blucli',
                            eligible: false,
                            missing: {
                                bins: ['blu'],
                                anyBins: [],
                                env: [],
                                config: [],
                                os: []
                            }
                        }
                    ]
                }
            };
        }
        if (method === 'skills.check') {
            return {
                ok: true,
                data: {
                    summary: { total: 1, eligible: 0, disabled: 0, blocked: 0, missingRequirements: 1 },
                    missingRequirements: [
                        {
                            name: 'blucli',
                            missing: {
                                bins: ['blu'],
                                anyBins: [],
                                env: [],
                                config: [],
                                os: []
                            },
                            install: [
                                {
                                    id: 'go',
                                    kind: 'go',
                                    label: 'Install blucli (go)',
                                    bins: ['blu']
                                }
                            ]
                        }
                    ]
                }
            };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const skills = await harness.invoke('util:getSkills');
    assert.equal(skills.length, 1);
    const [skill] = skills;
    assert.equal(skill.id, 'blucli');
    assert.equal(skill.eligible, false);
    assert.equal(Array.isArray(skill.requirementDetails), true);
    assert.equal(Array.isArray(skill.installOptions), true);
    const installerId = skill.installOptions[0]?.id || skill.installOptions[0]?.installId || skill.installOptions[0]?.kind;
    assert.equal(installerId, 'go');
});

test('util:getSkills caches skills.check between rapid status refreshes', async () => {
    const harness = createIpcHarness();
    const calls = [];
    registerSkillsHandlers(harness.ipc, async (method) => {
        calls.push(method);
        if (method === 'skills.status') {
            return {
                ok: true,
                data: {
                    skills: [{ id: 'clawhub', skillKey: 'clawhub', name: 'clawhub', enabled: false, eligible: true }]
                }
            };
        }
        if (method === 'skills.check') {
            return {
                ok: true,
                data: { summary: { total: 1, eligible: 1, missingRequirements: 0 }, missingRequirements: [] }
            };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    await harness.invoke('util:getSkills');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await harness.invoke('util:getSkills');

    assert.equal(calls.filter((method) => method === 'skills.status').length, 2);
    assert.equal(calls.filter((method) => method === 'skills.check').length, 1);
});

test('util:installWslHomebrew is exposed and guarded outside desktop runtime', async () => {
    const harness = createIpcHarness();
    registerSkillsHandlers(harness.ipc, async (method) => {
        if (method === 'skills.status' || method === 'skills.check') {
            return { ok: true, data: { skills: [] } };
        }
        throw new Error(`Unexpected method ${method}`);
    });

    const result = await harness.invoke('util:installWslHomebrew');
    assert.equal(result.success, false);
    assert.equal(result.reason, 'unsupported_platform');
});

test('bundled skills directories contain SKILL.md and fallback IDs are backed', async () => {
    const skillsRoot = path.join(process.cwd(), 'resources', 'engine', 'skills');
    const skillEntries = await fs.readdir(skillsRoot, { withFileTypes: true });
    const skillDirs = skillEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    const missingSkillDocs = [];
    for (const dirName of skillDirs) {
        const skillDocPath = path.join(skillsRoot, dirName, 'SKILL.md');
        try {
            await fs.access(skillDocPath);
        } catch {
            missingSkillDocs.push(dirName);
        }
    }
    assert.deepEqual(missingSkillDocs.sort(), []);

    const fallbackSkillIds = ['coding-agent', 'summarize', 'weather', 'tmux'];
    const missingFallbackBackings = fallbackSkillIds.filter((id) => !skillDirs.includes(id));
    assert.deepEqual(missingFallbackBackings, []);
});
