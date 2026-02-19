/**
 * DRAM Desktop - IPC Handlers (Orchestrator)
 * 
 * Complies with Golden Rule: Modular structure, files under 500 lines.
 */
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { registerBridgeHandlers } from './ipc-bridge.js';
import { redactObject } from './redact.js';
import { emitLogLine } from './log-bus.js';

// Import modular handlers
import { registerStorageHandlers } from './ipc/storage.js';
import { registerGatewayHandlers } from './ipc/gateway.js';
import { registerAppHandlers } from './ipc/app.js';
import { registerUtilHandlers } from './ipc/util.js';
import { registerFsHandlers } from './ipc/fs.js';
import { registerWindowHandlers } from './ipc/window.js';
import { registerMigrationHandlers } from './ipc/migration.js';
import { registerCanvasHandlers } from './ipc/canvas.js';
import { registerOpenClawHandlers } from './ipc/openclaw.js';
import { registerUpdaterHandlers } from './ipc/updater.js';

/**
 * Secure debug logging to file (Windows console capture workaround)
 */
let logFile = null;
export function debugLog(...args) {
  try {
    if (!logFile) logFile = path.join(app.getPath('userData'), 'dram-debug.log');
    const redactedArgs = args.map(a => typeof a === 'object' ? redactObject(a) : a);
    const line = `[${new Date().toISOString()}] ${redactedArgs.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
    fs.appendFileSync(logFile, line);
    emitLogLine(line);
    console.log(...redactedArgs);
  } catch { /* ignore */ }
}

// Rate limiting per channel
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // max 100 calls per minute per channel

/**
 * Create a rate-limited version of the IPC orchestrator
 * @param {import('electron').IpcMain} ipcMain
 * @param {Function} debugLog
 */
export function createIpcOrchestrator(ipcMain, debugLog) {
  return {
    handle: (channel, handler) => {
      ipcMain.handle(channel, async (event, ...args) => {
        const now = Date.now();
        const key = `${channel}-${event.sender.id}`;

        if (!rateLimits.has(key)) {
          rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        } else {
          const limit = rateLimits.get(key);
          if (now > limit.resetAt) {
            limit.count = 1;
            limit.resetAt = now + RATE_LIMIT_WINDOW;
          } else {
            limit.count++;
            if (limit.count > RATE_LIMIT_MAX) {
              debugLog(`[RateLimit] Channel ${channel} exceeded limit for sender ${event.sender.id}`);
              throw new Error('Rate limit exceeded. Please slow down.');
            }
          }
        }

        return handler(event, ...args);
      });
    },
    on: (channel, handler) => {
      // 'on' events are usually for async messages, still good to rate limit
      ipcMain.on(channel, (event, ...args) => {
        const now = Date.now();
        const key = `${channel}-${event.sender.id}`;

        const limit = rateLimits.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
        if (now > limit.resetAt) {
          limit.count = 1;
          limit.resetAt = now + RATE_LIMIT_WINDOW;
        } else {
          limit.count++;
        }
        rateLimits.set(key, limit);

        if (limit.count > RATE_LIMIT_MAX) {
          debugLog(`[RateLimit] Channel ${channel} (on) exceeded limit`);
          return;
        }

        handler(event, ...args);
      });
    }
  };
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(ipcMain, stateManager, windowManager, getAutoUpdater = () => null) {
  debugLog('=== IPC Handlers registering (Modular) ===');

  const ipc = createIpcOrchestrator(ipcMain, debugLog);

  // Register modular handlers
  registerStorageHandlers(ipc, stateManager, windowManager, debugLog);
  registerGatewayHandlers(ipc, stateManager.secureStorage, windowManager, debugLog);
  registerAppHandlers(ipc, stateManager.secureStorage, windowManager, debugLog);
  registerUtilHandlers(ipc, stateManager.secureStorage, windowManager, debugLog);
  registerFsHandlers(ipc, stateManager.secureStorage, windowManager, debugLog);
  registerWindowHandlers(ipc, stateManager.secureStorage, windowManager, debugLog);
  registerMigrationHandlers(ipc, stateManager.secureStorage, windowManager, debugLog);
  registerCanvasHandlers(ipc, stateManager.secureStorage, windowManager, debugLog);
  registerOpenClawHandlers(ipc, stateManager, windowManager, debugLog);
  registerUpdaterHandlers(ipc, stateManager.secureStorage, getAutoUpdater, debugLog);

  // Secure internal bridge
  registerBridgeHandlers(ipc, stateManager, windowManager, debugLog);

  debugLog('=== IPC Handlers registration complete ===');
}




