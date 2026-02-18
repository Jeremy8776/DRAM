/**
 * DRAM IPC - Shell and FS Utils
 */
import path from 'path';

/**
 * Validate an ID to prevent shell injection.
 * Only allows alphanumeric characters, hyphens, underscores, and dots.
 */
export function validateSafeId(id, maxLength = 100) {
    if (typeof id !== 'string' || id.length === 0 || id.length > maxLength) {
        throw new Error('Invalid ID: must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_\-.]+$/.test(id)) {
        throw new Error('Invalid ID: contains unsafe characters');
    }
    return id;
}

/**
 * Validate a path to prevent path traversal attacks.
 * Returns the normalized absolute path if valid.
 */
export function validateSafePath(filePath, allowedBasePaths) {
    if (typeof filePath !== 'string' || filePath.length === 0) {
        throw new Error('Invalid path');
    }

    const normalizedPath = path.resolve(filePath);
    const isWindows = process.platform === 'win32';
    const targetPath = isWindows ? normalizedPath.toLowerCase() : normalizedPath;

    for (const basePath of allowedBasePaths) {
        const normalizedBase = path.resolve(basePath);
        const base = isWindows ? normalizedBase.toLowerCase() : normalizedBase;
        if (targetPath.startsWith(base + path.sep) || targetPath === base) {
            return normalizedPath;
        }
    }

    throw new Error('Path traversal detected: access denied');
}




