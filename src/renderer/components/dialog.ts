/**
 * DRAM Desktop - Styled Dialog/Confirmation Component
 * Custom styled dialogs that match the Dieter Rams aesthetic
 */

import { closeDialog, setActiveDialog } from './dialog-state.js';
import { createDialogOverlay, ensureDialogAnimations, escapeHtml } from './dialog-utils.js';
import { showNoteDialog, showTextPrompt } from './dialog-note-prompt.js';
import { showToast } from './dialog-toast.js';

/**
 * Show a styled confirmation dialog
 * @param {Object} options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Main message
 * @param {string} options.detail - Secondary details
 * @param {string} options.type - 'warning', 'danger', 'info', 'confirm'
 * @param {string} options.confirmText - Text for confirm button
 * @param {string} options.cancelText - Text for cancel button
 * @returns {Promise<boolean>} - True if confirmed, false if cancelled
 */
export function showConfirmDialog({
    title = 'Confirm',
    message = 'Are you sure?',
    detail = '',
    type = 'confirm',
    confirmText = 'Confirm',
    cancelText = 'Cancel'
} = {}) {
    return new Promise((resolve) => {
        closeDialog();

        const overlay = createDialogOverlay();

        const typeConfig = {
            warning: { icon: '!', color: '#9f7aea', border: '#7c3aed66' },
            danger: { icon: '!', color: '#a855f7', border: '#9333ea66' },
            info: { icon: 'i', color: 'var(--accent, #7c3aed)', border: '#7c3aed66' },
            confirm: { icon: '?', color: 'var(--accent, #7c3aed)', border: '#7c3aed66' }
        };
        const config = typeConfig[type] || typeConfig.confirm;

        overlay.innerHTML = `
            <div class="dialog-box" style="
                background: var(--bg-elevated, #111114);
                border: 1px solid ${config.border};
                border-radius: 6px;
                padding: 22px 24px;
                max-width: 420px;
                width: 90%;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.36);
                animation: dialogSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            ">
                <div class="dialog-header" style="
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 12px;
                ">
                    <div class="dialog-icon" style="
                        width: 28px;
                        height: 28px;
                        border-radius: 4px;
                        background: color-mix(in srgb, ${config.color} 10%, transparent);
                        border: 1px solid color-mix(in srgb, ${config.color} 28%, transparent);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        font-weight: 700;
                        color: ${config.color};
                        letter-spacing: 0.05em;
                    ">${config.icon}</div>
                    <h3 style="
                        margin: 0;
                        font-size: 16px;
                        font-weight: 600;
                        color: var(--text-primary, #e0e0e0);
                        letter-spacing: 0.02em;
                    ">${escapeHtml(title)}</h3>
                </div>
                
                <div class="dialog-body" style="
                    margin-bottom: 18px;
                ">
                    <p style="
                        margin: 0 0 8px 0;
                        font-size: 14px;
                        line-height: 1.6;
                        color: var(--text-primary, #e0e0e0);
                    ">${escapeHtml(message)}</p>
                    ${detail ? `<p style="
                        margin: 0;
                        font-size: 12px;
                        line-height: 1.5;
                        color: var(--text-secondary, #888);
                    ">${escapeHtml(detail)}</p>` : ''}
                </div>
                
                <div class="dialog-footer" style="
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                ">
                    <button class="dialog-btn dialog-btn-cancel" style="
                        padding: 8px 14px;
                        border: 1px solid var(--border, #333);
                        background: transparent;
                        color: var(--text-secondary, #888);
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        font-family: inherit;
                    ">${escapeHtml(cancelText)}</button>
                    <button class="dialog-btn dialog-btn-confirm" style="
                        padding: 8px 14px;
                        border: 1px solid color-mix(in srgb, ${config.color} 60%, transparent);
                        background: color-mix(in srgb, ${config.color} 22%, var(--bg-elevated, #111114));
                        color: white;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        font-family: inherit;
                        box-shadow: none;
                    ">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;

        ensureDialogAnimations();

        const cancelBtn = overlay.querySelector('.dialog-btn-cancel');
        const confirmBtn = overlay.querySelector('.dialog-btn-confirm');

        cancelBtn.addEventListener('click', () => {
            closeDialog();
            resolve(false);
        });

        confirmBtn.addEventListener('click', () => {
            closeDialog();
            resolve(true);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeDialog();
                resolve(false);
            }
        });

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                resolve(false);
            }
        };
        document.addEventListener('keydown', handleEscape);

        setActiveDialog({ overlay, handleEscape });
        document.body.appendChild(overlay);
    });
}

export { closeDialog };
export { showNoteDialog };
export { showTextPrompt };
export { showToast };

/**
 * Legacy wrapper for showMessage using styled dialog
 * @param {Object} options - Same as Electron's dialog.showMessageBox options
 * @returns {Promise<{response: number}>}
 */
export async function showStyledMessage({
    type = 'info',
    title = '',
    message = '',
    detail = '',
    buttons = ['OK', 'Cancel']
} = {}) {
    const typeMap = {
        warning: 'warning',
        error: 'danger',
        info: 'info',
        question: 'confirm'
    };

    const confirmed = await showConfirmDialog({
        title: title || message,
        message: detail || message,
        detail: detail ? message : '',
        type: typeMap[type] || 'info',
        confirmText: buttons[1] || buttons[0],
        cancelText: buttons[0] === 'OK' ? 'Cancel' : buttons[0]
    });

    return { response: confirmed ? 1 : 0 };
}




