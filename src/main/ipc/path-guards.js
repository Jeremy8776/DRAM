import fs from 'node:fs';
import path from 'node:path';

function normalizeForComparison(value) {
    if (process.platform === 'win32') {
        return value.toLowerCase();
    }
    return value;
}

function tryRealpath(value) {
    try {
        return fs.realpathSync.native(value);
    } catch {
        return value;
    }
}

export function isPathWithinBaseDir(baseDir, targetPath) {
    if (typeof baseDir !== 'string' || typeof targetPath !== 'string') return false;
    if (!baseDir.trim() || !targetPath.trim()) return false;

    const resolvedBase = normalizeForComparison(tryRealpath(path.resolve(baseDir)));
    const resolvedTarget = normalizeForComparison(tryRealpath(path.resolve(targetPath)));
    const relative = path.relative(resolvedBase, resolvedTarget);

    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

