/**
 * DRAM Voice Mode - Minimized Toast Logic
 * Extracted to maintain modularity and adhere to the 500-line rule.
 */
import { elements } from './elements.js';

let isMinimized = false;

function getToast() {
    return document.getElementById('voice-toast');
}

export function minimizeVoice(options = {}) {
    const { isVoiceActive, onDeactivate, onFullscreen } = options;
    if (!isVoiceActive || isMinimized) return true;

    isMinimized = true;

    // Create floating toast if it doesn't exist
    let toast = getToast();
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'voice-toast';
        toast.className = 'voice-toast';
        toast.innerHTML = `
            <div class="voice-toast-header">
                <div class="voice-toast-title">
                    <span class="voice-toast-dot pulse"></span>
                    <span class="voice-toast-label">Voice Active</span>
                </div>
                <div class="voice-toast-actions">
                    <button id="voice-toast-fullscreen" class="voice-toast-btn" title="Fullscreen Waveform">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
                        </svg>
                    </button>
                    <button id="voice-toast-cancel" class="voice-toast-btn danger" title="End Voice Mode">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="6" y="6" width="12" height="12"></rect>
                        </svg>
                    </button>
                    <button id="voice-toast-close" class="voice-toast-btn" title="Close Toast">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="voice-toast-waveform-wrap">
                <canvas id="voice-toast-waveform" class="voice-toast-waveform"></canvas>
            </div>
        `;
        document.body.appendChild(toast);

        document.getElementById('voice-toast-fullscreen')?.addEventListener('click', () => {
            if (onFullscreen) onFullscreen();
        });

        document.getElementById('voice-toast-cancel')?.addEventListener('click', () => {
            if (onDeactivate) onDeactivate();
        });

        document.getElementById('voice-toast-close')?.addEventListener('click', () => {
            restoreVoice();
        });

        toast.querySelector('.voice-toast-waveform-wrap')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onFullscreen) onFullscreen();
        });
    }

    toast.classList.add('visible');

    // Hide inline UI
    if (elements.voiceInlineUi) elements.voiceInlineUi.classList.add('hidden');
    if (elements.messageInput) elements.messageInput.classList.remove('hidden');

    console.log('Voice Mode: Minimized to toast');
    return isMinimized;
}

export function restoreVoice() {
    isMinimized = false;

    // Hide toast
    const toast = document.getElementById('voice-toast');
    if (toast) toast.classList.remove('visible');

    // Show inline UI
    if (elements.voiceInlineUi) elements.voiceInlineUi.classList.remove('hidden');
    if (elements.messageInput) elements.messageInput.classList.add('hidden');

    console.log('Voice Mode: Restored from toast');
    return isMinimized;
}

export function isMinimizedState() {
    return isMinimized;
}

export function setToastVisible(visible) {
    const toast = getToast();
    if (!toast) return;
    toast.classList.toggle('visible', !!visible);
}

export function resetToastState() {
    isMinimized = false;
    setToastVisible(false);
}
