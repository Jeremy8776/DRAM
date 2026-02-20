/**
 * DRAM Listeners - Skill Management
 * Handles skill toggling and plugin configuration
 */
import { showConfirmDialog, showNoteDialog, showTextPrompt, showToast } from '../../components/dialog.js';
import { deriveSkillRequirementActions } from '../skill-requirements.js';
import {
    ensureRequiredTool,
    runWslHomebrewInstallGuide,
    attemptSkillInstall,
    buildInstallerFailureMessage
} from './skill-setup-installers.js';
import {
    normalizeToolToken,
    ensureWslHomebrewReady,
    getWindowsOnboardingPolicy,
    getSkillPlatformSupport
} from './skill-setup-policy.js';
import { handleNoAutomaticFixResult } from './skill-setup-feedback.js';

const SKILLS_REFRESH_MIN_INTERVAL_MS = 700;
let skillsRefreshPromise = null;
let lastSkillsRefreshAt = 0;
let lastSkillsSnapshot = [];

function normalizeSkillId(value) {
    return String(value || '').trim().toLowerCase();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveSkill(skills, targetId) {
    const target = normalizeSkillId(targetId);
    if (!target) return null;
    return (skills || []).find((skill) => {
        const candidates = [skill?.id, skill?.skillKey, skill?.name];
        return candidates.some((candidate) => normalizeSkillId(candidate) === target);
    }) || null;
}

function setByPath(target, path, value) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (parts.length === 0) return;
    let current = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key] || typeof current[key] !== 'object') current[key] = {};
        current = current[key];
    }
    current[parts[parts.length - 1]] = value;
}

export function getRequirementActionFromButton(button) {
    if (!button?.dataset) return null;
    const type = String(button.dataset.actionType || '').trim().toLowerCase();
    if (type === 'env') {
        const key = String(button.dataset.actionKey || '').trim();
        return key ? { type: 'env', key, requirement: '' } : null;
    }
    if (type === 'config') {
        const path = String(button.dataset.actionPath || '').trim();
        return path ? { type: 'config', path, requirement: '' } : null;
    }
    if (type === 'bin') {
        const bin = String(button.dataset.actionBin || '').trim();
        return { type: 'bin', bin, requirement: '' };
    }
    if (type === 'install') {
        const command = String(button.dataset.actionCommand || '').trim();
        const label = String(button.dataset.actionLabel || '').trim();
        const installId = String(button.dataset.actionInstallId || '').trim();
        const skillId = String(button.dataset.actionSkillId || '').trim();
        if (!command && !installId) return null;
        return {
            type: 'install',
            command,
            installId,
            label,
            skillId,
            requirement: ''
        };
    }
    return null;
}

export async function refreshSkillsList({ force = false } = {}) {
    const now = Date.now();
    if (!force && skillsRefreshPromise) {
        return skillsRefreshPromise;
    }

    if (!force && (now - lastSkillsRefreshAt) < SKILLS_REFRESH_MIN_INTERVAL_MS && Array.isArray(lastSkillsSnapshot)) {
        return lastSkillsSnapshot;
    }

    skillsRefreshPromise = (async () => {
        const skills = await window.dram.util.getSkills(force);
        const normalized = Array.isArray(skills) ? skills : [];
        lastSkillsSnapshot = normalized;
        lastSkillsRefreshAt = Date.now();
        const { updateSkillsList } = await import('../../components/settings/tabs/skills.js');
        updateSkillsList(normalized);
        return normalized;
    })();

    try {
        return await skillsRefreshPromise;
    } finally {
        skillsRefreshPromise = null;
    }
}

export function normalizeSetupMessage(message) {
    return String(message || '')
        .replace(/\bineligible\b/ig, 'requires setup')
        .replace(/\beligibility\b/ig, 'requirements')
        .replace(/\bunavailable\b/ig, 'setup needed');
}

function normalizeSetupPath(value: unknown) {
    const setupPath = String(value || '').trim().toLowerCase();
    if (!setupPath) return 'native-installer';
    if (setupPath === 'openclaw-installer') return 'native-installer';
    return setupPath;
}

function parseMissingToolFromRequirements(analysis: any) {
    const tools = new Set<string>();
    const requirements = Array.isArray(analysis?.requirements) ? analysis.requirements : [];
    requirements.forEach((entry) => {
        const text = String(entry || '').trim().toLowerCase();
        const match = text.match(/^([a-z0-9_.-]+)\s+not installed\b/i);
        if (match?.[1]) {
            const tool = normalizeToolToken(match[1]);
            if (tool) tools.add(tool);
        }
    });
    const actions = Array.isArray(analysis?.actions) ? analysis.actions : [];
    actions.forEach((action) => {
        if (action?.type !== 'bin') return;
        const tool = normalizeToolToken((action as any)?.bin);
        if (tool) tools.add(tool);
    });
    return tools;
}

function buildActionQueue(analysis: any, {
    includeInstall = true,
    includeConfig = true,
    includeBin = false,
    preferConfigFirst = false
} = {}) {
    const actions = Array.isArray(analysis?.actions) ? analysis.actions : [];
    const installActions = includeInstall ? actions.filter((action) => action.type === 'install') : [];
    const configActions = includeConfig ? actions.filter((action) => action.type === 'env' || action.type === 'config') : [];
    const binActions = includeBin ? actions.filter((action) => action.type === 'bin') : [];
    if (preferConfigFirst) {
        return [...configActions, ...installActions, ...binActions];
    }
    return [...installActions, ...configActions, ...binActions];
}

async function runActionQueue(skill: any, actions: any[]) {
    for (const action of actions) {
        const outcome = await applyRequirementAction(action, {
            skillId: String(skill?.id || skill?.skillKey || '').trim(),
            skill
        });
        if (outcome.changed) {
            return outcome;
        }
    }
    return { changed: false, pendingExternal: false };
}

async function ensureBootstrapToolsForPolicy(skill: any, tools: string[], analysis: any, { installAll = false } = {}) {
    const normalizedTools = Array.isArray(tools)
        ? Array.from(new Set(tools.map((value) => normalizeToolToken(value)).filter(Boolean)))
        : [];
    if (normalizedTools.length === 0) return { changed: false, blocked: false, reason: '' };

    const missing = parseMissingToolFromRequirements(analysis);
    const queue = installAll
        ? normalizedTools
        : normalizedTools.filter((tool) => missing.has(tool));
    if (queue.length === 0) return { changed: false, blocked: false, reason: '' };

    let changed = false;
    for (const tool of queue) {
        try {
            const toolInstall = await ensureRequiredTool(tool, String(skill?.name || skill?.id || ''));
            if (toolInstall.success) changed = true;
            if (toolInstall.cancelled) {
                return { changed, blocked: true, reason: 'tool_install_cancelled' };
            }
        } catch (err) {
            showToast({
                message: normalizeSetupMessage(err?.message || `Failed to install ${tool}`),
                type: 'warning'
            });
            return { changed, blocked: true, reason: 'tool_install_failed' };
        }
    }
    return { changed, blocked: false, reason: '' };
}

async function handleSkillInstallAttempt(skill: any, installAttempt: any, {
    allowExternalInstall = true,
    fallbackTools = []
} = {}) {
    if (installAttempt?.changed) {
        return {
            stop: true,
            result: { changed: true, pendingExternal: false }
        };
    }
    if (!installAttempt?.attempted) {
        return { stop: false };
    }

    const reason = String(installAttempt?.reason || '').trim().toLowerCase();
    if (reason === 'installer_missing') {
        showToast({ message: 'No built-in installer for this skill. Using skill-specific setup actions.', type: 'info' });
        return { stop: false };
    }
    if (reason === 'unsupported') {
        showToast({ message: 'Your OpenClaw runtime does not support skill installers. Using setup actions.', type: 'info' });
        return { stop: false };
    }
    if (reason === 'tool_missing') {
        const tool = normalizeToolToken(installAttempt?.installer || fallbackTools?.[0] || '');
        if (!tool) return { stop: false };
        try {
            const toolInstall = await ensureRequiredTool(tool, String(skill?.name || skill?.id || ''));
            if (toolInstall.cancelled) {
                return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'tool_install_cancelled' } };
            }
            if (toolInstall.success) {
                const retryAfterToolInstall = await attemptSkillInstall(skill);
                if (retryAfterToolInstall.changed) {
                    return { stop: true, result: { changed: true, pendingExternal: false } };
                }
                if (retryAfterToolInstall.attempted && retryAfterToolInstall.reason === 'tool_missing') {
                    showToast({
                        message: `${tool} is still unavailable after setup. Check system policy and try again.`,
                        type: 'warning'
                    });
                    return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'tool_missing' } };
                }
                showToast({ message: `${tool} is required for this setup. Trying alternate setup actions.`, type: 'info' });
            }
        } catch (err) {
            showToast({ message: normalizeSetupMessage(err?.message || `Failed to install ${tool}`), type: 'warning' });
            return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'tool_install_failed' } };
        }
        return { stop: false };
    }
    if (reason === 'wsl_missing') {
        return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'wsl_missing' } };
    }
    if (reason === 'wsl_admin_blocked') {
        return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'wsl_admin_blocked' } };
    }
    if (reason === 'wsl_not_ready') {
        return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'wsl_not_ready' } };
    }
    if (reason === 'wsl_brew_missing') {
        if (!allowExternalInstall) {
            return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'wsl_brew_missing' } };
        }
        try {
            const brewGuide = await runWslHomebrewInstallGuide();
            if (!brewGuide.started) {
                return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'wsl_brew_missing' } };
            }
            const retry = await attemptSkillInstall(skill);
            if (retry.changed) {
                return { stop: true, result: { changed: true, pendingExternal: false } };
            }
            showToast({
                message: buildInstallerFailureMessage(retry, 'Runtime setup completed but this skill still needs action'),
                type: 'warning'
            });
            return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'wsl_brew_missing' } };
        } catch (err) {
            showToast({ message: normalizeSetupMessage(err?.message || 'Windows runtime setup failed'), type: 'error' });
            return { stop: true, result: { changed: false, pendingExternal: false, noAutomaticFix: true, reason: 'wsl_install_failed' } };
        }
    }
    if (reason === 'failed' && installAttempt?.error) {
        showToast({ message: normalizeSetupMessage(installAttempt.error), type: 'warning' });
    }
    return { stop: false };
}

async function runSkillDoctor(bin = '') {
    const runDoctor = await showConfirmDialog({
        title: 'Run OpenClaw Doctor',
        message: bin ? `Requirement indicates missing binary "${bin}".` : 'Run dependency checks and fixes for this skill?',
        detail: 'DRAM will run "openclaw doctor --fix" and report the result.',
        type: 'info',
        confirmText: 'Run Doctor',
        cancelText: 'Cancel'
    });
    if (!runDoctor) return false;
    const result = await window.dram.shell.executeCLI('openclaw doctor --fix', {
        awaitExit: true,
        timeoutMs: 240000,
        uiConfirmed: true
    });
    if (!result?.ok) {
        const details = String(result?.stderr || result?.stdout || result?.error || '').trim();
        throw new Error(details || 'Doctor command failed');
    }
    showToast({ message: 'Doctor completed', type: 'success' });
    return true;
}

export async function applyRequirementAction(actionable: any, context: { skillId?: string; skill?: any } = {}) {
    if (!actionable) return { changed: false, pendingExternal: false };
    const contextSkillId = String(context?.skillId || actionable?.skillId || '').trim();
    const contextSkill = context?.skill || null;

    if (actionable.type === 'env') {
        const value = await showTextPrompt({
            title: `Set ${actionable.key}`,
            message: `Enter a value for ${actionable.key} to satisfy this skill requirement.`,
            placeholder: actionable.key,
            confirmText: 'Save',
            cancelText: 'Cancel'
        });
        if (value === null) return { changed: false, pendingExternal: false };
        const trimmed = String(value || '').trim();
        if (!trimmed) {
            showToast({ message: `No value provided for ${actionable.key}`, type: 'warning' });
            return { changed: false, pendingExternal: false };
        }
        await window.dram.gateway.patchConfig({ env: { vars: { [actionable.key]: trimmed } } });
        showToast({ message: `${actionable.key} saved`, type: 'success' });
        return { changed: true, pendingExternal: false };
    }

    if (actionable.type === 'config') {
        const value = await showTextPrompt({
            title: `Set ${actionable.path}`,
            message: `Enter a value for config path "${actionable.path}" to satisfy this skill requirement.`,
            placeholder: actionable.path,
            confirmText: 'Save',
            cancelText: 'Cancel'
        });
        if (value === null) return { changed: false, pendingExternal: false };
        const trimmed = String(value || '').trim();
        if (!trimmed) {
            showToast({ message: `No value provided for ${actionable.path}`, type: 'warning' });
            return { changed: false, pendingExternal: false };
        }
        const patch = {};
        setByPath(patch, actionable.path, trimmed);
        await window.dram.gateway.patchConfig(patch);
        showToast({ message: `${actionable.path} saved`, type: 'success' });
        return { changed: true, pendingExternal: false };
    }

    if (actionable.type === 'bin') {
        if (contextSkill) {
            const installAttempt = await attemptSkillInstall(contextSkill);
            if (installAttempt.changed) {
                return { changed: true, pendingExternal: false };
            }
            if (installAttempt.attempted) {
                showToast({
                    message: buildInstallerFailureMessage(installAttempt, 'Installer attempt did not complete'),
                    type: 'warning'
                });
            }
        }
        const changed = await runSkillDoctor(actionable.bin);
        return { changed, pendingExternal: false };
    }

    if (actionable.type === 'install') {
        const command = String(actionable.command || '').trim();
        const installId = String(actionable.installId || '').trim();
        if (!command && !contextSkillId) return { changed: false, pendingExternal: false };

        if (contextSkillId) {
            const installResult = await window.dram.util.installSkill(contextSkillId);
            if (installResult?.success) {
                showToast({ message: 'Skill setup completed', type: 'success' });
                return { changed: true, pendingExternal: false };
            }
            const reason = String(installResult?.reason || '').trim().toLowerCase();
            if (reason === 'wsl_missing' || reason === 'wsl_admin_blocked') {
                await showNoteDialog({
                    title: 'Administrator Approval Needed',
                    message: 'DRAM could not complete setup because a required Windows component is blocked by administrator policy.',
                    confirmText: 'OK'
                });
                return { changed: false, pendingExternal: false };
            }
            if (reason === 'wsl_brew_missing') {
                try {
                    const brewGuide = await runWslHomebrewInstallGuide();
                    if (!brewGuide.started) return { changed: false, pendingExternal: false };
                    const retryAfterBrew = await window.dram.util.installSkill(contextSkillId);
                    if (retryAfterBrew?.success) {
                        showToast({ message: 'Skill setup completed', type: 'success' });
                        return { changed: true, pendingExternal: false };
                    }
                    showToast({
                        message: buildInstallerFailureMessage(retryAfterBrew),
                        type: 'warning'
                    });
                    return { changed: false, pendingExternal: false };
                } catch (err) {
                    throw new Error(String(err?.message || 'Windows runtime setup failed'));
                }
            }
            if (reason === 'unsupported_platform' && String(installResult?.installer || '').trim().toLowerCase() === 'brew') {
                showToast({
                    message: 'This installer is not available directly on this Windows device. DRAM will use the guided setup path when possible.',
                    type: 'warning'
                });
                return { changed: false, pendingExternal: false };
            }
            showToast({
                message: buildInstallerFailureMessage(installResult),
                type: 'warning'
            });
            if (!command) return { changed: false, pendingExternal: false };
        }

        if (!command) {
            showToast({
                message: installId
                    ? `No local command for installer "${installId}". Use OpenClaw setup for this skill.`
                    : 'No executable setup command for this requirement',
                type: 'warning'
            });
            return { changed: false, pendingExternal: false };
        }

        const approved = await showConfirmDialog({
            title: actionable.label || 'Install Dependency',
            message: 'Run installer command for this skill dependency?',
            detail: `Command: ${command}`,
            type: 'info',
            confirmText: 'Run',
            cancelText: 'Cancel'
        });
        if (!approved) return { changed: false, pendingExternal: false };
        const result = await window.dram.shell.executeCLI(command, {
            awaitExit: true,
            timeoutMs: 240000,
            uiConfirmed: true
        });
        if (!result?.ok) {
            const details = String(result?.stderr || result?.stdout || result?.error || '').trim();
            throw new Error(details || 'Installer command failed');
        }
        showToast({ message: 'Installer completed', type: 'success' });
        return { changed: true, pendingExternal: false };
    }

    return { changed: false, pendingExternal: false };
}

export async function applySkillRequirementFix(skill) {
    const analysis = deriveSkillRequirementActions(skill);
    const ordered = [
        ...analysis.actions.filter((action) => action.type === 'install'),
        ...analysis.actions.filter((action) => action.type === 'env' || action.type === 'config'),
        ...analysis.actions.filter((action) => action.type === 'bin')
    ];
    const actionable = ordered[0];

    if (!actionable) {
        const details = analysis.requirements.length > 0
            ? analysis.requirements.slice(0, 6).map((item) => `- ${item}`).join('\n')
            : 'No requirement details available.';
        await showNoteDialog({
            title: 'No Automatic Fix Available',
            message: `This skill cannot be auto-fixed from DRAM.\n\n${details}`,
            confirmText: 'Close'
        });
        return { changed: false, pendingExternal: false };
    }

    const outcome = await applyRequirementAction(actionable, {
        skillId: String(skill?.id || skill?.skillKey || '').trim(),
        skill
    });
    return {
        changed: outcome.changed,
        pendingExternal: outcome.pendingExternal
    };
}

export async function runSkillSetup(skill, options: { allowExternalInstall?: boolean } = {}) {
    const allowExternalInstall = options.allowExternalInstall !== false;
    const analysis = deriveSkillRequirementActions(skill);
    const platformSupport = getSkillPlatformSupport(skill);
    if (!platformSupport.supported) {
        const message = String(platformSupport.message || 'This skill is not supported on this operating system.');
        showToast({ message, type: 'warning' });
        return {
            changed: false,
            pendingExternal: false,
            noAutomaticFix: true,
            reason: 'unsupported_os',
            supportedPlatforms: Array.isArray(platformSupport.allowed) ? platformSupport.allowed : []
        };
    }
    const windowsPolicy = getWindowsOnboardingPolicy(skill);
    const setupPath = normalizeSetupPath(windowsPolicy?.setupPath || 'native-installer');
    const bootstrapTools = Array.isArray(windowsPolicy?.toolBootstrap) ? windowsPolicy.toolBootstrap : [];
    const requiresWslHomebrew = Boolean(windowsPolicy?.requiresWslHomebrew) || setupPath === 'wsl-homebrew';

    if (allowExternalInstall && requiresWslHomebrew) {
        const prep = await ensureWslHomebrewReady(skill, { force: true });
        if (!prep.ok) {
            showToast({ message: normalizeSetupMessage(prep.error), type: 'warning' });
            return {
                changed: false,
                pendingExternal: false,
                noAutomaticFix: true,
                reason: prep.reason || 'wsl_install_failed'
            };
        }
    }

    if (setupPath === 'manual') {
        const bootstrap = await ensureBootstrapToolsForPolicy(skill, bootstrapTools, analysis, { installAll: false });
        if (bootstrap.blocked) {
            return { changed: false, pendingExternal: false, noAutomaticFix: true, reason: bootstrap.reason || 'manual_setup_required' };
        }
        const manualActions = buildActionQueue(analysis, {
            includeInstall: false,
            includeConfig: true,
            includeBin: false,
            preferConfigFirst: true
        });
        const manualOutcome = await runActionQueue(skill, manualActions);
        if (manualOutcome.changed) return manualOutcome;
        return {
            changed: bootstrap.changed,
            pendingExternal: false,
            noAutomaticFix: !bootstrap.changed,
            reason: bootstrap.changed ? '' : 'manual_setup_required'
        };
    }

    const runBootstrapEarly = setupPath === 'native-installer' || setupPath === 'in-app-config';
    if (allowExternalInstall && runBootstrapEarly) {
        const bootstrap = await ensureBootstrapToolsForPolicy(skill, bootstrapTools, analysis, {
            installAll: setupPath === 'native-installer'
        });
        if (bootstrap.blocked) {
            return { changed: false, pendingExternal: false, noAutomaticFix: true, reason: bootstrap.reason || 'tool_install_failed' };
        }
    }

    const shouldTryInstallBeforeActions = setupPath !== 'in-app-config';
    if (shouldTryInstallBeforeActions) {
        const installAttempt = await attemptSkillInstall(skill);
        const installHandling = await handleSkillInstallAttempt(skill, installAttempt, {
            allowExternalInstall,
            fallbackTools: bootstrapTools
        });
        if (installHandling.stop) return installHandling.result;
    }

    const requireConfigFirst = setupPath === 'in-app-config';
    const runInstallActions = allowExternalInstall && shouldTryInstallBeforeActions === false;
    const actionable = buildActionQueue(analysis, {
        includeInstall: runInstallActions,
        includeConfig: true,
        includeBin: false,
        preferConfigFirst: requireConfigFirst
    });
    const actionOutcome = await runActionQueue(skill, actionable);
    if (actionOutcome.changed) return actionOutcome;

    if (!shouldTryInstallBeforeActions && allowExternalInstall) {
        const lateInstallAttempt = await attemptSkillInstall(skill);
        const lateInstallHandling = await handleSkillInstallAttempt(skill, lateInstallAttempt, {
            allowExternalInstall,
            fallbackTools: bootstrapTools
        });
        if (lateInstallHandling.stop) return lateInstallHandling.result;
    }

    if (actionable.length === 0) {
        return {
            changed: false,
            pendingExternal: false,
            noAutomaticFix: true,
            reason: setupPath === 'in-app-config' ? 'in_app_config_required' : 'no_automatic_fix'
        };
    }

    return { changed: false, pendingExternal: false };
}

export async function finalizeSetupReadiness(skillId, setupResult, {
    maxChecks = 3,
    intervalMs = 700
} = {}) {
    if (!setupResult?.changed) {
        return { ready: false, skill: null };
    }

    const checks = Math.max(1, Number(maxChecks) || 3);
    let lastSkill = null;
    for (let attempt = 0; attempt < checks; attempt++) {
        const skills = await refreshSkillsList({ force: true });
        lastSkill = resolveSkill(skills, skillId);
        if (lastSkill && lastSkill.eligible !== false) {
            showToast({ message: 'Skill requirements satisfied', type: 'success' });
            return { ready: true, skill: lastSkill };
        }
        if (attempt < checks - 1) {
            await sleep(Math.max(250, Number(intervalMs) || 700));
        }
    }

    if (setupResult.pendingExternal) {
        showToast({
            message: 'Setup command started. Complete it, then retry enabling.',
            type: 'info'
        });
        return { ready: false, skill: lastSkill || null, manualActionNeeded: true };
    }

    const reason = lastSkill?.requirements?.[0]
        ? normalizeSetupMessage(lastSkill.requirements[0])
        : 'requirements are still missing';
    showToast({ message: `Setup completed, but ${reason}`, type: 'warning' });
    return { ready: false, skill: lastSkill || null };
}

export async function tryEnableSkillWithAutoSetup(skillId) {
    const skills = await refreshSkillsList();
    const skill = resolveSkill(skills, skillId);
    if (!skill) {
        return { ok: false, error: 'Skill not found' };
    }

    if (skill.eligible !== false) {
        const directEnable = await window.dram.util.toggleSkill(skillId, true);
        if (directEnable?.success) {
            return { ok: true };
        }
        return { ok: false, error: directEnable?.error || 'Enable failed' };
    }

    const setupResult = await runSkillSetup(skill, { allowExternalInstall: true });
    if (!setupResult.changed) {
        const postSetupSkills = await refreshSkillsList({ force: true });
        const postSetupSkill = resolveSkill(postSetupSkills, skillId);
        if (postSetupSkill && postSetupSkill.eligible !== false) {
            const postSetupEnable = await window.dram.util.toggleSkill(skillId, true);
            if (postSetupEnable?.success) {
                return { ok: true };
            }
            return { ok: false, error: postSetupEnable?.error || 'Enable failed after setup' };
        }

        if ('noAutomaticFix' in setupResult && setupResult.noAutomaticFix) {
            const noFix = await handleNoAutomaticFixResult(setupResult);
            if (noFix.handled) {
                return {
                    ok: false,
                    error: noFix.error
                };
            }
            return {
                ok: false,
                error: 'DRAM could not complete setup automatically for this skill'
            };
        }
        return { ok: false, error: 'Setup did not apply any changes' };
    }

    const readiness = await finalizeSetupReadiness(skillId, setupResult, {
        maxChecks: 8,
        intervalMs: 1200
    });
    if (!readiness.ready) {
        return {
            ok: false,
            error: readiness?.manualActionNeeded
                ? 'Complete any remaining setup steps, then try enabling this skill again'
                : (readiness?.skill?.requirements?.[0]
                ? normalizeSetupMessage(readiness.skill.requirements[0])
                : 'Setup completed but requirements are still missing')
        };
    }

    const retry = await window.dram.util.toggleSkill(skillId, true);
    if (!retry?.success) {
        return { ok: false, error: retry?.error || 'Enable failed after setup' };
    }

    return { ok: true };
}

/**
 * Setup skill management listeners
 * Uses event delegation on the document for dynamic skill cards
 */

