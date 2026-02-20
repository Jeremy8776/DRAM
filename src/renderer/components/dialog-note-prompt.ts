import { closeDialog, setActiveDialog } from './dialog-state.js';
import { createDialogOverlay, ensureDialogAnimations, escapeHtml } from './dialog-utils.js';

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
    return new Promise<void>((resolve) => {
        closeDialog();

        const overlay = createDialogOverlay();

        overlay.innerHTML = `
            <div class="dialog-box" style="
                background: var(--bg-elevated, #111114);
                border: 1px solid color-mix(in srgb, var(--accent, #7c3aed) 45%, var(--border, #333));
                border-radius: 6px;
                padding: 22px 24px;
                max-width: 520px;
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
                        background: color-mix(in srgb, var(--accent, #7c3aed) 10%, transparent);
                        border: 1px solid color-mix(in srgb, var(--accent, #7c3aed) 28%, transparent);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        color: var(--accent, #7c3aed);
                        font-weight: 700;
                        letter-spacing: 0.08em;
                    ">INFO</div>
                    <h3 style="
                        margin: 0;
                        font-size: 16px;
                        font-weight: 600;
                        color: var(--text-primary, #e0e0e0);
                        letter-spacing: 0.02em;
                    ">${escapeHtml(title)}</h3>
                </div>

                <div class="dialog-body" style="margin-bottom: 18px;">
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
                    gap: 8px;
                    justify-content: flex-end;
                ">
                    <button class="dialog-btn dialog-btn-confirm" style="
                        padding: 8px 14px;
                        border: 1px solid color-mix(in srgb, var(--accent, #7c3aed) 60%, transparent);
                        background: color-mix(in srgb, var(--accent, #7c3aed) 22%, var(--bg-elevated, #111114));
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

        const confirmBtn = overlay.querySelector('.dialog-btn-confirm') as HTMLButtonElement | null;
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

        setActiveDialog({ overlay, handleEscape });
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

        const overlay = createDialogOverlay();

        overlay.innerHTML = `
            <div class="dialog-box" style="
                background: var(--bg-elevated, #111114);
                border: 1px solid color-mix(in srgb, var(--accent, #7c3aed) 45%, var(--border, #333));
                border-radius: 6px;
                padding: 22px 24px;
                max-width: 520px;
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
                        background: #8b5cf620;
                        border: 1px solid #8b5cf640;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        color: #8b5cf6;
                        font-weight: 700;
                        letter-spacing: 0.08em;
                    ">ASK</div>
                    <h3 style="
                        margin: 0;
                        font-size: 16px;
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
                        border: 1px solid color-mix(in srgb, var(--accent, #7c3aed) 60%, transparent);
                        background: color-mix(in srgb, var(--accent, #7c3aed) 22%, var(--bg-elevated, #111114));
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

        const input = overlay.querySelector('#prompt-input') as HTMLInputElement | null;
        if (input) {
            input.value = initialValue || '';
            setTimeout(() => input.focus(), 0);
        }

        const cancelBtn = overlay.querySelector('.dialog-btn-cancel') as HTMLButtonElement | null;
        const confirmBtn = overlay.querySelector('.dialog-btn-confirm') as HTMLButtonElement | null;

        const finish = (value) => {
            closeDialog();
            resolve(value);
        };

        cancelBtn?.addEventListener('click', () => finish(null));
        confirmBtn?.addEventListener('click', () => finish(input ? input.value : ''));

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

        setActiveDialog({ overlay, handleEscape });
        document.body.appendChild(overlay);
    });
}







