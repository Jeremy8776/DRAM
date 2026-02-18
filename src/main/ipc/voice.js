/**
 * DRAM IPC - Voice and Transcription Handlers
 */
import { spawn } from 'child_process';
import { dialog } from 'electron';

/**
 * Register voice-related IPC handlers
 * @param {Object} ipc - The IPC orchestrator
 * @param {Object} secureStorage - The secure storage instance
 * @param {Object} windowManager - The window manager instance
 * @param {Function} debugLog - Debug logging function
 */
export function registerVoiceHandlers(ipc, secureStorage, windowManager, debugLog) {
    /**
     * Setup local voice transcription (Whisper)
     */
    ipc.handle('util:setupLocalVoice', async () => {
        debugLog('[Voice] Setting up local voice transcription...');

        // 1. Check if whisper is already installed
        const isInstalled = await new Promise((resolve) => {
            const check = spawn('whisper', ['--version'], {
                windowsHide: true  // Hide terminal window
            });
            check.on('error', () => resolve(false));
            check.on('exit', (code) => resolve(code === 0));
        });

        if (isInstalled) {
            debugLog('[Voice] Whisper is already installed.');
            return { success: true, alreadyInstalled: true };
        }

        // 2. Ask for confirmation before installing via pip
        const mainWindow = windowManager.getMainWindow();
        const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['Cancel', 'Install (pip)'],
            defaultId: 1,
            cancelId: 0,
            title: 'DRAM - Voice Setup',
            message: 'Local voice transcription requires "openai-whisper".',
            detail: 'Would you like to install it now via pip? This may take a few minutes and requires Python to be installed on your system.'
        });

        if (response !== 1) {
            debugLog('[Voice] Local voice setup cancelled by user.');
            return { success: false, error: 'Cancelled' };
        }

        return new Promise((resolve) => {
            installWhisper(resolve);
        });

        function installWhisper(resolve) {
            debugLog('[Voice] Installing openai-whisper via pip...');

            // Use 'python -m pip' to ensure we use the correct python environment
            const child = spawn('python', ['-m', 'pip', 'install', 'openai-whisper'], {
                stdio: 'pipe',
                windowsHide: true  // Hide terminal window during installation
            });

            let output = '';
            child.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                // Periodic logging of progress
                if (text.includes('Collecting') || text.includes('Installing')) {
                    debugLog('[Voice] Pip:', text.trim());
                }
            });

            child.stderr.on('data', (data) => {
                output += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    debugLog('[Voice] Local voice setup successful.');
                    resolve({ success: true, output });
                } else {
                    debugLog('[Voice] Local voice setup failed with code:', code);
                    // Try to provide a helpful error if python is missing
                    if (output.includes('is not recognized')) {
                        resolve({
                            success: false,
                            error: 'Python not found. Please install Python 3.10+ to use local voice.',
                            output
                        });
                    } else {
                        resolve({ success: false, error: 'Installation failed', output });
                    }
                }
            });
        }
    });
}
