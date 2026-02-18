/**
 * Chat/Canvas coupling helpers.
 * Keeps canvas parsing/render behavior isolated from chat stream state logic.
 */

const renderedCanvasRuns = new Set<string>();
const MAX_RENDERED_CANVAS_RUNS = 200;

function trackCanvasRenderRun(runId) {
    if (!runId) return;
    if (renderedCanvasRuns.size >= MAX_RENDERED_CANVAS_RUNS) {
        const first = renderedCanvasRuns.values().next().value;
        if (first) renderedCanvasRuns.delete(first);
    }
    renderedCanvasRuns.add(runId);
}

export function normalizeCanvasLanguageTag(language) {
    const lower = String(language || '').trim().toLowerCase();
    if (!lower) return 'text';
    if (lower === 'py') return 'python';
    if (lower === 'js') return 'javascript';
    if (lower === 'ts') return 'typescript';
    if (lower === 'sh' || lower === 'shell') return 'bash';
    if (lower === 'yml') return 'yaml';
    return lower;
}

export function extractCanvasPayloadFromMessage(content) {
    const text = String(content || '');
    if (!text.trim()) return null;

    const htmlFenceRegex = /```(?:html|htm)\b[^\n]*\n([\s\S]*?)```/gi;
    const htmlFenceMatch = htmlFenceRegex.exec(text);
    if (htmlFenceMatch?.[1]?.trim()) {
        return {
            type: 'html',
            content: htmlFenceMatch[1].trim()
        };
    }

    const fullHtmlRegex = /<html[\s\S]*<\/html>/i;
    const fullHtmlMatch = text.match(fullHtmlRegex);
    if (fullHtmlMatch?.[0]?.trim()) {
        return {
            type: 'html',
            content: fullHtmlMatch[0].trim()
        };
    }

    const codeFenceRegex = /```([a-zA-Z0-9_+.-]*)[^\n]*\n([\s\S]*?)```/g;
    let best = null;
    let match;
    while ((match = codeFenceRegex.exec(text)) !== null) {
        const rawLanguage = String(match[1] || '').trim();
        const body = String(match[2] || '').trim();
        if (!body) continue;
        if (!best || body.length > best.content.length) {
            best = {
                type: normalizeCanvasLanguageTag(rawLanguage) === 'html' ? 'html' : 'code',
                content: body,
                language: normalizeCanvasLanguageTag(rawLanguage)
            };
        }
    }

    return best;
}

export function buildCanvasPreviewMessage(payload) {
    const language = payload?.type === 'html'
        ? 'html'
        : normalizeCanvasLanguageTag(payload?.language || 'text');
    const body = String(payload?.content || '').trim();
    if (!body) return '';
    return [
        'Code preview (full source is in Canvas):',
        '',
        `\`\`\`${language}`,
        body,
        '```'
    ].join('\n');
}

export async function maybeRenderAssistantCanvas(runId: string, content: string, isCurrentTab: boolean) {
    if (!runId || !isCurrentTab) return;
    if (renderedCanvasRuns.has(runId)) return;
    const payload = extractCanvasPayloadFromMessage(content);
    if (!payload?.content) return;

    trackCanvasRenderRun(runId);
    try {
        const canvasApi: any = await import('./canvas.js');
        if (payload.type === 'code') {
            await canvasApi.pushToCanvas(payload.content, {
                type: 'code',
                language: payload.language || 'text'
            });
        } else {
            await canvasApi.pushToCanvas(payload.content, { type: 'html' });
        }
    } catch (err) {
        console.warn('[Chat] Auto-canvas push failed:', err?.message || err);
    }
}




