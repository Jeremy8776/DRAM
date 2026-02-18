import { stripMarkdownForTTS } from './voice-utils.js';

let audioQueue = [];
let isPlayingAudio = false;
let currentAudioSource = null;

/**
 * Queue a text segment for TTS playback.
 */
export async function queueVoiceResponse(text, onPlay, params) {
    const { isVoiceActive } = params;

    if (!text || !isVoiceActive) {
        if (onPlay && !isVoiceActive) onPlay({ duration: 0 });
        return;
    }

    audioQueue.push({ text, onPlay });

    if (!isPlayingAudio) {
        processAudioQueue(params);
    }
}

/**
 * Process the next item in the audio queue
 */
async function processAudioQueue(params) {
    const { mediaRecorder, updateStatus } = params;

    if (audioQueue.length === 0) {
        isPlayingAudio = false;
        updateStatus('Listening (Auto-send on pause)');
        if (mediaRecorder && mediaRecorder.state === 'paused') {
            mediaRecorder.resume();
        }
        return;
    }

    isPlayingAudio = true;
    const item = typeof audioQueue[0] === 'object' ? audioQueue.shift() : { text: audioQueue.shift() };
    const rawText = item.text;
    const onPlay = item.onPlay;

    const text = stripMarkdownForTTS(rawText);

    try {
        updateStatus('Speaking...');

        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.pause();
        }

        // Get provider-specific voice
        const ttsProvider = await window.dram.storage.get('settings.ttsProvider') || 'edge';
        let voice;
        if (ttsProvider === 'elevenlabs') {
            const savedVoice = await window.dram.storage.get('settings.ttsVoiceElevenlabs') || '21m00Tcm4TlvDq8ikWAM';
            // If custom is selected, use the custom voice ID
            if (savedVoice === 'custom') {
                voice = await window.dram.storage.get('settings.ttsVoiceElevenlabsCustom') || '21m00Tcm4TlvDq8ikWAM';
            } else {
                voice = savedVoice;
            }
        } else if (ttsProvider === 'openai') {
            voice = await window.dram.storage.get('settings.ttsVoiceOpenAI') || 'nova';
        } else {
            voice = await window.dram.storage.get('settings.ttsVoiceEdge') || 'en-US-AriaNeural';
        }
        console.log(`[voice-playback] Calling generateTTS with provider=${ttsProvider}, voice=${voice}`);
        const result = await window.dram.util.generateTTS(text, { voice, provider: ttsProvider });
        console.log(`[voice-playback] generateTTS result.success=${result.success}, provider=${result.provider}`);

        if (result.success && result.dataUri) {
            await playAudioData(result.dataUri, onPlay, params);
        } else {
            console.error('TTS generation failed:', result.error || 'Unknown error');
            if (onPlay) onPlay({ duration: 0 });
        }
    } catch (err) {
        console.error('TTS Processing failed:', err.message || err);
        if (onPlay) onPlay({ duration: 0 });
    }

    processAudioQueue(params);
}

/**
 * Helper to play audio data and wait for completion
 */
async function playAudioData(dataUri, onPlay, params) {
    const { audioContext, analyser } = params;

    // Ensure audioContext is active
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    return new Promise((resolve) => {
        const audio = new Audio(dataUri);

        audio.onloadedmetadata = () => {
            if (onPlay) onPlay({ duration: audio.duration });
        };

        if (analyser) {
            try {
                currentAudioSource = audioContext.createMediaElementSource(audio);
                currentAudioSource.connect(analyser);
                currentAudioSource.connect(audioContext.destination);
            } catch (e) {
                console.warn('Audio routing setup failed, playing directly:', e.message);
            }
        }

        audio.onended = () => {
            if (currentAudioSource) {
                try {
                    currentAudioSource.disconnect();
                } catch (e) {
                    console.debug('[voice-playback] disconnect failed (ignoring):', e.message);
                }
                currentAudioSource = null;
            }
            resolve();
        };

        audio.play().catch(err => {
            console.error('[voice-playback] audio.play() failed:', err);
            resolve();
        });
    });
}

export function getPlaybackState() {
    return { isPlayingAudio, currentAudioSource };
}

export function resetPlayback() {
    audioQueue = [];
    isPlayingAudio = false;
    if (currentAudioSource) {
        try { currentAudioSource.disconnect(); } catch (e) { console.debug('[voice-playback] reset disconnect failed:', e.message); }
        currentAudioSource = null;
    }
}
