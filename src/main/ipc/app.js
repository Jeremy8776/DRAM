/**
 * DRAM IPC - Shell and Core Application Handlers
 */
import { shell, dialog } from 'electron';
import { execSync } from 'child_process';
import { validateString, validateUrl } from '../ipc-validation.js';

export function registerAppHandlers(ipc, secureStorage, windowManager, debugLog) {
    /**
     * Open external URL in default browser
     */
    ipc.handle('shell:openExternal', async (event, url) => {
        try {
            validateUrl(url);
            await shell.openExternal(url);
            return true;
        } catch (err) {
            console.error('shell:openExternal error:', err);
            return false;
        }
    });

    /**
     * Execute a CLI command in platform-appropriate terminal
     * Used for plugin setup that requires CLI interaction
     */
    ipc.handle('shell:executeCLI', async (event, command, options = {}) => {
        try {
            validateString(command, 500);

            // 1. Block dangerous shell characters
            const dangerousChars = [';', '&', '|', '>', '<', '`', '$', '(', ')', '\n', '\r', '\t', '"', '\''];
            if (dangerousChars.some(char => command.includes(char))) {
                throw new Error('Command contains forbidden shell characters for security reasons.');
            }

            // 2. Security: Only allow specific commands and subcommands
            const allowedCommands = ['dram', 'npm', 'npx', 'node'];
            const parts = command.trim().split(/\s+/);
            const baseCommand = parts[0];

            if (!allowedCommands.includes(baseCommand)) {
                throw new Error('Command not in allowed list. Only dram, npm, npx, node permitted.');
            }

            // 3. For npm/npx, only allow installation/updates
            if (baseCommand === 'npm' || baseCommand === 'npx') {
                const subCommand = parts[1];
                const safeSubCommands = ['install', 'i', 'update', 'up', 'list', 'ls', 'version', 'v'];
                if (!safeSubCommands.includes(subCommand)) {
                    throw new Error(`npm/npx sub-command "${subCommand}" is not permitted for security reasons.`);
                }
            }

            // 4. SEC-001: Explicit User Confirmation for shell execution
            const win = windowManager.getMainWindow();
            const { response } = await dialog.showMessageBox(win, {
                type: 'warning',
                title: 'Security Warning: Shell Execution',
                message: 'A plugin or system component is requesting to execute a terminal command.',
                detail: `Command: ${command}\n\nDo you trust this operation?`,
                buttons: ['Deny', 'Allow Execution'],
                defaultId: 0,
                cancelId: 0,
                noLink: true
            });

            if (response !== 1) {
                debugLog('[CLI] Execution denied by user:', command);
                return { ok: false, error: 'Execution denied by user' };
            }

            const { spawn } = await import('child_process');
            const platform = process.platform;
            let shellCmd, shellArgs, shellOpts;

            // Platform-specific terminal spawning
            if (platform === 'win32') {
                const usePowerShell = options.usePowerShell || false;
                if (usePowerShell) {
                    shellCmd = 'powershell.exe';
                    shellArgs = ['-Command', command];
                } else {
                    shellCmd = 'cmd.exe';
                    shellArgs = ['/c', command];
                }
                shellOpts = { windowsHide: false, detached: true };
            } else if (platform === 'darwin') {
                const useTerminal = options.useTerminal !== false;
                if (useTerminal) {
                    shellCmd = 'open';
                    shellArgs = ['-a', 'Terminal', command];
                } else {
                    shellCmd = 'bash';
                    shellArgs = ['-c', command];
                }
                shellOpts = { detached: true };
            } else {
                const terminalCmd = options.terminalCmd || detectLinuxTerminal();
                if (terminalCmd) {
                    shellCmd = terminalCmd;
                    shellArgs = ['-e', `bash -c "${command}; echo Press Enter to close...; read"`];
                } else {
                    shellCmd = 'bash';
                    shellArgs = ['-c', command];
                }
                shellOpts = { detached: true };
            }

            debugLog('[CLI] Spawning:', shellCmd, shellArgs.join(' '));
            const child = spawn(shellCmd, shellArgs, { ...shellOpts, stdio: 'ignore' });
            child.unref();

            return { ok: true, pid: child.pid, platform, shell: shellCmd };
        } catch (err) {
            console.error('shell:executeCLI error:', err);
            return { ok: false, error: err.message };
        }
    });

    /**
     * Open platform-appropriate terminal at specific directory
     */
    ipc.handle('shell:openTerminal', async (event, dirPath) => {
        try {
            validateString(dirPath, 500);

            // 0. SEC-002: Sanitize path and block shell metacharacters
            const shellMetachars = [';', '&', '|', '>', '<', '`', '$', '(', ')', '\n', '\r', '\t', '"', '\''];
            if (shellMetachars.some(char => dirPath.includes(char))) {
                throw new Error('Directory path contains forbidden shell characters.');
            }

            const { spawn } = await import('child_process');
            const platform = process.platform;

            if (platform === 'win32') {
                // Windows: Use start with properly escaped path
                spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${dirPath}"`], {
                    windowsHide: false,
                    detached: true,
                    stdio: 'ignore'
                }).unref();
            } else if (platform === 'darwin') {
                spawn('open', ['-a', 'Terminal', dirPath], { detached: true, stdio: 'ignore' }).unref();
            } else {
                const terminals = [
                    ['gnome-terminal', ['--working-directory', dirPath]],
                    ['konsole', ['--workdir', dirPath]],
                    ['xfce4-terminal', ['--working-directory', dirPath]],
                    ['xterm', ['-e', 'bash', '-lc', 'cd -- "$1" && exec bash', 'bash', dirPath]]
                ];
                let spawned = false;
                for (const [term, args] of terminals) {
                    try {
                        spawn(term, args, { detached: true, stdio: 'ignore' }).unref();
                        spawned = true;
                        break;
                    } catch { continue; }
                }
                if (!spawned) throw new Error('No supported terminal found');
            }
            return { ok: true, platform };
        } catch (err) {
            console.error('shell:openTerminal error:', err);
            return { ok: false, error: err.message };
        }
    });

    /**
     * Detect available terminal emulator on Linux systems
     * @returns {string} The first available terminal command
     */
    function detectLinuxTerminal() {
        if (process.platform !== 'linux') return null;
        const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm', 'alacritty', 'kitty', 'tilix', 'terminology'];
        for (const term of terminals) {
            try {
                execSync(`which ${term}`, { stdio: 'ignore' });
                return term;
            } catch { continue; }
        }
        return 'xterm';
    }
    /**
     * Open a new application window with optional session key
     */
    ipc.handle('app:newWindow', async (event, options = {}) => {
        try {
            await windowManager.createMainWindow(options);
            return { ok: true };
        } catch (err) {
            console.error('app:newWindow error:', err);
            return { ok: false, error: err.message };
        }
    });
}
