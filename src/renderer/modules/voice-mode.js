/**
 * DRAM Voice Mode
 * Implements audio input visualization, recording, and TTS playback with waveform.
 */
import { elements } from './elements.js';
import { state } from './state.js';
import { createWaveform } from './voice-waveform.js';
import { minimizeVoice, restoreVoice, isMinimizedState, setToastVisible, resetToastState } from './voice-toast.js';
import { queueVoiceResponse as queueVoiceResponseImported, resetPlayback, getPlaybackState } from './voice-playback.js';
import { handleRecorderStopped } from './voice-recorder.js';

let audioContext = null;
let analyser = null;
let microphone = null;
let highPassFilter = null;
export let isVoiceActive = false;
export const isContinuousMode = true; // Always on by default
let animationId = null;
let mediaRecorder = null;
let activeStream = null;
let audioChunks = [];
let recognition = null;
let finalTranscript = '';
let inlineWaveform = null;
let toastWaveform = null;
let overlayWaveform = null;
let isFullscreen = false;
let silenceStart = 0;
let hasSpoken = false; // Track if user has spoken in this turn
let wasSpeechSubmission = false; // Flag to indicate this stop was for actual speech (not silence reset)
let speechStart = 0; // Track when speech started (for sustained speech detection)
const SILENCE_LEVEL = 14; // Slightly stricter gate to reduce ambient-noise triggers.
const SPEECH_CONFIRM_MS = 500; // Require stronger sustained speech before considering it intentional.
const SPEECH_THRESHOLD = 28; // Higher threshold specifically for confirming speech (vs ambient noise)
const AUTO_SEND_MS = 900; // Slightly longer pause tolerance to reduce accidental sends.
const SILENCE_RESET_MS = 5000; // Reset recording after 5 seconds of silence (prevents huge silent files)
const USE_BROWSER_SPEECH_RECOGNITION = false; // Live transcription is disabled; rely on final transcription at send time.
let prolongedSilenceStart = 0; // Track prolonged silence separately
let recognitionRestartTimer = null;
let recognitionAvailable = USE_BROWSER_SPEECH_RECOGNITION;

function setVoiceStatus(text) {
    if (elements.voiceStatusText) elements.voiceStatusText.textContent = text;
    if (elements.voiceStatus) elements.voiceStatus.textContent = text;
}

function setVoiceTranscript(text) {
    if (elements.voiceTranscriptInline) elements.voiceTranscriptInline.textContent = text;
    if (elements.voiceTranscript) elements.voiceTranscript.textContent = text;
}

function disconnectWaveform(waveform) {
    if (!waveform) return;
    try {
        const info = waveform.update(false, false, null);
        if (info?.resizeObserver) info.resizeObserver.disconnect();
    } catch (err) {
        console.debug('[voice-mode] waveform cleanup failed:', err?.message || err);
    }
}

export function openVoiceFullscreen() {
    if (!isVoiceActive || !elements.voiceOverlay) return;
    if (isFullscreen) return;
    isFullscreen = true;

    elements.voiceOverlay.classList.remove('hidden');
    elements.voiceOverlay.classList.add('fullscreen');

    if (isMinimizedState()) {
        setToastVisible(false);
    } else {
        if (elements.voiceInlineUi) elements.voiceInlineUi.classList.add('hidden');
    }
    if (elements.messageInput) elements.messageInput.classList.add('hidden');
}

function closeVoiceFullscreen() {
    if (!elements.voiceOverlay) return;
    if (!isFullscreen) return;
    isFullscreen = false;

    elements.voiceOverlay.classList.add('hidden');
    elements.voiceOverlay.classList.remove('fullscreen');

    if (isMinimizedState()) {
        setToastVisible(true);
        if (elements.messageInput) elements.messageInput.classList.remove('hidden');
    } else {
        if (elements.voiceInlineUi) elements.voiceInlineUi.classList.remove('hidden');
        if (elements.messageInput) elements.messageInput.classList.add('hidden');
    }
}

/**
 * Initialize Voice Mode Logic
 */
export function initVoiceMode() {
    if (!elements.btnVoiceToggle) return;

    elements.btnVoiceToggle.addEventListener('click', toggleVoiceMode);

    // Hide continuous mode toggle since it's always on
    if (elements.btnVoiceContinuous) {
        elements.btnVoiceContinuous.style.display = 'none';
    }

    // Use the cancel button on the inline interface
    if (elements.btnVoiceCancel) {
        elements.btnVoiceCancel.addEventListener('click', deactivateVoiceMode);
    }

    if (elements.btnVoiceOverlayClose) {
        elements.btnVoiceOverlayClose.addEventListener('click', closeVoiceFullscreen);
    }

    if (elements.voiceWaveformInline) {
        elements.voiceWaveformInline.addEventListener('click', openVoiceFullscreen);
    }

    console.log('Voice Mode: Continuous mode is always enabled');
}

async function toggleVoiceMode() {
    if (isVoiceActive) {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            stopAndSend();
        } else {
            deactivateVoiceMode();
        }
    } else {
        await activateVoiceMode();
    }
}

export function stopAndSend() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        wasSpeechSubmission = true; // Manual stop should always submit
        mediaRecorder.stop(); // This triggers handleRecordingStopped
    }
}

async function activateVoiceMode() {
    try {
        const deviceId = await window.dram.storage.get('settings.audioInputDeviceId');
        const constraints = {
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                // Enable browser/hardware audio processing for noise filtering
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true
            }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;

        isVoiceActive = true;
        document.body.classList.add('voice-active');

        // Inline UI Switch
        if (elements.messageInput) elements.messageInput.classList.add('hidden');
        if (elements.voiceInlineUi) elements.voiceInlineUi.classList.remove('hidden');

        setVoiceStatus('Listening (Auto-send on pause)');
        setVoiceTranscript('');

        // Buttons
        if (elements.btnVoiceToggle) elements.btnVoiceToggle.classList.add('hidden');
        if (elements.btnVoiceCancel) elements.btnVoiceCancel.classList.remove('hidden');

        // Setup Web Audio for Visualization
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64; // Smaller FFT for simpler wave

        // High-pass filter to cut low-frequency rumble (mic bumps, handling noise)
        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = 'highpass';
        highPassFilter.frequency.value = 85; // Cut below 85Hz (below normal speech range)
        highPassFilter.Q.value = 0.7; // Gentle rolloff

        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(highPassFilter);
        highPassFilter.connect(analyser);

        // --- Live Transcription (UI only) ---
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition && recognitionAvailable) {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            finalTranscript = '';
            recognition.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }
                setVoiceTranscript((finalTranscript + interimTranscript).trim());
            };

            recognition.onerror = (event) => {
                // 'network' = Google's speech servers unreachable (common in Electron)
                // 'not-allowed' = microphone permission denied
                // 'no-speech' = no speech detected
                const errorMessages = {
                    'network': 'Live preview unavailable (recording active)',
                    'not-allowed': 'Microphone access denied',
                    'no-speech': 'No speech detected',
                    'audio-capture': 'No microphone found',
                    'aborted': 'Recognition aborted'
                };
                const msg = errorMessages[event.error] || event.error;
                console.warn('Voice Recognition:', msg);
                if (event.error === 'network') {
                    // In some Electron builds, speech-recognition network calls can thrash.
                    // Disable live preview for this session and continue recording/transcribe flow.
                    recognitionAvailable = false;
                    setVoiceStatus('Listening (live preview unavailable)');
                    try { recognition.stop(); } catch { /* noop */ }
                    return;
                }
                if (event.error === 'not-allowed' || event.error === 'audio-capture') {
                    recognitionAvailable = false;
                }
                setVoiceStatus(msg);
            };

            recognition.onend = () => {
                if (recognitionRestartTimer) {
                    clearTimeout(recognitionRestartTimer);
                    recognitionRestartTimer = null;
                }
                if (!isVoiceActive || getPlaybackState().isPlayingAudio || !recognitionAvailable) return;
                recognitionRestartTimer = setTimeout(() => {
                    recognitionRestartTimer = null;
                    if (!isVoiceActive || !recognition || !recognitionAvailable) return;
                    try {
                        recognition.start();
                    } catch {
                        // Ignore restart races; next cycle will retry.
                    }
                }, 200);
            };

            recognition.start();
        }

        // Start Recording - try different formats for better compatibility
        let mimeType = 'audio/webm;codecs=opus';

        // Fallback to supported formats
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            const alternatives = [
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mp4',
                ''  // Use default
            ];
            mimeType = alternatives.find(type => MediaRecorder.isTypeSupported(type)) || '';
        }

        console.log('Voice Mode: Recording with format:', mimeType || 'default');
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);

                // Priority C: Stream chunks to gateway for provider-agnostic live transcription
                // Only stream if we are listening (not playing back)
                if (state.voiceStreamSupported === true && isVoiceActive && !getPlaybackState().isPlayingAudio) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64data = reader.result.split(',')[1];
                        window.dram.socket.send({
                            type: 'req',
                            id: `vstream-${Date.now()}`,
                            method: 'voice.stream',
                            params: {
                                sessionKey: state.sessionKey || 'main',
                                chunk: base64data,
                                isFinal: false
                            }
                        });
                    };
                    reader.readAsDataURL(e.data);
                }
            }
        };

        mediaRecorder.onstop = handleRecordingStopped;
        mediaRecorder.start(500); // Get chunks every 500ms for live streaming

        startWaveformAnimation();

        console.log('Voice Mode: Activated');
    } catch (err) {
        console.error('Voice Mode: Failed to access microphone', err);
        // Clean up UI if activation failed
        deactivateVoiceMode();
        alert('Microphone access denied or not available.');
    }
}

function deactivateVoiceMode() {
    isVoiceActive = false;
    document.body.classList.remove('voice-active');

    // UI Reset
    if (elements.voiceInlineUi) elements.voiceInlineUi.classList.add('hidden');
    if (elements.messageInput) elements.messageInput.classList.remove('hidden');
    resetToastState();

    if (elements.voiceOverlay) {
        elements.voiceOverlay.classList.add('hidden');
        elements.voiceOverlay.classList.remove('fullscreen');
    }
    isFullscreen = false;

    // Buttons
    if (elements.btnVoiceToggle) elements.btnVoiceToggle.classList.remove('hidden');
    if (elements.btnVoiceCancel) elements.btnVoiceCancel.classList.add('hidden');

    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    disconnectWaveform(inlineWaveform);
    disconnectWaveform(toastWaveform);
    disconnectWaveform(overlayWaveform);
    inlineWaveform = null;
    toastWaveform = null;
    overlayWaveform = null;

    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }

    if (highPassFilter) {
        highPassFilter.disconnect();
        highPassFilter = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = null; // Don't trigger send on deactivation
        mediaRecorder.stop();
    }

    // Stop all microphone tracks
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }

    if (recognition) {
        if (recognitionRestartTimer) {
            clearTimeout(recognitionRestartTimer);
            recognitionRestartTimer = null;
        }
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try { recognition.stop(); } catch (e) { console.debug('[voice-mode] recognition.stop failed:', e.message); }
        recognition = null;
    }
    finalTranscript = '';
    recognitionAvailable = USE_BROWSER_SPEECH_RECOGNITION;
    resetPlayback();

    // Notify backend to clear stream buffers
    if (state.voiceStreamSupported === true) {
        window.dram.socket.send({
            type: 'req',
            id: `vstream-deactivate-${Date.now()}`,
            method: 'voice.stream',
            params: {
                sessionKey: state.sessionKey || 'main',
                chunk: '',
                isFinal: true
            }
        });
    }

    console.log('Voice Mode: Deactivated');
}

function startWaveformAnimation() {
    const inlineCanvas = elements.voiceWaveformInline;
    if (!inlineCanvas) return;

    if (!inlineWaveform) {
        inlineWaveform = createWaveform(inlineCanvas, audioContext, analyser);
    }
    if (!inlineWaveform) return;

    const ensureToastWaveform = () => {
        if (toastWaveform) return;
        const toastCanvas = document.getElementById('voice-toast-waveform');
        if (toastCanvas) toastWaveform = createWaveform(toastCanvas, audioContext, analyser);
    };

    const ensureOverlayWaveform = () => {
        if (overlayWaveform || !elements.voiceWaveform) return;
        overlayWaveform = createWaveform(elements.voiceWaveform, audioContext, analyser);
    };

    function draw() {
        const playback = getPlaybackState();
        const isPlaying = playback.isPlayingAudio;
        const currentSource = playback.currentAudioSource;

        if (!isVoiceActive && !currentSource) {
            disconnectWaveform(inlineWaveform);
            disconnectWaveform(toastWaveform);
            disconnectWaveform(overlayWaveform);
            inlineWaveform = null;
            toastWaveform = null;
            overlayWaveform = null;
            return;
        }
        animationId = requestAnimationFrame(draw);

        const { rawEnergy } = inlineWaveform.update(isVoiceActive, isPlaying, currentSource);

        ensureToastWaveform();
        ensureOverlayWaveform();

        const toast = document.getElementById('voice-toast');
        const toastVisible = toast?.classList.contains('visible');
        if (toastVisible && toastWaveform) {
            toastWaveform.update(isVoiceActive, isPlaying, currentSource);
        }

        if (elements.voiceOverlay && !elements.voiceOverlay.classList.contains('hidden') && overlayWaveform) {
            overlayWaveform.update(isVoiceActive, isPlaying, currentSource);
        }

        // --- Continuous Mode: Silence Detection ---
        if (isVoiceActive && isContinuousMode && mediaRecorder && mediaRecorder.state === 'recording' && !isPlaying) {
            const energyValue = rawEnergy * 1000;
            const isAudioDetected = energyValue > SILENCE_LEVEL * 1.5;
            const isSpeechLevel = energyValue > SPEECH_THRESHOLD;

            if (isAudioDetected) {
                if (isSpeechLevel) {
                    if (speechStart === 0) {
                        speechStart = Date.now();
                    } else if (!hasSpoken && Date.now() - speechStart > SPEECH_CONFIRM_MS) {
                        console.log('Voice Mode: Speech confirmed');
                        hasSpoken = true;
                    }
                } else {
                    if (!(speechStart > 0 && Date.now() - speechStart < 100)) {
                        speechStart = 0;
                    }
                }
                silenceStart = 0;
                prolongedSilenceStart = 0;
            } else {
                speechStart = 0;
                if (hasSpoken) {
                    if (silenceStart === 0) {
                        silenceStart = Date.now();
                    } else if (Date.now() - silenceStart > AUTO_SEND_MS) {
                        console.log('Voice Mode: Auto-sending due to silence...');
                        wasSpeechSubmission = true;
                        stopAndSend();
                        silenceStart = 0;
                        hasSpoken = false;
                        speechStart = 0;
                    }
                } else {
                    if (prolongedSilenceStart === 0) {
                        prolongedSilenceStart = Date.now();
                    } else if (Date.now() - prolongedSilenceStart > SILENCE_RESET_MS) {
                        console.log('Voice Mode: Resetting recording (prolonged silence)');
                        wasSpeechSubmission = false;
                        if (mediaRecorder && mediaRecorder.state === 'recording') {
                            mediaRecorder.stop();
                        }
                        prolongedSilenceStart = 0;
                    }
                }
            }
        } else {
            silenceStart = 0;
            speechStart = 0;
            prolongedSilenceStart = 0;
            if (mediaRecorder?.state !== 'recording') hasSpoken = false;
        }
    }

    draw();
}

async function handleRecordingStopped() {
    await handleRecorderStopped({
        audioChunks,
        wasSpeechSubmission,
        isVoiceActive,
        finalTranscript,
        audioContext,
        mediaRecorder,
        startRecording,
        showVoiceThinking
    });
}

function startRecording() {
    if (!isVoiceActive || !mediaRecorder || mediaRecorder.state !== 'inactive') return;
    audioChunks = [];
    finalTranscript = '';
    setVoiceTranscript('');
    mediaRecorder.start(500);
}

/**
 * Queue a text segment for TTS playback.
 */
export async function queueVoiceResponse(text, onPlay) {
    await queueVoiceResponseImported(text, onPlay, {
        isVoiceActive,
        audioContext,
        analyser,
        mediaRecorder,
        updateStatus: (status) => {
            setVoiceStatus(status);
        }
    });
}

/**
 * Legacy wrapper for single-shot playback
 */
export async function playVoiceResponse(text) {
    queueVoiceResponse(text);
}

/**
 * Show thinking indicator in voice mode
 */
export function showVoiceThinking() {
    if (!isVoiceActive) return;

    // Add thinking class to voice UI for visual effect
    if (elements.voiceInlineUi) {
        elements.voiceInlineUi.classList.add('thinking');
    }
}

/**
 * Hide thinking indicator in voice mode
 */
export function hideVoiceThinking() {
    if (elements.voiceInlineUi) {
        elements.voiceInlineUi.classList.remove('thinking');
    }
}

/**
 * Minimize voice mode to floating toast (when navigating away from chat)
 */
export function minimizeVoiceMode() {
    minimizeVoice({
        isVoiceActive,
        onDeactivate: deactivateVoiceMode,
        onFullscreen: openVoiceFullscreen
    });
}

/**
 * Restore voice mode from floating toast (when returning to chat)
 */
export function restoreVoiceMode() {
    restoreVoice();
}

/**
 * Check if voice mode is minimized
 */
export function isVoiceModeMinimized() {
    return isMinimizedState();
}
