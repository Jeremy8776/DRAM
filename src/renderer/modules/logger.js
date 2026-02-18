/**
 * DRAM Renderer - Secure Logger and Redaction
 * 
 * Features:
 * - Automatic redaction of sensitive data (API keys, tokens, etc.)
 * - Log level controls (debug logs suppressed in production)
 * - Context-based logging with prefixes
 * 
 * Usage:
 *   import { log, logger } from './logger.js';
 *   log.debug('Debug message');  // Only shows in dev mode
 *   log.info('Info message');    // Shows based on log level
 *   log.warn('Warning');         // Shows in production
 *   log.error('Error');          // Always shows
 *   
 *   // With context
 *   const voiceLog = logger('Voice');
 *   voiceLog.info('Mode activated');  // [Voice] Mode activated
 */

const DEFAULT_REDACT_MIN_LENGTH = 18;
const DEFAULT_REDACT_KEEP_START = 6;
const DEFAULT_REDACT_KEEP_END = 4;

const REDACT_PATTERNS = [
    // ENV-style assignments: KEY=value
    /\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\b\s*[=:]\s*(["']?)([^\s"'\\]+)\1/gi,
    // JSON fields: "apiKey": "value"
    /"(?:apiKey|token|secret|password|passwd|accessToken|refreshToken)"\s*:\s*"([^"]+)"/gi,
    // CLI flags: --api-key value
    /--(?:api[-_]?key|token|secret|password|passwd)\s+(["']?)([^\s"']+)\1/gi,
    // Authorization headers
    /Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-+=]+)/gi,
    /\bBearer\s+([A-Za-z0-9._\-+=]{18,})\b/gi,
    // Common token prefixes
    /\b(sk-[A-Za-z0-9_-]{8,})\b/gi,
    /\b(ghp_[A-Za-z0-9]{20,})\b/gi,
    /\b(gsk_[A-Za-z0-9_-]{10,})\b/gi,
    /\b(AIza[0-9A-Za-z\-_]{20,})\b/gi,
];

/* ═══════════════════════════════════════════
   LOG LEVEL SYSTEM
   ═══════════════════════════════════════════ */

/**
 * Log levels
 */
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

// Detect dev mode
const isDev = typeof window !== 'undefined' &&
    (window.location?.hostname === 'localhost' ||
        window.dram?.isDev === true ||
        localStorage?.getItem('dram.debug') === 'true');

// Default log level based on environment
let currentLevel = isDev ? LogLevel.DEBUG : LogLevel.WARN;

/**
 * Set the global log level
 * @param {'debug' | 'info' | 'warn' | 'error' | 'none'} level
 */
export function setLogLevel(level) {
    const levelMap = {
        'debug': LogLevel.DEBUG,
        'info': LogLevel.INFO,
        'warn': LogLevel.WARN,
        'error': LogLevel.ERROR,
        'none': LogLevel.NONE
    };
    currentLevel = levelMap[level] ?? LogLevel.WARN;
}

/**
 * Get current log level
 * @returns {number}
 */
export function getLogLevel() {
    return currentLevel;
}

/* ═══════════════════════════════════════════
   REDACTION FUNCTIONS
   ═══════════════════════════════════════════ */

function maskToken(token) {
    if (!token || typeof token !== 'string') return token;
    if (token.length < DEFAULT_REDACT_MIN_LENGTH) return '***';
    const start = token.slice(0, DEFAULT_REDACT_KEEP_START);
    const end = token.slice(-DEFAULT_REDACT_KEEP_END);
    return `${start}…${end}`;
}

/**
 * Redact sensitive patterns in text
 * @param {string} text 
 * @returns {string}
 */
export function redactSensitiveText(text) {
    if (!text || typeof text !== 'string') return text;

    let result = text;
    for (const pattern of REDACT_PATTERNS) {
        result = result.replace(pattern, (match, p1, p2) => {
            // Find the token in the match groups
            const token = p2 || p1 || (match.includes(':') ? match.split(':')[1].trim() : match);
            // Handle case where capture groups might not be exactly what we want to mask
            // If it's a JSON-like match, we only want to mask the value
            const masked = maskToken(token);
            return match.replace(token, masked);
        });
    }
    return result;
}

/**
 * Recursive object redaction
 */
export function redactObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    // Handle Error objects specially to preserve error info
    if (obj instanceof Error) {
        const errorObj = {
            name: obj.name,
            message: redactSensitiveText(obj.message),
        };
        if (obj.stack) {
            errorObj.stack = redactSensitiveText(obj.stack);
        }
        // Copy any custom properties
        for (const [key, value] of Object.entries(obj)) {
            if (key !== 'name' && key !== 'message' && key !== 'stack') {
                errorObj[key] = redactObject(value);
            }
        }
        return errorObj;
    }

    if (Array.isArray(obj)) {
        return obj.map(redactObject);
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof key === 'string' && /key|token|secret|password|passwd/i.test(key)) {
            if (typeof value === 'string') {
                result[key] = maskToken(value);
            } else {
                result[key] = '***';
            }
        } else if (typeof value === 'object' && value !== null) {
            result[key] = redactObject(value);
        } else if (typeof value === 'string') {
            result[key] = redactSensitiveText(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

/* ═══════════════════════════════════════════
   LOGGING FUNCTIONS
   ═══════════════════════════════════════════ */

/**
 * Create a logger with optional context prefix
 * @param {string} [context] - Optional context prefix (e.g., 'Voice', 'Socket')
 * @returns {object} Logger object with debug, info, warn, error methods
 */
export function logger(context = '') {
    const prefix = context ? `[${context}] ` : '';

    return {
        debug: (message, ...args) => {
            if (currentLevel <= LogLevel.DEBUG) {
                console.log(prefix + message, ...args);
            }
        },
        info: (message, ...args) => {
            if (currentLevel <= LogLevel.INFO) {
                console.log(prefix + message, ...args);
            }
        },
        warn: (message, ...args) => {
            if (currentLevel <= LogLevel.WARN) {
                console.warn(prefix + message, ...args);
            }
        },
        error: (message, ...args) => {
            if (currentLevel <= LogLevel.ERROR) {
                console.error(prefix + message, ...args);
            }
        }
    };
}

/**
 * Default logger (no context)
 */
export const log = logger();

/**
 * Global console override with redaction
 */
export function setupSecureLogging() {
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    const wrap = (fn) => {
        return (...args) => {
            const redactedArgs = args.map(arg => {
                if (typeof arg === 'string') return redactSensitiveText(arg);
                if (typeof arg === 'object' && arg !== null) return redactObject(arg);
                return arg;
            });
            return fn.apply(console, redactedArgs);
        };
    };

    console.log = wrap(originalLog);
    console.info = wrap(originalInfo);
    console.warn = wrap(originalWarn);
    console.error = wrap(originalError);

    console.info('[Security] Global console redaction enabled.');
}

/* ═══════════════════════════════════════════
   DEBUG MODE CONTROLS
   ═══════════════════════════════════════════ */

/**
 * Enable debug mode from console
 * Call window.enableDebug() in dev tools to enable verbose logging
 */
if (typeof window !== 'undefined') {
    window.enableDebug = () => {
        localStorage?.setItem('dram.debug', 'true');
        currentLevel = LogLevel.DEBUG;
        console.log('[Logger] Debug mode enabled - all logs visible');
    };

    window.disableDebug = () => {
        localStorage?.removeItem('dram.debug');
        currentLevel = LogLevel.WARN;
        console.log('[Logger] Debug mode disabled - only warnings/errors visible');
    };

    window.setLogLevel = setLogLevel;
}

export default log;

