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
    'Rate limit exceeded. Please slow down.': 'Local app throttle triggered unexpectedly. This is not a provider 429.',
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
    { pattern: /ollama.*(model.*not.*found|invalid model)|model.*not.*found.*ollama/i, message: 'Selected Ollama model is unavailable. Choose a tool-capable local model in Settings.' },
    { pattern: /ollama.*(connection|refused|timeout|timed out|unreachable|cannot connect|econnrefused|failed)/i, message: 'Cannot connect to Ollama. Make sure Ollama is running locally.' },

    // Rate/quota
    { pattern: /rate limit exceeded\. please slow down/i, message: 'Local app throttle triggered unexpectedly. This is not a provider 429.' },
    { pattern: /\bprovider\s*429\b|http\s*429|status(?:\s*code)?\s*[:=]?\s*429\b/i, message: 'Provider rate limit reached (HTTP 429). Wait briefly and retry.' },
    { pattern: /\btoo many requests\b.*\b(openai|anthropic|google|gemini|groq|provider)\b|\b(openai|anthropic|google|gemini|groq|provider)\b.*\btoo many requests\b/i, message: 'Provider rate limit reached (HTTP 429). Wait briefly and retry.' },
    { pattern: /quota|billing|insufficient|402/i, message: 'Account quota exceeded. Check your provider billing.' },

    // Model/request issues
    { pattern: /invalid chat\.send params|unexpected property 'model'/i, message: 'Request format mismatch. The app/runtime is out of sync. Reload DRAM and retry.' },
    { pattern: /model.*not.*found|does not exist|\binvalid model\b/i, message: 'Model not available. Check your model selection in Settings.' },
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

function errorToCombinedText(error) {
    const message = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
    const code = typeof error === 'object' ? (error?.code || '') : '';
    return `${code} ${message}`;
}

/**
 * Classify error source for UX labeling.
 * @param {Error|string|Object} error
 * @returns {'provider_rate_limit'|'local_rate_limit'|'other'}
 */
export function classifyErrorSource(error) {
    const combined = errorToCombinedText(error);
    if (/rate limit exceeded\. please slow down/i.test(combined)) return 'local_rate_limit';
    if (/request payload exceeds local transport limit|payload too large/i.test(combined)) return 'local_rate_limit';
    if (/\bprovider\s*429\b|http\s*429|status(?:\s*code)?\s*[:=]?\s*429\b/i.test(combined)) return 'provider_rate_limit';
    if (/\b429\b/i.test(combined) && /\b(openai|anthropic|google|gemini|groq|provider)\b/i.test(combined)) return 'provider_rate_limit';
    if (/\btoo many requests\b/i.test(combined) && /\b(openai|anthropic|google|gemini|groq|provider)\b/i.test(combined)) return 'provider_rate_limit';
    return 'other';
}

/**
 * Humanize a technical error into a user-friendly message.
 * Accepts Error objects, plain strings, or { code, message } objects.
 * @param {Error|string|Object} error - The technical error
 * @returns {string} Human-friendly message
 */
export function humanizeError(error) {
    if (!error) return 'Something went wrong. Please try again.';

    const message = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
    const combined = errorToCombinedText(error);

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




