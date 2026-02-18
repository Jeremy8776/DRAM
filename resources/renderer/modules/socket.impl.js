/**
 * DRAM Socket Management (DRAM Engine Protocol)
 */
import { state } from '../../../modules/state.js';
import { elements } from '../../../modules/elements.js';
import { addMessage, clearMessages, renderAttachmentPreview, updateInfobar, showTypingIndicator, hideTypingIndicator, updateTypingStatus } from '../../../modules/renderer.js';
import { addSystemMessage, translateGatewayError } from '../../../modules/utils.js';
import { humanizeError } from '../../../modules/errors.js';
import { updateConnectionUI } from '../../../modules/connection-ui.js';
import { getActiveModelInfo } from '../../../modules/rate-limits.js';
import { getActiveModelUploadPolicy, imageUploadBlockedMessage } from '../../../modules/model-capabilities.js';

import { handleChatEvent, handleAgentEvent, trackRun } from '../../../modules/chat-handler.js';
import { logger } from '../../../modules/logger.js';

const log = logger('Socket');

const DESKTOP_CANVAS_HINT = [
    '[DRAM_DESKTOP_CANVAS_CONTEXT]',
    'Runtime: DRAM Desktop with a built-in right-side Canvas panel.',
    'If the user asks to build/show a webpage, UI, visualization, or canvas output:',
    '- Do NOT ask for a node/mobile canvas and do NOT say "node required".',
    '- Generate runnable HTML/CSS/JS and include it in a fenced ```html block.',
    '- If the user asks for a non-HTML language (e.g., python/js/ts/bash/sql), return that language instead of HTML.',
    '- Keep the answer concise and implementation-focused.',
    '[/DRAM_DESKTOP_CANVAS_CONTEXT]'
].join('\n');
const DRAM_CANVAS_FILE_CONTEXT_TAG = '[DRAM_CANVAS_FILE_CONTEXT]';
const CANVAS_CONTEXT_CHIP_ID = 'canvas-context-chip';
const FILE_ATTACHMENT_CONTEXT_TAG = '[DRAM_FILE_ATTACHMENTS]';
const FILE_ATTACHMENT_CONTEXT_END_TAG = '[/DRAM_FILE_ATTACHMENTS]';
const MAX_FILE_ATTACHMENTS_IN_CONTEXT = 8;
const MAX_FILE_CHARS_PER_ATTACHMENT = 8000;
const MAX_FILE_CHARS_TOTAL = 32000;
const CANVAS_EDIT_OUTPUT_HINT = [
    '[DRAM_CANVAS_EDIT_OUTPUT_CONTRACT]',
    'When editing a canvas-selected file:',
    '- Return exactly one fenced code block containing the full updated file.',
    '- Do not respond with summary-only prose.',
    '- Keep file type/language unchanged unless user asks otherwise.',
    '[/DRAM_CANVAS_EDIT_OUTPUT_CONTRACT]'
].join('\n');

function formatAttachmentSize(size) {
    const value = Number(size || 0);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function estimateDataUrlBytes(dataUrl) {
    const value = String(dataUrl || '');
    const comma = value.indexOf(',');
    if (comma < 0) return 0;
    return Math.floor((value.length - comma - 1) * 0.75);
}

function inferAttachmentLanguage(att) {
    const rawExt = String(att?.extension || '').trim().toLowerCase();
    if (!rawExt) return 'text';
    const map = {
        js: 'javascript',
        jsx: 'jsx',
        ts: 'typescript',
        tsx: 'tsx',
        py: 'python',
        ps1: 'powershell',
        sh: 'bash',
        yml: 'yaml',
        htm: 'html',
        md: 'markdown'
    };
    return map[rawExt] || rawExt;
}

function trimFileAttachmentContent(raw, remainingChars) {
    const source = String(raw || '');
    if (!source) return { text: '', trimmed: false };
    const cap = Math.max(0, Math.min(MAX_FILE_CHARS_PER_ATTACHMENT, remainingChars));
    if (cap <= 0) return { text: '', trimmed: true };
    if (source.length <= cap) return { text: source, trimmed: false };
    return { text: source.slice(0, cap), trimmed: true };
}

function buildFileAttachmentContext(attachments = []) {
    const files = attachments
        .filter((att) => att && att.kind === 'file')
        .slice(0, MAX_FILE_ATTACHMENTS_IN_CONTEXT);
    if (files.length === 0) return '';

    let remainingChars = MAX_FILE_CHARS_TOTAL;
    const sections = [];
    for (const file of files) {
        const name = String(file.name || 'file');
        const mimeType = String(file.type || 'application/octet-stream');
        const sizeLabel = formatAttachmentSize(file.size);
        const isTextLike = Boolean(file.textLike && typeof file.textContent === 'string' && file.textContent.length > 0);
        const header = `- ${name} (${mimeType}, ${sizeLabel})`;

        if (!isTextLike) {
            sections.push(`${header}\n  binary metadata only (content not inlined)`);
            continue;
        }

        const { text, trimmed } = trimFileAttachmentContent(file.textContent, remainingChars);
        remainingChars -= text.length;
        const language = inferAttachmentLanguage(file);
        const suffix = (trimmed || file.truncated) ? ' [trimmed]' : '';
        sections.push([
            `${header}${suffix}`,
            `\`\`\`${language}`,
            text,
            '```'
        ].join('\n'));
        if (remainingChars <= 0) break;
    }

    if (sections.length === 0) return '';
    return [
        FILE_ATTACHMENT_CONTEXT_TAG,
        'Use these user-provided file attachments as additional context:',
        ...sections,
        FILE_ATTACHMENT_CONTEXT_END_TAG
    ].join('\n\n');
}

function shouldInjectDesktopCanvasHint(text) {
    const value = String(text || '').toLowerCase();
    if (!value) return false;

    const hasExplicitCodeLanguage = /\b(python|py|javascript|typescript|node|bash|shell|powershell|ps1|sql|go|rust|java|c\+\+|cpp|c#|cs|ruby|php)\b/.test(value);
    if (hasExplicitCodeLanguage && !value.includes('html') && !value.includes('web page') && !value.includes('webpage')) {
        return false;
    }

    const hasUiWord = /(^|[^a-z0-9])ui([^a-z0-9]|$)/.test(value);
    return (
        value.includes('web page')
        || value.includes('webpage')
        || value.includes('html')
        || hasUiWord
        || value.includes('interface')
        || value.includes('dashboard')
        || value.includes('visualiz')
        || value.includes('front end')
        || value.includes('frontend')
    );
}

function buildOutboundMessage(text) {
    if (!shouldInjectDesktopCanvasHint(text)) return text;
    if (text.includes('[DRAM_DESKTOP_CANVAS_CONTEXT]')) return text;
    return `${text}\n\n${DESKTOP_CANVAS_HINT}`;
}

async function getCanvasPromptContextSnippet(userText) {
    try {
        const canvasModule = await import('../../../modules/canvas.js');
        if (typeof canvasModule.buildCanvasPromptContext !== 'function') return '';
        return canvasModule.buildCanvasPromptContext(userText);
    } catch (err) {
        log.debug('Canvas prompt context unavailable:', err?.message || err);
        return '';
    }
}

async function getCanvasPromptContextMeta(userText) {
    try {
        const canvasModule = await import('../../../modules/canvas.js');
        if (typeof canvasModule.getActiveCanvasContextMeta !== 'function') return null;
        return canvasModule.getActiveCanvasContextMeta(userText);
    } catch (err) {
        log.debug('Canvas prompt context meta unavailable:', err?.message || err);
        return null;
    }
}

async function recordCanvasUploadHistory(attachments = []) {
    if (!Array.isArray(attachments) || attachments.length === 0) return;
    try {
        const canvasModule = await import('../../../modules/canvas.js');
        if (typeof canvasModule.recordUploadHistory === 'function') {
            canvasModule.recordUploadHistory(attachments);
        }
    } catch (err) {
        log.debug('Canvas upload history unavailable:', err?.message || err);
    }
}

async function clearCanvasUploadHistoryForSession(sessionKey) {
    try {
        const canvasModule = await import('../../../modules/canvas.js');
        if (typeof canvasModule.clearUploadHistoryForSession === 'function') {
            canvasModule.clearUploadHistoryForSession(sessionKey);
        }
    } catch (err) {
        log.debug('Canvas upload history clear unavailable:', err?.message || err);
    }
}

function getCanvasContextChipElement() {
    return elements.canvasContextChip || document.getElementById(CANVAS_CONTEXT_CHIP_ID);
}

function setCanvasContextChip(meta) {
    const chip = getCanvasContextChipElement();
    if (!chip) return;
    if (!meta) {
        chip.classList.add('hidden');
        chip.textContent = '';
        chip.removeAttribute('title');
        return;
    }

    const fileLabel = String(meta.selectedFile || '').trim() || 'Selected Canvas File';
    const version = String(meta.selectedVersion || '').trim();
    const text = version
        ? `Canvas Context Active: ${fileLabel} (${version})`
        : `Canvas Context Active: ${fileLabel}`;

    chip.textContent = text;
    chip.title = text;
    chip.classList.remove('hidden');
}

async function buildOutboundMessageContextPackage(text) {
    const rawText = String(text || '');
    if (!rawText.trim()) {
        return { message: rawText, canvasMeta: null, hasCanvasContext: false };
    }

    const withDesktopHint = buildOutboundMessage(rawText);
    if (withDesktopHint.includes(DRAM_CANVAS_FILE_CONTEXT_TAG)) {
        return { message: withDesktopHint, canvasMeta: null, hasCanvasContext: true };
    }

    const [canvasContext, canvasMeta] = await Promise.all([
        getCanvasPromptContextSnippet(withDesktopHint),
        getCanvasPromptContextMeta(withDesktopHint)
    ]);

    if (!canvasContext) {
        return { message: withDesktopHint, canvasMeta: null, hasCanvasContext: false };
    }

    return {
        message: `${withDesktopHint}\n\n${canvasContext}\n\n${CANVAS_EDIT_OUTPUT_HINT}`,
        canvasMeta,
        hasCanvasContext: true
    };
}

export async function buildOutboundMessageWithContext(text) {
    const payload = await buildOutboundMessageContextPackage(text);
    return payload.message;
}

export async function refreshCanvasContextChipForDraft(text) {
    const sequence = ++canvasChipRefreshSequence;
    const draft = String(text || '').trim();
    if (!draft) {
        setCanvasContextChip(null);
        return;
    }
    const meta = await getCanvasPromptContextMeta(draft);
    if (sequence !== canvasChipRefreshSequence) return;
    setCanvasContextChip(meta);
}

let voiceCapabilityProbePromise = null;
let canvasChipRefreshSequence = 0;

function containsVoiceStreamCapability(value, seen = new Set(), depth = 0) {
    if (depth > 8 || value == null) return false;
    if (typeof value === 'string') {
        return value.toLowerCase().includes('voice.stream');
    }
    if (typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);

    if (Array.isArray(value)) {
        for (const entry of value) {
            if (containsVoiceStreamCapability(entry, seen, depth + 1)) return true;
        }
        return false;
    }

    for (const [key, entry] of Object.entries(value)) {
        if (String(key).toLowerCase().includes('voice.stream')) return true;
        if (containsVoiceStreamCapability(entry, seen, depth + 1)) return true;
    }
    return false;
}

function probeVoiceStreamCapability() {
    if (state.voiceStreamCapabilityChecked) return;
    if (voiceCapabilityProbePromise) return;

    state.voiceStreamCapabilityChecked = true;
    state.voiceStreamSupported = false;

    voiceCapabilityProbePromise = (async () => {
        try {
            const status = await window.dram.util.getSkillStatusRaw?.();
            if (containsVoiceStreamCapability(status)) {
                state.voiceStreamSupported = true;
                log.info('Gateway capability detected: voice.stream enabled');
                return;
            }
            log.debug('Gateway capability probe: voice.stream not advertised; keeping disabled');
        } catch (err) {
            log.debug('Voice capability probe failed; leaving voice.stream disabled:', err?.message || err);
        }
    })().finally(() => {
        voiceCapabilityProbePromise = null;
    });
}


/**
 * Initiate connection to the DRAM Engine gateway.
 * Handles credential retrieval and UI status updates.
 */
export async function connect() {
    if (state.connecting || state.connected) return;
    state.connecting = true;
    state.voiceStreamCapabilityChecked = false;
    state.voiceStreamSupported = false;

    // Immediate UI feedback across all indicators
    updateConnectionUI('connecting');
    if (elements.connectionStatus) elements.connectionStatus.className = 'indicator connecting';

    // Try to get from elements first, but fallback to storage via API
    let url = elements.gatewayUrl?.value?.trim();
    let token = elements.gatewayToken?.value?.trim();

    if (!url || !token) {
        try {
            const saved = await window.dram.gateway.getConnection();
            if (!url) url = saved.url;
            if (!token) token = saved.token;
        } catch {
            console.warn('Failed to fetch saved connection, using defaults');
        }
    }

    url = url || 'ws://127.0.0.1:18789';
    token = token || '';

    // Show terminal feedback in hero console
    const heroStatus = document.getElementById('hero-status');
    if (heroStatus) {
        heroStatus.textContent = 'Initializing Handshake...';
    }

    // console.log(`Connecting to ${url}...`);

    // Update Popover Status
    const popoverStatus = document.getElementById('popover-status');
    if (popoverStatus) popoverStatus.textContent = 'Initializing...';

    // Persist credentials (fire and forget)
    if (url) window.dram.storage.set('gateway.url', url).catch(() => { });
    if (token) window.dram.storage.set('gateway.token', token).catch(() => { });

    // console.log('Connecting via main process bridge...');
    window.dram.socket.connect(url, token);
}

/**
 * Handle incoming messages from the socket bridge.
 * @param {string} data - Raw JSON string from the socket.
 */
export function handleMessage(data) {
    let msg;
    try {
        // Handle both string and object data from IPC
        if (typeof data === 'string') {
            msg = JSON.parse(data);
        } else if (typeof data === 'object' && data !== null) {
            msg = data;
        } else {
            console.error('[Socket] Unknown data type:', typeof data);
            return;
        }
    } catch (err) {
        console.error('[Socket] Failed to parse message:', err, data?.slice?.(0, 200));
        return;
    }

    const isNoisyEvent = msg.type === 'event' && ['chat', 'agent', 'tick', 'health'].includes(msg.event);
    const isNoisyResponse = msg.type === 'res'
        && typeof msg.id === 'string'
        && (
            msg.id.startsWith('usage-status')
            || msg.id.startsWith('usage-cost')
            || msg.id.startsWith('history-')
            || msg.id.startsWith('util-')
        );
    // Standard Log
    if (!isNoisyEvent && !isNoisyResponse) {
        log.debug('Frame:', msg.type, msg.event || msg.id || '', 'keys:', Object.keys(msg || {}).join(','));
    }

    // Process Frame based on Gateway Protocol
    switch (msg.type) {
        case 'res':
            handleResponse(msg);
            break;
        case 'event':
            handleEvent(msg);
            break;
        case 'agent': // Keep for backward compatibility with older engine snapshots
            handleAgentEvent(msg);
            break;
        case 'chat': // Keep for backward compatibility
            handleChatEvent(msg, { onComplete: clearRequestTimeout });
            break;
        case 'connected':
            state.connecting = false;
            state.connected = true;
            updateConnectionUI('connected');
            if (elements.connectionPanel) elements.connectionPanel.classList.add('hidden');
            loadHistory();
            probeVoiceStreamCapability();
            break;
    }
}


/**
 * Handle official Gateway 'res' frames
 */
function handleResponse(msg) {
    // Forward to usage data handler for RPC responses
    if (msg.id && (msg.id.startsWith('usage-status') || msg.id.startsWith('usage-cost'))) {
        import('../../../modules/usage-data.js').then(m => m.handleUsageRpcResponse(msg));
        return;
    }

    // Handle partial transcripts from streaming STT
    if (msg.payload?.partialTranscript) {
        if (elements.voiceTranscriptInline) {
            elements.voiceTranscriptInline.textContent = msg.payload.partialTranscript;
        }
        if (elements.voiceTranscript) {
            elements.voiceTranscript.textContent = msg.payload.partialTranscript;
        }
    }

    const isChatRequest = msg.id && (msg.id.startsWith('send-') || msg.id.startsWith('voice-'));

    if (msg.ok) {
        const isHandshake = msg.id === 'handshake'
            || msg.payload?.type === 'hello-ok'
            || msg.payload?.type === 'connect-ok';

        if (isHandshake) {
            state.connecting = false;
            state.connected = true;
            updateConnectionUI('connected');
            if (msg.payload?.meta) updateInfobar(msg.payload.meta);
            loadHistory();
            probeVoiceStreamCapability();
            return;
        }

        if (msg.payload?.messages) {
            handleHistoryResponse(msg.payload);
            return;
        }

        if (msg.payload?.transcript) {
            addMessage('user', msg.payload.transcript, false);
            return;
        }

        if (isChatRequest) {
            const hasChatPayload = Boolean(
                msg.payload
                && (
                    msg.payload.state
                    || msg.payload.done
                    || msg.payload.errorMessage
                    || msg.payload.message
                    || msg.payload.delta
                    || msg.payload.content
                )
            );

            // Some gateway builds return chat frames as direct responses instead of events.
            if (hasChatPayload) {
                handleChatEvent(msg.payload, { onComplete: () => clearRequestTimeout(msg.id) });
                return;
            }

            const runId = typeof msg.payload?.runId === 'string' ? msg.payload.runId : '';
            if (runId) {
                trackRun(runId, state.sessionKey);
                updateTypingStatus('processing response...');
            }
            return;
        }
    } else {
        const errorMessage = String(msg.error?.message || '').toLowerCase();
        const isVoiceStreamRequest = typeof msg.id === 'string' && msg.id.startsWith('vstream-');
        const isUnknownMethod = errorMessage.includes('unknown method') || errorMessage.includes('method not found');
        const isTransientDisconnect =
            errorMessage.includes('engine disconnected')
            || errorMessage.includes('gateway disconnected')
            || errorMessage.includes('not connected');

        if (isVoiceStreamRequest && isUnknownMethod) {
            state.voiceStreamSupported = false;
            state.voiceStreamCapabilityChecked = true;
            log.warn('Gateway does not support voice.stream; disabling live voice streaming');
            return;
        }

        if (isChatRequest) {
            // Chat-related error: show translated message in the conversation
            hideTypingIndicator();
            clearRequestTimeout(msg.id);

            const friendlyMessage = translateGatewayError(msg.error);
            addMessage('assistant', friendlyMessage, false);

            log.warn('Chat request failed:', msg.error?.code, msg.error?.message);
        } else {
            if (isTransientDisconnect) {
                log.debug('Ignoring transient disconnected RPC response:', msg.id || '(no id)', msg.error?.message);
                return;
            }
            const isAuthError = errorMessage.includes('unauthorized') || errorMessage.includes('auth');
            if (isAuthError) {
                console.error('Request failed (auth):', msg.error);
                state.connecting = false;
                state.connected = false;
                updateConnectionUI('error', humanizeError(msg.error));
                return;
            }
            // Non-chat RPC failures should not tear down UI connection state.
            log.warn('Non-chat RPC failed (connection preserved):', msg.id || '(no id)', msg.error?.message);
        }
    }
}

/**
 * Handle official Gateway 'event' frames
 */
function handleEvent(msg) {
    if (msg.payload?.partialTranscript) {
        if (elements.voiceTranscriptInline) {
            elements.voiceTranscriptInline.textContent = msg.payload.partialTranscript;
        }
        if (elements.voiceTranscript) {
            elements.voiceTranscript.textContent = msg.payload.partialTranscript;
        }
    }

    switch (msg.event) {
        case 'chat':
            try {
                handleChatEvent(msg.payload, { onComplete: clearRequestTimeout });
            } catch (err) {
                hideTypingIndicator();
                log.error('Chat event handler failed:', err?.message || err);
            }
            break;
        case 'agent':
            handleAgentEvent(msg.payload);
            break;
        case 'voice:partial_transcript':
            if (elements.voiceTranscriptInline) {
                elements.voiceTranscriptInline.textContent = msg.payload.transcript;
            }
            if (elements.voiceTranscript) {
                elements.voiceTranscript.textContent = msg.payload.transcript;
            }
            break;
        case 'voice:wake_changed':
            // Custom event for voice status
            break;
    }
}

// Track pending requests for timeout handling
const pendingRequests = new Map();
const REQUEST_TIMEOUT = 300000; // 5 minutes

/**
 * Set a timeout for a pending request.
 */
function setRequestTimeout(requestId) {
    if (!requestId) return;
    clearRequestTimeout(requestId);
    const timeout = setTimeout(() => {
        hideTypingIndicator();
        pendingRequests.delete(requestId);
        addSystemMessage(elements, 'Request timed out. The model took too long to respond.');
        if (currentRequestId === requestId) currentRequestId = null;
    }, REQUEST_TIMEOUT);
    pendingRequests.set(requestId, timeout);
}

/**
 * Clear the timeout for a specific request.
 */
function clearRequestTimeout(requestId) {
    if (!requestId) {
        pendingRequests.forEach(timeout => clearTimeout(timeout));
        pendingRequests.clear();
        return;
    }
    const timeout = pendingRequests.get(requestId);
    if (timeout) {
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
    }
}

let historyLoadPending = false;
let lastHistoryLoadTime = 0;
const HISTORY_LOAD_COOLDOWN = 2000;

/**
 * Process history response.
 */
export function handleHistoryResponse(payload) {
    historyLoadPending = false;
    if (payload?.meta) updateInfobar(payload.meta);
    const messages = payload?.messages || payload;
    if (Array.isArray(messages)) {
        clearMessages();
        messages.forEach(m => {
            if (m.role === 'user' || m.role === 'assistant') {
                const content = Array.isArray(m.content) ? m.content.map(c => c.text || c).join('') : m.content;
                addMessage(m.role, content, false, false);
            }
        });
        if (elements.messages) elements.messages.scrollTop = elements.messages.scrollHeight;
    }
}

/**
 * Fetch chat history.
 */
export function loadHistory() {
    if (!state.connected) return;

    // Prevent rapid repeated calls
    const now = Date.now();
    if (historyLoadPending || (now - lastHistoryLoadTime) < HISTORY_LOAD_COOLDOWN) {
        log.debug('loadHistory skipped - cooldown or pending');
        return;
    }

    historyLoadPending = true;
    lastHistoryLoadTime = now;

    window.dram.socket.send({
        type: 'req',
        id: `history-${Date.now()}`,
        method: 'chat.history',
        params: { sessionKey: state.sessionKey, limit: 50 }
    });

    // Reset pending flag after a timeout (in case response doesn't come back)
    setTimeout(() => { historyLoadPending = false; }, 5000);
}

// Track current request for cancellation
let currentRequestId = null;

/**
 * Start a new clean chat session.
 */
export function resetChat() {
    if (!state.connected) return;

    console.log('[Socket] Resetting chat session:', state.sessionKey);

    window.dram.socket.send({
        type: 'req',
        id: `reset-${Date.now()}`,
        method: 'sessions.reset',
        params: { key: state.sessionKey }
    });

    // Clear local state and UI immediately
    clearMessages();
    state.messages = [];
    state.sessionCost = 0;
    state.sessionInputTokens = 0;
    state.sessionOutputTokens = 0;
    state.localRequestCount = 0;
    state.localProviderRequests = {};
    state.localModelUsage = {};
    state.sessionStartedAt = Date.now();

    void clearCanvasUploadHistoryForSession(state.sessionKey);

    // Add a welcome system message
    addSystemMessage(elements, 'NEW SESSION INITIALIZED // LOGS CLEARED');
}

/**
 * Send a new chat message to the assistant.
 * Handles attachments and UI updates.
 */
export async function sendMessage() {
    const text = elements.messageInput?.value?.trim() || '';
    let imageAttachments = state.attachments.filter((att) => (
        att?.kind === 'image'
        || (typeof att?.data === 'string' && att.data.startsWith('data:image/'))
    ));
    const fileAttachments = state.attachments.filter((att) => att?.kind === 'file');
    let hasAttachments = imageAttachments.length > 0 || fileAttachments.length > 0;

    if (!state.connected || (!text && !hasAttachments)) return;

    if (imageAttachments.length > 0) {
        const uploadPolicy = await getActiveModelUploadPolicy();
        if (!uploadPolicy.supportsImages) {
            addSystemMessage(elements, imageUploadBlockedMessage(uploadPolicy));
            imageAttachments = [];
            hasAttachments = fileAttachments.length > 0;
            if (!text && !hasAttachments) return;
        } else {
            const maxImageBytes = Number(uploadPolicy.maxImageBytes || 0);
            const maxTotalImageBytes = Number(uploadPolicy.maxTotalImageBytes || 0);
            const filteredImages = [];
            let runningTotal = 0;

            for (const image of imageAttachments) {
                const sizeBytes = Number(image?.size || 0) || estimateDataUrlBytes(image?.data || '');
                if (maxImageBytes > 0 && sizeBytes > maxImageBytes) {
                    addSystemMessage(
                        elements,
                        `${image?.name || 'Image'} skipped: ${formatAttachmentSize(sizeBytes)} exceeds model limit ${formatAttachmentSize(maxImageBytes)}.`
                    );
                    continue;
                }
                if (maxTotalImageBytes > 0 && (runningTotal + sizeBytes) > maxTotalImageBytes) {
                    addSystemMessage(
                        elements,
                        `${image?.name || 'Image'} skipped: combined image payload would exceed ${formatAttachmentSize(maxTotalImageBytes)}.`
                    );
                    continue;
                }
                runningTotal += sizeBytes;
                filteredImages.push(image);
            }

            imageAttachments = filteredImages;
            hasAttachments = imageAttachments.length > 0 || fileAttachments.length > 0;
            if (!text && !hasAttachments) return;
        }
    }

    const attachments = imageAttachments.map(att => ({
        fileName: att.name,
        mimeType: att.type,
        type: 'image',
        content: att.data
    }));

    // Add user message to UI
    addMessage('user', text, false, true, { images: imageAttachments.map((a) => a.data).filter(Boolean) });
    let outboundMessage = text;
    try {
        const payload = await buildOutboundMessageContextPackage(text);
        outboundMessage = payload.message;
        setCanvasContextChip(payload.canvasMeta);
    } catch (err) {
        log.warn('Failed to build outbound context, sending base message:', err?.message || err);
        outboundMessage = buildOutboundMessage(text);
        setCanvasContextChip(null);
    }

    const fileAttachmentContext = buildFileAttachmentContext(fileAttachments);
    if (fileAttachmentContext) {
        outboundMessage = outboundMessage
            ? `${outboundMessage}\n\n${fileAttachmentContext}`
            : fileAttachmentContext;
    }

    // Show typing indicator immediately
    const activeModelInfo = getActiveModelInfo();
    const activeModelName = activeModelInfo.name || state.models.primary.name || 'DRAM';
    const manualModelId = state.modelRoutingMode === 'manual'
        ? (activeModelInfo.id || state.currentActiveModelId || state.models.primary.id)
        : null;

    currentRequestId = `send-${Date.now()}`;
    trackRun(currentRequestId, state.sessionKey);
    showTypingIndicator(activeModelName, currentRequestId);

    // Set timeout for this request
    setRequestTimeout(currentRequestId);

    try {
        window.dram.socket.send({
            type: 'req',
            id: currentRequestId,
            method: 'chat.send',
            params: {
                sessionKey: state.sessionKey,
                model: manualModelId || undefined,
                message: outboundMessage,
                attachments: attachments.length > 0 ? attachments : undefined,
                idempotencyKey: `dram-${Date.now()}`
            }
        });
    } catch (err) {
        hideTypingIndicator();
        clearRequestTimeout(currentRequestId);
        addSystemMessage(elements, `Failed to send message: ${err?.message || err}`);
        currentRequestId = null;
        return;
    }

    void recordCanvasUploadHistory(
        [...imageAttachments, ...fileAttachments].map((att) => ({
            kind: att?.kind || (att?.data ? 'image' : 'file'),
            name: String(att?.name || (att?.kind === 'image' ? 'image' : 'file')),
            type: String(att?.type || ''),
            size: Number(att?.size || 0),
            extension: String(att?.extension || '')
        }))
    );

    if (elements.messageInput) {
        elements.messageInput.value = '';
        elements.messageInput.style.height = 'auto';
    }
    setCanvasContextChip(null);
    state.attachments = [];
    renderAttachmentPreview();
}

/**
 * Cancel the currently active chat request.
 */
export function cancelActiveRequest() {
    if (!currentRequestId || !state.connected) return;

    // Send abort request to engine
    window.dram.socket.send({
        type: 'req',
        id: `abort-${Date.now()}`,
        method: 'chat.abort',
        params: { sessionKey: state.sessionKey, runId: currentRequestId }
    });

    clearRequestTimeout(currentRequestId);
    addSystemMessage(elements, 'GENERATION STOPPED');
    currentRequestId = null;
}
