/**
 * DRAM Message Rendering Logic
 */
import { escapeHtml, formatCost } from './utils.js';
import { state } from './state.js';
import { elements } from './elements.js';
let codeBlockCounter = 0;
const MAX_CODE_BLOCK_REGISTRY = 600;
const codeBlockRegistry = new Map();
let canvasCodeActionsBound = false;

function normalizeLanguageTag(language) {
    const lower = String(language || '').trim().toLowerCase();
    if (!lower) return 'text';
    if (lower === 'py') return 'python';
    if (lower === 'js') return 'javascript';
    if (lower === 'ts') return 'typescript';
    if (lower === 'sh' || lower === 'shell') return 'bash';
    if (lower === 'yml') return 'yaml';
    return lower;
}

function languageLabel(language) {
    const value = normalizeLanguageTag(language);
    if (value === 'text') return 'code';
    return value;
}

function registerCodeBlock(language, content) {
    const codeId = `code-${++codeBlockCounter}`;
    if (codeBlockRegistry.size >= MAX_CODE_BLOCK_REGISTRY) {
        const first = codeBlockRegistry.keys().next().value;
        if (first) codeBlockRegistry.delete(first);
    }
    codeBlockRegistry.set(codeId, {
        language: normalizeLanguageTag(language),
        content: String(content || '')
    });
    return codeId;
}

async function openCodeBlockInCanvas(codeId, button = null) {
    const entry = codeBlockRegistry.get(codeId);
    if (!entry) return;
    const previousLabel = button ? button.textContent : '';
    if (button) {
        button.disabled = true;
        button.textContent = 'Opening...';
    }
    try {
        const { pushToCanvas } = await import('./canvas.js');
        if (entry.language === 'html') {
            await pushToCanvas(entry.content, { type: 'html' });
        } else {
            await pushToCanvas(entry.content, {
                type: 'code',
                language: entry.language
            });
        }
        if (button) {
            button.textContent = 'In Canvas';
        }
    } catch (err) {
        console.warn('[Renderer] Failed to open code block in canvas:', err?.message || err);
        if (button) {
            button.disabled = false;
            button.textContent = previousLabel || 'Open in Canvas';
        }
    }
}

function ensureCanvasCodeActionsBound() {
    if (canvasCodeActionsBound || !elements.messages) return;
    elements.messages.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest('.btn-open-canvas-code');
        if (!button) return;
        event.preventDefault();
        const codeId = String(button.getAttribute('data-code-id') || '').trim();
        if (!codeId) return;
        void openCodeBlockInCanvas(codeId, button);
    });
    canvasCodeActionsBound = true;
}

function renderCodeBlock(language, code) {
    const lang = normalizeLanguageTag(language);
    const rawCode = String(code || '').replace(/\r\n/g, '\n');
    const lines = rawCode.split('\n');
    const previewLineCount = 10;
    const preview = lines.slice(0, previewLineCount).join('\n');
    const previewText = lines.length > previewLineCount ? `${preview}\n...` : preview;
    const safePreview = escapeHtml(previewText);
    const codeClass = lang ? `language-${lang.replace(/[^a-z0-9_-]/g, '')}` : '';
    const codeId = registerCodeBlock(lang, rawCode);
    const safeLanguageLabel = escapeHtml(languageLabel(lang));

    return `
<div class="code-block-canvas">
    <div class="code-block-toolbar">
        <span class="code-block-lang">${safeLanguageLabel}</span>
        <button type="button" class="btn-open-canvas-code" data-code-id="${codeId}">Open in Canvas</button>
    </div>
    <pre class="code-block-preview"><code class="${codeClass}">${safePreview}</code></pre>
    <div class="code-block-hint">Full code lives in Canvas (${lines.length} lines).</div>
</div>`;
}

/**
 * Simple markdown to HTML converter for chat messages
 */
function renderMarkdown(text) {
    if (!text) return '';

    const source = String(text);
    const codeBlocks = [];

    const textWithCodePlaceholders = source.replace(/```([a-zA-Z0-9_+.-]*)[^\n]*\n([\s\S]*?)```/g, (_, language, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({
            language,
            code: String(code || '')
        });
        return `@@CODEBLOCK_${idx}@@`;
    });

    // Escape HTML after fencing so raw code can be safely re-rendered.
    let html = escapeHtml(textWithCodePlaceholders);

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Headers (only at start of line)
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Links - validate protocol to prevent javascript: or file: injection
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, href) => {
        const lowerHref = href.toLowerCase().trim();
        const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
        const isSafe = allowedProtocols.some(p => lowerHref.startsWith(p)) || (!lowerHref.includes(':') && !lowerHref.startsWith('//'));

        if (isSafe) {
            return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
        }
        return `<u>${text}</u>`; // Render as underlined text if unsafe
    });

    // Line breaks (preserve newlines)
    html = html.replace(/\n/g, '<br>');

    // Restore protected code blocks
    html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (_match, idx) => {
        const i = Number(idx);
        const block = Number.isFinite(i) ? codeBlocks[i] : null;
        return block ? renderCodeBlock(block.language, block.code) : '';
    });

    return html;
}

export function renderMessage(msg) {
    if (!elements.messages) return;
    ensureCanvasCodeActionsBound();

    const hero = document.getElementById('hero-welcome');
    if (hero) hero.classList.add('hidden');

    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    div.dataset.id = msg.id;

    const images = (msg.meta?.images || []).map(src => `<img class="message-image" src="${escapeHtml(src)}">`).join('');
    const roleLabel = msg.role === 'user'
        ? '<span class="system-label">USER // </span>'
        : '<span class="system-label" style="color:var(--accent)">DRAM // </span>';

    // Use displayedContent if available (for TTS sync), otherwise full content
    const textToShow = (typeof msg.displayedContent === 'string' ? msg.displayedContent : msg.content) || '';

    div.innerHTML = `${images}<div class="message-content">${roleLabel}${renderMarkdown(textToShow.trim())}</div><div class="message-meta"></div>`;
    elements.messages.appendChild(div);
}

export function updateMessageElement(msg) {
    if (!elements.messages) return;
    ensureCanvasCodeActionsBound();

    const div = elements.messages.querySelector(`[data-id="${msg.id}"]`);
    if (div) {
        const roleLabel = msg.role === 'user' ? '<span class="system-label">USER // </span>' : '<span class="system-label" style="color:var(--accent)">DRAM // </span>';
        const contentEl = div.querySelector('.message-content');

        // Use displayedContent if available
        const textToShow = (typeof msg.displayedContent === 'string' ? msg.displayedContent : msg.content) || '';

        if (contentEl) contentEl.innerHTML = `${roleLabel}${renderMarkdown(textToShow.trim())}`;
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }
}

export function updateMessageCost(msg, usage) {
    if (!elements.messages) return;

    const div = elements.messages.querySelector(`[data-id="${msg.id}"]`);
    if (div) {
        const metaEl = div.querySelector('.message-meta');
        if (metaEl && usage) {
            const costStr = formatCost(usage.cost);
            const tokensStr = `${(usage.inputTokens || 0).toLocaleString()}+${(usage.outputTokens || 0).toLocaleString()} tokens`;
            metaEl.innerHTML = `<span class="cost-badge">${costStr}</span><span class="tokens-badge">${tokensStr}</span>`;
        }
    }
}

export function addMessage(role, content, streaming = false, scroll = true, meta = {}) {
    const msg = { id: crypto.randomUUID(), role, content, streaming, meta };
    state.messages.push(msg);
    renderMessage(msg);
    if (scroll && elements.messages) elements.messages.scrollTop = elements.messages.scrollHeight;
    return msg;
}

// ===== Typing Indicator =====
import { getIcon } from './icons.js';

let typingIndicatorEl = null;

export function showTypingIndicator(modelName = 'DRAM', _runId = null) {
    if (typingIndicatorEl) return; // Already showing

    const hero = document.getElementById('hero-welcome');
    if (hero) hero.classList.add('hidden');

    const div = document.createElement('div');
    div.className = 'message assistant typing';
    div.id = 'typing-indicator';
    const safeModelName = escapeHtml(modelName);
    div.innerHTML = `
        <div class="message-content">
            <span class="system-label" style="color:var(--accent)">${safeModelName} // </span>
            <span class="typing-dots">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            </span>
            <span class="typing-text">thinking</span>
            <button class="btn-stop-generation" title="Stop generating">${getIcon('STOP')}</button>
        </div>
        <div class="message-meta">
            <span class="typing-status">generating response...</span>
        </div>
    `;

    // Wire up stop button
    const stopBtn = div.querySelector('.btn-stop-generation');
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            cancelGeneration();
        });
    }

    elements.messages.appendChild(div);
    typingIndicatorEl = div;
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

function cancelGeneration() {
    // Import dynamically to avoid circular dependency
    import('./socket.js').then(m => {
        if (m.cancelActiveRequest) {
            m.cancelActiveRequest();
        }
    });
    hideTypingIndicator();
}

export function hideTypingIndicator() {
    if (typingIndicatorEl) {
        typingIndicatorEl.remove();
        typingIndicatorEl = null;
    }
}

export function updateTypingStatus(status, isFallback = false) {
    if (!typingIndicatorEl) return;
    const statusEl = typingIndicatorEl.querySelector('.typing-status');
    if (statusEl) {
        statusEl.textContent = status;
        if (isFallback) {
            statusEl.classList.add('fallback-active');
            statusEl.textContent = '[RECOVERY] ' + status;
        }
    }
}

export function updateTypingWorklog(worklogText = '') {
    // Worklog panel intentionally disabled to avoid duplicate waiting UI.
    void worklogText;
}

export function clearMessages() {
    state.messages = [];
    const hero = document.getElementById('hero-welcome');

    // Selectively remove messages while keeping the hero structure
    const messages = elements.messages.querySelectorAll('.message');
    messages.forEach(m => m.remove());

    if (hero) {
        hero.classList.remove('hidden');
    }
}

function getAttachmentExtension(att) {
    const fromState = String(att?.extension || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (fromState) return fromState.slice(0, 6);
    const name = String(att?.name || '');
    const idx = name.lastIndexOf('.');
    if (idx > -1 && idx < name.length - 1) {
        return name.slice(idx + 1).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6) || 'FILE';
    }
    return 'FILE';
}

function buildAttachmentFileSvg(extLabel = 'FILE') {
    const safeLabel = escapeHtml(String(extLabel || 'FILE').slice(0, 6));
    return `<svg class="preview-file-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
<path d="M14 6h26l10 10v42H14z" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M40 6v10h10" fill="none" stroke="currentColor" stroke-width="2"></path>
<text x="32" y="44" text-anchor="middle">${safeLabel}</text>
</svg>`;
}

export function renderAttachmentPreview() {
    if (!elements.previewArea) return;
    elements.previewArea.classList.toggle('hidden', state.attachments.length === 0);
    elements.previewArea.innerHTML = '';
    state.attachments.forEach((att) => {
        const div = document.createElement('div');
        const isImage = typeof att?.data === 'string' && att.data.startsWith('data:image/');
        div.className = `preview-item ${isImage ? 'is-image' : 'is-file'}`;
        div.title = String(att?.name || 'attachment');

        if (isImage) {
            const image = document.createElement('img');
            image.className = 'preview-image';
            image.src = att.data;
            image.alt = String(att?.name || 'image');
            div.appendChild(image);
        } else {
            const fileIcon = document.createElement('div');
            fileIcon.className = 'preview-file-icon';
            fileIcon.innerHTML = buildAttachmentFileSvg(getAttachmentExtension(att));
            div.appendChild(fileIcon);

            const fileName = document.createElement('div');
            fileName.className = 'preview-file-name';
            fileName.textContent = String(att?.name || 'file');
            div.appendChild(fileName);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove-attach';
        removeBtn.title = 'Remove';
        removeBtn.type = 'button';
        removeBtn.innerHTML = getIcon('CLOSE');
        removeBtn.addEventListener('click', () => {
            state.attachments = state.attachments.filter((a) => a.id !== att.id);
            renderAttachmentPreview();
        });
        div.appendChild(removeBtn);

        elements.previewArea.appendChild(div);
    });
}
import { updateModelStats } from './rate-limits.js';

export function updateInfobar(metadata = {}) {
    updateModelStats(metadata);
}



/**
 * Update the hero section with active capabilities (skills)
 * @param {Array} skills - List of skills from engine
 */
export function updateHeroCapabilities(skills) {
    const container = document.getElementById('hero-capabilities');
    if (!container) return;

    const activeSkills = skills.filter(s => s && s.enabled);
    if (activeSkills.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = activeSkills.map(sk => `
        <div class="capability-tag active" title="${escapeHtml(sk.description || '')}">
            <span class="dot"></span>
            ${escapeHtml(sk.name || sk.id)}
        </div>
    `).join('');
}






