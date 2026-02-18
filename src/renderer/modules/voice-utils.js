/**
 * DRAM Voice Mode - Audio & Text Utilities
 * Extracted to maintain modularity and adhere to the 500-line rule.
 */

/**
 * Strip markdown formatting for TTS (so we don't say "asterisk asterisk")
 */
export function stripMarkdownForTTS(text) {
    if (!text) return '';
    return text
        // Remove bold/italic markers
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // ***bold italic***
        .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold**
        .replace(/\*(.+?)\*/g, '$1')           // *italic*
        .replace(/___(.+?)___/g, '$1')         // ___bold italic___
        .replace(/__(.+?)__/g, '$1')           // __bold__
        .replace(/_(.+?)_/g, '$1')             // _italic_
        // Remove headers
        .replace(/^#{1,6}\s+/gm, '')           // # Header
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, 'code block')
        .replace(/`([^`]+)`/g, '$1')           // `inline code`
        // Remove links but keep text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url)
        // Remove images
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1 image')
        // Remove blockquotes
        .replace(/^>\s+/gm, '')
        // Remove horizontal rules
        .replace(/^[-*_]{3,}$/gm, '')
        // Remove bullet points but keep text
        .replace(/^[\s]*[-*+]\s+/gm, '')
        // Remove numbered lists but keep text
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Clean up extra whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Convert AudioBuffer to WAV blob
 */
export function audioBufferToWav(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    // Interleave channels
    const length = audioBuffer.length * numberOfChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * bitDepth / 8, true);
    view.setUint16(32, numberOfChannels * bitDepth / 8, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write audio data
    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, channels[channel][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Convert audio blob to WAV format for better Whisper compatibility
 * @param {Blob} blob - Source audio blob
 * @param {AudioContext} audioContext - Active audio context
 */
export async function convertToWav(blob, audioContext) {
    if (!audioContext) return blob;

    // Read the blob as array buffer
    const arrayBuffer = await blob.arrayBuffer();

    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert to WAV format
    return audioBufferToWav(audioBuffer);
}
