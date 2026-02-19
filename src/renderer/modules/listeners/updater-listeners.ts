/**
 * DRAM Listeners - Updater Status Toasts
 */
import { showToast } from '../../components/dialog.js';

let detachUpdaterStatus = null;
let lastAnnouncedVersion = '';
let lastDownloadBucket = -1;
let restartToastVersion = '';
const shownAt = new Map();

function normalizeVersion(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/^v/i, '');
}

function extractVersion(payload) {
    return (
        normalizeVersion(payload?.version) ||
        normalizeVersion(payload?.latestVersion) ||
        normalizeVersion(payload?.tagName)
    );
}

function shouldShow(key, cooldownMs = 10000) {
    const now = Date.now();
    const last = shownAt.get(key) || 0;
    if (now - last < cooldownMs) return false;
    shownAt.set(key, now);
    return true;
}

function showFoundVersionToast(version) {
    const suffix = version ? ` ${version}` : '';
    showToast({
        message: `Update available${suffix}. Downloading in the background.`,
        type: 'info',
        duration: 5000
    });
}

function showDownloadingToast(percent) {
    showToast({
        message: `Downloading update: ${percent}%`,
        type: 'info',
        duration: 2500
    });
}

function showRestartToast(version) {
    const detail = version ? ` ${version}` : '';
    showToast({
        message: `Update${detail} is ready. Restart to finish installing.`,
        type: 'success',
        duration: 15000,
        actionLabel: 'Restart now',
        onAction: async () => {
            await window.dram.updater.installNow();
        }
    });
}

function handleUpdaterStatus(payload: any = {}) {
    const status = String(payload.status || '').trim();

    if (status === 'available') {
        const version = extractVersion(payload);
        lastAnnouncedVersion = version || lastAnnouncedVersion;
        lastDownloadBucket = -1;
        if (shouldShow(`available:${version || 'unknown'}`, 90000)) {
            showFoundVersionToast(version);
        }
        return;
    }

    if (status === 'github-release-available') {
        const version = extractVersion(payload);
        if (!version || version === lastAnnouncedVersion) return;
        lastAnnouncedVersion = version;
        if (shouldShow(`available:${version}`, 90000)) {
            showFoundVersionToast(version);
        }
        return;
    }

    if (status === 'downloading') {
        const numeric = Number(payload.percent);
        if (!Number.isFinite(numeric)) return;
        const percent = Math.max(0, Math.min(100, Math.round(numeric)));
        const bucket = Math.floor(percent / 20) * 20;
        if (bucket < 20 || bucket >= 100) return;
        if (bucket === lastDownloadBucket) return;
        lastDownloadBucket = bucket;
        if (shouldShow(`downloading:${bucket}`, 1200)) {
            showDownloadingToast(bucket);
        }
        return;
    }

    if (status === 'downloaded') {
        const version = extractVersion(payload) || lastAnnouncedVersion;
        const key = version || 'ready';
        if (restartToastVersion === key) return;
        restartToastVersion = key;
        showRestartToast(version);
        return;
    }

    if (status === 'error') {
        const message = String(payload.message || 'Update check failed');
        if (shouldShow(`error:${message}`, 45000)) {
            showToast({
                message: `Update check issue: ${message}`,
                type: 'warning',
                duration: 6000
            });
        }
        return;
    }

    if (status === 'github-error' && payload.reason === 'manual-ipc') {
        const message = String(payload.message || 'Could not check for updates right now');
        if (shouldShow(`github-manual-error:${message}`, 45000)) {
            showToast({
                message,
                type: 'warning',
                duration: 6000
            });
        }
    }
}

export function setupUpdaterListeners() {
    shutdownUpdaterListeners();
    if (!window?.dram?.updater?.onStatus) return;

    detachUpdaterStatus = window.dram.updater.onStatus((payload: any) => {
        try {
            handleUpdaterStatus(payload || {});
        } catch (err) {
            console.warn('[Updater] Failed to process updater status:', err?.message || err);
        }
    });
}

export function shutdownUpdaterListeners() {
    if (typeof detachUpdaterStatus === 'function') {
        try {
            detachUpdaterStatus();
        } catch {
            // ignore listener cleanup failures
        }
    }
    detachUpdaterStatus = null;
}
