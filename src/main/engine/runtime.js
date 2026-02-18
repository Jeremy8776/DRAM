/**
 * DRAM Engine Runtime Manager (Symbiotic Mode)
 * 
 * This module now serves as a compatibility layer for the external OpenClaw approach.
 * The bundled engine has been replaced with external OpenClaw CLI management.
 */
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('[EngineRuntime] Module loading (Symbiotic OpenClaw mode)...');

export class EngineRuntime {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.isReady = false;
  }

  /**
   * Check if OpenClaw CLI is available (instead of bundled engine)
   */
  async checkInstallation() {
    try {
      console.log('[EngineRuntime] Checking for OpenClaw CLI...');

      const { getDramEngine } = await import('./core.js');
      const engine = getDramEngine(this.windowManager);

      const found = await engine.findCli();
      this.isReady = found;

      if (found) {
        console.log('[EngineRuntime] OpenClaw CLI detected via core discovery');
      } else {
        console.log('[EngineRuntime] OpenClaw CLI not found');
      }

      return found;
    } catch (err) {
      console.error('[EngineRuntime] Check failed:', err.message);
      this.isReady = false;
      return false;
    }
  }

  /**
   * Get engine status
   * @deprecated Use OpenClaw discovery instead
   */
  getStatus() {
    return {
      ready: this.isReady,
      engineDir: null,
      version: null,
      mode: 'symbiotic'
    };
  }

  /**
   * @deprecated Bundled engine modules are not available in symbiotic mode
   */
  async import(modulePath) {
    console.warn(`[EngineRuntime] Cannot import bundled module: ${modulePath}`);
    console.warn('[EngineRuntime] Using external OpenClaw - bundled modules not available');
    throw new Error('Bundled engine modules not available in symbiotic mode. Use external OpenClaw CLI.');
  }

  /**
   * @deprecated Use core.js spawn instead
   */
  require(modulePath) {
    console.warn(`[EngineRuntime] Cannot require bundled module: ${modulePath}`);
    throw new Error('Bundled engine modules not available in symbiotic mode');
  }

  /**
   * @deprecated Use core.js spawn instead
   */
  spawn(args = [], options = {}) {
    console.warn('[EngineRuntime] spawn() is deprecated. Use DramEngine in core.js instead.');
    throw new Error('Use DramEngine.spawnGateway() instead of runtime.spawn()');
  }
}

// Singleton
let runtime = null;
export function getEngineRuntime(windowManager) {
  if (!runtime) {
    runtime = new EngineRuntime(windowManager);
  }
  return runtime;
}
