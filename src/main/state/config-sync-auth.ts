import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Sync auth profiles for the active agent.
 * OpenClaw resolves provider credentials from auth-profiles.json first,
 * so we persist API key entries here to avoid stale/missing auth at runtime.
 */
export async function syncAuthProfiles({
    state,
    configPath,
    getSettingValue,
    normalizeSecretValue,
    resolveRuntimeSecret,
    forEachAuthAlias
}) {
    try {
        const apiKeys = {
            anthropic: normalizeSecretValue(getSettingValue(state, 'apiKeyAnthropic')),
            openai: normalizeSecretValue(getSettingValue(state, 'apiKeyOpenAI')),
            google: normalizeSecretValue(getSettingValue(state, 'apiKeyGoogle')),
            ollama: normalizeSecretValue(getSettingValue(state, 'apiKeyOllama')),
            groq: normalizeSecretValue(getSettingValue(state, 'apiKeyGroq'))
        };

        const openClawHome = (typeof configPath === 'string' && configPath.trim())
            ? path.dirname(configPath)
            : path.join(os.homedir(), '.openclaw');
        const targetAgentDirs = [
            path.join(openClawHome, 'agents', 'main', 'agent'),
            path.join(os.homedir(), '.dram', 'agents', 'main', 'agent')
        ];

        let store = { version: 1, profiles: {} };
        for (const agentDir of targetAgentDirs) {
            const candidatePath = path.join(agentDir, 'auth-profiles.json');
            try {
                const existing = await fs.promises.readFile(candidatePath, 'utf-8');
                store = JSON.parse(existing);
                break;
            } catch {
                // Try next location.
            }
        }

        if (!store.profiles || typeof store.profiles !== 'object') {
            store.profiles = {};
        }

        const syncedProviders = [];
        const updateProfile = (provider, profileId, key) => {
            const resolvedKey = resolveRuntimeSecret(key);
            if (resolvedKey) {
                store.profiles[profileId] = {
                    type: 'api_key',
                    provider,
                    key: resolvedKey
                };
                syncedProviders.push(provider);
            } else {
                const existing = store.profiles[profileId];
                if (!existing || existing.type === 'api_key') {
                    delete store.profiles[profileId];
                }
            }
        };

        forEachAuthAlias('anthropic', (profileId, provider) => updateProfile(provider, profileId, apiKeys.anthropic));
        forEachAuthAlias('openai', (profileId, provider) => updateProfile(provider, profileId, apiKeys.openai));
        forEachAuthAlias('google', (profileId, provider) => updateProfile(provider, profileId, apiKeys.google));
        forEachAuthAlias('ollama', (profileId, provider) => updateProfile(provider, profileId, apiKeys.ollama));
        forEachAuthAlias('groq', (profileId, provider) => updateProfile(provider, profileId, apiKeys.groq));

        const writtenPaths = [];
        for (const agentDir of targetAgentDirs) {
            const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
            await fs.promises.mkdir(agentDir, { recursive: true });
            await fs.promises.writeFile(authProfilesPath, JSON.stringify(store, null, 2), 'utf-8');
            writtenPaths.push(authProfilesPath);
        }

        console.log('[ConfigSync] Synced API keys to auth-profiles.json:', syncedProviders.join(', ') || 'none', writtenPaths);
    } catch (err) {
        console.error('[ConfigSync] Failed to sync auth profiles:', err);
    }
}





