/**
 * DRAM IPC - Legacy Migration Handlers
 */
import { app } from 'electron';
import fsPromises from 'fs/promises';
import path from 'path';

export function registerMigrationHandlers(ipc, _secureStorage, _windowManager, _debugLog) {
    /**
     * Detect legacy configurations (Moltbot / Clawdbot)
     */
    ipc.handle('app:detectLegacyConfig', async () => {
        try {
            const home = app.getPath('home');
            const paths = [
                { name: 'Moltbot', path: path.join(home, '.moltbot', 'moltbot.json') },
                { name: 'Clawdbot', path: path.join(home, '.clawdbot', 'clawdbot.json') }
            ];

            for (const item of paths) {
                try {
                    console.log(`[Migration] Checking legacy path: ${item.path}`);
                    await fsPromises.access(item.path);
                    console.log(`[Migration] Found legacy config: ${item.path}`);
                    const content = await fsPromises.readFile(item.path, 'utf-8');
                    const config = JSON.parse(content);
                    return { found: true, name: item.name, config };
                } catch {
                    console.log(`[Migration] Path not found or inaccessible: ${item.path}`);
                    // Not found, continue
                }
            }
            return { found: false };
        } catch (err) {
            console.error('app:detectLegacyConfig error:', err);
            return { found: false };
        }
    });

    /**
     * Migrate legacy configuration to DRAM
     */
    ipc.handle('app:migrateLegacyConfig', async (event, legacyConfig) => {
        try {
            // Map legacy fields to DRAM wizard fields
            const wizardData = {
                model: legacyConfig.agents?.defaults?.model?.primary ||
                    legacyConfig.settings?.model ||
                    'claude-3-7-sonnet-latest',
                workspacePath: legacyConfig.agents?.defaults?.workspace ||
                    legacyConfig.settings?.workspacePath ||
                    '',
                fallbacks: [],
                plugins: [],
                skills: []
            };

            // Map fallbacks
            const legacyFallbacks = legacyConfig.agents?.defaults?.model?.fallbacks ||
                legacyConfig.settings?.fallbackChain || [];

            wizardData.fallbacks = legacyFallbacks.map(fb => ({
                model: typeof fb === 'string' ? fb : (fb.model || 'none'),
                apiKey: ''
            }));

            // Map plugins
            if (legacyConfig.plugins?.entries) {
                wizardData.plugins = Object.keys(legacyConfig.plugins.entries)
                    .filter(id => legacyConfig.plugins.entries[id].enabled !== false);
            }

            return wizardData;
        } catch (err) {
            console.error('app:migrateLegacyConfig error:', err);
            return null;
        }
    });
}
