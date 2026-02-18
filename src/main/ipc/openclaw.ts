import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import chokidar from 'chokidar';
function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}
const execAsync = promisify(exec);
const WINDOWS_HIDE = process.platform === 'win32';
const withWindowsHide = (options = {}) => (WINDOWS_HIDE ? { ...options, windowsHide: true } : options);
const quoteForCmd = (arg) => {
  const str = String(arg ?? '');
  if (!str.length) return '""';
  if (!/[ \t"&|<>^()]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
};
const resolveConfigCandidate = (candidatePath) => {
  if (!candidatePath) return null;
  const normalized = candidatePath.trim();
  if (!normalized) return null;
  if (path.extname(normalized).toLowerCase() === '.json') return normalized;
  return path.join(normalized, 'openclaw.json');
};
const CONFIG_PATHS = [
  () => path.join(os.homedir(), '.openclaw', 'openclaw.json'),
  () => process.env.OPENCLAW_HOME ? path.join(process.env.OPENCLAW_HOME, 'openclaw.json') : null,
  () => process.env.OPENCLAW_CONFIG_PATH || null,
];
const NPM_GLOBAL_PATHS = [
  () => path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', 'openclaw'),
  () => path.join(os.homedir(), '.nvm', 'versions', 'node', process.version, 'lib', 'node_modules', 'openclaw'),
  () => process.platform === 'win32'
    ? path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw')
    : '/usr/local/lib/node_modules/openclaw',
  () => process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || '', 'nodejs', 'node_modules', 'openclaw')
    : '/usr/lib/node_modules/openclaw',
];
export class OpenClawManager {
  windowManager: any;
  debugLog: (...args: any[]) => void;
  configWatcher: any;
  lastConfigMtime: number | null;
  discoveryCache: any;
  configPath: string | null;
  installPromise: Promise<any> | null;

  constructor(windowManager, debugLog) {
    this.windowManager = windowManager;
    this.debugLog = debugLog;
    this.configWatcher = null;
    this.lastConfigMtime = null;
    this.discoveryCache = null;
    this.configPath = null;
    this.installPromise = null;
  }
  async discover() {
    this.debugLog('[OpenClaw] Starting discovery...');
    const result = {
      found: false,
      installed: false,
      cliPath: null,
      configPath: null,
      configDir: null,
      version: null,
      npmRoot: null,
      source: null,
      config: null,
      needsInstall: false
    };
    const cliCheck = await this._findCli();
    if (cliCheck.found) {
      result.installed = true;
      result.cliPath = cliCheck.path;
      result.source = cliCheck.source;
      result.version = await this._getVersion(cliCheck.path);
      this.debugLog('[OpenClaw] CLI found:', cliCheck.path, 'source:', cliCheck.source, 'version:', result.version);
    }
    const configInfo = await this._findConfig();
    if (configInfo) {
      result.configPath = configInfo.path;
      result.configDir = configInfo.dir;
      result.config = configInfo.content;
      this.configPath = configInfo.path;
      this.debugLog('[OpenClaw] Config found:', configInfo.path);
      const hasUserConfig = this._hasMeaningfulConfig(configInfo.content);
      if (hasUserConfig) {
        result.found = true;
        this.debugLog('[OpenClaw] Config has user settings, marking as found');
      } else {
        this.debugLog('[OpenClaw] Config exists but is empty/default, not marking as found');
      }
    }
    if (result.source === 'global' && result.found) {
      this.debugLog('[OpenClaw] Global OpenClaw with config - showing detection');
      result.needsInstall = false;
    } else if (result.source === 'global' && !result.found) {
      this.debugLog('[OpenClaw] Global OpenClaw but empty config - fresh install');
      result.needsInstall = false;
    } else if (!result.installed) {
      this.debugLog('[OpenClaw] Not found - needs install');
      result.needsInstall = true;
    }
    if (result.configPath) {
      this._startConfigWatcher(result.configPath);
    }
    this.discoveryCache = result;
    return result;
  }
  async _findCli() {
    try {
      const { stdout: npmRoot } = await execAsync('npm root -g', withWindowsHide());
      const globalPath = path.join(npmRoot.trim(), 'openclaw');
      await fs.access(globalPath);
      const cliPath = process.platform === 'win32'
        ? path.join(npmRoot.trim(), '.bin', 'openclaw.cmd')
        : path.join(npmRoot.trim(), '.bin', 'openclaw');
      this.debugLog('[OpenClaw] Found global CLI at:', cliPath);
      return { found: true, path: cliPath, source: 'global' };
    } catch {
      void 0;
    }
    for (const pathFn of NPM_GLOBAL_PATHS) {
      const installDir = pathFn();
      if (!installDir) continue;
      try {
        await fs.access(path.join(installDir, 'package.json'));
        const prefix = path.dirname(path.dirname(installDir));
        const cliPath = process.platform === 'win32'
          ? path.join(prefix, 'openclaw.cmd')
          : path.join(prefix, 'bin', 'openclaw');
        await fs.access(cliPath);
        this.debugLog('[OpenClaw] Found global CLI from known path:', cliPath);
        return { found: true, path: cliPath, source: 'global' };
      } catch {
        void 0;
      }
    }
    const commands = process.platform === 'win32'
      ? ['where openclaw', 'where oc']
      : ['which openclaw', 'which oc'];
    for (const cmd of commands) {
      try {
        const { stdout } = await execAsync(cmd, withWindowsHide({ encoding: 'utf-8' }));
        const paths = stdout.trim().split(/\r?\n/).filter(Boolean);
        if (paths.length > 0 && !paths[0].includes('not found')) {
          this.debugLog('[OpenClaw] Found CLI in PATH at:', paths[0]);
          return { found: true, path: paths[0], source: 'global' };
        }
      } catch {
        void 0;
      }
    }
    return { found: false, path: null, source: null };
  }
  async _getVersion(cliPath) {
    try {
      const { stdout } = await execAsync(`"${cliPath}" --version`, withWindowsHide({ timeout: 5000 }));
      const match = stdout.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }
  async _findConfig() {
    for (const pathFn of CONFIG_PATHS) {
      const configPath = resolveConfigCandidate(pathFn());
      if (!configPath) continue;
      try {
        const stats = await fs.stat(configPath);
        if (stats.isFile()) {
          const content = await fs.readFile(configPath, 'utf-8');
          const parsed = JSON.parse(content);
          this.lastConfigMtime = stats.mtimeMs;
          return {
            path: configPath,
            dir: path.dirname(configPath),
            content: parsed,
            modified: stats.mtime
          };
        }
      } catch {
        void 0;
      }
    }
    return null;
  }
  _hasMeaningfulConfig(config) {
    if (!config || typeof config !== 'object') return false;
    let model = config.agents?.defaults?.model?.primary || '';
    if (model.includes('/')) {
      model = model.split('/')[1];
    }
    const workspace = config.agents?.defaults?.workspace;
    const plugins = config.plugins?.entries;
    const gatewayPort = config.gateway?.port;
    this.debugLog('[OpenClaw] Checking config - model:', model, 'workspace:', workspace, 'plugins:', plugins ? Object.keys(plugins).length : 0, 'port:', gatewayPort);
    const defaultModels = ['claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest'];
    const hasCustomModel = model && !defaultModels.includes(model);
    const hasCustomWorkspace = workspace &&
      !workspace.toLowerCase().includes('documents') &&
      !workspace.toLowerCase().includes('dram');
    const hasPlugins = plugins && Object.keys(plugins).length > 0;
    const hasGatewayConfig = !!gatewayPort && Number(gatewayPort) !== 18789;
    const result = hasCustomModel || hasCustomWorkspace || hasPlugins || hasGatewayConfig;
    this.debugLog('[OpenClaw] Config check result:', { hasCustomModel, hasCustomWorkspace, hasPlugins, hasGatewayConfig, result });
    return result;
  }
  _startConfigWatcher(configPath) {
    if (this.configWatcher) {
      this.configWatcher.close();
    }
    try {
      const watcher = chokidar.watch(configPath, {
        persistent: true,
        ignoreInitial: true,
        ignorePermissionErrors: true
      });
      watcher.on('change', async () => {
        this.debugLog('[OpenClaw] Config file changed externally');
        await this._handleConfigChange();
      });
      watcher.on('error', (err: any) => {
        this.debugLog('[OpenClaw] Watcher error:', err.message);
      });
      this.configWatcher = watcher;
      this.debugLog('[OpenClaw] Started watching config (chokidar):', configPath);
    } catch (err: any) {
      this.debugLog('[OpenClaw] Failed to start chokidar watcher:', err.message);
    }
  }
  _handleConfigChange = debounce(async () => {
    try {
      const configInfo = await this._findConfig();
      if (configInfo) {
        this.windowManager.sendToRenderer('openclaw:configChanged', {
          config: configInfo.content,
          modified: configInfo.modified
        });
        this.debugLog('[OpenClaw] Config change broadcasted to renderer');
      }
    } catch (err: any) {
      this.debugLog('[OpenClaw] Error handling config change:', err.message);
    }
  }, 500);
  async install(version = 'latest', onProgress = null) {
    if (this.installPromise) {
      this.debugLog('[OpenClaw] Install already in progress, joining existing request');
      return this.installPromise;
    }
    this.debugLog('[OpenClaw] Installing version:', version);
    const installSpec = version === 'latest' ? 'openclaw' : `openclaw@${version}`;
    this.installPromise = new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const npmCmd = isWindows ? 'npm.cmd' : 'npm';
      if (onProgress) onProgress({ status: 'starting', message: 'Starting installation...', percent: 0 });
      const child = isWindows
        ? spawn(
          process.env.ComSpec || 'cmd.exe',
          ['/d', '/s', '/c', `${quoteForCmd(npmCmd)} install -g ${quoteForCmd(installSpec)}`],
          {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, npm_config_loglevel: 'error' },
            windowsHide: true,
            shell: false
          }
        )
        : spawn(npmCmd, ['install', '-g', installSpec], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, npm_config_loglevel: 'error' },
          windowsHide: false,
          shell: false
        });
      let stdout = '';
      let stderr = '';
      let progress = 10;
      child.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        if (str.includes('added') || str.includes('packages')) {
          progress = Math.min(progress + 20, 90);
          if (onProgress) onProgress({ status: 'downloading', message: 'Downloading packages...', percent: progress });
        }
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      child.on('close', async (code) => {
        if (code === 0) {
          this.debugLog('[OpenClaw] Installation successful');
          if (onProgress) onProgress({ status: 'complete', message: 'Installation complete', percent: 100 });
          this.discoveryCache = null;
          resolve({ success: true, message: 'OpenClaw installed successfully' });
        } else {
          this.debugLog('[OpenClaw] Installation failed:', stderr);
          if (onProgress) onProgress({ status: 'error', message: 'Installation failed', percent: 0, error: stderr });
          resolve({
            success: false,
            error: stderr || 'Installation failed',
            code
          });
        }
      });
      child.on('error', (err: any) => {
        this.debugLog('[OpenClaw] Installation error:', err.message);
        if (onProgress) onProgress({ status: 'error', message: err.message, percent: 0, error: err.message });
        resolve({ success: false, error: err.message });
      });
    });
    return this.installPromise.finally(() => {
      this.installPromise = null;
    });
  }
  async getAvailableVersions() {
    try {
      const { stdout } = await execAsync('npm view openclaw versions --json', withWindowsHide({ timeout: 10000 }));
      const versions = JSON.parse(stdout);
      return versions.slice(-20).reverse();
    } catch (err: any) {
      this.debugLog('[OpenClaw] Failed to get versions:', err.message);
      return [];
    }
  }
  async readConfig() {
    if (!this.configPath) {
      const discovery = await this.discover();
      if (!discovery.configPath) {
        throw new Error('No OpenClaw config found');
      }
    }
    const content = await fs.readFile(this.configPath, 'utf-8');
    return JSON.parse(content);
  }
  async writeConfig(config) {
    if (!this.configPath) {
      const configDir = path.join(os.homedir(), '.openclaw');
      await fs.mkdir(configDir, { recursive: true });
      this.configPath = path.join(configDir, 'openclaw.json');
    }
    await fs.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
    this.debugLog('[OpenClaw] Config written to:', this.configPath);
    return true;
  }
  async createBackup() {
    if (!this.configPath) {
      throw new Error('No config to backup');
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.configPath}.dram-backup-${timestamp}`;
    await fs.copyFile(this.configPath, backupPath);
    this.debugLog('[OpenClaw] Backup created:', backupPath);
    return { success: true, path: backupPath };
  }
  async listBackups() {
    if (!this.configPath) return [];
    const configDir = path.dirname(this.configPath);
    const baseName = path.basename(this.configPath);
    try {
      const files = await fs.readdir(configDir);
      return files
        .filter(f => f.startsWith(baseName) && f.includes('.dram-backup-'))
        .map(f => ({
          name: f,
          path: path.join(configDir, f),
          date: f.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)?.[0] || 'unknown'
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  }
  async restoreBackup(backupPath) {
    if (!this.configPath) {
      throw new Error('No config location set');
    }
    await fs.copyFile(backupPath, this.configPath);
    this.debugLog('[OpenClaw] Restored from backup:', backupPath);
    return { success: true };
  }
  dispose() {
    if (this.configWatcher) {
      this.configWatcher.close();
      this.configWatcher = null;
    }
  }
}
export function registerOpenClawHandlers(ipc, _stateManager, windowManager, debugLog) {
  const manager = new OpenClawManager(windowManager, debugLog);
  ipc.handle('openclaw:discover', async () => {
    return await manager.discover();
  });
  ipc.handle('openclaw:install', async (_event, version = 'latest') => {
    return await manager.install(version);
  });
  ipc.handle('openclaw:getVersions', async () => {
    return await manager.getAvailableVersions();
  });
  ipc.handle('openclaw:readConfig', async () => {
    return await manager.readConfig();
  });
  ipc.handle('openclaw:writeConfig', async (_event, config) => {
    return await manager.writeConfig(config);
  });
  ipc.handle('openclaw:createBackup', async () => {
    return await manager.createBackup();
  });
  ipc.handle('openclaw:listBackups', async () => {
    return await manager.listBackups();
  });
  ipc.handle('openclaw:restoreBackup', async (_event, backupPath) => {
    return await manager.restoreBackup(backupPath);
  });
  ipc.handle('openclaw:initializeEngine', async () => {
    debugLog('[OpenClaw] Initializing engine after install...');
    try {
      const { getDramEngine } = await import('../engine/core.js');
      const engine = getDramEngine(windowManager, debugLog);
      await engine.initialize();
      if (engine.embeddedGatewayToken) {
        const { SecureStorage } = await import('../secure-storage.js');
        const secureStorage = new SecureStorage();
        await secureStorage.set('gateway.token', engine.embeddedGatewayToken);
        debugLog('[OpenClaw] Gateway token saved to secure storage');
      }
      debugLog('[OpenClaw] Engine initialized successfully');
      return { success: true };
    } catch (err: any) {
      debugLog('[OpenClaw] Engine initialization failed:', err.message);
      return { success: false, error: err.message };
    }
  });
  app.on('before-quit', () => {
    manager.dispose();
  });
}





