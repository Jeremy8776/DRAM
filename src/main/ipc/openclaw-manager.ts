import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import chokidar from 'chokidar';

const execAsync = promisify(exec);
const WINDOWS_HIDE = process.platform === 'win32';
const withWindowsHide = (options = {}) => (WINDOWS_HIDE ? { ...options, windowsHide: true } : options);
const normalizeJsonSource = (value: unknown) => {
  const text = String(value ?? '').replace(/^\uFEFF/, '');
  const firstJsonToken = text.search(/[{\[]/);
  if (firstJsonToken > 0) return text.slice(firstJsonToken);
  return text;
};
const parseJson = (value: unknown) => JSON.parse(normalizeJsonSource(value));

export function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

export const quoteForCmd = (arg) => {
  const str = String(arg ?? '');
  if (!str.length) return '""';
  if (!/[ \t"&|<>^()]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
};

export const pathExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const parseVersionScore = (rawVersion: unknown) => {
  const value = String(rawVersion || '').trim();
  if (!value) return -1;
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/) || value.match(/(\d+)\.(\d+)/);
  if (!match) return -1;
  const major = Number(match[1] || 0);
  const minor = Number(match[2] || 0);
  const patch = Number(match[3] || 0);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return -1;
  return (major * 1_000_000) + (minor * 1_000) + patch;
};

const readPackageVersionFromInstallDir = async (installDir: string | null | undefined) => {
  if (!installDir) return 'unknown';
  try {
    const packageJsonPath = path.join(installDir, 'package.json');
    const packageRaw = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = parseJson(packageRaw);
    const version = typeof pkg?.version === 'string' ? pkg.version.trim() : '';
    return version || 'unknown';
  } catch {
    return 'unknown';
  }
};

const inferPackageDirFromCliPath = (cliPath: string | null | undefined) => {
  if (!cliPath) return null;
  const normalized = path.normalize(cliPath);
  const marker = `${path.sep}node_modules${path.sep}openclaw`;
  const idx = normalized.toLowerCase().indexOf(marker.toLowerCase());
  if (idx !== -1) {
    return normalized.slice(0, idx + marker.length);
  }
  if (process.platform === 'win32') {
    const parent = path.dirname(normalized);
    return path.join(parent, 'node_modules', 'openclaw');
  }
  return null;
};

export const resolveCliEntryFromInstallDir = async (installDir) => {
  if (!installDir) return null;
  const packageJsonPath = path.join(installDir, 'package.json');
  if (!(await pathExists(packageJsonPath))) return null;

  let packageEntry = null;
  try {
    const packageRaw = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = parseJson(packageRaw);
    const bin = pkg?.bin;
    packageEntry = typeof bin === 'string'
      ? bin
      : (bin && typeof bin === 'object'
        ? (bin.openclaw || bin.cli || Object.values(bin).find((value) => typeof value === 'string'))
        : null);
  } catch {
    void 0;
  }

  const candidates = [];
  if (typeof packageEntry === 'string' && packageEntry.trim()) {
    candidates.push(path.resolve(installDir, packageEntry));
  }
  candidates.push(
    path.join(installDir, 'openclaw.mjs'),
    path.join(installDir, 'openclaw.js'),
    path.join(installDir, 'bin', 'openclaw.mjs'),
    path.join(installDir, 'bin', 'openclaw.js'),
    path.join(installDir, 'dist', 'cli.mjs'),
    path.join(installDir, 'dist', 'cli.js')
  );

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  return null;
};

export const resolveConfigCandidate = (candidatePath) => {
  if (!candidatePath) return null;
  const normalized = candidatePath.trim();
  if (!normalized) return null;
  if (path.extname(normalized).toLowerCase() === '.json') return normalized;
  return path.join(normalized, 'openclaw.json');
};

export const CONFIG_PATHS = [
  () => path.join(os.homedir(), '.openclaw', 'openclaw.json'),
  () => process.env.OPENCLAW_HOME ? path.join(process.env.OPENCLAW_HOME, 'openclaw.json') : null,
  () => process.env.OPENCLAW_CONFIG_PATH || null,
];

export const NPM_GLOBAL_PATHS = [
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
    const preferGlobal = !app.isPackaged;
    const candidates: Array<{ path: string; source: 'bundled' | 'global'; version: string; score: number }> = [];
    const seen = new Set<string>();
    const addCandidate = (candidate: { path: string; source: 'bundled' | 'global'; version: string }) => {
      const normalized = path.normalize(candidate.path);
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({
        path: normalized,
        source: candidate.source,
        version: candidate.version || 'unknown',
        score: parseVersionScore(candidate.version)
      });
    };

    const bundledInstallDirs = new Set<string>();
    if (typeof process.resourcesPath === 'string' && process.resourcesPath.trim()) {
      bundledInstallDirs.add(path.join(process.resourcesPath, 'engine'));
      bundledInstallDirs.add(path.join(process.resourcesPath, 'resources', 'engine'));
    }
    try {
      const appPath = app.getAppPath();
      if (typeof appPath === 'string' && appPath.trim()) {
        bundledInstallDirs.add(path.join(appPath, '..', 'engine'));
        bundledInstallDirs.add(path.join(appPath, 'resources', 'engine'));
      }
    } catch {
      void 0;
    }
    bundledInstallDirs.add(path.join(process.cwd(), 'resources', 'engine'));

    for (const installDir of bundledInstallDirs) {
      const bundledCliPath = await resolveCliEntryFromInstallDir(installDir);
      if (!bundledCliPath) continue;
      const version = await readPackageVersionFromInstallDir(installDir);
      addCandidate({ path: bundledCliPath, source: 'bundled', version });
    }

    try {
      const { stdout: npmRoot } = await execAsync('npm root -g', withWindowsHide());
      const globalInstallDir = path.join(npmRoot.trim(), 'openclaw');
      await fs.access(globalInstallDir);
      const cliPath = await resolveCliEntryFromInstallDir(globalInstallDir)
        || (process.platform === 'win32'
          ? path.join(npmRoot.trim(), '.bin', 'openclaw.cmd')
          : path.join(npmRoot.trim(), '.bin', 'openclaw'));
      const version = await readPackageVersionFromInstallDir(globalInstallDir);
      addCandidate({ path: cliPath, source: 'global', version });
    } catch {
      void 0;
    }

    for (const pathFn of NPM_GLOBAL_PATHS) {
      const installDir = pathFn();
      if (!installDir) continue;
      try {
        await fs.access(path.join(installDir, 'package.json'));
        const cliPath = await resolveCliEntryFromInstallDir(installDir)
          || (process.platform === 'win32'
            ? path.join(path.dirname(path.dirname(installDir)), 'openclaw.cmd')
            : path.join(path.dirname(path.dirname(installDir)), 'bin', 'openclaw'));
        const version = await readPackageVersionFromInstallDir(installDir);
        addCandidate({ path: cliPath, source: 'global', version });
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
          const installDir = inferPackageDirFromCliPath(paths[0]);
          const version = await readPackageVersionFromInstallDir(installDir);
          addCandidate({ path: paths[0], source: 'global', version });
        }
      } catch {
        void 0;
      }
    }

    if (candidates.length === 0) {
      return { found: false, path: null, source: null };
    }

    candidates.sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.source !== right.source) {
        if (preferGlobal) return left.source === 'global' ? -1 : 1;
        return left.source === 'bundled' ? -1 : 1;
      }
      return left.path.localeCompare(right.path);
    });

    const selected = candidates[0];
    this.debugLog('[OpenClaw] Selected CLI:', selected.path, 'source:', selected.source, 'version:', selected.version);
    return { found: true, path: selected.path, source: selected.source };
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
          const parsed = parseJson(content);
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
      const versions = parseJson(stdout);
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
    return parseJson(content);
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
