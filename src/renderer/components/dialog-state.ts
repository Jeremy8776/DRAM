/**
 * Shared dialog state management.
 */

let activeDialog = null;

export function setActiveDialog(dialog) {
    activeDialog = dialog || null;
}

export function closeDialog() {
    if (activeDialog) {
        document.removeEventListener('keydown', activeDialog.handleEscape);
        activeDialog.overlay.remove();
        activeDialog = null;
    }
}





