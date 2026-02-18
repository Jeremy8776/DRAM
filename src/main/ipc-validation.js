/**
 * DRAM IPC Validation Utilities
 */

export function validateString(value, maxLength = 10000) {
    if (typeof value !== 'string') {
        throw new Error('Invalid input: expected string');
    }
    if (value.length > maxLength) {
        throw new Error(`Invalid input: string too long (max ${maxLength})`);
    }
    // Check for null bytes (path traversal indicator)
    if (value.includes('\0')) {
        throw new Error('Invalid input: contains null bytes');
    }
    return value;
}

export function validateUrl(value) {
    validateString(value, 2000);
    try {
        const url = new URL(value);
        const allowedProtocols = ['http:', 'https:'];
        if (!allowedProtocols.includes(url.protocol)) {
            throw new Error('Invalid protocol');
        }
        return value;
    } catch {
        throw new Error('Invalid URL');
    }
}

export function validateGatewayUrl(value) {
    validateString(value, 500);
    try {
        const url = new URL(value);
        const allowedHosts = ['localhost', '127.0.0.1', '[::1]'];
        const allowedProtocols = ['ws:', 'wss:', 'http:', 'https:'];

        if (!allowedHosts.includes(url.hostname)) {
            throw new Error('Gateway URL must be localhost');
        }
        if (!allowedProtocols.includes(url.protocol)) {
            throw new Error('Invalid protocol for gateway');
        }
        return value;
    } catch (err) {
        if (err.message.includes('Gateway') || err.message.includes('Invalid')) {
            throw err;
        }
        throw new Error('Invalid gateway URL');
    }
}

export function validateSettingsKey(key) {
    validateString(key, 200);
    // More restrictive: only allow alphanumeric, dots, underscores, and hyphens
    // Must start with alphanumeric
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key)) {
        throw new Error('Invalid settings key: must start with alphanumeric and contain only alphanumerics, dots, underscores, and hyphens');
    }
    // Prevent path traversal patterns
    if (key.includes('..') || key.startsWith('.') || key.endsWith('.')) {
        throw new Error('Invalid settings key: path traversal detected');
    }
    return key;
}

/**
 * Validate an API key format
 * @param {string} value - API key to validate
 * @param {number} maxLength - Maximum length
 * @returns {string} Validated API key
 */
export function validateApiKey(value, maxLength = 500) {
    validateString(value, maxLength);
    // API keys typically don't have newlines or control characters
    if (hasControlChars(value)) {
        throw new Error('Invalid API key: contains control characters');
    }
    return value.trim();
}

function hasControlChars(value) {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code <= 31 || code === 127) {
            return true;
        }
    }
    return false;
}

/**
 * Validate an object is a plain object (not array, null, etc)
 * @param {any} value - Value to validate
 * @param {number} maxKeys - Maximum number of keys allowed
 * @returns {Object} Validated object
 */
export function validateObject(value, maxKeys = 100) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Invalid input: expected object');
    }
    const keys = Object.keys(value);
    if (keys.length > maxKeys) {
        throw new Error(`Invalid input: object has too many keys (max ${maxKeys})`);
    }
    return value;
}

/**
 * Validate an array
 * @param {any} value - Value to validate
 * @param {number} maxLength - Maximum array length
 * @param {Function} itemValidator - Optional validator for each item
 * @returns {Array} Validated array
 */
export function validateArray(value, maxLength = 1000, itemValidator = null) {
    if (!Array.isArray(value)) {
        throw new Error('Invalid input: expected array');
    }
    if (value.length > maxLength) {
        throw new Error(`Invalid input: array too long (max ${maxLength})`);
    }
    if (itemValidator) {
        value.forEach((item, index) => {
            try {
                itemValidator(item);
            } catch (err) {
                throw new Error(`Invalid input: array item at index ${index}: ${err.message}`);
            }
        });
    }
    return value;
}

/**
 * Validate a file path (basic validation, should be combined with path traversal checks)
 * @param {string} value - Path to validate
 * @param {number} maxLength - Maximum path length
 * @returns {string} Validated path
 */
export function validateFilePath(value, maxLength = 1000) {
    validateString(value, maxLength);
    // Check for null bytes
    if (value.includes('\0')) {
        throw new Error('Invalid path: contains null bytes');
    }
    // Check for obvious path traversal
    if (value.includes('..')) {
        throw new Error('Invalid path: contains parent directory references');
    }
    return value;
}

/**
 * Validate a port number
 * @param {any} value - Port to validate
 * @returns {number} Validated port number
 */
export function validatePort(value) {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('Invalid port: must be between 1 and 65535');
    }
    return port;
}

/**
 * Validate email address (basic validation)
 * @param {string} value - Email to validate
 * @returns {string} Validated email
 */
export function validateEmail(value) {
    validateString(value, 254);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
        throw new Error('Invalid email format');
    }
    return value.toLowerCase().trim();
}
