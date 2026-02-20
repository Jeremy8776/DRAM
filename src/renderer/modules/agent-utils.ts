/**
 * DRAM Agent Utility Functions
 * Helper logic for model identification and progress labeling.
 */
import { state } from './state.js';

/**
 * Resolve a session ID from various payload formats.
 */
export function resolveKnownSessionId(candidate: any) {
    const raw = String(candidate || '').trim();
    if (!raw) return null;

    const options = new Set([raw]);
    if (raw.includes(':')) {
        const parts = raw.split(':').filter(Boolean);
        if (parts.length > 0) options.add(parts[parts.length - 1]);
        if (parts.length > 1) options.add(parts[1]);
    }

    for (const option of options) {
        if (state.sessions.some((s) => s.id === option)) return option;
    }

    return null;
}

/**
 * Map internal engine phase names to user-friendly labels.
 */
export function getAssistantProgressLabel(rawType: string) {
    const value = String(rawType || '').toLowerCase().trim();
    if (!value) return null;
    if (value === 'thinking') return 'analyzing your request';
    if (value === 'tool_call') return 'preparing tool call';
    if (value === 'tool_result') return 'processing tool output';
    if (value === 'search') return 'searching references';
    if (value === 'retrieve') return 'gathering context';
    if (value === 'plan') return 'planning response';
    if (value === 'draft') return 'drafting answer';
    if (value === 'final') return null;
    if (value === 'delta' || value === 'content' || value === 'token') return null;
    return `agent phase: ${value}`;
}

/**
 * Determine if a model identifier represents a local (Ollama/LlamaCpp) instance.
 */
export function isLocalModelIdentifier(modelId: string, providerName: string) {
    const provider = String(providerName || '').toLowerCase();
    const model = String(modelId || '').toLowerCase();
    if (provider === 'ollama' || provider === 'local' || provider === 'lmstudio' || provider === 'llamacpp' || provider === 'vllm') {
        return true;
    }
    if (!model) return false;
    return model.startsWith('ollama/')
        || model.startsWith('local/')
        || model.includes('/local')
        || model.includes('ollama')
        || model.includes('lmstudio')
        || model.includes('llama.cpp')
        || model.includes('llamacpp')
        || model.includes('vllm');
}
