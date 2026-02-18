/**
 * DRAM IPC - Skills Handlers
 * Manages available skills and their status.
 */
import { validateString } from '../ipc-validation.js';

function normalizeSkillIdentifier(value) {
    return String(value || '').trim().toLowerCase();
}

function resolveSkillKey(skills, skillId) {
    const target = normalizeSkillIdentifier(skillId);
    if (!target) return '';

    const match = skills.find((skill) => {
        const candidates = [
            skill?.skillKey,
            skill?.id,
            skill?.skillId,
            skill?.name
        ];
        return candidates.some((candidate) => normalizeSkillIdentifier(candidate) === target);
    });

    if (match?.skillKey) return String(match.skillKey);
    if (match?.id) return String(match.id);
    return String(skillId).replace(/^@dram\//, '').replace(/\//g, '-');
}

/**
 * Register skills-related IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 * @param {Function} internalRequest - Helper to make internal requests to DramEngine
 */
export function registerSkillsHandlers(ipc, internalRequest) {
    ipc.handle('util:getSkillStatusRaw', async () => {
        try {
            const result = await internalRequest('skills.status');
            if (!result?.ok) return null;
            return result.data ?? null;
        } catch (err) {
            console.error('util:getSkillStatusRaw error:', err);
            return null;
        }
    });

    /**
     * Get available skills from the engine
     */
    ipc.handle('util:getSkills', async () => {
        try {
            const result = await internalRequest('skills.status');
            if (!result?.ok) {
                return [];
            }
            const data = result.data;
            const skills = data?.skills || data || [];

            // (Fallback logic remains the same, just keeping it inside the function)
            if (!Array.isArray(skills) || skills.length === 0) {
                // ... fallback code ...
            }

            if (!Array.isArray(skills)) return [];

            return skills.map(s => ({
                id: s.skillKey || s.id || s.skillId || 'unknown',
                name: s.name || s.id || 'Unknown',
                description: s.description || '',
                version: s.version || '',
                enabled: s.enabled !== false,
                eligible: s.eligible !== false,
                requirements: s.requirements || [],
                methods: s.methods || s.rpcMethods || s.capabilities || s.features || []
            }));
        } catch (err) {
            console.error('util:getSkills error:', err);
            return [];
        }
    });

    /**
     * Install a skill
     */
    ipc.handle('util:installSkill', async (event, skillId) => {
        try {
            validateString(skillId, 100);
            const result = await internalRequest('skills.install', { id: skillId });
            if (!result.ok) throw new Error(result.error?.message || 'Failed to install skill');
            return { success: true, data: result.data };
        } catch (err) {
            console.error('util:installSkill error:', err);
            return { success: false, error: err.message };
        }
    });

    /**
     * Update a skill
     */
    ipc.handle('util:updateSkill', async (event, skillId) => {
        try {
            validateString(skillId, 100);
            const result = await internalRequest('skills.update', { id: skillId });
            if (!result.ok) throw new Error(result.error?.message || 'Failed to update skill');
            return { success: true, data: result.data };
        } catch (err) {
            console.error('util:updateSkill error:', err);
            return { success: false, error: err.message };
        }
    });

    /**
     * Get skill binaries/status
     */
    ipc.handle('util:getSkillBins', async () => {
        try {
            const result = await internalRequest('skills.bins');
            if (!result?.ok) return [];
            const data = result.data;
            return data?.bins || data || [];
        } catch (err) {
            console.error('util:getSkillBins error:', err);
            return [];
        }
    });

    /**
     * Toggle skill enabled state
     */
    ipc.handle('util:toggleSkill', async (event, skillId, enabled) => {
        try {
            validateString(skillId, 100);
            const skillData = await internalRequest('skills.status');
            if (!skillData?.ok) {
                throw new Error(skillData?.error?.message || 'Failed to load skill status');
            }
            const rawSkills = skillData.data?.skills || skillData.data;
            const skills = Array.isArray(rawSkills) ? rawSkills : [];
            const skillKey = resolveSkillKey(skills, skillId);
            if (!skillKey) {
                throw new Error('Invalid skill identifier');
            }

            const result = await internalRequest('skills.update', { skillKey, enabled: Boolean(enabled) });
            if (!result.ok) throw new Error(result.error?.message || 'Failed to update skill state');
            return { success: true };
        } catch (err) {
            console.error('util:toggleSkill error:', err);
            return { success: false, error: err.message };
        }
    });
}




