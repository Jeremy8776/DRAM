/**
 * Attachment utility helpers for chat input.
 */

export const HARD_MAX_IMAGE_INPUT_BYTES = 35 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_DIMENSION = 2048;
export const MIN_IMAGE_DIMENSION = 640;
export const IMAGE_QUALITY_STEPS = [0.9, 0.84, 0.78, 0.72];
export const IMAGE_SCALE_STEPS = [1, 0.9, 0.8, 0.72, 0.64, 0.56];
export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_TEXT_CHARS = 60000;

const IMAGE_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'avif']);
const TEXT_FILE_EXTENSIONS = new Set([
    'txt', 'md', 'markdown', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'php', 'java', 'kt', 'swift',
    'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'scala', 'lua', 'r', 'sql', 'graphql', 'gql',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'svg', 'sh', 'bash', 'zsh', 'ps1',
    'bat', 'cmd', 'dockerfile', 'makefile', 'env'
]);

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
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

export function getDisplayExtension(file) {
    const ext = getFileExtension(file?.name || '');
    if (ext) return ext.slice(0, 6).toUpperCase();
    const mime = String(file?.type || '');
    if (mime.includes('/')) {
        return mime.split('/')[1].replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'FILE';
    }
    return 'FILE';
}

export function isImageFile(file) {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    const ext = getFileExtension(file?.name || '');
    return IMAGE_FILE_EXTENSIONS.has(ext);
}

export function isTextLikeFile(file) {
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

export function truncateTextContent(value, maxChars = MAX_FILE_TEXT_CHARS) {
    const text = String(value || '');
    if (text.length <= maxChars) {
        return { text, truncated: false };
    }
    return { text: text.slice(0, maxChars), truncated: true };
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function dataUrlByteSize(dataUrl = '') {
    const value = String(dataUrl || '');
    const comma = value.indexOf(',');
    if (comma < 0) return 0;
    const body = value.slice(comma + 1);
    return Math.floor((body.length * 3) / 4);
}

export function imageMimeToExtension(mimeType = '') {
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

export function getCurrentImagePayloadBytes(attachments = []) {
    return attachments
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

function readFileAsImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
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

export async function optimizeImageAttachment(file: File, policy: any = {}) {
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






