/**
 * DRAM Listeners - Chat
 */
import { elements } from '../elements.js';
import { sendMessage, resetChat, refreshCanvasContextChipForDraft } from '../socket.js';
import { renderAttachmentPreview } from '../renderer.js';
import { isVoiceActive, stopAndSend } from '../voice-mode.js';
import { state } from '../state.js';
import { addSystemMessage } from '../utils.js';
import {
    getActiveModelUploadPolicy,
    imageUploadBlockedMessage,
    refreshAttachButtonCapabilityHint
} from '../model-capabilities.js';

const MAX_ATTACHMENTS = 6;
const HARD_MAX_IMAGE_INPUT_BYTES = 35 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_DIMENSION = 2048;
const MIN_IMAGE_DIMENSION = 640;
const IMAGE_QUALITY_STEPS = [0.9, 0.84, 0.78, 0.72];
const IMAGE_SCALE_STEPS = [1, 0.9, 0.8, 0.72, 0.64, 0.56];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_TEXT_CHARS = 60000;
const FILE_INPUT_ID = 'file-input';
const IMAGE_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'avif']);

const TEXT_FILE_EXTENSIONS = new Set([
    'txt', 'md', 'markdown', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'php', 'java', 'kt', 'swift',
    'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'scala', 'lua', 'r', 'sql', 'graphql', 'gql',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'svg', 'sh', 'bash', 'zsh', 'ps1',
    'bat', 'cmd', 'dockerfile', 'makefile', 'env'
]);

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function getFileExtension(name = '') {
    const value = String(name || '');
    const idx = value.lastIndexOf('.');
    if (idx < 0 || idx === value.length - 1) return '';
    return value.slice(idx + 1).trim().toLowerCase();
}

function getDisplayExtension(file) {
    const ext = getFileExtension(file?.name || '');
    if (ext) return ext.slice(0, 6).toUpperCase();
    const mime = String(file?.type || '');
    if (mime.includes('/')) {
        return mime.split('/')[1].replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'FILE';
    }
    return 'FILE';
}

function isImageFile(file) {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    const ext = getFileExtension(file?.name || '');
    return IMAGE_FILE_EXTENSIONS.has(ext);
}

function isTextLikeFile(file) {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.startsWith('text/')) return true;
    if (
        mime.includes('json')
        || mime.includes('xml')
        || mime.includes('javascript')
        || mime.includes('typescript')
        || mime.includes('x-shellscript')
    ) {
        return true;
    }
    const ext = getFileExtension(file?.name || '');
    return TEXT_FILE_EXTENSIONS.has(ext);
}

function truncateTextContent(value, maxChars = MAX_FILE_TEXT_CHARS) {
    const text = String(value || '');
    if (text.length <= maxChars) {
        return { text, truncated: false };
    }
    return { text: text.slice(0, maxChars), truncated: true };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function dataUrlByteSize(dataUrl = '') {
    const value = String(dataUrl || '');
    const comma = value.indexOf(',');
    if (comma < 0) return 0;
    const body = value.slice(comma + 1);
    return Math.floor((body.length * 3) / 4);
}

function imageMimeToExtension(mimeType = '') {
    const lower = String(mimeType || '').toLowerCase();
    if (!lower) return '';
    if (lower.includes('jpeg')) return 'JPG';
    if (lower.includes('png')) return 'PNG';
    if (lower.includes('webp')) return 'WEBP';
    if (lower.includes('gif')) return 'GIF';
    if (lower.includes('svg')) return 'SVG';
    return '';
}

function uniqueValues(values = []) {
    const seen = new Set();
    const output = [];
    for (const value of values) {
        const key = String(value || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        output.push(value);
    }
    return output;
}

function getCurrentImagePayloadBytes() {
    return state.attachments
        .filter((att) => att?.kind === 'image')
        .reduce((sum, att) => {
            const explicit = Number(att?.size || 0);
            if (Number.isFinite(explicit) && explicit > 0) return sum + explicit;
            return sum + dataUrlByteSize(att?.data || '');
        }, 0);
}

function shouldKeepLossless(file) {
    const mime = String(file?.type || '').toLowerCase();
    return mime.includes('png') || mime.includes('gif') || mime.includes('svg');
}

function pickCompressionMimeTypes(file) {
    const original = String(file?.type || '').toLowerCase();
    if (original.includes('svg')) return [original];
    if (original.includes('gif')) return ['image/gif'];
    if (original.includes('png')) return ['image/webp', 'image/png', 'image/jpeg'];
    if (original.includes('webp')) return ['image/webp', 'image/jpeg'];
    return ['image/jpeg', 'image/webp'];
}

function readFileAsImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = dataUrl;
    });
}

function canvasToDataUrl(canvas, mimeType, quality) {
    if (mimeType === 'image/png' || mimeType === 'image/gif' || mimeType === 'image/svg+xml') {
        return canvas.toDataURL(mimeType);
    }
    return canvas.toDataURL(mimeType, quality);
}

async function optimizeImageAttachment(file, policy = {}) {
    const originalData = await readFileAsDataUrl(file);
    if (!originalData.startsWith('data:image/')) {
        throw new Error('Invalid image payload');
    }

    const targetBytes = clamp(
        Number(policy.maxImageBytes || DEFAULT_MAX_IMAGE_SIZE_BYTES),
        256 * 1024,
        30 * 1024 * 1024
    );
    const maxDimension = clamp(
        Number(policy.maxImageDimension || DEFAULT_MAX_IMAGE_DIMENSION),
        MIN_IMAGE_DIMENSION,
        4096
    );

    const originalBytes = dataUrlByteSize(originalData);
    const originalMime = String(file.type || 'image/jpeg').toLowerCase();
    if (originalBytes <= targetBytes) {
        return {
            data: originalData,
            mimeType: originalMime,
            sizeBytes: originalBytes,
            changed: false,
            width: null,
            height: null
        };
    }

    if (originalMime.includes('svg')) {
        return {
            data: originalData,
            mimeType: originalMime,
            sizeBytes: originalBytes,
            changed: false,
            width: null,
            height: null
        };
    }

    const image = await readFileAsImage(originalData);
    const sourceWidth = Number(image.naturalWidth || image.width || 0);
    const sourceHeight = Number(image.naturalHeight || image.height || 0);
    if (!sourceWidth || !sourceHeight) {
        throw new Error('Image dimensions unavailable');
    }

    const maxSide = Math.max(sourceWidth, sourceHeight);
    const baseScale = maxSide > maxDimension ? (maxDimension / maxSide) : 1;
    const mimeCandidates = uniqueValues(pickCompressionMimeTypes(file));
    const qualitySteps = shouldKeepLossless(file) ? [undefined, ...IMAGE_QUALITY_STEPS] : IMAGE_QUALITY_STEPS;
    let best = null;

    for (const scaleStep of IMAGE_SCALE_STEPS) {
        const scale = clamp(baseScale * scaleStep, MIN_IMAGE_DIMENSION / maxSide, 1);
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) continue;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        for (const mimeType of mimeCandidates) {
            for (const quality of qualitySteps) {
                const data = canvasToDataUrl(canvas, mimeType, quality);
                const sizeBytes = dataUrlByteSize(data);
                if (!best || sizeBytes < best.sizeBytes) {
                    best = { data, mimeType, sizeBytes, width, height };
                }
                if (sizeBytes <= targetBytes) {
                    return {
                        data,
                        mimeType,
                        sizeBytes,
                        changed: true,
                        width,
                        height
                    };
                }
            }
        }
    }

    if (!best) {
        throw new Error('Image optimization failed');
    }

    return {
        ...best,
        changed: true
    };
}

function ensureFileInputElement() {
    let input = elements.fileInput;
    if (!(input instanceof HTMLInputElement)) {
        const existing = document.getElementById(FILE_INPUT_ID);
        if (existing instanceof HTMLInputElement) {
            input = existing;
        } else {
            input = document.createElement('input');
            input.type = 'file';
            input.id = FILE_INPUT_ID;
            input.className = 'hidden';
            document.body.appendChild(input);
        }
        elements.fileInput = input;
    }
    input.accept = '*/*';
    input.multiple = true;
    return input;
}

async function appendAttachments(files) {
    const items = Array.from(files || []);
    if (items.length === 0) return;

    const imageCandidates = items.filter((file) => file && isImageFile(file));
    let imageUploadAllowed = true;
    let imageUploadPolicy = {
        supportsImages: true,
        maxImageBytes: DEFAULT_MAX_IMAGE_SIZE_BYTES,
        maxTotalImageBytes: DEFAULT_MAX_TOTAL_IMAGE_BYTES,
        maxImageDimension: DEFAULT_MAX_IMAGE_DIMENSION
    };
    if (imageCandidates.length > 0) {
        imageUploadPolicy = await getActiveModelUploadPolicy();
        imageUploadAllowed = Boolean(imageUploadPolicy.supportsImages);
        if (!imageUploadAllowed) {
            addSystemMessage(elements, imageUploadBlockedMessage(imageUploadPolicy));
        }
    }

    const candidates = [];
    for (const file of items) {
        if (!file) continue;
        if (isImageFile(file)) {
            if (!imageUploadAllowed) continue;
            candidates.push(file);
            continue;
        }
        candidates.push(file);
    }

    if (candidates.length === 0) {
        addSystemMessage(elements, 'No files were attached.');
        return;
    }

    const availableSlots = Math.max(0, MAX_ATTACHMENTS - state.attachments.length);
    if (availableSlots === 0) {
        addSystemMessage(elements, `Attachment limit reached (${MAX_ATTACHMENTS} files).`);
        return;
    }

    const selected = candidates.slice(0, availableSlots);
    if (selected.length < candidates.length) {
        addSystemMessage(elements, `Only the first ${selected.length} file(s) were attached.`);
    }

    let imagePayloadBytes = getCurrentImagePayloadBytes();
    const imagePayloadCap = clamp(
        Number(imageUploadPolicy.maxTotalImageBytes || DEFAULT_MAX_TOTAL_IMAGE_BYTES),
        DEFAULT_MAX_IMAGE_SIZE_BYTES,
        90 * 1024 * 1024
    );

    for (const file of selected) {
        const isImage = isImageFile(file);
        const name = file.name || (isImage ? 'image' : 'file');
        if (isImage) {
            if (file.size > HARD_MAX_IMAGE_INPUT_BYTES) {
                addSystemMessage(elements, `${name} exceeds 35 MB and was skipped.`);
                continue;
            }
            try {
                const optimized = await optimizeImageAttachment(file, imageUploadPolicy);
                if (!optimized.data.startsWith('data:image/')) {
                    addSystemMessage(elements, `${name} is not a valid image payload after optimization.`);
                    continue;
                }

                const imageCapBytes = clamp(
                    Number(imageUploadPolicy.maxImageBytes || DEFAULT_MAX_IMAGE_SIZE_BYTES),
                    256 * 1024,
                    30 * 1024 * 1024
                );
                if (optimized.sizeBytes > imageCapBytes) {
                    addSystemMessage(elements, `${name} is still too large after optimization (${formatBytes(optimized.sizeBytes)} > ${formatBytes(imageCapBytes)}).`);
                    continue;
                }

                if (imagePayloadBytes + optimized.sizeBytes > imagePayloadCap) {
                    addSystemMessage(elements, `${name} skipped: total image payload would exceed ${formatBytes(imagePayloadCap)} for this model.`);
                    continue;
                }

                imagePayloadBytes += optimized.sizeBytes;
                state.attachments.push({
                    id: crypto.randomUUID(),
                    kind: 'image',
                    name,
                    type: optimized.mimeType || file.type || 'image/*',
                    size: Number(optimized.sizeBytes || file.size || 0),
                    extension: imageMimeToExtension(optimized.mimeType) || getDisplayExtension(file),
                    data: optimized.data
                });

                if (optimized.changed) {
                    addSystemMessage(
                        elements,
                        `${name} optimized: ${formatBytes(file.size)} -> ${formatBytes(optimized.sizeBytes)}`
                    );
                }
            } catch (err) {
                console.warn('[Chat] Failed to process image attachment:', err?.message || err);
                addSystemMessage(elements, `Failed to attach ${name}.`);
            }
            continue;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            addSystemMessage(elements, `${name} exceeds 8 MB and was skipped.`);
            continue;
        }

        try {
            const textLike = isTextLikeFile(file);
            let textContent = '';
            let truncated = false;
            if (textLike) {
                const raw = await file.text();
                const result = truncateTextContent(raw, MAX_FILE_TEXT_CHARS);
                textContent = result.text;
                truncated = result.truncated;
            }

            state.attachments.push({
                id: crypto.randomUUID(),
                kind: 'file',
                name,
                type: file.type || 'application/octet-stream',
                size: Number(file.size || 0),
                extension: getDisplayExtension(file),
                textLike,
                textContent,
                truncated
            });

            if (!textLike) {
                addSystemMessage(elements, `${name} attached as binary metadata (content not inlined).`);
            } else if (truncated) {
                addSystemMessage(elements, `${name} was trimmed for prompt safety.`);
            }
        } catch (err) {
            console.warn('[Chat] Failed to process file attachment:', err?.message || err);
            addSystemMessage(elements, `Failed to attach ${name}.`);
        }
    }

    renderAttachmentPreview();
}

export function setupChatListeners(on) {
    const attachInput = ensureFileInputElement();
    if (!attachInput.dataset.chatAttachBound) {
        attachInput.addEventListener('change', async (event) => {
            const input = event?.target;
            if (!(input instanceof HTMLInputElement)) return;
            const files = Array.from(input.files || []);
            if (files.length > 0) {
                await appendAttachments(files);
            }
            input.value = '';
        });
        attachInput.dataset.chatAttachBound = '1';
    }

    const btnNewChat = document.getElementById('btn-new-chat');
    if (btnNewChat) {
        on(btnNewChat, 'click', () => {
            resetChat();
        });
    }

    const btnNewTab = document.getElementById('btn-new-tab');
    if (btnNewTab) {
        on(btnNewTab, 'click', () => {
            import('../tabs.js').then(m => m.createNewTab());
        });
    }

    on(elements.btnSend, 'click', async (e) => {
        e.preventDefault();
        if (isVoiceActive) {
            stopAndSend();
        } else {
            await sendMessage();
            if (elements.messageInput) elements.messageInput.style.height = '36px';
        }
    });

    on(elements.messageInput, 'input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        void refreshCanvasContextChipForDraft(this.value);
    });

    on(elements.messageInput, 'keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isVoiceActive) {
                stopAndSend();
            } else {
                await sendMessage();
                if (elements.messageInput) elements.messageInput.style.height = '36px';
            }
        }
    });

    on(elements.btnAttach, 'click', async () => {
        const input = ensureFileInputElement();
        input.value = '';
        input.click();
    });

    on(elements.messageInput, 'paste', async (event) => {
        const clipboardItems = Array.from(event.clipboardData?.items || []);
        const imageFiles = clipboardItems
            .filter((item) => item && item.type && item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (imageFiles.length === 0) return;

        event.preventDefault();
        await appendAttachments(imageFiles);
    });

    void refreshAttachButtonCapabilityHint(true);
    void refreshCanvasContextChipForDraft(elements.messageInput?.value || '');
}
