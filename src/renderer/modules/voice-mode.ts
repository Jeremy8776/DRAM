
import { elements } from './elements.js';
import { state } from './state.js';
import { createWaveform } from './voice-waveform.js';
import { resetToastState } from './voice-toast.js';
import { queueVoiceResponse as queueVoiceResponseImported, resetPlayback, getPlaybackState } from './voice-playback.js';
import { handleRecorderStopped } from './voice-recorder.js';
import {
    setVoiceStatus,
    setVoiceTranscript,
    disconnectWaveform,
    openVoiceFullscreenUi,
    closeVoiceFullscreenUi,
    showVoiceThinkingUi,
    hideVoiceThinkingUi,
    minimizeVoiceModeUi,
    restoreVoiceModeUi,
    isVoiceModeMinimizedUi
} from './voice-ui.js';

let audioContext = null;
let analyser = null;
let microphone = null;
let highPassFilter = null;
export let isVoiceActive = false;
export const isContinuousMode = true;
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
let hasSpoken = false;
let wasSpeechSubmission = false;
let speechStart = 0;
const SILENCE_LEVEL = 14;
const SPEECH_CONFIRM_MS = 500;
const SPEECH_THRESHOLD = 28;
const AUTO_SEND_MS = 900;
const SILENCE_RESET_MS = 5000;
const USE_BROWSER_SPEECH_RECOGNITION = false;
let prolongedSilenceStart = 0;
let recognitionRestartTimer = null;
let recognitionAvailable = USE_BROWSER_SPEECH_RECOGNITION;

export function openVoiceFullscreen() {
    isFullscreen = openVoiceFullscreenUi(isVoiceActive, isFullscreen);
}

function closeVoiceFullscreen() {
    isFullscreen = closeVoiceFullscreenUi(isFullscreen);
}

export function initVoiceMode() {
    if (!elements.btnVoiceToggle) return;

    elements.btnVoiceToggle.addEventListener('click', toggleVoiceMode);
    if (elements.btnVoiceContinuous) {
        elements.btnVoiceContinuous.style.display = 'none';
    }
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
        wasSpeechSubmission = true;
        mediaRecorder.stop();
    }
}

async function activateVoiceMode() {
    try {
        const deviceId = await window.dram.storage.get('settings.audioInputDeviceId');
        const constraints = {
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true
            }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;

        isVoiceActive = true;
        document.body.classList.add('voice-active');
        if (elements.messageInput) elements.messageInput.classList.add('hidden');
        if (elements.voiceInlineUi) elements.voiceInlineUi.classList.remove('hidden');

        setVoiceStatus('Listening (Auto-send on pause)');
        setVoiceTranscript('');
        if (elements.btnVoiceToggle) elements.btnVoiceToggle.classList.add('hidden');
        if (elements.btnVoiceCancel) elements.btnVoiceCancel.classList.remove('hidden');
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = 'highpass';
        highPassFilter.frequency.value = 85;
        highPassFilter.Q.value = 0.7;

        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(highPassFilter);
        highPassFilter.connect(analyser);
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
                    recognitionAvailable = false;
                    setVoiceStatus('Listening (live preview unavailable)');
                    try { recognition.stop(); } catch { void 0; }
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
                    } catch { void 0; }
                }, 200);
            };

            recognition.start();
        }
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            const alternatives = [
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mp4',
                ''
            ];
            mimeType = alternatives.find(type => MediaRecorder.isTypeSupported(type)) || '';
        }

        console.log('Voice Mode: Recording with format:', mimeType || 'default');
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
                if (state.voiceStreamSupported === true && isVoiceActive && !getPlaybackState().isPlayingAudio) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const result = typeof reader.result === 'string' ? reader.result : '';
                        const base64data = result.includes(',') ? result.split(',')[1] : '';
                        if (!base64data) return;
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
        mediaRecorder.start(500);

        startWaveformAnimation();

        console.log('Voice Mode: Activated');
    } catch (err) {
        console.error('Voice Mode: Failed to access microphone', err);
        deactivateVoiceMode();
        alert('Microphone access denied or not available.');
    }
}

function deactivateVoiceMode() {
    isVoiceActive = false;
    document.body.classList.remove('voice-active');
    if (elements.voiceInlineUi) elements.voiceInlineUi.classList.add('hidden');
    if (elements.messageInput) elements.messageInput.classList.remove('hidden');
    resetToastState();

    if (elements.voiceOverlay) {
        elements.voiceOverlay.classList.add('hidden');
        elements.voiceOverlay.classList.remove('fullscreen');
    }
    isFullscreen = false;
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
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
    }
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

export async function queueVoiceResponse(text, onPlay = undefined) {
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

export async function playVoiceResponse(text) {
    await queueVoiceResponse(text);
}

export function showVoiceThinking() {
    showVoiceThinkingUi(isVoiceActive);
}

export function hideVoiceThinking() {
    hideVoiceThinkingUi();
}

export function minimizeVoiceMode() {
    minimizeVoiceModeUi(isVoiceActive, deactivateVoiceMode, openVoiceFullscreen);
}

export function restoreVoiceMode() {
    restoreVoiceModeUi();
}

export function isVoiceModeMinimized() {
    return isVoiceModeMinimizedUi();
}







