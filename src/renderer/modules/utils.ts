/**
 * DRAM Utilities
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function addSystemMessage(elements, text) {
    const div = document.createElement('div');
    div.className = 'system-label';
    div.style.textAlign = 'center';
    div.textContent = `--- ${text} ---`;
    if (elements && elements.messages) {
        elements.messages.appendChild(div);
    } else {
        console.warn('System Message (elements missing):', text);
    }
}

/**
 * Model pricing per 1M tokens (USD)
 * Updated Feb 2026 - adjust as needed
 */
const MODEL_PRICING = {
    // Anthropic
    'claude-3-7-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-5-haiku': { input: 0.80, output: 4.00 },
    'claude-3-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-opus': { input: 15.00, output: 75.00 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    // OpenAI
    'gpt-4.5': { input: 75.00, output: 150.00 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'o1': { input: 15.00, output: 60.00 },
    'o1-mini': { input: 3.00, output: 12.00 },
    'o3-mini': { input: 1.10, output: 4.40 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    // Google
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-2.0-pro': { input: 0.00, output: 0.00 }, // Preview/Free
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    // Groq (Subsidized/Free tiers often apply, but using list prices where available)
    'llama-3.3-70b': { input: 0.59, output: 0.79 },
    'llama-3.1-70b': { input: 0.59, output: 0.79 },
    'llama-3.1-8b': { input: 0.05, output: 0.08 },
    'llama-3-70b': { input: 0.59, output: 0.79 },
    'llama-3-8b': { input: 0.05, output: 0.08 },
    'mixtral-8x7b': { input: 0.24, output: 0.24 },
    // Perplexity
    'sonar-deep-research': { input: 3.00, output: 15.00 }, // Est
    // Local
    'ollama': { input: 0, output: 0 },
    'local': { input: 0, output: 0 }
};

/**
 * Calculate cost from token usage
 * @param {string} modelId - Model identifier
 * @param {number} inputTokens - Input/prompt tokens
 * @param {number} outputTokens - Output/completion tokens
 * @returns {number} Cost in USD
 */
export function calculateCost(modelId, inputTokens = 0, outputTokens = 0) {
    // Find matching pricing (partial match with priority)
    let pricing = null;
    const modelLower = (modelId || '').toLowerCase();

    // Direct match first
    if (MODEL_PRICING[modelLower]) {
        pricing = MODEL_PRICING[modelLower];
    } else {
        // Partial match - iterate and sort by key length (descending) to match specific first
        // e.g. match 'gpt-4o-mini' before 'gpt-4o'
        const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
        for (const key of keys) {
            if (modelLower.includes(key)) {
                pricing = MODEL_PRICING[key];
                break;
            }
        }
    }

    if (!pricing) {
        // Default fallback pricing
        pricing = { input: 1.00, output: 3.00 };
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
}

/**
 * Format cost for display
 * @param {number} cost - Cost in USD
 * @param {boolean} includeSymbol - Whether to include the $ symbol
 * @returns {string} Formatted cost string
 */
export function formatCost(cost, includeSymbol = true) {
    const symbol = includeSymbol ? '$' : '';
    if (cost === 0) return symbol + '0.00';
    if (cost < 0.0001) return includeSymbol ? '<$0.0001' : '<0.0001';

    let value;
    if (cost < 0.01) value = cost.toFixed(4);
    else if (cost < 1) value = cost.toFixed(3);
    else value = cost.toFixed(2);

    return symbol + value;
}

import { humanizeError, classifyErrorSource } from './errors.js';

/**
 * Translate gateway error codes/messages into user-friendly chat messages.
 * Wraps the result in bold markdown for display in the chat.
 * Accepts either an error object { code, message } or a plain error string.
 */
export function translateGatewayError(error) {
    const friendly = humanizeError(error);
    const source = classifyErrorSource(error);
    if (source === 'provider_rate_limit') {
        return `**[Provider 429] ${friendly}**`;
    }
    if (source === 'local_rate_limit') {
        return `**[Local App] ${friendly}**`;
    }
    return `**${friendly}**`;
}





