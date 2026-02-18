import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { validateApiKey, validateUrl } from '../runtime/main/ipc-validation.js';
import { setupConfigSync } from '../runtime/main/state/config-sync.js';

class FakeStateManager extends EventEmitter {
    constructor(state) {
        super();
        this.state = state;
    }

    getAll() {
        return this.state;
    }

    async set(_key, _value, _persist) {
        return true;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

test('validateUrl only allows http/https protocols', () => {
    assert.equal(validateUrl('https://example.com'), 'https://example.com');
    assert.equal(validateUrl('http://localhost:8080/path'), 'http://localhost:8080/path');
    assert.throws(() => validateUrl('ws://localhost:8080'), /Invalid URL/);
    assert.throws(() => validateUrl('javascript:alert(1)'), /Invalid URL/);
});

test('validateApiKey rejects control characters', () => {
    assert.equal(validateApiKey('sk-valid-key-123'), 'sk-valid-key-123');
    assert.throws(() => validateApiKey('sk-bad\nkey'), /control characters/);
    assert.throws(() => validateApiKey('sk-bad\u0000key'), /control characters|null bytes/);
});

test('config sync keeps API keys out of config payload and in runtime env', async (t) => {
    const managedEnvVars = [
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'GROQ_API_KEY',
        'ELEVENLABS_API_KEY',
        'XI_API_KEY'
    ];
    const originalEnv = Object.fromEntries(managedEnvVars.map((k) => [k, process.env[k]]));
    t.after(() => {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    const originalConsoleError = console.error;
    console.error = () => { };
    t.after(() => {
        console.error = originalConsoleError;
    });

    const state = {
        settings: {
            model: 'gpt-4o',
            fallbackChain: [],
            temperature: 0.5,
            thinkLevel: 1,
            ttsProvider: 'edge',
            ttsVoiceEdge: 'en-US-AriaNeural',
            ttsVoiceOpenAI: '',
            ttsVoiceElevenlabs: '',
            ttsVoiceElevenlabsCustom: '',
            apiKeyAnthropic: 'anthropic-secret',
            apiKeyOpenAI: 'openai-secret',
            apiKeyGoogle: 'google-secret',
            apiKeyGroq: 'groq-secret',
            apiKeyElevenLabs: 'eleven-secret'
        },
        plugins: []
    };

    let writtenConfig = null;
    const engineModules = {
        loadConfig: () => ({
            env: {
                vars: {
                    OPENAI_API_KEY: 'old-openai-secret',
                    ELEVENLABS_API_KEY: 'old-eleven-secret'
                }
            },
            auth: {
                profiles: {
                    'openai:default': {
                        provider: 'openai',
                        mode: 'api_key'
                    }
                }
            },
            messages: {
                tts: {
                    provider: 'edge',
                    elevenlabs: {
                        voiceId: 'Rachel',
                        apiKey: 'old-eleven-secret'
                    }
                }
            }
        }),
        writeConfigFile: async (nextConfig) => {
            writtenConfig = nextConfig;
            throw new Error('test-stop-after-capture');
        },
        configPath: null
    };

    setupConfigSync(new FakeStateManager(state), engineModules);
    await sleep(50);

    assert.ok(writtenConfig, 'expected config payload to be captured');
    assert.equal(writtenConfig.env?.vars?.OPENAI_API_KEY, undefined);
    assert.equal(writtenConfig.env?.vars?.ANTHROPIC_API_KEY, undefined);
    assert.equal(writtenConfig.env?.vars?.GOOGLE_API_KEY, undefined);
    assert.equal(writtenConfig.env?.vars?.GEMINI_API_KEY, undefined);
    assert.equal(writtenConfig.env?.vars?.GROQ_API_KEY, undefined);
    assert.equal(writtenConfig.env?.vars?.ELEVENLABS_API_KEY, undefined);
    assert.equal(writtenConfig.env?.vars?.XI_API_KEY, undefined);
    assert.equal(writtenConfig.messages?.tts?.elevenlabs?.apiKey, undefined);

    assert.deepEqual(writtenConfig.auth?.profiles?.['anthropic:default'], { provider: 'anthropic', mode: 'api_key' });
    assert.deepEqual(writtenConfig.auth?.profiles?.['openai:default'], { provider: 'openai', mode: 'api_key' });
    assert.deepEqual(writtenConfig.auth?.profiles?.['google:default'], { provider: 'google', mode: 'api_key' });
    assert.deepEqual(writtenConfig.auth?.profiles?.['groq:default'], { provider: 'groq', mode: 'api_key' });

    assert.equal(process.env.ANTHROPIC_API_KEY, 'anthropic-secret');
    assert.equal(process.env.OPENAI_API_KEY, 'openai-secret');
    assert.equal(process.env.GOOGLE_API_KEY, 'google-secret');
    assert.equal(process.env.GEMINI_API_KEY, 'google-secret');
    assert.equal(process.env.GROQ_API_KEY, 'groq-secret');
    assert.equal(process.env.ELEVENLABS_API_KEY, 'eleven-secret');
    assert.equal(process.env.XI_API_KEY, 'eleven-secret');
});
