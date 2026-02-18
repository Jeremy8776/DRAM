/**
 * DRAM Desktop - Main Process Entry Point
 * Uses bundled engine from extraResources
 */
import { app, BrowserWindow, ipcMain, Menu, protocol, shell, dialog } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err.message);
  if (err.code === 'EPIPE' || err.message?.includes('EPIPE')) {
    console.error('[Main] EPIPE error - a pipe/stream was closed unexpectedly');
    return;
  }
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    require('fs').appendFileSync(logPath, `[${new Date().toISOString()}] FATAL: ${err.message}\n${err.stack}\n\n`);
  } catch { /* ignore */ }
  console.error('[Main] Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
});

import { WindowManager } from './window-manager.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { TrayManager } from './tray.js';
import { SecureStorage } from './secure-storage.js';
import { AutoUpdater } from './auto-updater.js';
import { getStateManager } from './state/state-manager.js';
import { setupConfigSync } from './state/config-sync.js';
import { getDramEngine, peekDramEngine, killGatewayProcessesOnPort } from './engine/core.js';
import { debugLog } from './ipc-handlers.js';
import { getPerformanceMonitor } from './performance-monitor.js';
import { getTokenManager } from './token-manager.js';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let windowManager;
  let secureStorage;
  let autoUpdater;
  let trayManager;
  let quitCleanupStarted = false;
  let processCleanupBound = false;

  const forceCleanupGateway = () => {
    try {
      const killedPids = killGatewayProcessesOnPort(18789);
      if (killedPids.length > 0) {
        console.log(`[Main] Forced gateway cleanup. Killed PIDs: ${killedPids.join(', ')}`);
      }
    } catch (err) {
      console.warn('[Main] Forced gateway cleanup failed:', err.message);
    }
  };

  async function initialize() {
    try {
      // 1. Register Protocol
      const rendererDir = path.resolve(__dirname, '../renderer');

      protocol.handle('dram', async (request) => {
        let urlPath = request.url.replace('dram://app/', '');
        urlPath = urlPath.split('?')[0]; // Remove query params

        if (!urlPath || urlPath === '/' || urlPath === '') {
          urlPath = 'index.html';
        }

        // Support subdirectories and prevent traversal
        const filePath = path.join(rendererDir, urlPath);

        try {
          // Security: Prevent path traversal
          const resolvedPath = path.resolve(filePath);
          if (!resolvedPath.startsWith(rendererDir + path.sep) && resolvedPath !== rendererDir && resolvedPath !== path.join(rendererDir, 'index.html')) {
            console.error(`[Protocol] Traversal attempt blocked: ${urlPath}`);
            return new Response('Access Denied', { status: 403 });
          }

          let data;
          try {
            data = await fs.readFile(resolvedPath);
          } catch (readErr) {
            // Fallback for modules if not found in root (legacy support)
            if (!urlPath.includes('/') && !urlPath.includes('\\')) {
              const fallbackPath = path.join(rendererDir, 'modules', urlPath);
              try {
                data = await fs.readFile(fallbackPath);
              } catch {
                throw readErr;
              }
            } else {
              throw readErr;
            }
          }

          const ext = path.extname(resolvedPath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.ico': 'image/x-icon',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.otf': 'font/otf',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.mp4': 'video/mp4'
          };

          return new Response(data, {
            status: 200,
            headers: {
              'Content-Type': mimeTypes[ext] || 'application/octet-stream',
              'X-Content-Type-Options': 'nosniff'
            }
          });
        } catch (err) {
          console.error(`[Protocol] Failed to load ${urlPath}:`, err.message);
          return new Response('Not Found', { status: 404 });
        }
      });

      const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
      const isInternalUrl = (urlStr) => {
        try {
          const url = new URL(urlStr);
          if (url.protocol === 'dram:' && url.hostname === 'app') return true;
          if ((url.protocol === 'http:' || url.protocol === 'https:') &&
            loopbackHosts.has(url.hostname) &&
            url.port === '18789') {
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };

      const isSafeExternalUrl = (urlStr) => {
        try {
          const url = new URL(urlStr);
          return ['http:', 'https:', 'mailto:'].includes(url.protocol);
        } catch {
          return false;
        }
      };

      const openExternalSafely = (url) => {
        if (isSafeExternalUrl(url)) {
          shell.openExternal(url).catch(err => {
            console.warn('[Security] Failed to open external URL:', err.message);
          });
        } else {
          console.warn(`[Security] Blocked unsafe external URL: ${url}`);
        }
      };

      // 2. Global WebContents Security & CSP
      app.on('web-contents-created', (_event, contents) => {
        // Block popups and only open explicit external links safely.
        contents.setWindowOpenHandler(({ url }) => {
          if (!isInternalUrl(url)) {
            openExternalSafely(url);
          }
          return { action: 'deny' };
        });

        // Security: Block navigation away from the app
        contents.on('will-navigate', (event, url) => {
          if (!isInternalUrl(url)) {
            console.warn(`[Security] Blocked navigation attempt to: ${url}`);
            event.preventDefault();
            openExternalSafely(url);
          }
        });

        contents.on('will-redirect', (event, url) => {
          if (!isInternalUrl(url)) {
            console.warn(`[Security] Blocked redirect attempt to: ${url}`);
            event.preventDefault();
            openExternalSafely(url);
          }
        });

        const allowedPermissions = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write']);
        const isTrustedOrigin = (origin) => isInternalUrl(origin);

        contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
          const requestingUrl = details?.requestingUrl || details?.embeddingOrigin || webContents.getURL();
          callback(isTrustedOrigin(requestingUrl) && allowedPermissions.has(permission));
        });

        contents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
          const origin = requestingOrigin || details?.embeddingOrigin || webContents?.getURL?.() || '';
          return isTrustedOrigin(origin) && allowedPermissions.has(permission);
        });

        // Set CSP
        contents.session.webRequest.onHeadersReceived((details, callback) => {
          // Keep gateway-owned responses untouched.
          if (details.url.startsWith('http://127.0.0.1:18789')) {
            return callback({ responseHeaders: details.responseHeaders });
          }

          callback({
            responseHeaders: {
              ...details.responseHeaders,
              'Content-Security-Policy': [
                "default-src 'self' dram:; " +
                "script-src 'self' 'unsafe-inline' dram: blob:; " +
                "style-src 'self' 'unsafe-inline' dram:; " +
                "img-src 'self' data: blob: dram: https:; " +
                "font-src 'self' data: dram:; " +
                "connect-src 'self' dram: " +
                'http://127.0.0.1:18789 http://localhost:18789 ' +
                'ws://127.0.0.1:18789 ws://localhost:18789 ' +
                'wss://127.0.0.1:18789 wss://localhost:18789 ' +
                'https://*.google.com https://www.google.com; ' +
                "frame-src 'self' dram: " +
                'blob: data: http://127.0.0.1:18789 http://localhost:18789; ' +
                "media-src 'self' data: blob: dram:; " +
                "object-src 'none'; " +
                "frame-ancestors 'none'; " +
                "base-uri 'self'; " +
                "form-action 'self';"
              ]
            }
          });
        });
      });

      // 3. System Components
      secureStorage = new SecureStorage();
      await secureStorage.initialize();

      // 3a. Initialize Performance Monitor & Token Manager
      const perfMonitor = getPerformanceMonitor();
      perfMonitor.startTimer('app:startup');
      perfMonitor.startRecording(10000); // Record every 10 seconds

      getTokenManager(secureStorage);
      console.log('[Main] Token manager initialized');

      // 4. Build UI
      windowManager = new WindowManager(secureStorage);

      // 4a. State Management
      const stateManager = getStateManager(secureStorage, windowManager);
      await stateManager.initialize();

      registerIpcHandlers(ipcMain, stateManager, windowManager);
      Menu.setApplicationMenu(null);

      await windowManager.createMainWindow();

      // 5. Background Tasks
      const minimizeToTray = stateManager.get('settings.minimizeToTray');
      if (minimizeToTray) trayManager = new TrayManager(windowManager);

      if (app.isPackaged) {
        autoUpdater = new AutoUpdater(windowManager);
        autoUpdater.checkForUpdates();
      }

      // 6. Background Engine Initialization & Config Sync
      setTimeout(() => {
        try {
          console.log('[Main] Triggering background engine initialization...');
          const engine = getDramEngine(windowManager, debugLog);
          perfMonitor.startTimer('engine:initialize');

          engine.initialize().then(async () => {
            const initTime = perfMonitor.endTimer('engine:initialize');
            const startupTime = perfMonitor.endTimer('app:startup');
            console.log(`[Main] Engine initialized in ${Math.round(initTime)}ms`);
            console.log(`[Main] Total startup time: ${Math.round(startupTime)}ms`);

            // Save gateway token to secure storage for renderer access
            if (engine.embeddedGatewayToken) {
              const secureStorage = new SecureStorage();
              await secureStorage.set('gateway.token', engine.embeddedGatewayToken);
              console.log('[Main] Gateway token saved to secure storage');
            }

            // Log performance metrics
            const metrics = perfMonitor.getHealthStatus();
            console.log('[Main] Performance status:', metrics.status);

            setupConfigSync(stateManager, {
              loadConfig: engine.modules.loadConfig,
              writeConfigFile: engine.modules.writeConfigFile,
              configPath: engine.modules.configPath,
              restartGatewayForRuntimeSecrets: engine.modules.restartGatewayForRuntimeSecrets
            });
          }).catch(err => {
            console.error('[Main] Background engine init failed:', err.message);
          });
        } catch (e) {
          console.error('[Main] Failed to start background init:', e);
        }
      }, 500);

      if (!processCleanupBound) {
        processCleanupBound = true;
        process.once('SIGINT', forceCleanupGateway);
        process.once('SIGTERM', forceCleanupGateway);
        process.once('exit', forceCleanupGateway);
      }
    } catch (err) {
      console.error('Boot Error:', err);
      // Only show dialog for non-EPIPE errors
      if (err.code !== 'EPIPE' && !err.message?.includes('EPIPE')) {
        dialog.showErrorBox('DRAM Boot Failure', err.message);
      }
    }
  }

  app.whenReady().then(initialize);

  app.on('second-instance', () => {
    if (windowManager) windowManager.focusMainWindow();
  });

  app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    if (quitCleanupStarted) return;
    quitCleanupStarted = true;
    event.preventDefault();

    (async () => {
      try {
        if (trayManager) {
          trayManager.destroy();
          trayManager = null;
        }

        const engine = peekDramEngine();
        if (engine) {
          await Promise.race([
            engine.stop(),
            new Promise((resolve) => setTimeout(resolve, 2000))
          ]);
        }

        forceCleanupGateway();
      } catch (err) {
        console.warn('[Main] Quit cleanup failed:', err.message);
      } finally {
        app.exit(0);
      }
    })();
  });

  app.on('will-quit', () => {
    forceCleanupGateway();
  });

  app.on('quit', () => {
    forceCleanupGateway();
  });

  app.on('activate', () => {
    if (windowManager && BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow();
    }
  });
}
