/**
 * DRAM Streaming TTS Handler
 * Manages buffering chunks of text and queuing them for voice output.
 */
let ttsBuffer = '';

/**
 * Resets the TTS buffer. Called on new requests or errors.
 */
export function resetTtsBuffer() {
    ttsBuffer = '';
}

/**
 * Processes a chunk of text for streaming TTS.
 * Buffers text until a sentence delimiter is found, then queues for voice response.
 * @param {string} content - The text chunk to process.
 * @param {boolean} isFinal - Whether this is the final chunk.
 */
export async function processTtsStreaming(content, isFinal = false, onSentenceReady = null) {
    if (!content && !isFinal) return;

    // Helper to queue with callback
    const queue = async (text) => {
        const { queueVoiceResponse } = await import('./voice-mode.js');
        queueVoiceResponse(text.trim(), (meta) => {
            // Pass back to socket/renderer when playing
            if (onSentenceReady) onSentenceReady(text, meta);
        });
    };

    if (content) {
        ttsBuffer += content;
        // Check for sentence delimiters (. ? ! \n)
        // Simple approach: Split on punctuation followed by space or end
        const sentenceMatch = ttsBuffer.match(/.*?[.!?](\s+|$)/);

        if (sentenceMatch) {
            const sentence = sentenceMatch[0];
            const rest = ttsBuffer.slice(sentence.length);

            // Send sentence to voice queue
            await queue(sentence);

            ttsBuffer = rest;
        }
    }

    if (isFinal && ttsBuffer.trim().length > 0) {
        await queue(ttsBuffer);
        ttsBuffer = '';
    }
}
