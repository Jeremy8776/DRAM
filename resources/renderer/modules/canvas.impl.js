/**
 * DRAM Desktop - Canvas Panel Module
 * Manages the slide-out Canvas panel for A2UI content and local file iterations.
 */

import { showToast } from '../../../src/renderer/components/dialog.js';
import { state } from '../../../src/renderer/modules/state.js';

const CHAT_CANVAS_FILE_KEY = '__canvas_chat_output__';
const CHAT_CANVAS_FILE_LABEL = 'Chat Canvas Output';
const MAX_SCAN_FILES = 2000;
const MAX_VERSIONS_PER_FILE = 50;
const SKIPPED_DIRECTORIES = new Set([
    '.git',
    '.hg',
    '.svn',
    'node_modules',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    '.cache',
    '.turbo',
    '.idea',
    '.vscode',
    'coverage',
    'tmp',
    'temp'
]);
const CODE_EXTENSIONS = new Set([
    '.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.hh',
    '.cs', '.go', '.java', '.kt', '.kts', '.swift', '.rs',
    '.py', '.rb', '.php', '.sh', '.bash', '.zsh', '.fish', '.ps1',
    '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
    '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.env', '.conf',
    '.css', '.scss', '.sass', '.less',
    '.html', '.htm', '.xml', '.svg', '.md', '.txt',
    '.sql', '.graphql', '.gql', '.proto'
]);
const CODE_FILENAMES = new Set([
    'dockerfile',
    'makefile',
    'cmakelists.txt',
    'readme',
    'license',
    '.gitignore',
    '.npmrc',
    '.eslintrc',
    '.prettierrc',
    '.editorconfig'
]);
const HTML_EXTENSIONS = new Set(['.html', '.htm', '.svg', '.xml']);
const DRAM_CANVAS_CONTEXT_TAG = '[DRAM_CANVAS_FILE_CONTEXT]';
const DRAM_CANVAS_CONTEXT_END_TAG = '[/DRAM_CANVAS_FILE_CONTEXT]';
const DEFAULT_PROMPT_CONTEXT_MAX_CHARS = 12000;
const MAX_UPLOAD_HISTORY_PER_SESSION = 80;
const LANGUAGE_BY_EXTENSION = {
    '.py': 'python',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.jsonc': 'json',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'scss',
    '.html': 'html',
    '.htm': 'html',
    '.xml': 'xml',
    '.svg': 'xml',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.fish': 'bash',
    '.ps1': 'powershell',
    '.go': 'go',
    '.java': 'java',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.php': 'php',
    '.sql': 'sql',
    '.md': 'markdown',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.toml': 'toml',
    '.ini': 'ini',
    '.env': 'ini',
    '.txt': 'text'
};
const WINDOWS_RESERVED_NAMES = new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9'
]);

// Canvas state
export const canvasState = {
    isOpen: false,
    isLoaded: false,
    hasContent: false,
    url: null,
    remoteUrl: null,
    remoteAvailable: false,
    remoteA2uiPushSupported: null,
    runtimeMode: 'idle',
    wsConnected: false,
    engineCanvasFeatureAvailable: null,
    localContentUrl: null,
    localContentDocument: null,
    localScriptUrls: [],
    ws: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    loadAttempts: 0,
    maxLoadAttempts: 8,
    width: 50, // percentage
    workspacePath: null,
    files: [],
    versionsByFile: {},
    selectedFileKey: null,
    selectedVersionId: null,
    currentContent: '',
    currentRenderMode: 'html',
    preferredHtmlViewMode: 'render',
    uploadHistoryBySession: {},
    sessionSyncBound: false
};

function getPathApi() {
    return window?.dram?.path || {
        join: (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
        dirname: (value) => String(value || '').replace(/[\\/][^\\/]*$/, '') || '/',
        basename: (value) => String(value || '').split(/[\\/]/).pop() || '',
        extname: (value) => {
            const base = String(value || '').split(/[\\/]/).pop() || '';
            const idx = base.lastIndexOf('.');
            return idx > 0 ? base.slice(idx) : '';
        },
        normalize: (value) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/')
    };
}

function isWindowsPlatform() {
    return String(window?.dram?.platform || '').toLowerCase() === 'win32';
}

function normalizePathValue(value) {
    const pathApi = getPathApi();
    return pathApi.normalize(String(value || '')).replace(/\\/g, '/');
}

function normalizePathForCompare(value) {
    const normalized = normalizePathValue(value);
    return isWindowsPlatform() ? normalized.toLowerCase() : normalized;
}

function normalizeRelativeInput(value) {
    let normalized = String(value || '').trim().replace(/\\/g, '/');
    normalized = normalized.replace(/^\/+/, '').replace(/\/+/g, '/');
    if (!normalized || normalized === '.') return '';
    const parts = normalized.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..')) return '';
    return parts.join('/');
}

function joinPath(basePath, relativePath) {
    const pathApi = getPathApi();
    const relative = normalizeRelativeInput(relativePath);
    if (!relative) return basePath;
    return relative.split('/').reduce((acc, segment) => pathApi.join(acc, segment), basePath);
}

function fileKeyFromPath(filePath) {
    return normalizePathForCompare(filePath);
}

function getFileEntry(fileKey) {
    return canvasState.files.find((file) => file.key === fileKey) || null;
}

function toRelativePath(filePath, workspacePath) {
    const fileNorm = normalizePathForCompare(filePath);
    const workspaceNorm = normalizePathForCompare(workspacePath);
    const fileDisplay = normalizePathValue(filePath);
    const workspaceDisplay = normalizePathValue(workspacePath).replace(/\/$/, '');
    const workspacePrefix = workspaceNorm.endsWith('/') ? workspaceNorm : `${workspaceNorm}/`;
    if (fileNorm === workspaceNorm) {
        return getPathApi().basename(fileDisplay);
    }
    if (fileNorm.startsWith(workspacePrefix)) {
        return fileDisplay.slice(workspaceDisplay.length + 1);
    }
    return getPathApi().basename(fileDisplay);
}

function shouldIncludeFile(entry) {
    const name = String(entry?.name || '');
    const ext = String(entry?.ext || '').toLowerCase();
    if (!name || name.startsWith('.#')) return false;
    if (name.startsWith('.') && !CODE_FILENAMES.has(name.toLowerCase())) return false;
    if (CODE_EXTENSIONS.has(ext)) return true;
    return CODE_FILENAMES.has(name.toLowerCase());
}

function shouldSkipDirectory(name) {
    if (!name) return true;
    return SKIPPED_DIRECTORIES.has(String(name).toLowerCase());
}

function nowIso() {
    return new Date().toISOString();
}

function formatTimestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getCurrentSessionUploadKey() {
    return String(state.sessionKey || state.currentSessionId || 'main');
}

function getUploadHistoryForSession(sessionKey = getCurrentSessionUploadKey()) {
    const key = String(sessionKey || 'main');
    const history = canvasState.uploadHistoryBySession[key];
    return Array.isArray(history) ? history : [];
}

function setUploadHistoryForSession(sessionKey, history) {
    const key = String(sessionKey || 'main');
    canvasState.uploadHistoryBySession[key] = Array.isArray(history) ? history : [];
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function detectLanguageFromFilePath(filePath) {
    const ext = String(getPathApi().extname(filePath) || '').toLowerCase();
    return LANGUAGE_BY_EXTENSION[ext] || '';
}

function normalizeLanguageTag(language) {
    const lower = String(language || '').trim().toLowerCase();
    if (!lower) return 'text';
    if (lower === 'py') return 'python';
    if (lower === 'js') return 'javascript';
    if (lower === 'ts') return 'typescript';
    if (lower === 'sh' || lower === 'shell') return 'bash';
    if (lower === 'ps' || lower === 'powershell') return 'powershell';
    if (lower === 'yml') return 'yaml';
    return lower;
}

function detectLanguage(filePath, content = '') {
    const byPath = detectLanguageFromFilePath(filePath);
    if (byPath) return byPath;

    const sample = String(content || '').trim().slice(0, 300).toLowerCase();
    if (!sample) return 'text';
    if (sample.startsWith('<!doctype html') || sample.startsWith('<html')) return 'html';
    if (sample.includes('import ') && sample.includes(' from ') && sample.includes('function')) return 'javascript';
    if (sample.includes('def ') || sample.includes('import ') && sample.includes('print(')) return 'python';
    if (sample.startsWith('{') || sample.startsWith('[')) return 'json';
    return 'text';
}

const KEYWORDS_BY_LANGUAGE = {
    python: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'return', 'import', 'from', 'as', 'with', 'lambda', 'yield', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'pass', 'break', 'continue'],
    javascript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'return', 'import', 'from', 'export', 'default', 'class', 'extends', 'new', 'this', 'try', 'catch', 'finally', 'throw', 'await', 'async', 'typeof', 'instanceof', 'null', 'true', 'false'],
    typescript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'return', 'import', 'from', 'export', 'default', 'class', 'extends', 'new', 'this', 'try', 'catch', 'finally', 'throw', 'await', 'async', 'typeof', 'instanceof', 'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected', 'readonly', 'null', 'true', 'false'],
    bash: ['if', 'then', 'else', 'fi', 'for', 'in', 'do', 'done', 'case', 'esac', 'function', 'local', 'export', 'return', 'while'],
    powershell: ['function', 'param', 'if', 'else', 'foreach', 'for', 'while', 'switch', 'return', 'try', 'catch', 'finally', '$true', '$false', '$null'],
    go: ['package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'return', 'defer', 'go', 'chan', 'map'],
    java: ['class', 'interface', 'enum', 'public', 'private', 'protected', 'static', 'final', 'void', 'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'return', 'new', 'import', 'package', 'try', 'catch', 'finally', 'throws'],
    rust: ['fn', 'let', 'mut', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'if', 'else', 'for', 'while', 'loop', 'match', 'return', 'Self', 'self', 'crate'],
    ruby: ['def', 'class', 'module', 'if', 'elsif', 'else', 'end', 'do', 'while', 'until', 'for', 'in', 'begin', 'rescue', 'ensure', 'return', 'yield', 'true', 'false', 'nil'],
    php: ['function', 'class', 'public', 'private', 'protected', 'if', 'else', 'elseif', 'for', 'foreach', 'while', 'switch', 'case', 'default', 'return', 'new', 'use', 'namespace', 'true', 'false', 'null'],
    sql: ['select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer', 'on', 'insert', 'into', 'update', 'delete', 'create', 'table', 'index', 'and', 'or', 'not', 'group', 'by', 'order', 'limit', 'having']
};
const STRING_PATTERN = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
const FUNCTION_PATTERN = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?=\()/g;
const NUMBER_PATTERN = /\b(\d+(?:\.\d+)?)\b/g;
const OPERATOR_PATTERN = /(=>|==={0,1}|!==|<=|>=|\+\+|--|&&|\|\||[+*/%=<>!-]+)/g;

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightCodeLine(line, language = 'text') {
    const normalized = normalizeLanguageTag(language);
    const keywords = KEYWORDS_BY_LANGUAGE[normalized] || [];
    const stash = [];
    const hold = (html) => {
        const key = `__TOK_${stash.length}__`;
        stash.push(html);
        return key;
    };
    const release = (value) => value.replace(/__TOK_(\d+)__/g, (_match, idx) => stash[Number(idx)] || '');

    let html = escapeHtml(line);

    html = html.replace(STRING_PATTERN, (match) => hold(`<span class="tok-str">${match}</span>`));
    if (normalized === 'python' || normalized === 'bash' || normalized === 'powershell') {
        html = html.replace(/(#.*)$/g, (match) => hold(`<span class="tok-com">${match}</span>`));
    } else if (normalized === 'javascript' || normalized === 'typescript' || normalized === 'go' || normalized === 'java' || normalized === 'rust' || normalized === 'php') {
        html = html.replace(/(\/\/.*)$/g, (match) => hold(`<span class="tok-com">${match}</span>`));
    } else if (normalized === 'sql') {
        html = html.replace(/(--.*)$/g, (match) => hold(`<span class="tok-com">${match}</span>`));
    }

    if (keywords.length > 0) {
        const keywordRegex = new RegExp(`\\b(${keywords.map(escapeRegex).join('|')})\\b`, normalized === 'sql' ? 'gi' : 'g');
        html = html.replace(keywordRegex, '<span class="tok-kw">$1</span>');
    }
    if (!['json', 'html', 'xml', 'yaml', 'toml', 'ini'].includes(normalized)) {
        html = html.replace(FUNCTION_PATTERN, '<span class="tok-fn">$1</span>');
    }
    html = html.replace(NUMBER_PATTERN, '<span class="tok-num">$1</span>');
    html = html.replace(OPERATOR_PATTERN, '<span class="tok-op">$1</span>');

    return release(html);
}

function buildHighlightedCodeLines(content, language = 'text') {
    const normalized = normalizeLanguageTag(language);
    const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
    return lines.map((line, idx) => {
        const highlighted = highlightCodeLine(line, normalized) || '&nbsp;';
        return `<div class="code-line"><span class="ln">${idx + 1}</span><span class="lc">${highlighted}</span></div>`;
    }).join('');
}

function buildCodePreviewDocument(content, title, language = 'text') {
    const safeTitle = escapeHtml(title || 'Code Preview');
    const normalizedLanguage = normalizeLanguageTag(language);
    const safeLanguage = escapeHtml(normalizedLanguage);
    const lineMarkup = buildHighlightedCodeLines(content, normalizedLanguage);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
:root{color-scheme:dark}
html,body{height:100%;margin:0;background:#0b0b0d;color:#e6e6ec;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.wrap{display:flex;flex-direction:column;height:100%}
.head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #26262b;color:#a5a8b6;font-size:12px;letter-spacing:.03em}
.lang{padding:2px 7px;border:1px solid #3a3a44;border-radius:999px;font-size:11px;color:#c8cad8}
.viewer{margin:0;flex:1;overflow:auto;padding:14px 0}
.viewer{scrollbar-width:thin;scrollbar-color:rgba(124,58,237,.62) transparent}
.viewer::-webkit-scrollbar{width:10px;height:10px}
.viewer::-webkit-scrollbar-track{background:transparent}
.viewer::-webkit-scrollbar-thumb{background:rgba(124,58,237,.62);border-radius:999px;border:2px solid transparent;background-clip:content-box}
.viewer::-webkit-scrollbar-thumb:hover{background:rgba(124,58,237,.84);background-clip:content-box}
.code-line{display:grid;grid-template-columns:56px minmax(0,1fr);gap:0;line-height:1.52;font-size:13px}
.ln{display:block;padding:0 12px 0 0;text-align:right;color:#656b7c;user-select:none;border-right:1px solid #1f2330;margin-right:12px}
.lc{display:block;white-space:pre;word-break:normal}
.tok-kw{color:#c792ea;font-weight:600}
.tok-str{color:#ecc48d}
.tok-num{color:#f78c6c}
.tok-com{color:#6a9955}
.tok-fn{color:#82aaff}
.tok-op{color:#89ddff}
</style>
</head>
<body>
<div class="wrap">
  <div class="head"><span>${safeTitle}</span><span class="lang">${safeLanguage}</span></div>
  <div class="viewer">${lineMarkup}</div>
</div>
</body>
</html>`;
}

function detectRenderMode(filePath, content) {
    const ext = String(getPathApi().extname(filePath) || '').toLowerCase();
    if (HTML_EXTENSIONS.has(ext)) return 'html';
    const sample = String(content || '').trim().slice(0, 400).toLowerCase();
    if (sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.startsWith('<svg')) {
        return 'html';
    }
    return 'code';
}

function updatePanelContentState(hasContent) {
    canvasState.hasContent = !!hasContent;
    const panel = document.getElementById('canvas-panel');
    if (panel) panel.classList.toggle('has-content', !!hasContent);
    const emptyState = document.getElementById('canvas-empty-state');
    if (emptyState) {
        emptyState.classList.toggle('hidden', !!hasContent);
    }
}

function renderWorkspacePath() {
    const pathEl = document.getElementById('canvas-workspace-path');
    if (!pathEl) return;
    const value = canvasState.workspacePath || 'No folder selected';
    pathEl.textContent = value;
    pathEl.title = value;
}

function getCanvasRuntimeLabel() {
    if (canvasState.runtimeMode === 'local') return 'Local Preview';
    if (canvasState.runtimeMode === 'remote') return canvasState.wsConnected ? 'Gateway Live' : 'Gateway';
    if (canvasState.remoteUrl) return 'Gateway Ready';
    return 'Idle';
}

function renderCanvasControlState() {
    const badge = document.getElementById('canvas-runtime-badge');
    if (badge) {
        const label = getCanvasRuntimeLabel();
        badge.textContent = label;
        const details = [
            `mode=${canvasState.runtimeMode || 'idle'}`,
            `ws=${canvasState.wsConnected ? 'connected' : 'disconnected'}`,
            `remote=${canvasState.remoteUrl ? 'available' : 'unavailable'}`,
            `feature=${canvasState.engineCanvasFeatureAvailable === null ? 'unknown' : (canvasState.engineCanvasFeatureAvailable ? 'enabled' : 'disabled')}`,
            `a2ui-push=${canvasState.remoteA2uiPushSupported === null ? 'unknown' : (canvasState.remoteA2uiPushSupported ? 'enabled' : 'unsupported')}`
        ];
        badge.title = `Canvas runtime: ${details.join(' | ')}`;
    }

    const popoutBtn = document.getElementById('btn-canvas-popout');
    if (popoutBtn) {
        const canOpen = Boolean(canvasState.remoteUrl);
        popoutBtn.disabled = !canOpen;
        popoutBtn.title = canOpen
            ? 'Open Gateway Canvas in Browser'
            : 'Gateway Canvas URL unavailable';
    }

    const reloadBtn = document.getElementById('btn-canvas-reload');
    if (reloadBtn) {
        const canReload = Boolean(canvasState.localContentDocument || canvasState.localContentUrl || canvasState.remoteUrl || canvasState.url);
        reloadBtn.disabled = !canReload;
    }

    const snapshotBtn = document.getElementById('btn-canvas-snapshot');
    if (snapshotBtn) {
        snapshotBtn.disabled = !canvasState.isLoaded && !canvasState.remoteUrl;
    }
}

function getVersionList(fileKey) {
    const list = canvasState.versionsByFile[fileKey];
    return Array.isArray(list) ? list : [];
}

function setVersionList(fileKey, list) {
    canvasState.versionsByFile[fileKey] = Array.isArray(list) ? list : [];
}

function ensureChatFileEntry() {
    const existing = getFileEntry(CHAT_CANVAS_FILE_KEY);
    if (existing) return existing;
    const entry = {
        key: CHAT_CANVAS_FILE_KEY,
        path: CHAT_CANVAS_FILE_KEY,
        relativePath: CHAT_CANVAS_FILE_LABEL,
        label: CHAT_CANVAS_FILE_LABEL,
        isVirtual: true
    };
    canvasState.files = [entry, ...canvasState.files];
    renderFileList();
    return entry;
}

function sortFileEntries(files) {
    return [...files].sort((a, b) => {
        if (!!a.isVirtual !== !!b.isVirtual) return a.isVirtual ? -1 : 1;
        return String(a.relativePath || a.label || '').localeCompare(String(b.relativePath || b.label || ''));
    });
}

function upsertFileEntry(entry) {
    const next = { ...entry };
    const index = canvasState.files.findIndex((file) => file.key === next.key);
    if (index >= 0) {
        canvasState.files[index] = { ...canvasState.files[index], ...next };
    } else {
        canvasState.files.push(next);
        canvasState.files = sortFileEntries(canvasState.files);
    }
    renderFileList();
    return canvasState.files.find((file) => file.key === next.key) || next;
}

function addVersionForFile(fileKey, {
    content = '',
    renderMode = 'html',
    language = 'text',
    source = 'generated',
    activate = true,
    allowDuplicate = false
} = {}) {
    const versions = [...getVersionList(fileKey)];
    const last = versions[versions.length - 1];
    if (!allowDuplicate && last && last.content === content && last.renderMode === renderMode) {
        if (activate) {
            activateVersion(fileKey, last.id);
        }
        return last;
    }

    const version = {
        id: `ver-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        label: `v${versions.length + 1}`,
        content,
        renderMode,
        language: normalizeLanguageTag(language),
        source,
        createdAt: nowIso()
    };
    versions.push(version);
    if (versions.length > MAX_VERSIONS_PER_FILE) {
        versions.splice(0, versions.length - MAX_VERSIONS_PER_FILE);
        versions.forEach((item, idx) => {
            item.label = `v${idx + 1}`;
        });
    }
    setVersionList(fileKey, versions);

    if (activate) {
        activateVersion(fileKey, version.id);
    } else {
        renderVersionList();
    }
    return version;
}

function setCurrentCanvasContent(content, renderMode = 'html') {
    canvasState.currentContent = String(content || '');
    canvasState.currentRenderMode = renderMode;
}

function hasCanvasEditIntent(userText = '', fileEntry = null) {
    const value = String(userText || '').trim().toLowerCase();
    if (!value) return false;

    const directActionIntent = /\b(edit|modify|refactor|rewrite|fix|update|change|improve|patch|implement|debug|review|explain|analy[sz]e|continue|extend|add|remove|rename)\b/.test(value);
    if (directActionIntent) return true;

    const selectedFileSignals = /\b(this|that|it|here|selected|current)\b/.test(value)
        && /\b(file|code|function|class|component|module|canvas|version|iteration)\b/.test(value);
    if (selectedFileSignals) return true;

    if (fileEntry) {
        const pathNeedles = [
            fileEntry.relativePath,
            fileEntry.label,
            fileEntry.path
        ]
            .map((item) => String(item || '').toLowerCase())
            .filter(Boolean);
        if (pathNeedles.some((needle) => value.includes(needle))) {
            return true;
        }
    }

    return false;
}

function sanitizeSessionProjectName(name) {
    let cleaned = String(name || '')
        .replace(/[<>:"/\\|?*]/g, ' ')
        .split('')
        .map((char) => (char.charCodeAt(0) < 32 ? ' ' : char))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');
    if (!cleaned) cleaned = 'Untitled Project';
    if (WINDOWS_RESERVED_NAMES.has(cleaned.toUpperCase())) {
        cleaned = `${cleaned} Project`;
    }
    return cleaned;
}

function getCurrentSessionProjectName() {
    const currentSessionId = String(state.currentSessionId || 'main');
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const currentSession = sessions.find((session) => String(session?.id || '') === currentSessionId);
    const rawName = String(currentSession?.name || '').trim();
    return sanitizeSessionProjectName(rawName || `Project ${currentSessionId}`);
}

async function resolveDefaultCanvasWorkspacePath() {
    try {
        const documentsPath = String(await window.dram.app.getPath('documents') || '').trim();
        if (!documentsPath) return '';
        const projectName = getCurrentSessionProjectName();
        return getPathApi().join(documentsPath, 'DRAM', 'project', projectName);
    } catch (err) {
        console.warn('[Canvas] Failed to resolve default project path:', err?.message || err);
        return '';
    }
}

function getActiveCanvasContextRecord(userText = '') {
    const selectedFileKey = canvasState.selectedFileKey;
    if (!selectedFileKey) return null;

    const fileEntry = getFileEntry(selectedFileKey);
    if (!fileEntry) return null;

    const versions = getVersionList(selectedFileKey);
    if (!versions.length) return null;

    const selectedVersion = versions.find((entry) => entry.id === canvasState.selectedVersionId) || versions[versions.length - 1];
    if (!selectedVersion) return null;

    if (!hasCanvasEditIntent(userText, fileEntry)) return null;

    return { fileEntry, selectedVersion };
}

function isRenderableVersion(version) {
    return Boolean(version && version.renderMode === 'html');
}

function getSelectedVersionRecord() {
    const fileKey = canvasState.selectedFileKey;
    if (!fileKey) return null;
    const fileEntry = getFileEntry(fileKey);
    if (!fileEntry) return null;
    const versions = getVersionList(fileKey);
    if (!versions.length) return null;
    const version = versions.find((entry) => entry.id === canvasState.selectedVersionId) || versions[versions.length - 1];
    if (!version) return null;
    return { fileEntry, version };
}

function resolveCanvasViewMode(version, preferredMode = null) {
    if (!isRenderableVersion(version)) return 'code';
    const candidate = String(preferredMode || canvasState.preferredHtmlViewMode || 'render').toLowerCase();
    return candidate === 'code' ? 'code' : 'render';
}

function renderCanvasViewToggle(version = null, activeMode = 'code') {
    const toggle = document.getElementById('canvas-view-toggle');
    const renderBtn = document.getElementById('btn-canvas-view-render');
    const codeBtn = document.getElementById('btn-canvas-view-code');
    if (!toggle || !renderBtn || !codeBtn) return;

    const canRender = isRenderableVersion(version);
    toggle.classList.toggle('hidden', !canRender);

    if (!canRender) {
        renderBtn.classList.remove('active');
        codeBtn.classList.remove('active');
        return;
    }

    const mode = activeMode === 'code' ? 'code' : 'render';
    renderBtn.classList.toggle('active', mode === 'render');
    codeBtn.classList.toggle('active', mode === 'code');
}

function renderVersionInFrame(fileEntry, version, preferredMode = null) {
    const viewMode = resolveCanvasViewMode(version, preferredMode);
    setCurrentCanvasContent(version.content, viewMode);

    if (viewMode === 'render') {
        showHtmlInFrame(version.content);
    } else {
        const label = fileEntry?.relativePath || fileEntry?.label || 'Code Preview';
        showCodeInFrame(version.content, label, version.language);
    }

    renderCanvasViewToggle(version, viewMode);
}

function switchCanvasView(mode) {
    const normalized = String(mode || '').toLowerCase();
    if (normalized !== 'code' && normalized !== 'render') return;

    const selected = getSelectedVersionRecord();
    if (!selected) return;
    const { fileEntry, version } = selected;
    if (normalized === 'render' && !isRenderableVersion(version)) return;

    canvasState.preferredHtmlViewMode = normalized;
    renderVersionInFrame(fileEntry, version, normalized);
    updatePanelContentState(true);
}

function activateVersion(fileKey, versionId) {
    const versions = getVersionList(fileKey);
    const version = versions.find((item) => item.id === versionId);
    if (!version) return;

    const fileEntry = getFileEntry(fileKey);
    canvasState.selectedFileKey = fileKey;
    canvasState.selectedVersionId = version.id;
    renderVersionInFrame(fileEntry, version);

    updatePanelContentState(true);
    renderFileList();
    renderVersionList();
}

function renderFileList() {
    const container = document.getElementById('canvas-file-list');
    if (!container) return;
    container.innerHTML = '';

    if (!canvasState.files.length) {
        const hint = document.createElement('div');
        hint.className = 'canvas-empty-hint';
        hint.textContent = 'Select a folder to browse files.';
        container.appendChild(hint);
        return;
    }

    for (const file of canvasState.files) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `canvas-nav-item${canvasState.selectedFileKey === file.key ? ' active' : ''}`;
        const label = document.createElement('span');
        label.className = 'canvas-nav-label';
        label.textContent = file.relativePath || file.label || file.path;
        item.appendChild(label);

        const meta = document.createElement('span');
        meta.className = 'canvas-nav-meta';
        if (file.isVirtual) {
            meta.textContent = 'virtual';
        } else {
            const ext = String(getPathApi().extname(file.path || '') || '').toLowerCase();
            meta.textContent = ext || 'file';
        }
        item.appendChild(meta);

        item.addEventListener('click', () => {
            void selectCanvasFile(file.key);
        });

        container.appendChild(item);
    }
}

function renderVersionList() {
    const container = document.getElementById('canvas-version-list');
    if (!container) return;
    container.innerHTML = '';

    if (!canvasState.selectedFileKey) {
        const hint = document.createElement('div');
        hint.className = 'canvas-empty-hint';
        hint.textContent = 'Select a file to view versions.';
        container.appendChild(hint);
        renderCanvasViewToggle(null, 'code');
        return;
    }

    const versions = getVersionList(canvasState.selectedFileKey);
    if (!versions.length) {
        const hint = document.createElement('div');
        hint.className = 'canvas-empty-hint';
        hint.textContent = 'No versions yet.';
        container.appendChild(hint);
        renderCanvasViewToggle(null, 'code');
        return;
    }

    for (let i = versions.length - 1; i >= 0; i--) {
        const version = versions[i];
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `canvas-nav-item${canvasState.selectedVersionId === version.id ? ' active' : ''}`;

        const label = document.createElement('span');
        label.className = 'canvas-nav-label';
        label.textContent = version.label;
        item.appendChild(label);

        const meta = document.createElement('span');
        meta.className = 'canvas-nav-meta';
        const when = formatTimestamp(version.createdAt);
        meta.textContent = when ? `${version.source} - ${when}` : version.source;
        item.appendChild(meta);

        item.addEventListener('click', () => {
            activateVersion(canvasState.selectedFileKey, version.id);
        });

        container.appendChild(item);
    }
}

function renderUploadHistory() {
    const container = document.getElementById('canvas-upload-list');
    if (!container) return;
    container.innerHTML = '';

    const history = getUploadHistoryForSession();
    if (!history.length) {
        const hint = document.createElement('div');
        hint.className = 'canvas-empty-hint';
        hint.textContent = 'No uploads in this session.';
        container.appendChild(hint);
        return;
    }

    const maxItems = 16;
    for (let i = history.length - 1; i >= 0 && (history.length - 1 - i) < maxItems; i--) {
        const entry = history[i];
        const item = document.createElement('div');
        item.className = 'canvas-nav-item canvas-upload-item';

        const label = document.createElement('span');
        label.className = 'canvas-nav-label';
        label.textContent = String(entry.name || 'file');
        item.appendChild(label);

        const meta = document.createElement('span');
        meta.className = 'canvas-nav-meta';
        const kind = String(entry.kind || 'file').toLowerCase() === 'image' ? 'image' : 'file';
        const ext = String(entry.extension || '').trim();
        const kindText = ext ? `${kind.toUpperCase()} â€¢ ${ext.toUpperCase()}` : kind.toUpperCase();
        const sizeText = formatBytes(entry.size);
        const when = formatTimestamp(entry.sentAt);
        meta.textContent = when ? `${kindText} â€¢ ${sizeText} â€¢ ${when}` : `${kindText} â€¢ ${sizeText}`;
        item.appendChild(meta);

        item.title = String(entry.name || 'file');
        container.appendChild(item);
    }
}

async function scanWorkspaceFiles(workspacePath) {
    const pathApi = getPathApi();
    const files = [];
    const queue = [workspacePath];
    const visited = new Set();

    while (queue.length && files.length < MAX_SCAN_FILES) {
        const current = queue.shift();
        const currentKey = normalizePathForCompare(current);
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);

        let entries = [];
        try {
            entries = await window.dram.fs.list(current);
        } catch {
            continue;
        }

        entries.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        for (const entry of entries) {
            if (!entry || !entry.name) continue;
            const fullPath = pathApi.join(current, entry.name);
            if (entry.isDir) {
                if (!shouldSkipDirectory(entry.name)) {
                    queue.push(fullPath);
                }
                continue;
            }

            if (!shouldIncludeFile(entry)) continue;
            const key = fileKeyFromPath(fullPath);
            files.push({
                key,
                path: fullPath,
                relativePath: toRelativePath(fullPath, workspacePath),
                label: entry.name,
                isVirtual: false
            });
            if (files.length >= MAX_SCAN_FILES) break;
        }
    }

    return sortFileEntries(files);
}

async function refreshWorkspaceFiles() {
    const virtualFiles = canvasState.files.filter((file) => file.isVirtual);
    if (!canvasState.workspacePath) {
        canvasState.files = sortFileEntries(virtualFiles);
        if (canvasState.selectedFileKey && !getFileEntry(canvasState.selectedFileKey)) {
            canvasState.selectedFileKey = null;
            canvasState.selectedVersionId = null;
        }
        renderFileList();
        renderVersionList();
        return;
    }

    const workspaceFiles = await scanWorkspaceFiles(canvasState.workspacePath);
    canvasState.files = sortFileEntries([...virtualFiles, ...workspaceFiles]);
    if (canvasState.selectedFileKey && !getFileEntry(canvasState.selectedFileKey)) {
        canvasState.selectedFileKey = null;
        canvasState.selectedVersionId = null;
    }
    renderFileList();
    renderVersionList();
}

async function setCanvasWorkspace(workspacePath, { persist = true } = {}) {
    const normalized = String(workspacePath || '').trim();
    if (!normalized) return false;
    canvasState.workspacePath = normalized;
    renderWorkspacePath();
    if (persist) {
        await window.dram.storage.set('settings.canvasWorkspacePath', normalized);
    }
    await refreshWorkspaceFiles();
    return true;
}

async function selectCanvasWorkspace() {
    const result = await window.dram.dialog.showOpenDialog({
        title: 'Select Canvas Workspace Folder',
        properties: ['openDirectory']
    });
    if (result?.canceled || !Array.isArray(result?.filePaths) || !result.filePaths[0]) {
        return null;
    }
    const selectedPath = result.filePaths[0];
    await setCanvasWorkspace(selectedPath, { persist: true });
    showToast({ message: 'Canvas workspace selected', type: 'success' });
    return selectedPath;
}

async function ensureCanvasWorkspace({ preferSessionDefault = false } = {}) {
    if (canvasState.workspacePath) return canvasState.workspacePath;
    if (preferSessionDefault) {
        const defaultWorkspace = await resolveDefaultCanvasWorkspacePath();
        if (defaultWorkspace) {
            await setCanvasWorkspace(defaultWorkspace, { persist: false });
            return defaultWorkspace;
        }
    }
    return selectCanvasWorkspace();
}

async function selectCanvasFile(fileKey) {
    const fileEntry = getFileEntry(fileKey);
    if (!fileEntry) return;
    canvasState.selectedFileKey = fileKey;
    renderFileList();

    const existingVersions = getVersionList(fileKey);
    if (existingVersions.length > 0) {
        const targetVersion = existingVersions[existingVersions.length - 1];
        activateVersion(fileKey, targetVersion.id);
        return;
    }

    if (fileEntry.isVirtual) {
        renderVersionList();
        return;
    }

    let content = '';
    try {
        const fileContent = await window.dram.fs.read(fileEntry.path);
        content = typeof fileContent === 'string' ? fileContent : '';
    } catch (err) {
        showToast({ message: `Failed to read ${fileEntry.relativePath}`, type: 'error' });
        console.warn('[Canvas] read file error:', err);
        return;
    }

    const renderMode = detectRenderMode(fileEntry.path, content);
    addVersionForFile(fileKey, {
        content,
        renderMode,
        language: detectLanguage(fileEntry.path, content),
        source: 'disk',
        activate: true,
        allowDuplicate: true
    });
}

async function createCanvasFile() {
    const workspacePath = await ensureCanvasWorkspace({ preferSessionDefault: true });
    if (!workspacePath) return;

    const input = window.prompt('New file path (relative to selected folder):', 'index.html');
    if (input === null) return;
    const relativePath = normalizeRelativeInput(input);
    if (!relativePath) {
        showToast({ message: 'Invalid file path', type: 'warning' });
        return;
    }

    const absolutePath = joinPath(workspacePath, relativePath);
    try {
        await window.dram.fs.write(absolutePath, '');
        upsertFileEntry({
            key: fileKeyFromPath(absolutePath),
            path: absolutePath,
            relativePath,
            label: getPathApi().basename(absolutePath),
            isVirtual: false
        });
        await refreshWorkspaceFiles();
        await selectCanvasFile(fileKeyFromPath(absolutePath));
        showToast({ message: `Created ${relativePath}`, type: 'success' });
    } catch (err) {
        showToast({ message: `Failed to create ${relativePath}`, type: 'error' });
        console.warn('[Canvas] create file error:', err);
    }
}

function pickSavePathRelative() {
    const suggested = 'canvas-output.html';
    const input = window.prompt('Save as (path relative to selected folder):', suggested);
    if (input === null) return null;
    const relativePath = normalizeRelativeInput(input);
    if (!relativePath) return '';
    return relativePath;
}

async function saveCanvasContent() {
    if (!canvasState.currentContent && canvasState.currentContent !== '') {
        showToast({ message: 'Nothing to save', type: 'warning' });
        return;
    }

    const workspacePath = await ensureCanvasWorkspace({ preferSessionDefault: true });
    if (!workspacePath) return;

    let fileEntry = getFileEntry(canvasState.selectedFileKey);
    let targetPath = fileEntry && !fileEntry.isVirtual ? fileEntry.path : null;

    if (!targetPath) {
        const relative = pickSavePathRelative();
        if (relative === null) return;
        if (!relative) {
            showToast({ message: 'Invalid save path', type: 'warning' });
            return;
        }
        targetPath = joinPath(workspacePath, relative);
        fileEntry = upsertFileEntry({
            key: fileKeyFromPath(targetPath),
            path: targetPath,
            relativePath: relative,
            label: getPathApi().basename(targetPath),
            isVirtual: false
        });
    }

    try {
        await window.dram.fs.write(targetPath, canvasState.currentContent);
        await refreshWorkspaceFiles();
        const targetKey = fileKeyFromPath(targetPath);
        const renderMode = detectRenderMode(targetPath, canvasState.currentContent);
        addVersionForFile(targetKey, {
            content: canvasState.currentContent,
            renderMode,
            language: detectLanguage(targetPath, canvasState.currentContent),
            source: 'saved',
            activate: true,
            allowDuplicate: true
        });
        showToast({ message: `Saved ${toRelativePath(targetPath, workspacePath)}`, type: 'success' });
    } catch (err) {
        showToast({ message: 'Failed to save canvas content', type: 'error' });
        console.warn('[Canvas] save file error:', err);
    }
}

function gatewayOriginFromConnection(connectionUrl = 'ws://127.0.0.1:18789') {
    const raw = String(connectionUrl || '').trim() || 'ws://127.0.0.1:18789';
    const normalized = raw
        .replace(/^ws:\/\//i, 'http://')
        .replace(/^wss:\/\//i, 'https://');
    try {
        return new URL(normalized).origin;
    } catch {
        return 'http://127.0.0.1:18789';
    }
}

function revokeLocalCanvasUrl() {
    if (!canvasState.localContentUrl) return;
    try {
        URL.revokeObjectURL(canvasState.localContentUrl);
    } catch {
        // Ignore stale blob URLs.
    }
    canvasState.localContentUrl = null;
}

function revokeLocalCanvasAssets() {
    revokeLocalCanvasUrl();
    canvasState.localContentDocument = null;
    if (Array.isArray(canvasState.localScriptUrls)) {
        for (const scriptUrl of canvasState.localScriptUrls) {
            try {
                URL.revokeObjectURL(scriptUrl);
            } catch {
                // Ignore stale script blob URLs.
            }
        }
    }
    canvasState.localScriptUrls = [];
}

function stripExternalFontLinks(html) {
    return String(html || '')
        .replace(/<link[^>]+href=["']https:\/\/fonts\.googleapis\.com\/[^"']+["'][^>]*>/gi, '')
        .replace(/<link[^>]+href=["']https:\/\/fonts\.gstatic\.com\/[^"']+["'][^>]*>/gi, '')
        .replace(/<link[^>]+rel=["']preconnect["'][^>]*>/gi, (match) => {
            const lower = match.toLowerCase();
            if (lower.includes('fonts.googleapis.com') || lower.includes('fonts.gstatic.com')) {
                return '';
            }
            return match;
        });
}

function stripEmbeddedCspMeta(html) {
    const source = String(html || '');
    if (!source) return source;

    try {
        const doc = new DOMParser().parseFromString(source, 'text/html');
        const metaNodes = Array.from(doc.querySelectorAll('meta[http-equiv]'));
        let removed = false;
        for (const node of metaNodes) {
            const value = String(node.getAttribute('http-equiv') || '').trim().toLowerCase();
            if (value === 'content-security-policy') {
                node.remove();
                removed = true;
            }
        }
        if (!removed || !doc.documentElement) return source;
        const serialized = doc.documentElement.outerHTML;
        return /<!doctype/i.test(source) ? `<!doctype html>\n${serialized}` : serialized;
    } catch {
        return source.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
    }
}

function rewriteInlineEventHandlers(html) {
    // Keep authored HTML handlers/scripts intact for the canvas sandbox runtime.
    return String(html || '');
}

function buildHtmlDocument(content) {
    const sanitized = stripEmbeddedCspMeta(stripExternalFontLinks(content));
    if (/<html[\s>]/i.test(sanitized)) return sanitized;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canvas</title>
<style>
html,body{margin:0;padding:0;height:100%;background:#f7f8f9;color:#111;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
</style>
</head>
<body>
${sanitized}
</body>
</html>`;
}

function renderLocalHtmlToFrameDocument(content) {
    const frame = document.getElementById('canvas-frame');
    if (!frame) return false;

    const baseHtml = buildHtmlDocument(content);
    revokeLocalCanvasAssets();
    const withEventHandlers = rewriteInlineEventHandlers(baseHtml);
    const html = withEventHandlers;

    canvasState.localContentUrl = null;
    canvasState.localContentDocument = html;
    canvasState.localScriptUrls = [];
    canvasState.url = 'local://canvas-srcdoc';
    canvasState.isLoaded = true;
    canvasState.loadAttempts = 0;
    canvasState.runtimeMode = 'local';
    frame.src = 'about:blank';
    frame.srcdoc = html;
    renderCanvasControlState();

    return true;
}

function showHtmlInFrame(content) {
    renderLocalHtmlToFrameDocument(content);
}

function showCodeInFrame(content, title, language = 'text') {
    const preview = buildCodePreviewDocument(content, title, language);
    renderLocalHtmlToFrameDocument(preview);
}
/**
 * Initialize the canvas module
 */
export function initCanvas() {
    console.log('[Canvas] Initializing side panel...');

    setupCanvasListeners();
    bindCanvasSessionSync();
    setupResizeHandle();
    renderWorkspacePath();
    renderFileList();
    renderVersionList();
    renderUploadHistory();
    renderCanvasViewToggle(null, 'code');
    renderCanvasControlState();

    checkCanvasAvailability();
    void initializeCanvasWorkspace();
}

function bindCanvasSessionSync() {
    if (canvasState.sessionSyncBound) return;
    canvasState.sessionSyncBound = true;

    window.addEventListener('dram:session:changed', () => {
        renderUploadHistory();
    });

    window.addEventListener('dram:state:changed', (event) => {
        const key = String(event?.detail?.key || '');
        if (key === 'sessionKey' || key === 'currentSessionId') {
            renderUploadHistory();
        }
    });
}

async function initializeCanvasWorkspace() {
    try {
        const [canvasWorkspace, appWorkspace] = await Promise.all([
            window.dram.storage.get('settings.canvasWorkspacePath'),
            window.dram.storage.get('settings.workspacePath')
        ]);
        const savedCanvasWorkspace = String(canvasWorkspace || '').trim();
        if (savedCanvasWorkspace) {
            await setCanvasWorkspace(savedCanvasWorkspace, { persist: false });
            return;
        }

        const defaultWorkspace = await resolveDefaultCanvasWorkspacePath();
        if (defaultWorkspace) {
            await setCanvasWorkspace(defaultWorkspace, { persist: false });
            return;
        }

        const appDefaultWorkspace = String(appWorkspace || '').trim();
        if (appDefaultWorkspace) {
            await setCanvasWorkspace(appDefaultWorkspace, { persist: false });
        }
    } catch (err) {
        console.warn('[Canvas] Failed to initialize workspace:', err?.message || err);
    }
}

function setupCanvasListeners() {
    const toggleBtn = document.getElementById('btn-canvas-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            toggleCanvas();
        });
    }

    const closeBtn = document.getElementById('btn-canvas-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeCanvas();
        });
    }

    const popoutBtn = document.getElementById('btn-canvas-popout');
    if (popoutBtn) {
        popoutBtn.addEventListener('click', () => {
            openCanvasInBrowser();
        });
    }

    const reloadBtn = document.getElementById('btn-canvas-reload');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            reloadCanvas();
        });
    }

    const resetBtn = document.getElementById('btn-canvas-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            void clearCanvas();
        });
    }

    const snapshotBtn = document.getElementById('btn-canvas-snapshot');
    if (snapshotBtn) {
        snapshotBtn.addEventListener('click', () => {
            void captureCanvasSnapshot();
        });
    }

    const viewRenderBtn = document.getElementById('btn-canvas-view-render');
    if (viewRenderBtn) {
        viewRenderBtn.addEventListener('click', () => {
            switchCanvasView('render');
        });
    }

    const viewCodeBtn = document.getElementById('btn-canvas-view-code');
    if (viewCodeBtn) {
        viewCodeBtn.addEventListener('click', () => {
            switchCanvasView('code');
        });
    }

    const selectFolderBtn = document.getElementById('btn-canvas-select-folder');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', () => {
            void selectCanvasWorkspace();
        });
    }

    const newFileBtn = document.getElementById('btn-canvas-new-file');
    if (newFileBtn) {
        newFileBtn.addEventListener('click', () => {
            void createCanvasFile();
        });
    }

    const saveFileBtn = document.getElementById('btn-canvas-save-file');
    if (saveFileBtn) {
        saveFileBtn.addEventListener('click', () => {
            void saveCanvasContent();
        });
    }

    window.addEventListener('message', handleCanvasMessage);
}

function setupResizeHandle() {
    const handle = document.getElementById('canvas-resize-handle');
    const panel = document.getElementById('canvas-panel');

    if (!handle || !panel) return;

    let pointerId = null;
    let startX = 0;
    let startWidth = 0;
    const minWidthPx = 320;
    const defaultWidthPercent = 48;

    const finishResize = () => {
        if (pointerId === null) return;
        pointerId = null;
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };

    handle.style.touchAction = 'none';

    handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (panel.classList.contains('collapsed')) return;

        pointerId = event.pointerId;
        startX = event.clientX;
        startWidth = panel.getBoundingClientRect().width;
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    document.addEventListener('pointermove', (event) => {
        if (pointerId === null || event.pointerId !== pointerId) return;

        const containerWidth = panel.parentElement?.offsetWidth || 0;
        if (!containerWidth) return;

        const deltaX = startX - event.clientX;
        const maxWidthPx = Math.max(minWidthPx + 40, Math.floor(containerWidth * 0.82));
        const nextWidthPx = Math.max(minWidthPx, Math.min(maxWidthPx, startWidth + deltaX));
        const nextPercent = (nextWidthPx / containerWidth) * 100;

        canvasState.width = Math.max(28, Math.min(78, nextPercent));
        panel.style.width = `${canvasState.width}%`;
    });

    document.addEventListener('pointerup', (event) => {
        if (pointerId === null || event.pointerId !== pointerId) return;
        finishResize();
    });

    document.addEventListener('pointercancel', finishResize);
    window.addEventListener('blur', finishResize);

    handle.addEventListener('dblclick', (event) => {
        if (panel.classList.contains('collapsed')) return;
        canvasState.width = defaultWidthPercent;
        panel.style.width = `${defaultWidthPercent}%`;
        event.preventDefault();
    });
}

async function checkCanvasAvailability() {
    try {
        const health = await window.dram.util.getHealth();
        const hasCanvas = health?.features?.canvas || health?.capabilities?.canvas;
        canvasState.engineCanvasFeatureAvailable = Boolean(hasCanvas);
        renderCanvasControlState();

        if (hasCanvas) {
            console.log('[Canvas] Canvas feature detected on engine');
        }
    } catch (err) {
        canvasState.engineCanvasFeatureAvailable = null;
        renderCanvasControlState();
        console.warn('[Canvas] Failed to check canvas availability:', err.message);
    }
}

export function toggleCanvas() {
    if (canvasState.isOpen) {
        closeCanvas();
    } else {
        openCanvas();
    }
}

export function openCanvas() {
    console.log('[Canvas] Opening side panel');
    const panel = document.getElementById('canvas-panel');
    const toggleBtn = document.getElementById('btn-canvas-toggle');

    if (panel) {
        panel.classList.remove('collapsed');

        if (canvasState.width && canvasState.width !== 50) {
            panel.style.width = `${canvasState.width}%`;
        }

        canvasState.isOpen = true;
        renderUploadHistory();
        renderCanvasControlState();

        if (toggleBtn) toggleBtn.classList.add('active');

        if (!canvasState.isLoaded && !canvasState.localContentUrl && !canvasState.localContentDocument) {
            void loadCanvas();
        }
    }
}

export function closeCanvas() {
    console.log('[Canvas] Closing side panel');
    const panel = document.getElementById('canvas-panel');
    const toggleBtn = document.getElementById('btn-canvas-toggle');

    if (panel) {
        panel.classList.add('collapsed');
        panel.style.width = '';
        canvasState.isOpen = false;
        renderCanvasControlState();

        if (toggleBtn) toggleBtn.classList.remove('active');
    }
}

async function loadCanvas() {
    const frame = document.getElementById('canvas-frame');

    if (!frame) return;

    try {
        const connection = await window.dram.gateway.getConnection();
        const gatewayOrigin = gatewayOriginFromConnection(connection?.url);
        const status = await window.dram.canvas.getStatus().catch(() => null);
        const canvasUrl = status?.url || `${gatewayOrigin}/__openclaw__/canvas/`;
        canvasState.remoteUrl = canvasUrl;
        canvasState.remoteAvailable = Boolean(status?.available);
        if (typeof status?.a2uiPushJsonlSupported === 'boolean') {
            canvasState.remoteA2uiPushSupported = status.a2uiPushJsonlSupported;
        }
        renderCanvasControlState();
        if (!status?.available) {
            console.warn('[Canvas] Probe unavailable, attempting direct load:', canvasUrl, 'status:', status?.status);
        }
        canvasState.url = canvasUrl;
        canvasState.runtimeMode = 'idle';

        frame.removeAttribute('srcdoc');
        frame.src = canvasUrl;

        frame.onload = () => {
            canvasState.isLoaded = true;
            canvasState.loadAttempts = 0;
            canvasState.runtimeMode = 'remote';
            renderCanvasControlState();
            connectCanvasWebSocket(gatewayOrigin);
        };

        frame.onerror = (loadErr) => {
            console.error('[Canvas] Frame failed to load:', loadErr);
            canvasState.runtimeMode = 'idle';
            canvasState.loadAttempts += 1;
            renderCanvasControlState();
            if (canvasState.loadAttempts < canvasState.maxLoadAttempts) {
                const retryMs = Math.min(1200 * canvasState.loadAttempts, 5000);
                setTimeout(() => { void loadCanvas(); }, retryMs);
                return;
            }
            showCanvasError();
        };
    } catch (err) {
        console.error('[Canvas] Failed to load canvas:', err);
        canvasState.runtimeMode = 'idle';
        canvasState.loadAttempts += 1;
        renderCanvasControlState();
        if (canvasState.loadAttempts < canvasState.maxLoadAttempts) {
            const retryMs = Math.min(1200 * canvasState.loadAttempts, 5000);
            setTimeout(() => { void loadCanvas(); }, retryMs);
            return;
        }
        showCanvasError();
    }
}

function showCanvasError() {
    canvasState.runtimeMode = 'idle';
    canvasState.isLoaded = false;
    renderCanvasControlState();
    const emptyState = document.getElementById('canvas-empty-state');
    if (emptyState) {
        emptyState.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 8px;">!</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Canvas Unavailable</div>
            <div style="font-size: 12px; color: var(--text-secondary); max-width: 200px;">Could not connect to the canvas server.</div>
            <button class="tactile-btn sm" id="btn-canvas-retry" style="margin-top: 16px;">Retry</button>
        `;
        emptyState.classList.remove('hidden');

        document.getElementById('btn-canvas-retry')?.addEventListener('click', () => {
            window.location.reload();
        });
    }
}

export function reloadCanvas() {
    const frame = document.getElementById('canvas-frame');
    if (frame) {
        if (canvasState.localContentDocument) {
            canvasState.runtimeMode = 'local';
            frame.src = 'about:blank';
            frame.srcdoc = canvasState.localContentDocument;
            renderCanvasControlState();
            return;
        }
        if (canvasState.localContentUrl) {
            canvasState.runtimeMode = 'local';
            frame.removeAttribute('srcdoc');
            frame.src = canvasState.localContentUrl;
            renderCanvasControlState();
            return;
        }
        canvasState.isLoaded = false;
        canvasState.runtimeMode = 'idle';
        renderCanvasControlState();
        frame.removeAttribute('srcdoc');
        frame.src = 'about:blank';
        setTimeout(() => { void loadCanvas(); }, 100);
    }
}

function triggerDownloadFromDataUrl(dataUrl, fileName) {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

function extractSnapshotImagePayload(snapshotResult) {
    const candidates = [
        snapshotResult?.data?.pngBase64,
        snapshotResult?.data?.imageBase64,
        snapshotResult?.data?.image,
        snapshotResult?.data?.snapshot,
        snapshotResult?.pngBase64,
        snapshotResult?.imageBase64,
        snapshotResult?.image,
        snapshotResult?.snapshot
    ];

    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (!value) continue;
        if (value.startsWith('data:image/')) return value;
        if (/^[a-z0-9+/=\r\n]+$/i.test(value) && value.length > 80) {
            return `data:image/png;base64,${value.replace(/\s+/g, '')}`;
        }
    }
    return '';
}

async function captureCanvasSnapshot() {
    try {
        const result = await window.dram.canvas.snapshot();
        if (!result?.ok) {
            const reason = String(result?.error?.message || result?.error || 'snapshot request failed');
            showToast({ message: `Snapshot failed: ${reason}`, type: 'error' });
            return;
        }

        const imageDataUrl = extractSnapshotImagePayload(result);
        if (!imageDataUrl) {
            showToast({ message: 'Snapshot requested (engine did not return an image payload)', type: 'info' });
            console.info('[Canvas] snapshot response (no image payload):', result);
            return;
        }

        const fileName = `canvas-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        triggerDownloadFromDataUrl(imageDataUrl, fileName);
        showToast({ message: 'Canvas snapshot downloaded', type: 'success' });
    } catch (err) {
        showToast({ message: 'Snapshot failed', type: 'error' });
        console.warn('[Canvas] Snapshot error:', err);
    }
}

function openCanvasInBrowser() {
    const targetUrl = canvasState.remoteUrl
        || (canvasState.url && !canvasState.url.startsWith('blob:') ? canvasState.url : '');
    if (!targetUrl) {
        showToast({ message: 'Gateway canvas URL is not available yet', type: 'warning' });
        return;
    }
    window.dram.shell.openExternal(targetUrl);
    showToast({ message: 'Opened gateway canvas in browser', type: 'success' });
}

function connectCanvasWebSocket(gatewayUrl) {
    try {
        if (canvasState.ws) {
            try {
                canvasState.ws.close();
            } catch {
                // Ignore close errors.
            }
            canvasState.ws = null;
        }
        canvasState.wsConnected = false;
        renderCanvasControlState();

        const wsUrl = gatewayUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/__openclaw__/ws';

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            canvasState.ws = ws;
            canvasState.wsConnected = true;
            canvasState.reconnectAttempts = 0;
            renderCanvasControlState();
        };

        ws.onmessage = (event) => {
            if (event.data === 'reload') {
                reloadCanvas();
            }
        };

        ws.onclose = () => {
            canvasState.ws = null;
            canvasState.wsConnected = false;
            renderCanvasControlState();

            if (canvasState.reconnectAttempts < canvasState.maxReconnectAttempts) {
                canvasState.reconnectAttempts++;
                setTimeout(() => connectCanvasWebSocket(gatewayUrl), 3000 * canvasState.reconnectAttempts);
            }
        };

        ws.onerror = (err) => {
            console.error('[Canvas] WebSocket error:', err);
        };
    } catch (err) {
        canvasState.wsConnected = false;
        renderCanvasControlState();
        console.warn('[Canvas] Failed to connect WebSocket:', err.message);
    }
}

function resolveCanvasVersionTargetKey() {
    const selectedKey = canvasState.selectedFileKey;
    if (selectedKey && getFileEntry(selectedKey)) {
        return selectedKey;
    }
    ensureChatFileEntry();
    return CHAT_CANVAS_FILE_KEY;
}

export async function pushToCanvas(content, options = {}) {
    const { type = 'html' } = options;
    const isHtmlContent = type === 'html' && typeof content === 'string' && content.trim().length > 0;
    const isCodeContent = type === 'code' && typeof content === 'string';
    const requestedLanguage = normalizeLanguageTag(options?.language || '');

    if (!canvasState.isOpen) {
        if (isHtmlContent || isCodeContent) canvasState.isLoaded = true;
        openCanvas();
    }

    if (isHtmlContent || isCodeContent) {
        const fileKey = resolveCanvasVersionTargetKey();
        const fileEntry = getFileEntry(fileKey);
        const effectiveLanguage = isCodeContent
            ? (requestedLanguage || detectLanguage(fileEntry?.path || '', content))
            : 'html';
        addVersionForFile(fileKey, {
            content,
            renderMode: isHtmlContent ? 'html' : 'code',
            language: effectiveLanguage,
            source: 'assistant',
            activate: true
        });
    }

    if (isCodeContent) {
        // Code preview is handled fully in local canvas mode.
        return;
    }

    if (type === 'html' && canvasState.remoteA2uiPushSupported === false) {
        return;
    }

    try {
        const result = await window.dram.canvas.pushA2UI({
            html: type === 'html' ? content : null,
            evalScript: type === 'script' ? content : null,
            reset: options.reset || false
        });

        const unsupported = result?.data?.unsupported || result?.data?.forwarded === false;
        if (unsupported) {
            canvasState.remoteA2uiPushSupported = false;
            renderCanvasControlState();
        } else if (result?.ok) {
            canvasState.remoteA2uiPushSupported = true;
            renderCanvasControlState();
        }
        const errorText = String(result?.error?.message || result?.error || '').toLowerCase();
        if (errorText.includes('unknown method') || errorText.includes('method not found')) {
            canvasState.remoteA2uiPushSupported = false;
            renderCanvasControlState();
        }
        if (!(result.ok || unsupported || errorText.includes('unknown method') || errorText.includes('method not found'))) {
            console.error('[Canvas] Failed to push content:', result.error);
        }
    } catch (err) {
        console.error('[Canvas] Push error:', err);
    }
}

export async function clearCanvas() {
    let resetError = null;
    try {
        await window.dram.canvas.reset();
    } catch (err) {
        resetError = err;
        console.error('[Canvas] Reset error:', err);
    }

    revokeLocalCanvasAssets();
    canvasState.hasContent = false;
    canvasState.isLoaded = false;
    canvasState.url = null;
    canvasState.runtimeMode = 'idle';
    setCurrentCanvasContent('', 'html');

    const frame = document.getElementById('canvas-frame');
    if (frame) {
        frame.removeAttribute('srcdoc');
        frame.src = 'about:blank';
    }

    const panel = document.getElementById('canvas-panel');
    if (panel) panel.classList.remove('has-content');
    const emptyState = document.getElementById('canvas-empty-state');
    if (emptyState) emptyState.classList.remove('hidden');
    renderCanvasViewToggle(null, 'code');
    renderCanvasControlState();

    if (!resetError) {
        console.log('[Canvas] Canvas reset');
    }
}

function handleCanvasMessage(event) {
    if (!canvasState.url) return;
    const frame = document.getElementById('canvas-frame');
    if (!frame || event.source !== frame.contentWindow) return;

    if (canvasState.url.startsWith('blob:')) {
        if (event.origin !== 'null') return;
    } else if (event.origin !== 'null') {
        try {
            const messageOrigin = new URL(event.origin).origin;
            const canvasOrigin = new URL(canvasState.url).origin;
            if (messageOrigin !== canvasOrigin) return;
        } catch {
            return;
        }
    }

    const data = event.data;

    if (typeof data === 'object' && data.type) {
        switch (data.type) {
            case 'canvas:ready':
                break;

            case 'a2ui:action':
                handleA2UIAction(data.action);
                break;

            case 'canvas:contentLoaded':
                updatePanelContentState(true);
                break;
        }
    }
}

function handleA2UIAction(action) {
    window.dram.canvas.sendA2UIAction?.(action).catch((err) => {
        console.warn('[Canvas] Failed to send A2UI action:', err);
    });
}

export function buildCanvasPromptContext(userText = '', options = {}) {
    const record = getActiveCanvasContextRecord(userText);
    if (!record) return '';
    const { fileEntry, selectedVersion } = record;

    const limitFromOptions = Number(options?.maxChars);
    const maxChars = Number.isFinite(limitFromOptions) && limitFromOptions > 0
        ? Math.floor(limitFromOptions)
        : DEFAULT_PROMPT_CONTEXT_MAX_CHARS;

    const fullContent = String(selectedVersion.content || '');
    const truncated = fullContent.length > maxChars;
    const content = truncated ? fullContent.slice(0, maxChars) : fullContent;
    const relativeLabel = fileEntry.relativePath || fileEntry.label || fileEntry.path || fileEntry.key;
    const sourceLabel = selectedVersion.source || 'unknown';
    const versionLabel = selectedVersion.label || 'v?';
    const renderMode = selectedVersion.renderMode || 'code';
    const language = normalizeLanguageTag(selectedVersion.language || detectLanguage(fileEntry.path || '', selectedVersion.content || ''));
    const outputLanguage = renderMode === 'html' ? 'html' : language;

    return [
        DRAM_CANVAS_CONTEXT_TAG,
        `selected_file: ${relativeLabel}`,
        `selected_version: ${versionLabel} (${sourceLabel})`,
        `render_mode: ${renderMode}`,
        `language: ${outputLanguage}`,
        `workspace: ${canvasState.workspacePath || 'none'}`,
        `content_truncated: ${truncated ? 'true' : 'false'}`,
        'response_contract:',
        '- This is a Canvas file edit request.',
        `- Return the full updated file contents in exactly one fenced code block (\`\`\`${outputLanguage} ... \`\`\`).`,
        '- Do not return prose-only summaries when editing; include the updated full file content.',
        '- Keep the same file type unless the user explicitly requests a type change.',
        'content_start',
        content,
        'content_end',
        DRAM_CANVAS_CONTEXT_END_TAG
    ].join('\n');
}

export function getActiveCanvasContextMeta(userText = '') {
    const record = getActiveCanvasContextRecord(userText);
    if (!record) return null;
    const { fileEntry, selectedVersion } = record;
    const relativeLabel = fileEntry.relativePath || fileEntry.label || fileEntry.path || fileEntry.key;
    return {
        selectedFile: relativeLabel,
        selectedVersion: selectedVersion.label || 'v?',
        source: selectedVersion.source || 'unknown',
        renderMode: selectedVersion.renderMode || 'code',
        workspace: canvasState.workspacePath || ''
    };
}

export function recordUploadHistory(attachments = []) {
    if (!Array.isArray(attachments) || attachments.length === 0) return;
    const sessionKey = getCurrentSessionUploadKey();
    const previous = getUploadHistoryForSession(sessionKey);
    const now = nowIso();
    const nextEntries = attachments
        .filter(Boolean)
        .map((att) => ({
            id: crypto.randomUUID(),
            name: String(att.name || (att.kind === 'image' ? 'image' : 'file')),
            kind: String(att.kind || '').toLowerCase() === 'image' ? 'image' : 'file',
            type: String(att.type || ''),
            size: Number(att.size || 0),
            extension: String(att.extension || ''),
            sentAt: now
        }));
    const merged = [...previous, ...nextEntries];
    if (merged.length > MAX_UPLOAD_HISTORY_PER_SESSION) {
        merged.splice(0, merged.length - MAX_UPLOAD_HISTORY_PER_SESSION);
    }
    setUploadHistoryForSession(sessionKey, merged);
    renderUploadHistory();
}

export function clearUploadHistoryForSession(sessionKey = getCurrentSessionUploadKey()) {
    const key = String(sessionKey || 'main');
    if (canvasState.uploadHistoryBySession[key]) {
        delete canvasState.uploadHistoryBySession[key];
    }
    renderUploadHistory();
}

export function isCanvasOpen() {
    return canvasState.isOpen;
}

export function getCanvasState() {
    return { ...canvasState };
}
