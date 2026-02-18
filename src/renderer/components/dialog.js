/**
 * DRAM Desktop - Styled Dialog/Confirmation Component
 * Custom styled dialogs that match the Dieter Rams aesthetic
 */

// Active dialog tracking
let activeDialog = null;

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
        // Close any existing dialog
        closeDialog();

        // Create dialog container
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: dialogFadeIn 0.2s ease;
        `;

        // Type styling
        const typeConfig = {
            warning: { icon: '!', color: '#f59e0b', border: '#f59e0b' },
            danger: { icon: '☠', color: '#ef4444', border: '#ef4444' },
            info: { icon: 'INFO', color: '#3b82f6', border: '#3b82f6' },
            confirm: { icon: '?', color: '#8b5cf6', border: '#8b5cf6' }
        };
        const config = typeConfig[type] || typeConfig.confirm;

        overlay.innerHTML = `
            <div class="dialog-box" style="
                background: var(--bg-surface, #1a1a2e);
                border: 1px solid ${config.border};
                border-radius: 8px;
                padding: 28px 32px;
                max-width: 420px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
                animation: dialogSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            ">
                <div class="dialog-header" style="
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                ">
                    <div class="dialog-icon" style="
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        background: ${config.color}20;
                        border: 1px solid ${config.color}40;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 20px;
                        color: ${config.color};
                    ">${config.icon}</div>
                    <h3 style="
                        margin: 0;
                        font-size: 18px;
                        font-weight: 600;
                        color: var(--text-primary, #e0e0e0);
                        letter-spacing: 0.02em;
                    ">${escapeHtml(title)}</h3>
                </div>
                
                <div class="dialog-body" style="
                    margin-bottom: 24px;
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
                    gap: 12px;
                    justify-content: flex-end;
                ">
                    <button class="dialog-btn dialog-btn-cancel" style="
                        padding: 10px 20px;
                        border: 1px solid var(--border, #333);
                        background: transparent;
                        color: var(--text-secondary, #888);
                        border-radius: 6px;
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        font-family: inherit;
                    ">${escapeHtml(cancelText)}</button>
                    <button class="dialog-btn dialog-btn-confirm" style="
                        padding: 10px 20px;
                        border: none;
                        background: ${config.color};
                        color: white;
                        border-radius: 6px;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        font-family: inherit;
                        box-shadow: 0 2px 8px ${config.color}40;
                    ">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;

        // Add animations
        if (!document.getElementById('dialog-animations')) {
            const style = document.createElement('style');
            style.id = 'dialog-animations';
            style.textContent = `
                @keyframes dialogFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes dialogSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .dialog-btn:hover {
                    transform: translateY(-1px);
                }
                .dialog-btn-cancel:hover {
                    border-color: var(--text-primary, #e0e0e0);
                    color: var(--text-primary, #e0e0e0);
                }
                .dialog-btn-confirm:hover {
                    filter: brightness(1.1);
                }
                .dialog-btn:active {
                    transform: translateY(0);
                }
            `;
            document.head.appendChild(style);
        }

        // Event handlers
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

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeDialog();
                resolve(false);
            }
        });

        // Close on Escape
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                resolve(false);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Track active dialog
        activeDialog = { overlay, handleEscape };

        // Show dialog
        document.body.appendChild(overlay);
    });
}

/**
 * Show an informational dialog with a single action button.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} options.confirmText
 * @returns {Promise<void>}
 */
export function showNoteDialog({
    title = 'Notice',
    message = '',
    confirmText = 'OK'
} = {}) {
    return new Promise((resolve) => {
        closeDialog();

        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: dialogFadeIn 0.2s ease;
        `;

        overlay.innerHTML = `
            <div class="dialog-box" style="
                background: var(--bg-surface, #1a1a2e);
                border: 1px solid var(--border, #333);
                border-radius: 8px;
                padding: 28px 32px;
                max-width: 520px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
                animation: dialogSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            ">
                <div class="dialog-header" style="
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                ">
                    <div class="dialog-icon" style="
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background: #3b82f620;
                        border: 1px solid #3b82f640;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        color: #3b82f6;
                        letter-spacing: 0.08em;
                    ">INFO</div>
                    <h3 style="
                        margin: 0;
                        font-size: 18px;
                        font-weight: 600;
                        color: var(--text-primary, #e0e0e0);
                        letter-spacing: 0.02em;
                    ">${escapeHtml(title)}</h3>
                </div>

                <div class="dialog-body" style="margin-bottom: 24px;">
                    <p style="
                        margin: 0;
                        font-size: 13px;
                        line-height: 1.6;
                        color: var(--text-primary, #e0e0e0);
                        white-space: pre-wrap;
                    ">${escapeHtml(message)}</p>
                </div>

                <div class="dialog-footer" style="
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                ">
                    <button class="dialog-btn dialog-btn-confirm" style="
                        padding: 10px 20px;
                        border: none;
                        background: #3b82f6;
                        color: white;
                        border-radius: 6px;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        font-family: inherit;
                        box-shadow: 0 2px 8px #3b82f640;
                    ">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;

        if (!document.getElementById('dialog-animations')) {
            const style = document.createElement('style');
            style.id = 'dialog-animations';
            style.textContent = `
                @keyframes dialogFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes dialogSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .dialog-btn:hover {
                    transform: translateY(-1px);
                }
                .dialog-btn:active {
                    transform: translateY(0);
                }
            `;
            document.head.appendChild(style);
        }

        const confirmBtn = overlay.querySelector('.dialog-btn-confirm');
        confirmBtn.addEventListener('click', () => {
            closeDialog();
            resolve();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeDialog();
                resolve();
            }
        });

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                resolve();
            }
        };
        document.addEventListener('keydown', handleEscape);

        activeDialog = { overlay, handleEscape };
        document.body.appendChild(overlay);
    });
}

/**
 * Show a text input prompt dialog.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} options.placeholder
 * @param {string} options.initialValue
 * @param {string} options.confirmText
 * @param {string} options.cancelText
 * @returns {Promise<string|null>}
 */
export function showTextPrompt({
    title = 'Input Required',
    message = '',
    placeholder = '',
    initialValue = '',
    confirmText = 'Continue',
    cancelText = 'Cancel'
} = {}) {
    return new Promise((resolve) => {
        closeDialog();

        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: dialogFadeIn 0.2s ease;
        `;

        overlay.innerHTML = `
            <div class="dialog-box" style="
                background: var(--bg-surface, #1a1a2e);
                border: 1px solid var(--border, #333);
                border-radius: 8px;
                padding: 28px 32px;
                max-width: 520px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
                animation: dialogSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            ">
                <div class="dialog-header" style="
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                ">
                    <div class="dialog-icon" style="
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background: #8b5cf620;
                        border: 1px solid #8b5cf640;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        color: #8b5cf6;
                        letter-spacing: 0.08em;
                    ">ASK</div>
                    <h3 style="
                        margin: 0;
                        font-size: 18px;
                        font-weight: 600;
                        color: var(--text-primary, #e0e0e0);
                        letter-spacing: 0.02em;
                    ">${escapeHtml(title)}</h3>
                </div>

                <div class="dialog-body" style="margin-bottom: 20px;">
                    <p style="
                        margin: 0 0 12px 0;
                        font-size: 13px;
                        line-height: 1.6;
                        color: var(--text-primary, #e0e0e0);
                        white-space: pre-wrap;
                    ">${escapeHtml(message)}</p>
                    <input class="mono-input" type="text" id="prompt-input" placeholder="${escapeHtml(placeholder)}" style="
                        width: 100%;
                        box-sizing: border-box;
                    ">
                </div>

                <div class="dialog-footer" style="
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                ">
                    <button class="dialog-btn dialog-btn-cancel" style="
                        padding: 10px 20px;
                        border: 1px solid var(--border, #333);
                        background: transparent;
                        color: var(--text-secondary, #888);
                        border-radius: 6px;
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        font-family: inherit;
                    ">${escapeHtml(cancelText)}</button>
                    <button class="dialog-btn dialog-btn-confirm" style="
                        padding: 10px 20px;
                        border: none;
                        background: #8b5cf6;
                        color: white;
                        border-radius: 6px;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.15s ease;
                        font-family: inherit;
                        box-shadow: 0 2px 8px #8b5cf640;
                    ">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;

        if (!document.getElementById('dialog-animations')) {
            const style = document.createElement('style');
            style.id = 'dialog-animations';
            style.textContent = `
                @keyframes dialogFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes dialogSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .dialog-btn:hover {
                    transform: translateY(-1px);
                }
                .dialog-btn-cancel:hover {
                    border-color: var(--text-primary, #e0e0e0);
                    color: var(--text-primary, #e0e0e0);
                }
                .dialog-btn-confirm:hover {
                    filter: brightness(1.1);
                }
                .dialog-btn:active {
                    transform: translateY(0);
                }
            `;
            document.head.appendChild(style);
        }

        const input = overlay.querySelector('#prompt-input');
        if (input) {
            input.value = initialValue || '';
            setTimeout(() => input.focus(), 0);
        }

        const cancelBtn = overlay.querySelector('.dialog-btn-cancel');
        const confirmBtn = overlay.querySelector('.dialog-btn-confirm');

        const finish = (value) => {
            closeDialog();
            resolve(value);
        };

        cancelBtn.addEventListener('click', () => finish(null));
        confirmBtn.addEventListener('click', () => finish(input ? input.value : ''));

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                finish(null);
            }
        });

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                finish(null);
            }
        };
        document.addEventListener('keydown', handleEscape);

        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    finish(input.value);
                }
            });
        }

        activeDialog = { overlay, handleEscape };
        document.body.appendChild(overlay);
    });
}

/**
 * Close the active dialog
 */
export function closeDialog() {
    if (activeDialog) {
        document.removeEventListener('keydown', activeDialog.handleEscape);
        activeDialog.overlay.remove();
        activeDialog = null;
    }
}

/**
 * Show a styled toast notification
 * @param {Object} options
 * @param {string} options.message - Toast message
 * @param {string} options.type - 'success', 'error', 'warning', 'info'
 * @param {number} options.duration - Duration in ms
 */
export function showToast({
    message = '',
    type = 'info',
    duration = 3000
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
        ">${escapeHtml(message)}</span>
    `;

    // Add animation
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

    // Auto remove
    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.2s ease forwards';
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
        'warning': 'warning',
        'error': 'danger',
        'info': 'info',
        'question': 'confirm'
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
