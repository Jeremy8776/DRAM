/**
 * Voice & Audio Settings Tab
 * Enhanced with provider-specific options and validation feedback
 */
import { renderSelect, renderSection, renderSwitch, renderInput } from '../../../modules/ui-components.js';

export function renderVoiceTab() {
    const sttContent = `
        ${renderSelect({
        id: 'setting-stt-provider',
        label: 'Speech Recognition (STT)',
        description: 'Engine for converting audio input to text.',
        options: [
            { value: 'local', text: 'Local (Whisper / Sherpa - Offline)' },
            { value: 'groq', text: 'Groq (Cloud Whisper - Ultra Fast)' },
            { value: 'openai', text: 'OpenAI (Cloud Whisper - Best Quality)' }
        ],
        value: 'local'
    })}
        <div id="stt-cloud-options" class="provider-specific-options hidden">
            ${renderSelect({
        id: 'setting-stt-model',
        label: 'STT Model',
        description: 'Quality vs speed for cloud transcription.',
        options: [
            { value: 'whisper-large-v3', text: 'Large v3 (Best Quality)' },
            { value: 'distil-whisper-large-v3', text: 'Distil Large (Fastest)' }
        ],
        value: 'whisper-large-v3'
    })}
        </div>
        <div id="stt-local-options" class="provider-specific-options">
            ${renderSelect({
        id: 'setting-stt-local-model',
        label: 'Local Model Size',
        description: 'Larger models are more accurate but slower.',
        options: [
            { value: 'base', text: 'Base (Fastest, Lowest Quality)' },
            { value: 'small', text: 'Small (Balanced)' },
            { value: 'medium', text: 'Medium (Better Quality)' },
            { value: 'large-v3', text: 'Large v3 (Best, Requires 8GB+ RAM)' }
        ],
        value: 'base'
    })}
        </div>
        <div id="stt-status" class="setting-status-indicator"></div>
    `;

    const ttsContent = `
        ${renderSelect({
        id: 'setting-tts-provider',
        label: 'Voice Generation (TTS)',
        description: 'Engine for generating spoken responses.',
        options: [
            { value: 'edge', text: 'Microsoft Edge (Free / Fastest)' },
            { value: 'elevenlabs', text: 'ElevenLabs (Ultra-Realistic, API Key Required)' },
            { value: 'openai', text: 'OpenAI (Nova / Shimmer / Alloy)' }
        ],
        value: 'edge'
    })}
        <div id="tts-voice-options">
            ${renderSelect({
        id: 'setting-tts-voice-edge',
        label: 'Voice',
        description: 'Neural voice for speech synthesis.',
        options: [
            { value: 'en-US-AriaNeural', text: 'Aria (US Female)' },
            { value: 'en-GB-SoniaNeural', text: 'Sonia (UK Female)' },
            { value: 'en-US-GuyNeural', text: 'Guy (US Male)' },
            { value: 'en-GB-RyanNeural', text: 'Ryan (UK Male)' }
        ],
        value: 'en-US-AriaNeural'
    })}
        </div>
        <div id="tts-elevenlabs-options" class="provider-specific-options hidden">
            ${renderSelect({
        id: 'setting-tts-voice-elevenlabs',
        label: 'ElevenLabs Voice',
        description: 'Choose from premium ElevenLabs voices.',
        options: [
            { value: '21m00Tcm4TlvDq8ikWAM', text: 'Rachel (US Female)' },
            { value: '54YYBuRuAG6KJooiOhFI', text: 'Alice (UK Female)' },
            { value: 'pNInz6obpgDQGcFmaJgB', text: 'Adam (US Male)' },
            { value: 'nPczCjzI2devNBz1zQrb', text: 'Brian (UK Male)' },
            { value: 'custom', text: 'Custom Voice ID...' }
        ],
        value: '21m00Tcm4TlvDq8ikWAM'
    })}
            <div id="elevenlabs-custom-voice-container" class="provider-specific-options hidden" style="margin-top: 12px;">
                ${renderInput({
        id: 'setting-tts-voice-elevenlabs-custom',
        label: 'Custom Voice ID',
        description: 'Enter your custom ElevenLabs voice ID (20+ alphanumeric characters).',
        placeholder: 'e.g. KLON7Nwan8mJxpF2R8Yw',
        value: ''
    })}
            </div>
        </div>
        <div id="tts-openai-options" class="provider-specific-options hidden">
            ${renderSelect({
        id: 'setting-tts-voice-openai',
        label: 'OpenAI Voice',
        description: 'Choose from OpenAI\'s built-in voices.',
        options: [
            { value: 'shimmer', text: 'Shimmer (US Female)' },
            { value: 'nova', text: 'Nova (US Female)' },
            { value: 'fable', text: 'Fable (UK Male Accent)' },
            { value: 'onyx', text: 'Onyx (US Male)' }
        ],
        value: 'nova'
    })}
        </div>
        ${renderSwitch({
        id: 'setting-tts-enabled',
        label: 'Auto-Spoken Responses',
        description: 'Automatically speak incoming messages in Voice Mode.',
        checked: true
    })}
        <div id="tts-status" class="setting-status-indicator"></div>
    `;

    return `
        <div id="tab-voice" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Neural Ears',
        subtitle: 'Configure audio input and transcription engines.',
        content: sttContent,
        infoTooltip: 'Choose your speech recognition engine. Local mode works offline but cloud providers (Groq/OpenAI) offer faster, more accurate transcription.'
    })}
            ${renderSection({
        title: 'Neural Voice',
        subtitle: 'Configure synthesized speech and vocal identity.',
        content: ttsContent,
        infoTooltip: 'Text-to-Speech converts AI responses to spoken audio. Edge is free and fast, ElevenLabs offers the most realistic voices, OpenAI provides consistent quality.'
    })}
        </div>
    `;
}

/**
 * Update UI visibility based on selected providers
 */
export function updateVoiceProviderUI() {
    const sttProvider = document.getElementById('setting-stt-provider')?.value || 'local';
    const ttsProvider = document.getElementById('setting-tts-provider')?.value || 'edge';

    // STT options visibility
    const sttCloudOptions = document.getElementById('stt-cloud-options');
    const sttLocalOptions = document.getElementById('stt-local-options');
    if (sttCloudOptions && sttLocalOptions) {
        if (sttProvider === 'local') {
            sttCloudOptions.classList.add('hidden');
            sttLocalOptions.classList.remove('hidden');
        } else {
            sttCloudOptions.classList.remove('hidden');
            sttLocalOptions.classList.add('hidden');
        }
    }

    // TTS voice options visibility
    const ttsVoiceOptions = document.getElementById('tts-voice-options');
    const ttsElevenlabsOptions = document.getElementById('tts-elevenlabs-options');
    const ttsOpenaiOptions = document.getElementById('tts-openai-options');

    if (ttsVoiceOptions) ttsVoiceOptions.classList.add('hidden');
    if (ttsElevenlabsOptions) ttsElevenlabsOptions.classList.add('hidden');
    if (ttsOpenaiOptions) ttsOpenaiOptions.classList.add('hidden');

    if (ttsProvider === 'edge' && ttsVoiceOptions) {
        ttsVoiceOptions.classList.remove('hidden');
    } else if (ttsProvider === 'elevenlabs' && ttsElevenlabsOptions) {
        ttsElevenlabsOptions.classList.remove('hidden');
        // Show/hide custom voice input
        updateElevenLabsCustomVoiceVisibility();
    } else if (ttsProvider === 'openai' && ttsOpenaiOptions) {
        ttsOpenaiOptions.classList.remove('hidden');
    }
}

/**
 * Update ElevenLabs custom voice input visibility
 */
export function updateElevenLabsCustomVoiceVisibility() {
    const voiceSelect = document.getElementById('setting-tts-voice-elevenlabs');
    const customContainer = document.getElementById('elevenlabs-custom-voice-container');
    if (voiceSelect && customContainer) {
        if (voiceSelect.value === 'custom') {
            customContainer.classList.remove('hidden');
        } else {
            customContainer.classList.add('hidden');
        }
    }
}

/**
 * Show status indicator for setting changes
 */
export function showSettingStatus(elementId, message, type = 'success') {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.textContent = message;
    el.className = `setting-status-indicator ${type}`;
    el.style.opacity = '1';

    setTimeout(() => {
        el.style.opacity = '0';
    }, 3000);
}

/**
 * Get current TTS voice based on provider
 */
export function getCurrentTTSVoice() {
    const provider = document.getElementById('setting-tts-provider')?.value || 'edge';

    if (provider === 'elevenlabs') {
        const voiceSelect = document.getElementById('setting-tts-voice-elevenlabs');
        const selectedVoice = voiceSelect?.value || '21m00Tcm4TlvDq8ikWAM';
        // If custom is selected, use the custom voice ID input
        if (selectedVoice === 'custom') {
            const customInput = document.getElementById('setting-tts-voice-elevenlabs-custom');
            return customInput?.value?.trim() || '21m00Tcm4TlvDq8ikWAM';
        }
        return selectedVoice;
    } else if (provider === 'openai') {
        return document.getElementById('setting-tts-voice-openai')?.value || 'nova';
    } else {
        return document.getElementById('setting-tts-voice-edge')?.value || 'en-US-AriaNeural';
    }
}

/**
 * Get current STT model based on provider
 */
export function getCurrentSTTModel() {
    const provider = document.getElementById('setting-stt-provider')?.value || 'local';

    if (provider === 'local') {
        return document.getElementById('setting-stt-local-model')?.value || 'base';
    } else {
        return document.getElementById('setting-stt-model')?.value || 'whisper-large-v3';
    }
}






