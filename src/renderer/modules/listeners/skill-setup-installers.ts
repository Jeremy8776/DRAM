/**
 * DRAM Listeners - Skill setup installer helpers
 */
import { showConfirmDialog, showNoteDialog, showToast } from '../../components/dialog.js';

function normalizeSkillSetupMessage(message: unknown) {
    return String(message || '')
        .replace(/\bineligible\b/ig, 'requires setup')
        .replace(/\beligibility\b/ig, 'requirements')
        .replace(/\bunavailable\b/ig, 'setup needed');
}

function resolveToolInstallCommand(tool: string) {
    const normalized = String(tool || '').trim().toLowerCase();
    const isWindows = typeof navigator !== 'undefined' && /win/i.test(String(navigator.platform || ''));
    if (!isWindows) return '';

    if (normalized === 'go') {
        return 'winget install --id GoLang.Go -e --accept-package-agreements --accept-source-agreements';
    }
    if (normalized === 'node' || normalized === 'npm') {
        return 'winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements';
    }
    if (normalized === 'python' || normalized === 'python3' || normalized === 'pip' || normalized === 'pip3') {
        return 'winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements';
    }
    if (normalized === 'uv') {
        return 'winget install --id astral-sh.uv -e --accept-package-agreements --accept-source-agreements';
    }
    if (normalized === 'gh') {
        return 'winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements';
    }
    if (normalized === 'jq') {
        return 'winget install --id jqlang.jq -e --accept-package-agreements --accept-source-agreements';
    }
    if (normalized === 'rg' || normalized === 'ripgrep') {
        return 'winget install --id BurntSushi.ripgrep.MSVC -e --accept-package-agreements --accept-source-agreements';
    }
    if (normalized === 'ffmpeg') {
        return 'winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements';
    }
    if (normalized === 'curl') {
        return 'winget install --id cURL.cURL -e --accept-package-agreements --accept-source-agreements';
    }
    return '';
}

export async function ensureRequiredTool(tool: string, skillName = '') {
    const normalized = String(tool || '').trim().toLowerCase();
    if (!normalized) return { attempted: false, success: false, cancelled: false };

    const command = resolveToolInstallCommand(normalized);
    if (!command) {
        return { attempted: false, success: false, cancelled: false };
    }

    const approved = await showConfirmDialog({
        title: 'Install Required Runtime',
        message: skillName
            ? `This skill requires ${normalized}. DRAM can install it now.`
            : `A required runtime (${normalized}) is missing.`,
        detail: `Command: ${command}`,
        type: 'info',
        confirmText: 'Install',
        cancelText: 'Cancel'
    });
    if (!approved) return { attempted: true, success: false, cancelled: true };

    const result = await window.dram.shell.executeCLI(command, {
        awaitExit: true,
        timeoutMs: 900000,
        uiConfirmed: true
    });
    if (!result?.ok) {
        const details = String(result?.stderr || result?.stdout || result?.error || '').trim();
        throw new Error(details || `Failed to install required runtime (${normalized})`);
    }

    showToast({ message: `Installed required runtime: ${normalized}`, type: 'success' });
    return { attempted: true, success: true, cancelled: false };
}

export async function runWslHomebrewInstallGuide() {
    const approved = await showConfirmDialog({
        title: 'Prepare Skill Runtime',
        message: 'This skill needs additional runtime components on Windows.',
        detail: 'DRAM can prepare them now, then continue setup automatically.',
        type: 'info',
        confirmText: 'Continue',
        cancelText: 'Cancel'
    });
    if (!approved) return { started: false, cancelled: true };

    const result = await window.dram.util.installWslHomebrew();
    if (!result?.success) {
        const msg = String(result?.error || 'Runtime setup failed').trim();
        throw new Error(msg);
    }

    await showNoteDialog({
        title: 'Runtime Ready',
        message: 'Required runtime components are ready. DRAM will continue setup.',
        confirmText: 'OK'
    });
    return { started: true, cancelled: false };
}

function hasNativeSkillInstaller(skill: any) {
    if (!skill || typeof skill !== 'object') return false;
    if (Array.isArray(skill.installOptions) && skill.installOptions.length > 0) return true;
    if (!Array.isArray(skill.requirementDetails)) return false;
    return skill.requirementDetails.some((entry: any) => {
        if (!entry || typeof entry !== 'object') return false;
        return Boolean(entry.install || entry.installer || entry.installers);
    });
}

export async function attemptSkillInstall(skill: any) {
    const skillId = String(skill?.id || skill?.skillKey || '').trim();
    if (!skillId) {
        return { attempted: false, changed: false, reason: 'invalid_skill' };
    }
    if (!hasNativeSkillInstaller(skill)) {
        return { attempted: false, changed: false, reason: 'no_installer_hint' };
    }
    try {
        const result = await window.dram.util.installSkill(skillId);
        if (result?.success) {
            showToast({ message: `Installed prerequisites for ${skillId}`, type: 'success' });
            return { attempted: true, changed: true, reason: '' };
        }
        return {
            attempted: true,
            changed: false,
            reason: String(result?.reason || 'failed').trim() || 'failed',
            installer: String(result?.installer || '').trim(),
            error: String(result?.error || '').trim()
        };
    } catch (err: any) {
        return {
            attempted: true,
            changed: false,
            reason: 'failed',
            error: String(err?.message || '').trim()
        };
    }
}

export function buildInstallerFailureMessage(result: any, fallbackMessage = 'Skill setup failed') {
    const reason = String(result?.reason || '').trim().toLowerCase();
    const installer = String(result?.installer || '').trim();
    const error = String(result?.error || '').trim();
    const platform = String(typeof navigator !== 'undefined' ? (navigator.platform || '') : '').trim().toLowerCase();
    if (reason === 'tool_missing') {
        return installer ? `${installer} is required for this skill setup` : 'A required installer tool is missing';
    }
    if (reason === 'installer_missing') {
        return 'No compatible installer is exposed by this OpenClaw skill';
    }
    if (reason === 'unsupported_platform') {
        if (installer === 'brew' && platform.includes('win')) {
            return 'This dependency cannot be installed directly on this Windows device. DRAM will try the guided Windows setup path.';
        }
        return installer
            ? `Installer "${installer}" is not supported on this OS`
            : 'No compatible installer is available on this OS';
    }
    if (reason === 'wsl_missing') {
        return 'A required Windows component is blocked by administrator policy.';
    }
    if (reason === 'wsl_admin_blocked') {
        return error || 'Windows administrator policy blocked WSL setup required for this skill.';
    }
    if (reason === 'wsl_brew_missing') {
        return 'A required Windows runtime component is missing. DRAM will try to set it up automatically.';
    }
    if (reason === 'wsl_not_ready') {
        return error || 'WSL is still initializing. Finish first-run Linux setup, then retry.';
    }
    if (reason === 'wsl_install_failed') {
        return error || 'Windows runtime setup failed. Please retry setup.';
    }
    if (reason === 'unsupported') {
        return 'This OpenClaw runtime does not support skill installers';
    }
    if (error) return normalizeSkillSetupMessage(error);
    return fallbackMessage;
}
