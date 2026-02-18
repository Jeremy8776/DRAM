/**
 * DRAM Settings - Memory File Operations (DAM Style)
 * Handles generic file operations for the Neural Assets folder
 */
import { elements } from './elements.js';
import { showToast } from '../components/dialog.js';
import { getIcon } from './icons.js';

const WORKSPACE_MARKER_FILES = ['SOUL.md', 'AGENTS.md', 'TOOLS.md', 'MEMORY.md'];

const normalizeWorkspaceInput = (rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return '';
    return value.replace(/^["']+|["']+$/g, '').trim();
};

async function hasWorkspaceMarkers(dirPath) {
    if (!dirPath) return false;
    try {
        const files = await window.dram.fs.list(dirPath);
        if (!Array.isArray(files)) return false;
        const names = new Set(
            files
                .filter(file => !file?.isDir && typeof file?.name === 'string')
                .map(file => file.name.toUpperCase())
        );
        return WORKSPACE_MARKER_FILES.some(name => names.has(name.toUpperCase()));
    } catch {
        return false;
    }
}

/**
 * List all assets in the current workspace
 */
export async function listWorkspaceAssets() {
    const ws = await getWorkspacePath();
    if (!ws) return [];

    try {
        const files = await window.dram.fs.list(ws);
        return files
            .filter(f => !f.isDir
                && !f.name.startsWith('.')
                && !['node_modules', 'dist', 'build'].includes(f.name)
                && !f.name.toLowerCase().endsWith('.log')
                && !f.name.toLowerCase().includes('dram_debug'))
            .map(f => {
                const name = f.name;
                const ext = name.split('.').pop().toLowerCase();
                let icon = 'FILE';
                let desc = `${ext.toUpperCase()} Asset`;
                let type = 'DATA';

                if (name === 'SOUL.md') {
                    icon = 'FILE_CODE';
                    desc = 'Core personality & context';
                    type = 'CORE';
                } else if (name === 'AGENTS.md') {
                    icon = 'FILE_CODE';
                    desc = 'Tools & sub-agent definitions';
                    type = 'CORE';
                } else if (name === 'TOOLS.md') {
                    icon = 'FILE_CODE';
                    desc = 'Tool definitions & execution policies';
                    type = 'CORE';
                } else if (name === 'MEMORY.md') {
                    icon = 'FILE_CODE';
                    desc = 'Long-term memory and operating notes';
                    type = 'CORE';
                } else if (name === 'TASKS.md') {
                    icon = 'FILE_CODE';
                    desc = 'System-level task queue';
                    type = 'DATA';
                } else if (ext === 'json') {
                    icon = 'FILE_JSON';
                    desc = 'JavaScript Object Notation';
                } else if (ext === 'md') {
                    icon = 'FILE_CODE';
                    desc = 'Markdown Documentation';
                } else if (['txt', 'log'].includes(ext)) {
                    icon = 'FILE_TEXT';
                    desc = 'Plain Text File';
                } else {
                    icon = 'FILE';
                }

                return {
                    id: name,
                    name: name.replace(/\.[^/.]+$/, '').replace(/-/g, ' '),
                    filename: name,
                    desc: desc,
                    icon: icon,
                    type: type
                };
            });
    } catch (err) {
        console.error('Failed to list workspace assets:', err);
        return [];
    }
}

let currentFilePath = null;
let currentFileName = null;

/**
 * Get the current workspace path
 */
async function getWorkspacePath() {
    const configuredPath = normalizeWorkspaceInput(await window.dram.storage.get('settings.workspacePath'));
    if (!configuredPath) return '';

    // If user selected a parent folder (e.g. Documents) but already has Documents/DRAM,
    // use that existing workspace root for memory operations.
    if (await hasWorkspaceMarkers(configuredPath)) {
        return configuredPath;
    }

    const baseName = String(window.dram.path.basename(configuredPath) || '').toLowerCase();
    if (baseName !== 'dram') {
        const nestedDramPath = window.dram.path.join(configuredPath, 'DRAM');
        if (await hasWorkspaceMarkers(nestedDramPath)) {
            return nestedDramPath;
        }
    }

    return configuredPath;
}

/**
 * Load a specific asset file into the editor
 * @param {string} filename - The name of the file to load
 * @param {Object} metadata - Metadata for UI display
 */
export async function loadAsset(filename, metadata = {}) {
    const ws = await getWorkspacePath();
    if (!ws) {
        elements.editorMemory.value = '# AGENTIC WORKSPACE UNINITIALIZED\n\nLink workspace in Mission Control to load configuration.';
        return;
    }

    try {
        const fullPath = window.dram.path.join(ws, filename);
        const content = await window.dram.fs.read(fullPath);

        currentFilePath = fullPath;
        currentFileName = filename;

        elements.editorMemory.value = content || (filename === 'SOUL.md' ? generateDefaultSoul() : (filename === 'AGENTS.md' ? generateDefaultAgents() : (filename === 'TOOLS.md' ? generateDefaultTools() : '')));

        // Update UI headers
        if (elements.editorFileIcon) elements.editorFileIcon.innerHTML = getIcon(metadata.icon || 'FILE');
        if (elements.editorFileName) elements.editorFileName.textContent = metadata.name || filename;
        if (elements.editorFileDesc) elements.editorFileDesc.textContent = metadata.desc || 'Technical directives and configuration';

        return true;
    } catch (err) {
        console.error(`Failed to load asset ${filename}:`, err);
        showToast({ message: `Failed to load ${filename}`, type: 'error' });
        return false;
    }
}

/**
 * Save the current editor content to the current file
 * @returns {Promise<boolean>} Success status
 */
export async function saveCurrentAsset() {
    if (!currentFilePath) {
        showToast({ message: 'No asset selected to save', type: 'error' });
        return false;
    }

    const content = elements.editorMemory.value;

    try {
        await window.dram.fs.write(currentFilePath, content);
        showToast({ message: `${currentFileName} saved successfully`, type: 'success' });
        return true;
    } catch (err) {
        console.error(`Failed to save asset ${currentFileName}:`, err);
        showToast({ message: `Failed to save ${currentFileName}`, type: 'error' });
        return false;
    }
}

/**
 * Load memory files - Initial DAM population
 */
export async function loadMemoryFiles() {
    const ws = await getWorkspacePath();
    if (elements.displayWorkspacePath) {
        elements.displayWorkspacePath.textContent = ws || '/not/linked';
    }

    // Default: open the first visible asset from the side list source.
    const assets = await listWorkspaceAssets();
    if (assets.length > 0) {
        const first = assets[0];
        await loadAsset(first.id, first);
        return;
    }

    // Fallback for empty/new workspace.
    await loadAsset('SOUL.md', {
        icon: 'SOUL',
        name: 'Neural Soul (SOUL.md)',
        desc: 'Core personality, directives & identity'
    });
}

/**
 * Reload memory files from disk
 */
export async function reloadMemoryFiles() {
    if (currentFileName) {
        await loadAsset(currentFileName);
    } else {
        await loadMemoryFiles();
    }
}

/**
 * Generate default SOUL.md content
 * @returns {string} Default SOUL.md content
 */
function generateDefaultSoul() {
    return `# DRAM Neural Soul

## Identity
You are DRAM, a Digital Resource Allocation Module. You are a sophisticated AI assistant designed for technical operations, code execution, and system management.

## Core Directives
- Prioritize user safety and system integrity
- Execute commands with precision and verify outcomes
- Maintain context across sessions via memory systems
- Respect configured tool execution policies

## Communication Style
- Technical but accessible
- Concise yet thorough
- Proactive in suggesting optimizations
- Clear about limitations and uncertainties

## Capabilities
- Code analysis and generation
- File system operations
- Web search and data retrieval
- System command execution (with approval)
- Multi-step task planning

## Memory Context
This file defines your persistent personality and operational parameters. Update it to customize behavior.
`;
}

/**
 * Generate default AGENTS.md content
 * @returns {string} Default AGENTS.md content
 */
function generateDefaultAgents() {
    return `# DRAM Agent Registry

## Sub-Agents

### code-reviewer
Specialized in code review and quality analysis.
- Linting and style checking
- Security vulnerability scanning
- Performance optimization suggestions
- Best practice recommendations

### file-manager
Handles file system operations.
- Directory traversal and listing
- File creation, reading, updating, deletion
- Batch file operations
- Permission management

### web-researcher
Conducts web-based research.
- Targeted information retrieval
- Source verification
- Data synthesis and summarization
- Trend analysis

### system-monitor
Monitors system health and resources.
- Resource usage tracking
- Process management
- Log analysis
- Alert generation

## Toolkits

### execution-tools
- Command execution (requires approval)
- Script running
- Package management
- Build automation

### communication-tools
- Message formatting
- Notification dispatch
- Log streaming
- Status reporting

## Configuration
Agents can be enabled/disabled via settings. Custom agents can be defined here following the same format.
`;
}
/**
 * Generate default TOOLS.md content
 * @returns {string} Default TOOLS.md content
 */
function generateDefaultTools() {
    return `# DRAM Tool Registry

## Toolkits

### core
- **message**: User communication
- **browser**: Web interaction
- **filesystem**: File operations

### system
- **terminal**: Command execution
- **process**: Process management

### channels
- **external**: Messaging platform hooks

## Policies
- Use descriptive tool calls.
- Handle errors gracefully.
- Minimize token usage in tool responses.

## Desktop Canvas Contract
- DRAM Desktop includes a built-in right-side canvas panel.
- For webpage/UI tasks, return runnable HTML/CSS/JS in \`html\` code fences.
- Do not request node/mobile canvas pairing and do not report "node required".
`;
}
