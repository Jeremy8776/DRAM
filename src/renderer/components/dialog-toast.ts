import { escapeHtml } from './dialog-utils.js';

/**
 * Show a styled toast notification.
 * @param {Object} options
 * @param {string} options.message
 * @param {string} options.type
 * @param {number} options.duration
 * @param {string} options.actionLabel
 * @param {() => void | Promise<void>} options.onAction
 * @param {boolean} options.dismissOnAction
 */
export function showToast({
    message = '',
    type = 'info',
    duration = 3000,
    actionLabel = '',
    onAction = null,
    dismissOnAction = true
} = {}) {
    const toast = document.createElement('div');

    const typeConfig = {
        success: { icon: 'OK', color: '#10b981', bg: '#10b98115' },
        error: { icon: 'ERR', color: '#ef4444', bg: '#ef444415' },
        warning: { icon: '!', color: '#f59e0b', bg: '#f59e0b15' },
        info: { icon: 'INFO', color: '#3b82f6', bg: '#3b82f615' }
    };
    const config = typeConfig[type] || typeConfig.info;

    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--bg-surface, #1a1a2e);
        border: 1px solid ${config.color}40;
        border-left: 3px solid ${config.color};
        border-radius: 6px;
        padding: 14px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        z-index: 10001;
        animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        max-width: 360px;
    `;

    toast.innerHTML = `
        <span style="
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: ${config.bg};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: ${config.color};
            flex-shrink: 0;
        ">${config.icon}</span>
        <span style="
            font-size: 13px;
            color: var(--text-primary, #e0e0e0);
            flex: 1;
        ">${escapeHtml(message)}</span>
        ${actionLabel ? `<button type="button" class="toast-action-btn" style="
            border: 1px solid ${config.color}55;
            background: ${config.bg};
            color: ${config.color};
            border-radius: 5px;
            padding: 6px 10px;
            font-size: 12px;
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

    document.body.appendChild(toast);

    const dismiss = () => {
        toast.style.animation = 'toastSlideOut 0.2s ease forwards';
        setTimeout(() => toast.remove(), 200);
    };

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

    if (Number(duration) > 0) {
        setTimeout(() => {
            dismiss();
        }, duration);
    }

    return { dismiss, element: toast };
}





