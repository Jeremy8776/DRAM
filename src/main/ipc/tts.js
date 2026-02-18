/**
 * DRAM IPC - TTS Handlers
 */
import fsPromises from 'fs/promises';
import { validateString } from '../ipc-validation.js';

export function registerTtsHandlers(ipc, internalRequest) {
    /**
     * Generate TTS for text
     * Returns audio as data URI for security and simplicity
     */
    ipc.handle('util:generateTTS', async (_event, text, options) => {
        try {
            validateString(text, 100000);

            const params = { text };
            if (options && typeof options === 'object') {
                if (options.voice) params.voice = options.voice;
                if (options.provider) params.provider = options.provider;
            }

            console.log(`[ipc:tts] generateTTS called with params=${JSON.stringify(params)}`);
            const response = await internalRequest('tts.convert', params);
            console.log(`[ipc:tts] generateTTS response.ok=${response.ok}, provider=${response.data?.provider}`);

            if (response.ok && response.data?.audioPath) {
                const audioPath = response.data.audioPath;
                const buffer = await fsPromises.readFile(audioPath);
                const base64 = buffer.toString('base64');
                const mimeType = audioPath.endsWith('.mp3') ? 'audio/mpeg' :
                    audioPath.endsWith('.wav') ? 'audio/wav' :
                        'audio/webm';

                return {
                    success: true,
                    dataUri: `data:${mimeType};base64,${base64}`,
                    provider: response.data.provider
                };
            }

            return { success: false, error: response.error?.message || 'TTS failed' };
        } catch (err) {
            console.error('util:generateTTS error:', err);
            return { success: false, error: err.message };
        }
    });

    /**
     * Set TTS provider (updates prefs file)
     */
    ipc.handle('util:setTtsProvider', async (_event, provider) => {
        try {
            validateString(provider, 20);
            const response = await internalRequest('tts.setProvider', { provider });
            return { success: response.ok, provider, error: response.error?.message };
        } catch (err) {
            console.error('util:setTtsProvider error:', err);
            return { success: false, error: err.message };
        }
    });
}
