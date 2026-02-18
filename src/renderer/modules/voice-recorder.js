import { elements } from './elements.js';
import { state } from './state.js';
import { addMessage, showTypingIndicator } from './renderer.js';
import { convertToWav } from './voice-utils.js';
import { buildOutboundMessageWithContext } from './socket.js';

/**
 * Handles the recording stopped event.
 */
export async function handleRecorderStopped(params) {
    const {
        audioChunks,
        wasSpeechSubmission,
        isVoiceActive,
        audioContext,
        mediaRecorder,
        startRecording,
        showVoiceThinking
    } = params;

    if (!wasSpeechSubmission) {
        console.log('Voice Mode: Discarding silent recording (silence reset)');
        if (isVoiceActive) startRecording();
        return;
    }

    const sessionKey = state.sessionKey || 'main';

    if (audioChunks.length === 0) {
        if (isVoiceActive) startRecording();
        return;
    }

    // Process final audio segment once on stop/send.
    const recordedMimeType = mediaRecorder.mimeType || 'audio/webm';
    const audioBlob = new Blob(audioChunks, { type: recordedMimeType });

    if (elements.voiceStatusText) elements.voiceStatusText.textContent = 'Transcribing...';
    if (elements.voiceStatus) elements.voiceStatus.textContent = 'Transcribing...';

    try {
        const wavBlob = await convertToWav(audioBlob, audioContext);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64data = reader.result.split(',')[1];
            try {
                const sttProvider = String(await window.dram.storage.get('settings.sttProvider') || 'local')
                    .trim()
                    .toLowerCase();
                const sttModel = sttProvider === 'local'
                    ? String(await window.dram.storage.get('settings.sttLocalModel') || 'base').trim()
                    : String(await window.dram.storage.get('settings.sttModel') || 'whisper-large-v3').trim();
                const transcription = await window.dram.util.transcribeAudio(base64data, {
                    provider: sttProvider,
                    model: sttModel,
                    mimeType: 'audio/wav',
                    timeoutMs: 30000
                });
                const messageText = transcription?.success
                    ? String(transcription.transcript || '').trim()
                    : '';

                if (!messageText) {
                    console.warn('Voice Mode: Empty transcript; skipping chat.send');
                    if (isVoiceActive) startRecording();
                    return;
                }

                addMessage('user', messageText, false, true);
                const outboundMessage = await buildOutboundMessageWithContext(messageText);

                window.dram.socket.send({
                    type: 'req',
                    id: `voice-${Date.now()}`,
                    method: 'chat.send',
                    params: {
                        sessionKey: sessionKey,
                        message: outboundMessage,
                        idempotencyKey: 'voice-' + Date.now()
                    }
                });
                showTypingIndicator('Assistant', `voice-${Date.now()}`);
                showVoiceThinking();
                if (isVoiceActive) startRecording();
            } catch (err) {
                console.error('Voice Mode: Send failed', err);
                if (isVoiceActive) startRecording();
            }

            // Priority C: Notify backend that the stream is complete to clear buffers
            if (state.voiceStreamSupported === true) {
                window.dram.socket.send({
                    type: 'req',
                    id: `vstream-final-${Date.now()}`,
                    method: 'voice.stream',
                    params: {
                        sessionKey: sessionKey,
                        chunk: '',
                        isFinal: true
                    }
                });
            }
        };
        reader.readAsDataURL(wavBlob);
    } catch (err) {
        console.error('Voice Mode: Audio conversion failed', err);
        if (isVoiceActive) startRecording();
    }
}
