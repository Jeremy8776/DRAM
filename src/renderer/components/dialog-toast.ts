import { escapeHtml } from './dialog-utils.js';

const activeToastsById = new Map();
const TOAST_CONTAINER_ID = 'dram-toast-stack';

function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) return container;

    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.style.cssText = `
        position: fixed;
        right: 24px;
        bottom: 24px;
        display: flex;
        flex-direction: column-reverse;
        align-items: flex-end;
        gap: 10px;
        z-index: 10001;
        max-width: calc(100vw - 24px);
        pointer-events: none;
    `;
    document.body.appendChild(container);
    return container;
}

function clearToastById(id) {
    const existing = activeToastsById.get(id);
    if (!existing) return;
    try {
        existing.element.remove();
    } catch {
        // ignore remove failures
    }
    activeToastsById.delete(id);
}

/**
 * Show a styled toast notification.
 * @param {Object} options
 * @param {string} options.message
 * @param {string} options.type
 * @param {number} options.duration
 * @param {string} options.actionLabel
 * @param {() => void | Promise<void>} options.onAction
 * @param {boolean} options.dismissOnAction
 * @param {string} options.id
 * @param {boolean} options.replace
 */
export function showToast({
    message = '',
    type = 'info',
    duration = 3000,
    actionLabel = '',
    onAction = null,
    dismissOnAction = true,
    id = '',
    replace = true
} = {}) {
    const toastId = String(id || '').trim();
    if (toastId && replace) {
        clearToastById(toastId);
    }

    const toast = document.createElement('div');

    const typeConfig = {
        success: { icon: 'OK', color: 'var(--accent, #7c3aed)', bg: 'rgba(124, 58, 237, 0.14)' },
        error: { icon: 'ERR', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.14)' },
        warning: { icon: '!', color: '#b794f4', bg: 'rgba(183, 148, 244, 0.14)' },
        info: { icon: 'i', color: 'var(--accent, #7c3aed)', bg: 'rgba(124, 58, 237, 0.14)' }
    };
    const config = typeConfig[type] || typeConfig.info;
    const toastContainer = ensureToastContainer();
    const autoDismissMs = Math.max(0, Number(duration) || 0);
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;
    let dismissStartedAt = 0;
    let dismissRemainingMs = autoDismissMs;

    toast.style.cssText = `
        background: var(--bg-elevated, #111114);
        border: 1px solid color-mix(in srgb, ${config.color} 38%, var(--border, #333));
        border-left: 2px solid ${config.color};
        border-radius: 5px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
        animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        max-width: 360px;
        width: min(360px, calc(100vw - 36px));
        pointer-events: auto;
    `;

    toast.innerHTML = `
        <span style="
            width: 22px;
            height: 22px;
            border-radius: 4px;
            background: ${config.bg};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 700;
            color: ${config.color};
            flex-shrink: 0;
        ">${config.icon}</span>
        <span style="
            font-size: 12px;
            color: var(--text-primary, #e0e0e0);
            flex: 1;
        ">${escapeHtml(message)}</span>
        ${actionLabel ? `<button type="button" class="toast-action-btn" style="
            border: 1px solid color-mix(in srgb, ${config.color} 45%, var(--border, #333));
            background: ${config.bg};
            color: ${config.color};
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.01em;
            cursor: pointer;
            flex-shrink: 0;
        ">${escapeHtml(actionLabel)}</button>` : ''}
    `;

    if (!document.getElementById('toast-animations')) {
        const style = document.createElement('style');
        style.id = 'toast-animations';
        style.textContent = `
            @keyframes toastSlideIn {
                from { opacity: 0; transform: translateX(20px); }
                to { opacity: 1; transform: translateX(0); }
            }
            @keyframes toastSlideOut {
                from { opacity: 1; transform: translateX(0); }
                to { opacity: 0; transform: translateX(20px); }
            }
        `;
        document.head.appendChild(style);
    }

    toastContainer.appendChild(toast);

    const clearDismissTimer = () => {
        if (!dismissTimer) return;
        clearTimeout(dismissTimer);
        dismissTimer = null;
        if (dismissStartedAt > 0) {
            const elapsed = Date.now() - dismissStartedAt;
            dismissRemainingMs = Math.max(0, dismissRemainingMs - elapsed);
            dismissStartedAt = 0;
        }
    };

    const dismiss = () => {
        if (toast.dataset.closing === '1') return;
        clearDismissTimer();
        toast.dataset.closing = '1';
        toast.style.animation = 'toastSlideOut 0.2s ease forwards';
        setTimeout(() => {
            toast.remove();
            if (toastId) {
                const active = activeToastsById.get(toastId);
                if (active?.element === toast) {
                    activeToastsById.delete(toastId);
                }
            }
        }, 200);
    };

    const scheduleDismiss = () => {
        if (autoDismissMs <= 0 || toast.dataset.closing === '1') return;
        if (dismissRemainingMs <= 0) {
            dismiss();
            return;
        }
        dismissStartedAt = Date.now();
        dismissTimer = setTimeout(() => {
            dismissTimer = null;
            dismiss();
        }, dismissRemainingMs);
    };

    if (toastId) {
        activeToastsById.set(toastId, { dismiss, element: toast });
    }

    if (actionLabel && typeof onAction === 'function') {
        const actionBtn = toast.querySelector('.toast-action-btn');
        actionBtn?.addEventListener('click', async () => {
            try {
                await onAction();
            } catch (err) {
                console.warn('[Toast] Action handler failed:', err?.message || err);
            }
            if (dismissOnAction) dismiss();
        });
    }

    if (autoDismissMs > 0) {
        toast.addEventListener('mouseenter', () => {
            if (toast.dataset.closing === '1') return;
            clearDismissTimer();
        });
        toast.addEventListener('mouseleave', () => {
            if (toast.dataset.closing === '1') return;
            scheduleDismiss();
        });
        scheduleDismiss();
    }

    return { dismiss, element: toast };
}





