/**
 * DRAM - Sensitive Data Redaction for Main Process Logs
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

function maskToken(token) {
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
            const token = p2 || p1 || match;
            const masked = maskToken(token);
            return match.replace(token, masked);
        });
    }
    return result;
}

/**
 * Recursive object redaction (for JSON.stringify replacements)
 */
export function redactObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

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




