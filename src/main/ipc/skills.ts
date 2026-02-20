/**
 * DRAM IPC - Skills Handlers
 * Manages available skills and their status.
 */
import { validateString } from '../ipc-validation.js';
import {
    normalizeSkillIdentifier,
    normalizeTrustStatus,
    readTrustRegistry,
    writeTrustRegistry,
    normalizeSkillsPayload,
    normalizeCheckSkillsPayload,
    attachCheckDataToSkills,
    extractNormalizedSkills,
    resolveSkillTrustStatus,
    expandIdentifierVariants,
    isLikelyGenericInstallerToken,
    resolveSkillEntry,
    buildSkillInstallCandidates,
    tryInstallViaWslBrew,
    getPlatformDisplayName,
    classifyInstallFailureMessage,
    resolveSkillKey,
    installHomebrewInWsl
} from './skills-utils.js';
export function registerSkillsHandlers(ipc, internalRequest, secureStorage = null) {
    const inMemoryTrustStore = {};
    let skillsStatusCachedResult = null;
    let skillsStatusCachedAt = 0;
    let skillsStatusInFlight = null;
    let skillsCheckCachedMap = null;
    let skillsCheckLastAttemptAt = 0;
    let skillsCheckInFlight = null;
    const SKILLS_STATUS_CACHE_TTL_MS = 900;
    const SKILLS_CHECK_CACHE_TTL_MS = 15000;
    function invalidateSkillsStatusCache() {
        skillsStatusCachedResult = null;
        skillsStatusCachedAt = 0;
        skillsCheckCachedMap = null;
        skillsCheckLastAttemptAt = 0;
    }

    async function getSkillsCheckMap({ force = false } = {}) {
        const now = Date.now();
        if (!force) {
            if (skillsCheckInFlight) {
                return skillsCheckInFlight;
            }
            if ((now - skillsCheckLastAttemptAt) < SKILLS_CHECK_CACHE_TTL_MS) {
                return skillsCheckCachedMap;
            }
        }

        skillsCheckInFlight = (async () => {
            skillsCheckLastAttemptAt = Date.now();
            try {
                const checkResult = await internalRequest('skills.check');
                if (checkResult?.ok) {
                    skillsCheckCachedMap = normalizeCheckSkillsPayload(checkResult.data);
                    return skillsCheckCachedMap;
                }
            } catch {
                // Best effort only: some runtimes may not expose skills.check
            }
            skillsCheckCachedMap = null;
            return null;
        })();

        try {
            return await skillsCheckInFlight;
        } finally {
            skillsCheckInFlight = null;
        }
    }

    async function getSkillsStatus({ force = false } = {}) {
        const now = Date.now();
        if (!force) {
            if (skillsStatusInFlight) {
                return skillsStatusInFlight;
            }
            if (skillsStatusCachedResult && (now - skillsStatusCachedAt) < SKILLS_STATUS_CACHE_TTL_MS) {
                return skillsStatusCachedResult;
            }
        }

        skillsStatusInFlight = (async () => {
            const statusResult = await internalRequest('skills.status');
            if (!statusResult?.ok) {
                skillsStatusCachedResult = statusResult;
                skillsStatusCachedAt = Date.now();
                return statusResult;
            }

            let normalizedSkills = normalizeSkillsPayload(statusResult.data);
            const checkMap = await getSkillsCheckMap({ force });
            if (checkMap) {
                normalizedSkills = attachCheckDataToSkills(normalizedSkills, checkMap);
            }

            const result = {
                ok: true,
                data: {
                    __normalized: true,
                    skills: normalizedSkills
                }
            };
            skillsStatusCachedResult = result;
            skillsStatusCachedAt = Date.now();
            return result;
        })();

        try {
            return await skillsStatusInFlight;
        } finally {
            skillsStatusInFlight = null;
        }
    }

    ipc.handle('util:getSkillVetting', async () => {
        return readTrustRegistry(secureStorage, inMemoryTrustStore);
    });

    ipc.handle('util:setSkillTrust', async (_event, skillId, status) => {
        try {
            validateString(skillId, 100);
            const normalizedSkillId = normalizeSkillIdentifier(skillId);
            if (!normalizedSkillId) {
                return { ok: false, error: 'Invalid skill identifier' };
            }

            const normalizedStatus = normalizeTrustStatus(status);
            if (!normalizedStatus) {
                return { ok: false, error: 'Invalid trust status (expected trusted, untrusted, or blocked)' };
            }

            const registry = await readTrustRegistry(secureStorage, inMemoryTrustStore);
            registry[normalizedSkillId] = normalizedStatus;
            const persisted = await writeTrustRegistry(secureStorage, inMemoryTrustStore, registry);
            if (!persisted) {
                return { ok: false, error: 'Failed to persist skill trust policy' };
            }

            return { ok: true, skillId: normalizedSkillId, trustStatus: normalizedStatus };
        } catch (err) {
            console.error('util:setSkillTrust error:', err);
            return { ok: false, error: err?.message || 'Failed to set skill trust policy' };
        }
    });

    ipc.handle('util:getSkillStatusRaw', async () => {
        try {
            const result = await getSkillsStatus();
            if (!result?.ok) return null;
            return result.data ?? null;
        } catch (err) {
            console.error('util:getSkillStatusRaw error:', err);
            return null;
        }
    });

    ipc.handle('util:installWslHomebrew', async () => {
        try {
            const result = await installHomebrewInWsl();
            return result;
        } catch (err) {
            console.error('util:installWslHomebrew error:', err);
            return {
                success: false,
                reason: 'wsl_install_failed',
                installer: 'brew',
                error: String(err?.message || 'Failed to install Homebrew in WSL')
            };
        }
    });

    /**
     * Get available skills from the engine
     */
    ipc.handle('util:getSkills', async (_event, force = false) => {
        try {
            const result = await getSkillsStatus({ force: Boolean(force) });
            if (!result?.ok) {
                return [];
            }
            const trustRegistry = await readTrustRegistry(secureStorage, inMemoryTrustStore);
            const skills = extractNormalizedSkills(result.data).map((skill) => ({
                ...skill,
                trustStatus: resolveSkillTrustStatus(skill, trustRegistry)
            }));
            return skills;
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
            const requestedVariants = expandIdentifierVariants(skillId).filter((value) => !isLikelyGenericInstallerToken(value));
            let combinedCandidates = requestedVariants.map((value) => ({ installId: value, name: value }));
            let hasExplicitInstallers = false;
            let installerMetadataUnsupportedOnPlatform = false;
            let unsupportedInstaller = '';
            let unsupportedInstallOption = null;
            try {
                const statusResult = await getSkillsStatus();
                if (statusResult?.ok) {
                    const skills = extractNormalizedSkills(statusResult.data);
                    const matched = resolveSkillEntry(skills, skillId);
                    const candidates = buildSkillInstallCandidates(matched, skillId);
                    combinedCandidates = candidates.combined.length > 0 ? candidates.combined : combinedCandidates;
                    hasExplicitInstallers = candidates.hasExplicitInstallers === true;
                    installerMetadataUnsupportedOnPlatform = candidates.installerMetadataUnsupportedOnPlatform === true;
                    unsupportedInstaller = String(candidates.unsupportedInstaller || '').trim();
                    unsupportedInstallOption = candidates.unsupportedInstallOption || null;
                }
            } catch {
                // Best effort only; we'll still try direct install below.
            }

            if (installerMetadataUnsupportedOnPlatform) {
                if (process.platform === 'win32' && unsupportedInstaller === 'brew') {
                    const fallbackSkillId = String(requestedVariants[0] || skillId || '').trim();
                    const wslAttempt = await tryInstallViaWslBrew(unsupportedInstallOption, fallbackSkillId);
                    if (wslAttempt?.success) {
                        invalidateSkillsStatusCache();
                        return { success: true, data: wslAttempt.data, paramsTried: [] };
                    }
                    return {
                        success: false,
                        reason: String(wslAttempt?.reason || 'unsupported_platform'),
                        installer: String(wslAttempt?.installer || 'brew'),
                        error: String(wslAttempt?.error || 'Unable to install dependency via WSL'),
                        suggestedCommand: String(wslAttempt?.suggestedCommand || ''),
                        paramsTried: []
                    };
                }
                const platformName = getPlatformDisplayName();
                const detail = unsupportedInstaller
                    ? `Installer "${unsupportedInstaller}" is not supported on ${platformName}`
                    : `No compatible installer is available on ${platformName}`;
                return {
                    success: false,
                    reason: 'unsupported_platform',
                    installer: unsupportedInstaller,
                    error: detail,
                    paramsTried: []
                };
            }

            if (!Array.isArray(combinedCandidates) || combinedCandidates.length === 0) {
                return {
                    success: false,
                    reason: 'installer_missing',
                    installer: '',
                    error: 'No installer metadata found for this skill',
                    paramsTried: []
                };
            }

            let lastError = '';
            const requestedPrimary = String(requestedVariants[0] || skillId || '').trim().toLowerCase();
            const attemptedParams = [];
            const combinedErrors = [];
            for (const params of combinedCandidates) {
                attemptedParams.push(params);
                const result = await internalRequest('skills.install', params);
                if (result?.ok) {
                    invalidateSkillsStatusCache();
                    return { success: true, data: result.data, paramsTried: params };
                }
                lastError = result?.error?.message || lastError;
                combinedErrors.push(String(result?.error?.message || ''));
                const message = String(result?.error?.message || '');
                const missingInstaller = message.match(/Installer not found:\s*([^\s]+)/i);
                if (missingInstaller && String(missingInstaller[1] || '').trim().toLowerCase() === requestedPrimary) {
                    // The exact requested installer is not known by OpenClaw; no need to try degraded aliases.
                    break;
                }
                if (hasExplicitInstallers) {
                    const classification = classifyInstallFailureMessage(message, requestedPrimary);
                    if (classification.reason && classification.reason !== 'invalid_request') {
                        break;
                    }
                }
            }

            const allErrors = combinedErrors.map((value) => String(value || '').trim()).filter(Boolean);
            const errorMessage = String(lastError || allErrors[allErrors.length - 1] || 'Failed to install skill');

            let failure = classifyInstallFailureMessage(errorMessage, requestedPrimary);
            if (!failure.reason && allErrors.length > 0) {
                for (const candidateError of allErrors) {
                    const candidateFailure = classifyInstallFailureMessage(candidateError, requestedPrimary);
                    if (candidateFailure.reason && candidateFailure.reason !== 'failed') {
                        failure = candidateFailure;
                        break;
                    }
                }
            }
            if (!failure.reason) {
                failure = { reason: 'failed', installer: '' };
            }

            if (failure.reason !== 'failed') {
                return {
                    success: false,
                    reason: failure.reason,
                    installer: failure.installer || '',
                    error: errorMessage,
                    paramsTried: attemptedParams
                };
            }

            return {
                success: false,
                reason: 'failed',
                error: errorMessage,
                paramsTried: attemptedParams
            };
        } catch (err) {
            console.error('util:installSkill error:', err);
            return { success: false, reason: 'failed', error: err.message };
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
            invalidateSkillsStatusCache();
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
    ipc.handle('util:toggleSkill', async (event, skillId, enabled, options = {}) => {
        try {
            validateString(skillId, 100);
            const skillData = await getSkillsStatus({ force: true });
            if (!skillData?.ok) {
                throw new Error(skillData?.error?.message || 'Failed to load skill status');
            }
            const skills = extractNormalizedSkills(skillData.data);
            const requestedEnabled = Boolean(enabled);
            const matchedSkill = resolveSkillEntry(skills, skillId);
            if (!matchedSkill) {
                throw new Error('Invalid skill identifier');
            }
            /** @type {Record<string, unknown>} */
            const normalizedToggleOptions = (options && typeof options === 'object') ? options : {};
            const skipEligibilityGuard = normalizedToggleOptions['skipEligibilityGuard'] === true;
            if (requestedEnabled && matchedSkill.eligible === false) {
                if (skipEligibilityGuard) {
                    // Continue to engine update; renderer requested a post-setup retry where
                    // local eligibility may be stale for a short period.
                } else {
                const reason = matchedSkill.requirements?.[0] || 'missing runtime requirements';
                return { success: false, error: `Skill "${matchedSkill.name || skillId}" requires setup: ${reason}` };
                }
            }

            if (requestedEnabled) {
                const trustRegistry = await readTrustRegistry(secureStorage, inMemoryTrustStore);
                const trustStatus = resolveSkillTrustStatus(matchedSkill, trustRegistry);
                if (trustStatus === 'blocked') {
                    return { success: false, error: `Skill "${matchedSkill.name || skillId}" is blocked by vetting policy` };
                }
            }

            const skillKey = resolveSkillKey(skills, skillId);
            if (!skillKey) {
                throw new Error('Invalid skill identifier');
            }

            const result = await internalRequest('skills.update', { skillKey, enabled: requestedEnabled });
            if (!result.ok) throw new Error(result.error?.message || 'Failed to update skill state');
            invalidateSkillsStatusCache();
            return { success: true };
        } catch (err) {
            console.error('util:toggleSkill error:', err);
            return { success: false, error: err.message };
        }
    });
}





