/**
 * DRAM Listeners - Skill setup policy helpers
 */
import { showToast } from '../../components/dialog.js';
import { deriveSkillRequirementActions } from '../skill-requirements.js';
import { getSkillOnboardingPolicy } from '../skill-onboarding-policy.js';

export function normalizeToolToken(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'npm') return 'node';
    if (normalized === 'python3' || normalized === 'pip' || normalized === 'pip3') return 'python';
    if (normalized === 'ripgrep') return 'rg';
    return normalized;
}

function skillNeedsWslHomebrew(skill: any) {
    const requirements = Array.isArray(skill?.requirements) ? skill.requirements : [];
    if (requirements.some((entry) => /(^|\W)(homebrew|brew)(\W|$)/i.test(String(entry || '')))) {
        return true;
    }

    const installOptions = Array.isArray(skill?.installOptions) ? skill.installOptions : [];
    for (const option of installOptions) {
        const installId = String(
            option?.installId || option?.installerId || option?.installer || option?.manager || option?.kind || option?.id || ''
        ).trim().toLowerCase();
        const command = String(option?.command || option?.cmd || '').trim().toLowerCase();
        if (installId === 'brew') return true;
        if (/\bbrew\s+install\b/.test(command)) return true;
    }

    const analysis = deriveSkillRequirementActions(skill);
    return analysis.actions.some((action) => {
        if (action?.type !== 'install') return false;
        const installId = String((action as any)?.installId || '').trim().toLowerCase();
        const command = String((action as any)?.command || '').trim().toLowerCase();
        const requirement = String((action as any)?.requirement || '').trim().toLowerCase();
        return installId === 'brew' || /\bbrew\s+install\b/.test(command) || requirement.includes('homebrew') || requirement.includes('brew');
    });
}

export async function ensureWslHomebrewReady(skill: any, { force = false } = {}) {
    const isWindows = typeof navigator !== 'undefined' && /win/i.test(String(navigator.platform || ''));
    if (!isWindows) return { ok: true, reason: '', error: '' };
    if (!force && !skillNeedsWslHomebrew(skill)) return { ok: true, reason: '', error: '' };

    showToast({ message: 'Preparing required Windows dependencies...', type: 'info' });
    const result = await window.dram.util.installWslHomebrew();
    if (result?.success) {
        const alreadyInstalled = Boolean(result?.data?.alreadyInstalled);
        showToast({
            message: alreadyInstalled ? 'Dependencies already ready' : 'Dependencies ready',
            type: 'success'
        });
        return { ok: true, reason: '', error: '' };
    }

    const reason = String(result?.reason || '').trim().toLowerCase();
    const detail = String(result?.error || '').trim();
    if (reason === 'wsl_missing' || reason === 'wsl_admin_blocked') {
        return {
            ok: false,
            reason,
            error: detail || 'A Windows component required for this skill is blocked by administrator policy.'
        };
    }
    return {
        ok: false,
        reason: reason || 'wsl_install_failed',
        error: detail || 'Failed to prepare required Windows dependencies'
    };
}

export function getWindowsOnboardingPolicy(skill: any) {
    const isWindows = typeof navigator !== 'undefined' && /win/i.test(String(navigator.platform || ''));
    if (!isWindows) return null;
    const policy = getSkillOnboardingPolicy(skill);
    if (!policy?.windows) return null;
    return policy.windows;
}

function normalizePlatformToken(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'macos') return 'darwin';
    if (normalized === 'windows') return 'win32';
    return normalized;
}

function detectCurrentPlatformToken() {
    const platform = String((typeof navigator !== 'undefined' ? navigator.platform : '') || '').trim().toLowerCase();
    if (platform.includes('win')) return 'win32';
    if (platform.includes('mac')) return 'darwin';
    if (platform.includes('linux')) return 'linux';
    return '';
}

function formatPlatformLabel(token: string) {
    if (token === 'win32') return 'Windows';
    if (token === 'darwin') return 'macOS';
    if (token === 'linux') return 'Linux';
    return token || 'this OS';
}

export function getSkillPlatformSupport(skill: any) {
    const policy = getSkillOnboardingPolicy(skill);
    const declared = Array.isArray(policy?.os)
        ? policy.os.map((entry: unknown) => normalizePlatformToken(entry)).filter(Boolean)
        : [];
    if (declared.length === 0) {
        return { supported: true, current: detectCurrentPlatformToken(), allowed: [] as string[] };
    }
    const current = detectCurrentPlatformToken();
    if (!current) {
        return { supported: true, current: '', allowed: declared };
    }
    if (declared.includes(current)) {
        return { supported: true, current, allowed: declared };
    }
    return {
        supported: false,
        current,
        allowed: declared,
        message: `This skill is currently supported on ${declared.map(formatPlatformLabel).join(', ')}.`
    };
}
