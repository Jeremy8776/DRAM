/**
 * DRAM Chat Event Handler
 * Processes streaming chunks, tool calls, and lifecycle events.
 */
import { state } from './state.js';
import { elements } from './elements.js';
import { addMessage, updateMessageElement, hideTypingIndicator, updateTypingStatus, updateTypingWorklog, renderMessage } from './renderer.js';
import { calculateCost, addSystemMessage, translateGatewayError } from './utils.js';
import { resetTtsBuffer, processTtsStreaming } from './tts-handler.js';
import { extractCanvasPayloadFromMessage, buildCanvasPreviewMessage, maybeRenderAssistantCanvas } from './chat-canvas.js';

// Track which runId belongs to which sessionKey
export const runToSession = new Map();
// Track active runs to correlate events
export const activeRuns = new Map();
const MAX_ACTIVE_RUNS = 100;

function resolveKnownSessionId(candidate) {
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
 * Track an active chat run to correlate events.
 */
export function trackRun(runId, sessionKey = null) {
    if (!runId) return;
    if (activeRuns.size >= MAX_ACTIVE_RUNS) {
        const oldestKey = activeRuns.keys().next().value;
        activeRuns.delete(oldestKey);
        runToSession.delete(oldestKey);
    }
    activeRuns.set(runId, { startedAt: Date.now() });
    const existing = resolveKnownSessionId(runToSession.get(runId));
    if (existing) return;
    const resolved = resolveKnownSessionId(sessionKey);
    if (resolved) {
        runToSession.set(runId, resolved);
    }
}

// Track thinking content for current run
const thinkingBuffer = new Map();
const worklogBuffer = new Map();
const worklogLastEntry = new Map();
const MAX_WORKLOG_CHARS = 16000;

function isVoiceModeActive() {
    return document.body.classList.contains('voice-active');
}

function getRunSessionId(runId, payloadSessionKey = null) {
    if (!runId) {
        return resolveKnownSessionId(payloadSessionKey) || state.currentSessionId;
    }
    return resolveKnownSessionId(runToSession.get(runId))
        || resolveKnownSessionId(payloadSessionKey)
        || state.currentSessionId;
}

function isCurrentVisibleSession(sessionId) {
    return sessionId === state.currentSessionId;
}

function trimWorklog(text) {
    const value = String(text || '');
    if (value.length <= MAX_WORKLOG_CHARS) return value;
    return value.slice(value.length - MAX_WORKLOG_CHARS);
}

function setRunWorklog(runId, nextText, sessionId = null) {
    if (!runId) return;
    worklogBuffer.set(runId, trimWorklog(nextText));
    if (!isVoiceModeActive() && isCurrentVisibleSession(sessionId || getRunSessionId(runId))) {
        updateTypingWorklog(worklogBuffer.get(runId));
    }
}

function appendRunWorklog(runId, chunk, sessionId = null) {
    if (!runId || !chunk) return;
    const normalizedChunk = String(chunk).trim().replace(/\s+\n/g, '\n');
    if (!normalizedChunk) return;
    if (worklogLastEntry.get(runId) === normalizedChunk) return;
    const current = worklogBuffer.get(runId) || '';
    const separator = current ? '\n' : '';
    setRunWorklog(runId, `${current}${separator}${normalizedChunk}`, sessionId);
    worklogLastEntry.set(runId, normalizedChunk);
}

function clearRunTransientState(runId) {
    if (!runId) return;
    thinkingBuffer.delete(runId);
    worklogBuffer.delete(runId);
    worklogLastEntry.delete(runId);
    activeRuns.delete(runId);
    runToSession.delete(runId);
}

function getAssistantProgressLabel(rawType) {
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

function isLocalModelIdentifier(modelId, providerName) {
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

/**
 * Handle agent-specific events (tool calls, thinking, fallback).
 */
export function handleAgentEvent(payload) {
    const stream = payload?.stream;
    const runId = payload?.runId;
    const payloadSessionKey = payload?.sessionKey || payload?.data?.sessionKey || null;
    const sessionId = getRunSessionId(runId, payloadSessionKey);
    const isCurrentTab = isCurrentVisibleSession(sessionId);
    const shouldRenderWorklog = isCurrentTab && !isVoiceModeActive();

    if (runId) {
        trackRun(runId, sessionId);
    }

    if (stream === 'assistant' && runId) {
        const data = payload?.data;
        let didUpdateThinking = false;

        if (data?.type === 'thinking' && typeof data?.thinking === 'string') {
            const currentThinking = thinkingBuffer.get(runId) || '';
            const nextThinking = currentThinking + data.thinking;
            thinkingBuffer.set(runId, nextThinking);
            appendRunWorklog(runId, 'analyzing your request', sessionId);
            didUpdateThinking = true;
        }

        if (data?.content && Array.isArray(data.content)) {
            for (const block of data.content) {
                if (block.type === 'thinking' && typeof block.thinking === 'string') {
                    const currentThinking = thinkingBuffer.get(runId) || '';
                    const nextThinking = currentThinking + block.thinking;
                    thinkingBuffer.set(runId, nextThinking);
                    appendRunWorklog(runId, 'analyzing your request', sessionId);
                    didUpdateThinking = true;
                }
            }
        }

        if (!didUpdateThinking && shouldRenderWorklog) {
            const progressLabel = getAssistantProgressLabel(data?.type);
            if (progressLabel) appendRunWorklog(runId, progressLabel, sessionId);
        }
    }

    if ((stream === 'tool' || stream === 'tools') && runId) {
        const data = payload?.data || {};
        const toolName = data?.name || data?.tool || data?.toolName || payload?.name || 'tool';
        const toolState = data?.status || data?.phase || data?.state || 'running';
        const command = data?.command || data?.input?.command || data?.args?.command || '';
        const commandPreview = typeof command === 'string' && command.length > 140
            ? `${command.slice(0, 140)}...`
            : command;
        const summary = command
            ? `[tool:${toolName}] ${toolState}\n$ ${commandPreview}`
            : `[tool:${toolName}] ${toolState}`;
        appendRunWorklog(runId, summary, sessionId);
    }

    if (stream === 'lifecycle' && payload?.data?.phase === 'fallback' && runId) {
        const { model } = payload.data;
        const modelLabel = typeof model === 'string'
            ? (model.includes('/') ? model.split('/').pop() : model)
            : 'fallback model';
        updateTypingStatus(`using ${modelLabel} (fallback)`, true);
        import('./renderer.js').then(m => m.updateInfobar({ model }));
        addSystemMessage(elements, `RESILIENCE: Primary model failed. Switched to ${modelLabel}.`);
        appendRunWorklog(runId, `fallback -> ${modelLabel}`, sessionId);
    }

    if (stream === 'lifecycle' && payload?.data?.phase === 'start' && runId) {
        updateTypingStatus('working through response...', false);
        appendRunWorklog(runId, 'planning response', sessionId);
    }

    if (stream === 'lifecycle' && payload?.data?.phase === 'error' && runId) {
        const errorText = payload?.data?.error || payload?.data?.message || 'run failed';
        appendRunWorklog(runId, `error: ${errorText}`, sessionId);
    }

    if (stream === 'lifecycle' && payload?.data?.phase === 'end' && runId) {
        thinkingBuffer.delete(runId);
        appendRunWorklog(runId, 'finalizing answer', sessionId);
        if (shouldRenderWorklog) {
            updateTypingWorklog(worklogBuffer.get(runId) || '');
        }
    }
}

/**
 * Processes chat-related events (streaming chunks, errors, completion).
 */
export function handleChatEvent(payload, options = {}) {
    const typedOptions = options as { onComplete?: () => void };
    const { onComplete } = typedOptions;
    const extractTextContent = (value) => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (typeof item === 'string') return item;
                    if (item && typeof item === 'object') {
                        if (typeof item.text === 'string') return item.text;
                        if (typeof item.content === 'string') return item.content;
                    }
                    return '';
                })
                .join('');
        }
        if (value && typeof value === 'object' && typeof value.text === 'string') {
            return value.text;
        }
        return '';
    };

    const content = (
        extractTextContent(payload?.content)
        || extractTextContent(payload?.delta?.content)
        || extractTextContent(payload?.message?.content)
    );
    const done = payload?.done || payload?.delta?.done;
    const runId = payload?.runId;
    const state_event = payload?.state;
    const errorMessage = payload?.errorMessage;
    const payloadSessionKey = payload?.sessionKey || null;

    if (runId) trackRun(runId, getRunSessionId(runId, payloadSessionKey));

    const sessionId = getRunSessionId(runId, payloadSessionKey);
    const targetSession = state.sessions.find(s => s.id === (sessionId || state.currentSessionId));
    const isCurrentTab = targetSession?.id === state.currentSessionId;
    const targetMessages = targetSession?.messages || [];

    if (payload?.meta) {
        import('./renderer.js').then(m => m.updateInfobar(payload.meta));
    }

    if (state_event === 'error' || errorMessage) {
        hideTypingIndicator();
        updateTypingWorklog('');
        import('./voice-mode.js').then(m => m.hideVoiceThinking?.());
        resetTtsBuffer();
        if (runId) clearRunTransientState(runId);
        if (onComplete) onComplete();

        // Show as an assistant message with user-friendly translation
        const friendlyError = translateGatewayError(errorMessage || 'An unknown error occurred.');
        addMessage('assistant', friendlyError, false);
        return;
    }

    if (state_event === 'final' && !content) {
        hideTypingIndicator();
        updateTypingWorklog('');
        import('./voice-mode.js').then(m => m.hideVoiceThinking?.());
        if (runId) clearRunTransientState(runId);
        if (onComplete) onComplete();

        const msgContent = payload?.message?.content;
        if (msgContent) {
            const text = Array.isArray(msgContent) ? msgContent.map(c => c.text || '').join('') : msgContent;
            if (text) {
                const canvasPayload = extractCanvasPayloadFromMessage(text);
                const textForDisplay = canvasPayload ? (buildCanvasPreviewMessage(canvasPayload) || text) : text;
                if (document.body.classList.contains('voice-active') && isCurrentTab) {
                    const msg = {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: textForDisplay,
                        streaming: false
                    };
                    targetMessages.push(msg);
                    renderMessage(msg);
                    void processTtsStreaming(textForDisplay, true);
                } else {
                    addMessage('assistant', textForDisplay, false);
                    if (isCurrentTab) {
                        import('./voice-mode.js').then(m => m.queueVoiceResponse(textForDisplay));
                    }
                }
                if (runId) {
                    maybeRenderAssistantCanvas(runId, text, isCurrentTab);
                }
            }
        }
        return;
    }

    if (content) {
        if (isCurrentTab && isVoiceModeActive()) {
            import('./voice-mode.js').then(m => m.hideVoiceThinking?.());
        }

        if (runId && onComplete) onComplete();

        const lastMsg = targetMessages[targetMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.streaming) {
            let nextChunk = content;
            if (typeof nextChunk === 'string' && typeof lastMsg.content === 'string' && nextChunk.startsWith(lastMsg.content)) {
                nextChunk = nextChunk.slice(lastMsg.content.length);
            }
            if (nextChunk) {
                lastMsg.content += nextChunk;
                if (document.body.classList.contains('voice-active') && isCurrentTab) {
                    void processTtsStreaming(nextChunk, false);
                    updateMessageElement(lastMsg);
                } else if (isCurrentTab) {
                    updateMessageElement(lastMsg);
                }
            }
        } else {
            const msg = { id: crypto.randomUUID(), role: 'assistant', content, streaming: true };
            targetMessages.push(msg);
            if (isCurrentTab) {
                renderMessage(msg);
                if (document.body.classList.contains('voice-active')) {
                    void processTtsStreaming(content, false);
                }
            }
        }
    }

    if (done || state_event === 'final') {
        hideTypingIndicator();
        updateTypingWorklog('');
        import('./voice-mode.js').then(m => m.hideVoiceThinking?.());
        const lastMsg = targetMessages[targetMessages.length - 1];
        if (lastMsg) {
            lastMsg.streaming = false;
            const originalAssistantContent = typeof lastMsg.content === 'string' ? lastMsg.content : '';
            if (lastMsg.role === 'assistant' && originalAssistantContent) {
                const canvasPayload = extractCanvasPayloadFromMessage(originalAssistantContent);
                if (canvasPayload) {
                    const previewText = buildCanvasPreviewMessage(canvasPayload);
                    if (previewText) {
                        lastMsg.content = previewText;
                    }
                }
            }
            if (isCurrentTab) {
                void processTtsStreaming(null, true);
                updateMessageElement(lastMsg);
            }
        }

        if (lastMsg?.role === 'assistant' && runId) {
            const sourceContent = extractTextContent(payload?.content)
                || extractTextContent(payload?.delta?.content)
                || extractTextContent(payload?.message?.content)
                || '';
            const contentForCanvas = sourceContent || String(lastMsg.content || '');
            if (contentForCanvas) {
                maybeRenderAssistantCanvas(runId, contentForCanvas, isCurrentTab);
            }
        }

        if (runId) clearRunTransientState(runId);
        if (onComplete) onComplete();

        const usage = payload?.meta?.usage || payload?.usage;
        if (usage && lastMsg) {
            const model = payload?.meta?.model || state.currentActiveModelId || state.models.primary.id || 'unknown';
            const gatewayCost = Number(usage.cost);
            const cost = !isNaN(gatewayCost) ? gatewayCost : calculateCost(model, usage.inputTokens || 0, usage.outputTokens || 0);

            // Update specific target session tracking (tab-safe)
            if (targetSession) {
                targetSession.sessionCost = (targetSession.sessionCost || 0) + cost;
                targetSession.sessionInputTokens = (targetSession.sessionInputTokens || 0) + (usage.inputTokens || 0);
                targetSession.sessionOutputTokens = (targetSession.sessionOutputTokens || 0) + (usage.outputTokens || 0);
                targetSession.localRequestCount = (targetSession.localRequestCount || 0) + 1;

                import('./usage-data.js').then(usageMod => {
                    const provider = usageMod.getProviderForModel(model);
                    const providerRequests = { ...targetSession.localProviderRequests };
                    const existingProviderEntry = providerRequests[provider];
                    const providerUsage = (existingProviderEntry && typeof existingProviderEntry === 'object')
                        ? { ...existingProviderEntry }
                        : {
                            requests: Number(existingProviderEntry || 0),
                            inputTokens: 0,
                            outputTokens: 0
                        };
                    providerUsage.requests += 1;
                    providerUsage.inputTokens += (usage.inputTokens || 0);
                    providerUsage.outputTokens += (usage.outputTokens || 0);
                    providerRequests[provider] = providerUsage;
                    targetSession.localProviderRequests = providerRequests;

                    if (isLocalModelIdentifier(model, provider)) {
                        const localModelKey = (typeof model === 'string' && model.trim())
                            ? model.trim()
                            : `${provider || 'local'}/local`;
                        const localModelUsage = { ...(targetSession.localModelUsage || {}) };
                        const existingLocalEntry = localModelUsage[localModelKey];
                        const localEntry = (existingLocalEntry && typeof existingLocalEntry === 'object')
                            ? { ...existingLocalEntry }
                            : {
                                provider: provider || 'local',
                                requests: 0,
                                inputTokens: 0,
                                outputTokens: 0
                            };
                        localEntry.provider = provider || localEntry.provider || 'local';
                        localEntry.requests += 1;
                        localEntry.inputTokens += (usage.inputTokens || 0);
                        localEntry.outputTokens += (usage.outputTokens || 0);
                        localModelUsage[localModelKey] = localEntry;
                        targetSession.localModelUsage = localModelUsage;
                    }
                });
            }

            // Sync message cost display
            if (isCurrentTab) {
                import('./renderer.js').then(m => {
                    m.updateMessageCost(lastMsg, { cost, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
                });
            }
        }
    }
}







