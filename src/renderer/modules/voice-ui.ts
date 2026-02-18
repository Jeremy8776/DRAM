import { elements } from './elements.js';
import {
    minimizeVoice,
    restoreVoice,
    isMinimizedState,
    setToastVisible
} from './voice-toast.js';

export function setVoiceStatus(text) {
    if (elements.voiceStatusText) elements.voiceStatusText.textContent = text;
    if (elements.voiceStatus) elements.voiceStatus.textContent = text;
}

export function setVoiceTranscript(text) {
    if (elements.voiceTranscriptInline) elements.voiceTranscriptInline.textContent = text;
    if (elements.voiceTranscript) elements.voiceTranscript.textContent = text;
}

export function disconnectWaveform(waveform) {
    if (!waveform) return;
    try {
        const info = waveform.update(false, false, null);
        if (info?.resizeObserver) info.resizeObserver.disconnect();
    } catch (err) {
        console.debug('[voice-mode] waveform cleanup failed:', err?.message || err);
    }
}

export function openVoiceFullscreenUi(isVoiceActive, isFullscreen) {
    if (!isVoiceActive || !elements.voiceOverlay || isFullscreen) return isFullscreen;

    elements.voiceOverlay.classList.remove('hidden');
    elements.voiceOverlay.classList.add('fullscreen');

    if (isMinimizedState()) {
        setToastVisible(false);
    } else if (elements.voiceInlineUi) {
        elements.voiceInlineUi.classList.add('hidden');
    }

    if (elements.messageInput) elements.messageInput.classList.add('hidden');
    return true;
}

export function closeVoiceFullscreenUi(isFullscreen) {
    if (!elements.voiceOverlay || !isFullscreen) return isFullscreen;

    elements.voiceOverlay.classList.add('hidden');
    elements.voiceOverlay.classList.remove('fullscreen');

    if (isMinimizedState()) {
        setToastVisible(true);
        if (elements.messageInput) elements.messageInput.classList.remove('hidden');
    } else {
        if (elements.voiceInlineUi) elements.voiceInlineUi.classList.remove('hidden');
        if (elements.messageInput) elements.messageInput.classList.add('hidden');
    }
    return false;
}

export function showVoiceThinkingUi(isVoiceActive) {
    if (!isVoiceActive) return;
    if (elements.voiceInlineUi) elements.voiceInlineUi.classList.add('thinking');
}

export function hideVoiceThinkingUi() {
    if (elements.voiceInlineUi) elements.voiceInlineUi.classList.remove('thinking');
}

export function minimizeVoiceModeUi(isVoiceActive, onDeactivate, onFullscreen) {
    minimizeVoice({
        isVoiceActive,
        onDeactivate,
        onFullscreen
    });
}

export function restoreVoiceModeUi() {
    restoreVoice();
}

export function isVoiceModeMinimizedUi() {
    return isMinimizedState();
}







