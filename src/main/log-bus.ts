/**
 * DRAM Main Log Bus
 * Lightweight in-memory stream so renderer log console can subscribe to live logs.
 */
const MAX_BUFFERED_LINES = 400;
const subscribers = new Set<(line: string) => void>();
const recentLines = [];

function normalizeLine(line) {
    if (line === null || line === undefined) return '';
    if (typeof line === 'string') return line;
    try {
        return JSON.stringify(line);
    } catch {
        return String(line);
    }
}

export function emitLogLine(line) {
    const normalized = normalizeLine(line).trimEnd();
    if (!normalized) return;

    recentLines.push(normalized);
    if (recentLines.length > MAX_BUFFERED_LINES) {
        recentLines.splice(0, recentLines.length - MAX_BUFFERED_LINES);
    }

    for (const subscriber of subscribers) {
        try {
            subscriber(normalized);
        } catch {
            // Ignore subscriber errors to keep the stream alive.
        }
    }
}

export function subscribeLogStream(callback, { replay = true } = {}) {
    if (typeof callback !== 'function') {
        return () => { };
    }

    if (replay) {
        for (const line of recentLines) {
            try {
                callback(line);
            } catch {
                // Ignore replay callback errors.
            }
        }
    }

    subscribers.add(callback);
    return () => {
        subscribers.delete(callback);
    };
}

export function clearLogBusForTests() {
    subscribers.clear();
    recentLines.length = 0;
}






