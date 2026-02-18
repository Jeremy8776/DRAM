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
import {
    HARD_MAX_IMAGE_INPUT_BYTES,
    DEFAULT_MAX_IMAGE_SIZE_BYTES,
    DEFAULT_MAX_TOTAL_IMAGE_BYTES,
    DEFAULT_MAX_IMAGE_DIMENSION,
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_TEXT_CHARS,
    clamp,
    formatBytes,
    imageMimeToExtension,
    getDisplayExtension,
    isImageFile,
    isTextLikeFile,
    truncateTextContent,
    getCurrentImagePayloadBytes,
    optimizeImageAttachment
} from '../attachment-utils.js';

const MAX_ATTACHMENTS = 6;
const FILE_INPUT_ID = 'file-input';

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

    let imagePayloadBytes = getCurrentImagePayloadBytes(state.attachments);
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
        const pasteEvent = event as ClipboardEvent;
        const clipboardItems = Array.from((pasteEvent.clipboardData?.items || []) as DataTransferItem[]);
        const imageFiles = clipboardItems
            .filter((item) => item && item.type && item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (imageFiles.length === 0) return;

        pasteEvent.preventDefault();
        await appendAttachments(imageFiles);
    });

    void refreshAttachButtonCapabilityHint(true);
    void refreshCanvasContextChipForDraft(elements.messageInput?.value || '');
}






