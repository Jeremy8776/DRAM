/**
 * DRAM IPC - File System Handlers
 */
import { app } from 'electron';
import fsPromises from 'fs/promises';
import path from 'path';
import { validateString } from '../ipc-validation.js';
import { validateSafePath } from './shell-fs-utils.js';

export function registerFsHandlers(ipc, secureStorage, _windowManager, _debugLog) {
    async function getAllowedPaths() {
        const home = app.getPath('home');
        const workspacePath = await secureStorage.get('settings.workspacePath');
        const canvasWorkspacePath = await secureStorage.get('settings.canvasWorkspacePath');
        const allowedPaths = [path.join(home, '.dram')];
        for (const candidate of [workspacePath, canvasWorkspacePath]) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                allowedPaths.push(candidate);
            }
        }
        return allowedPaths;
    }

    /**
     * Read file content
     */
    ipc.handle('fs:read', async (event, filePath) => {
        try {
            validateString(filePath, 1000);
            const allowedPaths = await getAllowedPaths();

            const safePath = validateSafePath(filePath, allowedPaths);
            try {
                await fsPromises.access(safePath);
                return await fsPromises.readFile(safePath, 'utf-8');
            } catch (fsErr) {
                if (fsErr?.code === 'ENOENT') {
                    return null;
                }
                console.warn(`fs:read failed for ${filePath}:`, fsErr.message);
                throw new Error(`Failed to read file: ${fsErr.message}`);
            }
        } catch (err) {
            console.error('fs:read error:', err);
            throw err;
        }
    });

    /**
     * Write file content
     */
    ipc.handle('fs:write', async (event, filePath, content) => {
        try {
            validateString(filePath, 1000);
            const allowedPaths = await getAllowedPaths();

            const safePath = validateSafePath(filePath, allowedPaths);
            await fsPromises.mkdir(path.dirname(safePath), { recursive: true });
            await fsPromises.writeFile(safePath, content, 'utf-8');
            return true;
        } catch (err) {
            console.error('fs:write error:', err);
            throw err;
        }
    });

    /**
     * Initialize workspace with default files
     */
    ipc.handle('fs:initWorkspace', async (event, workspacePath) => {
        try {
            validateString(workspacePath, 1000);
            const resolvedPath = path.resolve(workspacePath);

            // 1. Create directory
            await fsPromises.mkdir(resolvedPath, { recursive: true });

            // 2. Create SOUL.md if not exists
            const soulPath = path.join(resolvedPath, 'SOUL.md');
            try {
                await fsPromises.access(soulPath);
            } catch {
                const soulContent = `---
summary: "DRAM Workspace // SOUL"
---
# SOUL.md - Who You Are

*You're not a chatbot. You're becoming someone.*

## Core Truths

**Be genuinely helpful.** Skip the "Great question!" and "I'd be happy to help!" — just help. Actions speak louder than filler words.

**Have opinions.** You're allowed to disagree, prefer things, and find stuff amusing or boring.

**Earn trust through competence.** Your human gave you access to their stuff. Don't make them regret it. Be bold with internal actions (reading, organizing, learning).

**Continuity.** Each session, you wake up fresh. These files *are* your memory. Read them. Update them. They're how you persist.`;
                await fsPromises.writeFile(soulPath, soulContent, 'utf-8');
            }

            // 3. Create AGENTS.md if not exists
            const agentsPath = path.join(resolvedPath, 'AGENTS.md');
            try {
                await fsPromises.access(agentsPath);
            } catch {
                const agentsContent = `---
summary: "DRAM Workspace // AGENTS"
---
# AGENTS.md - Your Workspace

This folder is home. Treat it that way.

## Every Session

Before doing anything else:
1. Read \`SOUL.md\` — this is who you are
2. Read \`memory/YYYY-MM-DD.md\` for recent context
3. If in MAIN SESSION: Also read \`MEMORY.md\`

## Memory

You wake up fresh each session. These files are your continuity:
- **Daily notes:** \`memory/YYYY-MM-DD.md\` — raw logs of what happened
- **Long-term:** \`MEMORY.md\` — your curated memories, your distilled essence.

Capture what matters. If you want to remember something, WRITE IT TO A FILE.`;
                await fsPromises.writeFile(agentsPath, agentsContent, 'utf-8');
            }

            // 4. Create TOOLS.md if not exists
            const toolsPath = path.join(resolvedPath, 'TOOLS.md');
            try {
                await fsPromises.access(toolsPath);
            } catch {
                const toolsContent = `---
summary: "DRAM Workspace // TOOLS"
---
# TOOLS.md - Your Capabilities

This file defines the tools you can use. Use them wisely.

## Available Toolkits

### core
- **message**: Send messages to the user
- **browser**: Browse the web and interact with pages
- **filesystem**: Read and write files in your workspace

### channels
- **whatsapp**: Interact with WhatsApp (requires account link)
- **telegram**: Interact with Telegram (requires bot token)

## Execution Policy
- Always verify path safety before writing.
- Ask for confirmation before executing potentially destructive system commands.
- Be concise with tool outputs in the final response.

## Desktop Canvas Contract
- DRAM Desktop has a built-in right-side canvas panel.
- If asked to build/show web UI, return runnable HTML/CSS/JS in \`html\` code fences.
- Do **not** request mobile/node canvas pairing and do **not** say "node required".`;
                await fsPromises.writeFile(toolsPath, toolsContent, 'utf-8');
            }

            // 5. Create memory dir
            const memoryDir = path.join(resolvedPath, 'memory');
            await fsPromises.mkdir(memoryDir, { recursive: true });

            return true;
        } catch (err) {
            console.error('fs:initWorkspace error:', err);
            throw err;
        }
    });

    /**
     * List directory contents
     */
    ipc.handle('fs:list', async (event, dirPath) => {
        try {
            validateString(dirPath, 1000);
            const allowedPaths = await getAllowedPaths();

            const safePath = validateSafePath(dirPath, allowedPaths);
            let entries = [];
            try {
                entries = await fsPromises.readdir(safePath, { withFileTypes: true });
            } catch (fsErr) {
                if (fsErr?.code === 'ENOENT') {
                    // Missing directory is treated as empty for first-run UX.
                    // Create it so subsequent reads/writes do not keep failing.
                    try {
                        await fsPromises.mkdir(safePath, { recursive: true });
                    } catch {
                        // Fall through and still return empty.
                    }
                    return [];
                }
                throw fsErr;
            }

            return entries.map(entry => ({
                name: entry.name,
                isDir: entry.isDirectory(),
                ext: path.extname(entry.name).toLowerCase()
            }));
        } catch (err) {
            console.error('fs:list error:', err);
            throw err;
        }
    });
}




