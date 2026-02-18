/**
 * DRAM Listeners - Voice & Audio Settings
 * Handles STT, TTS, and audio device settings
 */
import { showToast } from '../../components/dialog.js';

/**
 * Setup voice & audio settings listeners
 * @param {function} on - Event binding helper
 */
export function setupVoiceSettingsListeners(on) {
    // STT Provider
    on(document.getElementById('setting-stt-provider'), 'change', async (e) => {
        const val = e.target.value;
        await window.dram.storage.set('settings.sttProvider', val);

        const { updateVoiceProviderUI, showSettingStatus, getCurrentSTTModel } = await import('../../components/settings/tabs/voice.js');
        updateVoiceProviderUI();

        const model = getCurrentSTTModel();
        if (val === 'groq' || val === 'openai') {
            await window.dram.gateway.patchConfig({
                tools: { media: { audio: { models: [{ type: 'provider', provider: val, model: model }] } } }
            });
            showSettingStatus('stt-status', `STT switched to ${val} (${model})`, 'success');
        } else {
            showSettingStatus('stt-status', `STT switched to Local (${model})`, 'success');
        }
        showToast({ message: `STT Provider: ${val}`, type: 'success' });
    });

    // STT Model
    on(document.getElementById('setting-stt-model'), 'change', async (e) => {
        const val = e.target.value;
        await window.dram.storage.set('settings.sttModel', val);
        const provider = document.getElementById('setting-stt-provider')?.value || 'local';
        if (provider !== 'local') {
            await window.dram.gateway.patchConfig({
                tools: { media: { audio: { models: [{ type: 'provider', provider: provider, model: val }] } } }
            });
        }
        const { showSettingStatus } = await import('../../components/settings/tabs/voice.js');
        showSettingStatus('stt-status', `STT model updated to ${val}`, 'success');
        showToast({ message: `STT Model: ${val}`, type: 'info' });
    });

    // STT Local Model
    on(document.getElementById('setting-stt-local-model'), 'change', async (e) => {
        const val = e.target.value;
        await window.dram.storage.set('settings.sttLocalModel', val);
        const { showSettingStatus } = await import('../../components/settings/tabs/voice.js');
        showSettingStatus('stt-status', `Local STT model set to ${val}`, 'success');
        showToast({ message: `Local STT: ${val}`, type: 'info' });
    });

    // TTS Provider
    on(document.getElementById('setting-tts-provider'), 'change', async (e) => {
        const val = e.target.value;
        await window.dram.storage.set('settings.ttsProvider', val);

        const { updateVoiceProviderUI, showSettingStatus, getCurrentTTSVoice } = await import('../../components/settings/tabs/voice.js');
        updateVoiceProviderUI();

        await window.dram.util.setTtsProvider(val);

        const voice = getCurrentTTSVoice();
        if (val === 'elevenlabs') {
            await window.dram.gateway.patchConfig({
                messages: { tts: { provider: val, elevenlabs: { voiceId: voice } } }
            });
        } else if (val === 'openai') {
            await window.dram.gateway.patchConfig({
                messages: { tts: { provider: val, openai: { voice: voice } } }
            });
        } else {
            await window.dram.gateway.patchConfig({
                messages: { tts: { provider: val, edge: { voice: voice } } }
            });
        }

        showSettingStatus('tts-status', `TTS switched to ${val} (${voice})`, 'success');
        showToast({ message: `TTS Provider: ${val}`, type: 'success' });
    });

    // TTS Voice - Edge
    on(document.getElementById('setting-tts-voice-edge'), 'change', async (e) => {
        const val = e.target.value;
        await window.dram.storage.set('settings.ttsVoiceEdge', val);
        await window.dram.gateway.patchConfig({
            messages: { tts: { edge: { voice: val } } }
        });
        const { showSettingStatus } = await import('../../components/settings/tabs/voice.js');
        showSettingStatus('tts-status', `Edge voice set to ${val}`, 'success');
        showToast({ message: `Voice: ${val}`, type: 'info' });
    });

    // TTS Voice - ElevenLabs
    on(document.getElementById('setting-tts-voice-elevenlabs'), 'change', async (e) => {
        const val = e.target.value;
        await window.dram.storage.set('settings.ttsVoiceElevenlabs', val);

        const { updateElevenLabsCustomVoiceVisibility } = await import('../../components/settings/tabs/voice.js');
        updateElevenLabsCustomVoiceVisibility();

        if (val !== 'custom') {
            await window.dram.gateway.patchConfig({
                messages: { tts: { elevenlabs: { voiceId: val } } }
            });
            const { showSettingStatus } = await import('../../components/settings/tabs/voice.js');
            showSettingStatus('tts-status', 'ElevenLabs voice set', 'success');
            showToast({ message: 'ElevenLabs Voice updated', type: 'info' });
        }
    });

    // TTS Voice - ElevenLabs Custom
    on(document.getElementById('setting-tts-voice-elevenlabs-custom'), 'change', async (e) => {
        const val = e.target.value.trim();
        if (!val) return;
        await window.dram.storage.set('settings.ttsVoiceElevenlabsCustom', val);
        await window.dram.gateway.patchConfig({
            messages: { tts: { elevenlabs: { voiceId: val } } }
        });
        const { showSettingStatus } = await import('../../components/settings/tabs/voice.js');
        showSettingStatus('tts-status', 'Custom ElevenLabs voice set', 'success');
        showToast({ message: `Custom ElevenLabs Voice: ${val.substring(0, 8)}...`, type: 'info' });
    });

    // TTS Voice - OpenAI
    on(document.getElementById('setting-tts-voice-openai'), 'change', async (e) => {
        const val = e.target.value;
        await window.dram.storage.set('settings.ttsVoiceOpenAI', val);
        await window.dram.gateway.patchConfig({
            messages: { tts: { openai: { voice: val } } }
        });
        const { showSettingStatus } = await import('../../components/settings/tabs/voice.js');
        showSettingStatus('tts-status', `OpenAI voice set to ${val}`, 'success');
        showToast({ message: `OpenAI Voice: ${val}`, type: 'info' });
    });

    // TTS Auto-enable toggle
    on(document.getElementById('setting-tts-enabled'), 'change', async (e) => {
        const enabled = e.target.checked;
        await window.dram.storage.set('settings.ttsEnabled', enabled);
        showToast({ message: `Auto-TTS ${enabled ? 'enabled' : 'disabled'}`, type: enabled ? 'success' : 'warning' });
    });
}

/**
 * Populate Audio Input Devices Dropdown
 */
export async function populateAudioDevices() {
    const select = document.getElementById('setting-audio-input');
    if (!select) return;

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');

        const hasLabels = inputs.some(d => d.label.length > 0);
        if (!hasLabels && inputs.length > 0) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                const newDevices = await navigator.mediaDevices.enumerateDevices();
                inputs.length = 0;
                inputs.push(...newDevices.filter(d => d.kind === 'audioinput'));
            } catch (err) {
                console.warn('Microphone permission denied, cannot show device labels', err);
            }
        }

        const savedId = await window.dram.storage.get('settings.audioInputDeviceId');

        select.innerHTML = '<option value="">Default System Device</option>';

        inputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${select.options.length}`;
            select.appendChild(option);
        });

        if (savedId) {
            select.value = savedId;
        }

    } catch (err) {
        console.error('Failed to populate audio devices:', err);
        select.innerHTML = '<option value="">Error loading devices</option>';
    }
}






