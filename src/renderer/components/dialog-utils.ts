/**
 * Shared dialog rendering helpers.
 */

export function createDialogOverlay() {
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
    return overlay;
}

export function ensureDialogAnimations() {
    if (document.getElementById('dialog-animations')) {
        return;
    }
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

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}





