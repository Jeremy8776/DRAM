/**
 * DRAM Listeners - Skill setup result messaging
 */
import { showNoteDialog } from '../../components/dialog.js';

function platformLabel(token: unknown) {
    const normalized = String(token || '').trim().toLowerCase();
    if (normalized === 'win32') return 'Windows';
    if (normalized === 'darwin') return 'macOS';
    if (normalized === 'linux') return 'Linux';
    return normalized;
}

export async function handleNoAutomaticFixResult(setupResult: any) {
    const reason = String(setupResult?.reason || '').trim().toLowerCase();
    if (reason === 'wsl_missing' || reason === 'wsl_brew_missing' || reason === 'wsl_admin_blocked') {
        await showNoteDialog({
            title: 'Administrator Approval Needed',
            message: 'DRAM could not finish setup automatically because this Windows device blocks a required component. Ask your administrator to enable it, then try enabling this skill again.',
            confirmText: 'OK'
        });
        return {
            handled: true,
            error: 'Setup blocked by administrator policy'
        };
    }
    if (reason === 'wsl_not_ready') {
        await showNoteDialog({
            title: 'Complete Linux First-Run Setup',
            message: 'WSL started but is still in first-run setup mode. Open Ubuntu once, finish the initial login/setup prompts, then enable this skill again.',
            confirmText: 'OK'
        });
        return {
            handled: true,
            error: 'WSL first-run setup is incomplete'
        };
    }

    if (reason === 'manual_setup_required') {
        await showNoteDialog({
            title: 'Manual Setup Required',
            message: 'This skill needs a manual setup step that DRAM cannot complete automatically on this device yet.',
            confirmText: 'OK'
        });
        return {
            handled: true,
            error: 'Manual setup is required for this skill'
        };
    }

    if (reason === 'unsupported_os') {
        const supportedPlatforms = Array.isArray(setupResult?.supportedPlatforms)
            ? setupResult.supportedPlatforms
            : [];
        const supportedLabel = supportedPlatforms.length > 0
            ? supportedPlatforms.map((entry: unknown) => platformLabel(entry)).join(', ')
            : 'a different operating system';
        await showNoteDialog({
            title: 'Not Available On This Device',
            message: `This skill is currently available on ${supportedLabel}.`,
            confirmText: 'OK'
        });
        return {
            handled: true,
            error: 'This skill is not available on this operating system'
        };
    }

    return { handled: false, error: '' };
}
