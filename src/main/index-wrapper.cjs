/**
 * CommonJS wrapper for ES module main process
 * This helps handle module loading issues in Electron
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to write to temp log
function logError(msg, err) {
  const timestamp = new Date().toISOString();
  const logContent = `[${timestamp}] ${msg}\n${err ? err.message || err : ''}\n${err && err.stack ? err.stack : ''}\n\n`;

  // Try multiple locations
  const tempDir = os.tmpdir();
  const logPaths = [
    path.join(tempDir, 'dram-error.log'),
    path.join(os.homedir(), 'dram-error.log'),
    path.join(process.cwd(), 'dram-error.log')
  ];

  for (const logPath of logPaths) {
    try {
      fs.appendFileSync(logPath, logContent);
      return logPath; // Return the path that worked
    } catch { /* ignore */ }
  }
  return null;
}

// Set up error handlers BEFORE anything else
process.on('uncaughtException', (err) => {
  // Silently ignore EPIPE errors - they happen when renderer closes unexpectedly
  if (err.code === 'EPIPE' || err.message?.includes('EPIPE') || err.message?.includes('broken pipe')) {
    console.error('[Pre-Load] EPIPE error - ignoring');
    return;
  }

  const logPath = logError('Uncaught Exception', err);
  console.error('[Pre-Load] Uncaught Exception:', err);

  // Try to show dialog (only for non-EPIPE errors)
  try {
    const { dialog } = require('electron');
    const msg = `Error: ${err.message}\n\nLog: ${logPath || 'failed to write'}`;
    dialog.showErrorBox('Fatal Error', msg);
  } catch { /* ignore */ }

  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  logError('Unhandled Rejection', reason);
  console.error('[Pre-Load] Unhandled Rejection:', reason);
});

// Log startup
logError('Starting application...');

// IMPORTANT: Register custom protocol schemes BEFORE app is ready
// This must be done synchronously before the async ES module load
try {
  const { protocol } = require('electron');
  if (protocol && typeof protocol.registerSchemesAsPrivileged === 'function') {
    protocol.registerSchemesAsPrivileged([
      { scheme: 'dram', privileges: { standard: true, secure: true, allowServiceWorkers: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
    ]);
  }
} catch {
  // Silent fail - protocol registration may already be done in index.js or not possible at this stage
}

// Try to import the ES module
(async () => {
  try {
    logError('About to import ES module...');
    await import('./index.js');
    logError('ES module loaded successfully');
  } catch (err) {
    logError('Failed to load ES module', err);
    console.error('[Pre-Load] Failed to load ES module:', err);

    // Show error dialog (skip for EPIPE)
    if (!err.message?.includes('EPIPE')) {
      try {
        const { dialog } = require('electron');
        dialog.showErrorBox('Module Load Error', `Failed to load application:\n\n${err.message}`);
      } catch { /* ignore */ }
    }

    process.exit(1);
  }
})();
