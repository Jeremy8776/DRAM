/**
 * DRAM Listeners - UI Prompts from Main
 */
import { showConfirmDialog, showNoteDialog, showTextPrompt } from '../../components/dialog.js';

export function setupUiPromptListeners() {
    if (typeof window.dram?.on !== 'function') return;

    window.dram.on('ui:prompt', async (payload) => {
        const requestId = payload?.requestId;
        if (!requestId) return;

        try {
            const kind = payload?.kind || 'text';

            if (kind === 'note') {
                await showNoteDialog({
                    title: payload?.title || 'Notice',
                    message: payload?.message || '',
                    confirmText: payload?.confirmText || 'OK'
                });
                await window.dram.util.respondPrompt({ requestId, cancelled: false });
                return;
            }

            if (kind === 'confirm') {
                const confirmed = await showConfirmDialog({
                    title: payload?.title || 'Confirm',
                    message: payload?.message || '',
                    detail: payload?.detail || '',
                    type: 'confirm',
                    confirmText: payload?.confirmText || 'Continue',
                    cancelText: payload?.cancelText || 'Cancel'
                });
                await window.dram.util.respondPrompt({ requestId, confirmed, cancelled: false });
                return;
            }

            const value = await showTextPrompt({
                title: payload?.title || 'Input Required',
                message: payload?.message || '',
                placeholder: payload?.placeholder || '',
                initialValue: payload?.initialValue || '',
                confirmText: payload?.confirmText || 'Continue',
                cancelText: payload?.cancelText || 'Cancel'
            });

            await window.dram.util.respondPrompt({
                requestId,
                value,
                cancelled: value === null
            });
        } catch (err) {
            await window.dram.util.respondPrompt({
                requestId,
                cancelled: true,
                error: err?.message || String(err)
            });
        }
    });
}
