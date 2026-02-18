/**
 * DRAM Error Humanization Registry
 * Maps technical error codes and message patterns to user-friendly feedback.
 * This is the single source of truth for all error translation in the renderer.
 */

const ERROR_MAP = {
    // Connection Errors
    'ECONNREFUSED': 'Connection refused. The engine may be offline or blocked by a firewall.',
    'ETIMEDOUT': 'Connection timed out. The server is too slow or unresponsive.',
    'ENOTFOUND': 'Server address not found. Please verify your Gateway URL in Settings.',
    'ERR_CONNECTION_REFUSED': 'Connection refused. Is the engine running?',

    // Auth Errors
    'Unauthorized': 'Access denied. Your access token may be invalid or expired.',
    'Forbidden': 'Permission denied. Your credentials lack the required access level.',
    'Invalid token': 'Authentication failed. Please re-enter your access token in Settings.',

    // Rate Limit Errors
    'Rate limit exceeded': 'Rate limit reached. Wait a moment and try again.',
    'Too Many Requests': 'Too many requests. The provider is limiting throughput.',

    // Model Errors
    'model_not_found': 'The selected model is not available on this provider.',
    'insufficient_quota': 'Account quota exceeded. Check your provider billing and usage.',
    'overloaded': 'The model is currently overloaded. Try again shortly.',

    // System Errors
    'EACCES': 'File access denied. Check folder permissions.',
    'ENOENT': 'Required file not found. Check that the workspace path exists.'
};

const PATTERN_MAP = [
    // API key issues (most common user-facing error)
    { pattern: /no api key|api.key.*not|missing.*key|apikey/i, message: 'No API key configured. Add your key in Settings to start chatting.' },
    { pattern: /authentication|unauthorized|401/i, message: 'Authentication failed. Check your API key in Settings.' },

    // Provider-specific connectivity
    { pattern: /api\.anthropic\.com/i, message: 'Cannot reach Anthropic. Check your internet connection.' },
    { pattern: /api\.openai\.com/i, message: 'Cannot reach OpenAI. Check your internet connection.' },
    { pattern: /ollama/i, message: 'Cannot connect to Ollama. Make sure Ollama is running locally.' },

    // Rate/quota
    { pattern: /rate.limit|429/i, message: 'Rate limit reached. Wait a moment and try again.' },
    { pattern: /quota|billing|insufficient|402/i, message: 'Account quota exceeded. Check your provider billing.' },

    // Model issues
    { pattern: /model.*not.*found|does not exist|invalid.*model/i, message: 'Model not available. Check your model selection in Settings.' },
    { pattern: /context.length|too.long|max.tokens/i, message: 'Message too long. Try a shorter message or reset the session.' },

    // Timeouts
    { pattern: /timeout|timed out|deadline/i, message: 'Request timed out. Try again.' },

    // Server errors
    { pattern: /500|502|503|internal server|overloaded/i, message: 'Provider error. The AI service is having issues. Try again shortly.' },

    // Invalid requests
    { pattern: /invalid.request|bad.request|400/i, message: 'Request rejected. There may be a configuration issue.' },

    // Network
    { pattern: /network|connection refused|econnrefused|enotfound/i, message: 'Connection error. Check your internet connection.' },
    { pattern: /disk full/i, message: 'Disk full. Free up some space and try again.' }
];

/**
 * Humanize a technical error into a user-friendly message.
 * Accepts Error objects, plain strings, or { code, message } objects.
 * @param {Error|string|Object} error - The technical error
 * @returns {string} Human-friendly message
 */
export function humanizeError(error) {
    if (!error) return 'Something went wrong. Please try again.';

    const message = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
    const code = typeof error === 'object' ? (error.code || '') : '';
    const combined = `${code} ${message}`;

    // 1. Direct match on code or message
    for (const [key, friendly] of Object.entries(ERROR_MAP)) {
        if (combined.includes(key)) return friendly;
    }

    // 2. Pattern match
    for (const entry of PATTERN_MAP) {
        if (entry.pattern.test(combined)) return entry.message;
    }

    // 3. Fallback — show a cleaned-up version of the raw message
    // Strip file paths and technical prefixes for cleaner display
    const cleaned = message
        .replace(/Error:\s*/i, '')
        .replace(/[A-Z]:\\[^\s"]+/g, '')  // strip Windows paths
        .replace(/\/[^\s"]+/g, '')         // strip Unix paths
        .replace(/\s{2,}/g, ' ')           // collapse whitespace
        .trim();

    return cleaned || 'Something went wrong. Please try again.';
}
