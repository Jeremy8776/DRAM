/**
 * DRAM - OpenClaw Engine Manager (Symbiotic Mode)
 * Manages OpenClaw lifecycle by discovering and spawning external CLI
 */
import crypto from 'crypto';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import WebSocket from 'ws';
import os from 'os';
import { spawn, exec, execFile, execSync, spawnSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const WINDOWS_HIDE = process.platform === 'win32';
const withWindowsHide = (options = {}) => (WINDOWS_HIDE ? { ...options, windowsHide: true } : options);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
function listExecutablesInPath(fileNames = []) {
  const rawPath = process.env.PATH || process.env.Path || '';
  if (!rawPath) return [];
  const names = Array.isArray(fileNames) ? fileNames.filter(Boolean) : [];
  if (names.length === 0) return [];

  const entries = rawPath
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const found = [];
  const seen = new Set();
  for (const entry of entries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      try {
        if (!fs.existsSync(candidate)) continue;
        found.push(candidate);
        seen.add(key);
      } catch {
        // ignore candidate probe failures
      }
    }
  }
  return found;
}
function findExecutableInPath(fileNames = []) {
  const matches = listExecutablesInPath(fileNames);
  return matches.length > 0 ? matches[0] : null;
}
function isSameExecutablePath(left, right) {
  if (!left || !right) return false;
  try {
    return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
  } catch {
    return false;
  }
}
function resolveNodeRuntime() {
  const execPath = process.execPath || '';
  const runningInsideElectron = Boolean(process.versions?.electron);

  const envCandidates = [
    process.env.npm_node_execpath,
    process.env.NODE_EXE,
    process.env.NODE
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);

  for (const candidate of envCandidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore invalid env path
    }
  }

  const pathHit = process.platform === 'win32'
    ? findExecutableInPath(['node.exe', 'node.cmd', 'node'])
    : findExecutableInPath(['node']);
  if (pathHit) return pathHit;

  if (process.platform === 'win32') {
    const knownWindowsCandidates = [
      path.join(process.env.ProgramFiles || '', 'nodejs', 'node.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'nodejs', 'node.exe')
    ];
    for (const candidate of knownWindowsCandidates) {
      if (!candidate || candidate.includes('\\\\')) continue;
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        // ignore candidate probe failures
      }
    }
  }

  // In packaged Electron builds, fallback to the app binary and force Node mode.
  if (runningInsideElectron && execPath) {
    return execPath;
  }

  return execPath || 'node';
}
const NODE_RUNTIME = resolveNodeRuntime();
const NODE_RUNTIME_USE_ELECTRON_NODE = Boolean(
  process.versions?.electron && isSameExecutablePath(NODE_RUNTIME, process.execPath)
);
function buildNodeRuntimeEnv(baseEnv = {}) {
  if (!NODE_RUNTIME_USE_ELECTRON_NODE) return baseEnv;
  return {
    ...baseEnv,
    ELECTRON_RUN_AS_NODE: '1'
  };
}

function resolveOpenClawEntryFromPackageDir(packageDir) {
  if (typeof packageDir !== 'string' || !packageDir.trim()) return null;
  const normalizedDir = path.normalize(packageDir);
  const packageJsonPath = path.join(normalizedDir, 'package.json');

  try {
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const bin = pkg?.bin;
      const binPath = typeof bin === 'string'
        ? bin
        : (bin && typeof bin === 'object'
          ? (bin.openclaw || bin.cli || Object.values(bin).find((v) => typeof v === 'string'))
          : null);

      if (typeof binPath === 'string' && binPath.trim()) {
        const entry = path.resolve(normalizedDir, binPath);
        if (fs.existsSync(entry)) return entry;
      }
    }
  } catch {
    // ignore package parsing failures
  }

  const fallbackEntries = [
    'openclaw.mjs',
    'openclaw.js',
    path.join('bin', 'openclaw.mjs'),
    path.join('bin', 'openclaw.js'),
    path.join('dist', 'cli.mjs'),
    path.join('dist', 'cli.js')
  ];

  for (const rel of fallbackEntries) {
    try {
      const candidate = path.join(normalizedDir, rel);
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore candidate probe failures
    }
  }

  return null;
}
function resolveBundledOpenClawEntry() {
  const packageDirs = new Set();

  try {
    if (typeof process.resourcesPath === 'string' && process.resourcesPath.trim()) {
      packageDirs.add(path.join(process.resourcesPath, 'engine'));
      packageDirs.add(path.join(process.resourcesPath, 'resources', 'engine'));
    }
  } catch {
    // ignore
  }

  // Dev workspace fallback: <repo>/resources/engine
  packageDirs.add(path.resolve(MODULE_DIR, '../../engine'));

  for (const packageDir of packageDirs) {
    const entry = resolveOpenClawEntryFromPackageDir(packageDir);
    if (entry) return entry;
  }
  return null;
}

function resolveOpenClawMjsFromShim(shimPath) {
  if (typeof shimPath !== 'string' || !shimPath.trim()) return null;

  const normalized = path.normalize(shimPath);
  const fileName = path.basename(normalized).toLowerCase();
  const looksLikeShim = fileName === 'openclaw.cmd' || fileName === 'openclaw';
  if (!looksLikeShim) return null;

  const packageDirs = new Set();
  const shimDir = path.dirname(normalized);

  // Example: C:\Users\<user>\AppData\Roaming\npm\openclaw.cmd
  packageDirs.add(path.join(shimDir, 'node_modules', 'openclaw'));

  // Example: ...\node_modules\.bin\openclaw.cmd
  if (path.basename(shimDir).toLowerCase() === '.bin') {
    packageDirs.add(path.join(path.dirname(shimDir), 'openclaw'));
  }

  const marker = `${path.sep}node_modules${path.sep}.bin${path.sep}`;
  const idx = normalized.toLowerCase().lastIndexOf(marker.toLowerCase());
  if (idx !== -1) {
    const nodeModulesRoot = normalized.slice(0, idx + `${path.sep}node_modules`.length);
    packageDirs.add(path.join(nodeModulesRoot, 'openclaw'));
  }

  for (const packageDir of packageDirs) {
    const entry = resolveOpenClawEntryFromPackageDir(packageDir);
    if (entry) return entry;
  }

  return null;
}

function quoteForCmd(arg) {
  const str = String(arg ?? '');
  if (!str.length) return '""';
  if (!/[ \t"&|<>^()]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function listListeningPidsOnPortSync(port) {
  if (!Number.isFinite(Number(port))) return [];

  if (process.platform === 'win32') {
    try {
      const stdout = execSync(`netstat -ano | findstr :${port}`, withWindowsHide({ encoding: 'utf8' }));
      const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
      const pids = new Set();
      for (const line of lines) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      return [...pids];
    } catch {
      return [];
    }
  }

  try {
    const stdout = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' });
    return String(stdout || '')
      .trim()
      .split(/\r?\n/)
      .filter((pid) => /^\d+$/.test(pid));
  } catch {
    return [];
  }
}

function killPidSync(pid) {
  if (!/^\d+$/.test(String(pid))) return false;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, shell: false });
    return result.status === 0;
  }

  const term = spawnSync('kill', ['-TERM', String(pid)], { shell: false });
  if (term.status === 0) return true;
  const kill = spawnSync('kill', ['-KILL', String(pid)], { shell: false });
  return kill.status === 0;
}

// Config path for OpenClaw (native format)
const OPENCLAW_CONFIG_DIR = path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_CONFIG_DIR, 'openclaw.json');
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

console.log('[DramEngine] Module loading (Symbiotic OpenClaw mode)...');

class DramEngine {
  constructor(windowManager, debugLog) {
    this.windowManager = windowManager;
    this.debugLog = debugLog;
    this.initialized = false;
    this.initializingPromise = null;
    this.cliPath = null;
    this.useNodeSpawn = false;
    this.configDir = OPENCLAW_CONFIG_DIR;
    this.configPath = OPENCLAW_CONFIG_PATH;
    this.gatewayPort = 18789;

    this.engineProcess = null;
    this.ws = null;
    this.pendingRequests = new Map();
    this.embeddedGatewayToken = crypto.randomUUID();
    this.deviceIdentity = null;
    this.lastCliProbeAt = 0;
    this.lastCliProbeOk = null;
    this.gatewayRestartExpectedUntil = 0;
    this.reconnectTimer = null;
    this.shuttingDown = false;
    this.managedGateway = false;
    this.verboseWsFrames = String(process.env.DRAM_VERBOSE_WS || '') === '1';
    this.allScopes = [
      'operator.read',
      'operator.write',
      'operator.admin',
      'operator.approvals',
      'operator.pairing'
    ];

    // Exposed for ConfigSync
    this.modules = {
      loadConfig: this.loadConfig.bind(this),
      writeConfigFile: this.writeConfigFile.bind(this),
      configPath: this.configPath,
      restartGatewayForRuntimeSecrets: this.restartGatewayForRuntimeSecrets.bind(this)
    };

    console.log(`[DramEngine] Generated gateway token (masked): ${this.embeddedGatewayToken.substring(0, 4)}****`);
  }

  _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _emitSocketStatus(status) {
    try {
      this.windowManager?.sendToRenderer('socket:status', status);
    } catch {
      // noop
    }
  }

  _scheduleReconnect(delayMs = 1500) {
    if (this.shuttingDown) return;
    if (this.reconnectTimer) return;

    const waitForExpectedRestart = Math.max(0, this.gatewayRestartExpectedUntil - Date.now());
    const boundedRestartWait = Math.min(waitForExpectedRestart, 3000);
    const delay = Math.max(delayMs, boundedRestartWait);
    console.log(`[DramEngine] Scheduling reconnect in ${Math.round(delay)}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.shuttingDown) return;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
      this.initialized = false;
      try {
        await this.initialize();
        console.log('[DramEngine] Reconnected to gateway');
      } catch (err) {
        console.warn('[DramEngine] Reconnect attempt failed:', err.message);
        this._scheduleReconnect(2000);
      }
    }, delay);
  }

  async findCli() {
    console.log('[DramEngine] findCli() starting...');

    if (this.cliPath) {
      try {
        if (fs.existsSync(this.cliPath)) return true;
      } catch {
        // stale path, continue probe
      }
      this.cliPath = null;
      this.useNodeSpawn = false;
    }

    // Throttle repeated probes to avoid shell churn and window flashes.
    const now = Date.now();
    if (this.lastCliProbeOk === false && (now - this.lastCliProbeAt) < 10000) {
      return false;
    }

    const bundledEntry = resolveBundledOpenClawEntry();
    if (bundledEntry) {
      this.cliPath = bundledEntry;
      this.useNodeSpawn = true;
      this.lastCliProbeAt = now;
      this.lastCliProbeOk = true;
      console.log('[DramEngine] Using bundled OpenClaw entry:', bundledEntry);
      return true;
    }

    const candidatePaths = new Set();
    const packageDirs = new Set();
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const npmPrefix = process.env.npm_config_prefix || path.join(appData, 'npm');
      candidatePaths.add(path.join(npmPrefix, 'openclaw.cmd'));
      candidatePaths.add(path.join(npmPrefix, 'node_modules', '.bin', 'openclaw.cmd'));
      packageDirs.add(path.join(npmPrefix, 'node_modules', 'openclaw'));
      packageDirs.add(path.join(appData, 'npm', 'node_modules', 'openclaw'));
      for (const hit of listExecutablesInPath(['openclaw.cmd', 'openclaw'])) {
        candidatePaths.add(hit);
      }
    } else {
      candidatePaths.add('/usr/local/bin/openclaw');
      candidatePaths.add('/usr/bin/openclaw');
      packageDirs.add('/usr/local/lib/node_modules/openclaw');
      packageDirs.add('/usr/lib/node_modules/openclaw');
      for (const hit of listExecutablesInPath(['openclaw'])) {
        candidatePaths.add(hit);
      }
    }

    for (const packageDir of packageDirs) {
      const resolvedEntry = resolveOpenClawEntryFromPackageDir(packageDir);
      if (resolvedEntry) {
        this.cliPath = resolvedEntry;
        this.useNodeSpawn = true;
        this.lastCliProbeAt = now;
        this.lastCliProbeOk = true;
        console.log('[DramEngine] Found global OpenClaw entry:', resolvedEntry);
        return true;
      }
    }

    for (const candidate of candidatePaths) {
      if (!candidate) continue;
      const normalized = path.normalize(candidate);
      const lower = normalized.toLowerCase();
      if (lower.includes('dram-desktop') || lower.includes('resources') || lower.includes('dist')) {
        continue;
      }
      try {
        if (!fs.existsSync(normalized)) continue;
      } catch {
        continue;
      }

      const resolvedMjs = resolveOpenClawMjsFromShim(normalized);
      if (resolvedMjs) {
        this.cliPath = resolvedMjs;
        this.useNodeSpawn = true;
        this.lastCliProbeAt = now;
        this.lastCliProbeOk = true;
        console.log('[DramEngine] Found OpenClaw mjs via shim:', resolvedMjs);
        return true;
      }

      this.cliPath = normalized;
      this.useNodeSpawn = lower.endsWith('.mjs') || lower.endsWith('.js');
      this.lastCliProbeAt = now;
      this.lastCliProbeOk = true;
      console.log('[DramEngine] Found OpenClaw in PATH:', normalized);
      return true;
    }

    this.lastCliProbeAt = now;
    this.lastCliProbeOk = false;
    return false;
  }

  /**
   * Ensure OpenClaw config directory exists
   */
  async ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  async _getListeningPidsOnGatewayPort() {
    if (process.platform !== 'win32') return [];
    try {
      const { stdout } = await execAsync(`netstat -ano | findstr :${this.gatewayPort}`, withWindowsHide());
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      const pids = new Set();
      for (const line of lines) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      return [...pids];
    } catch {
      return [];
    }
  }

  _ensureGatewayDefaults(config = {}) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      config = {};
    }

    if (!config.gateway || typeof config.gateway !== 'object' || Array.isArray(config.gateway)) {
      config.gateway = {};
    }

    if (!config.gateway.mode || typeof config.gateway.mode !== 'string') {
      config.gateway.mode = 'local';
    }

    if (!config.gateway.auth || typeof config.gateway.auth !== 'object' || Array.isArray(config.gateway.auth)) {
      config.gateway.auth = {};
    }
    if (!config.gateway.auth.mode || typeof config.gateway.auth.mode !== 'string') {
      config.gateway.auth.mode = 'token';
    }

    const existingToken = typeof config.gateway.auth.token === 'string'
      ? config.gateway.auth.token.trim()
      : '';
    if (existingToken) {
      this.embeddedGatewayToken = existingToken;
      config.gateway.auth.token = existingToken;
    } else if (this.embeddedGatewayToken) {
      config.gateway.auth.token = this.embeddedGatewayToken;
    }

    if (!config.gateway.controlUi || typeof config.gateway.controlUi !== 'object' || Array.isArray(config.gateway.controlUi)) {
      config.gateway.controlUi = {};
    }
    if (!Array.isArray(config.gateway.controlUi.allowedOrigins) || config.gateway.controlUi.allowedOrigins.length === 0) {
      config.gateway.controlUi.allowedOrigins = ['*'];
    }

    // OpenClaw schema does not support agents.defaults.thinkLevel.
    // Keep this setting renderer-local and strip stale values to avoid boot failures.
    if (config.agents?.defaults && Object.prototype.hasOwnProperty.call(config.agents.defaults, 'thinkLevel')) {
      delete config.agents.defaults.thinkLevel;
    }

    return config;
  }

  _identityPath() {
    return path.join(this.configDir, 'identity', 'device.json');
  }

  _syncGatewayTokenFromConfig() {
    try {
      if (!fs.existsSync(this.configPath)) return;
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const token = typeof parsed?.gateway?.auth?.token === 'string'
        ? parsed.gateway.auth.token.trim()
        : '';
      if (!token) return;
      if (token !== this.embeddedGatewayToken) {
        this.embeddedGatewayToken = token;
        console.log(`[DramEngine] Synced gateway token from config (masked): ${token.substring(0, 4)}****`);
      }
    } catch (err) {
      console.warn('[DramEngine] Failed to sync gateway token from config:', err.message);
    }
  }

  _ensureParentDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  }

  _base64UrlEncode(buffer) {
    return buffer
      .toString('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/g, '');
  }

  _derivePublicKeyRaw(publicKeyPem) {
    const spki = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
    if (
      spki.length === ED25519_SPKI_PREFIX.length + 32 &&
      spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
    ) {
      return spki.subarray(ED25519_SPKI_PREFIX.length);
    }
    return spki;
  }

  _fingerprintPublicKey(publicKeyPem) {
    const raw = this._derivePublicKeyRaw(publicKeyPem);
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  _generateDeviceIdentity() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    return {
      deviceId: this._fingerprintPublicKey(publicKeyPem),
      publicKeyPem,
      privateKeyPem
    };
  }

  _loadOrCreateDeviceIdentity() {
    if (this.deviceIdentity) return this.deviceIdentity;

    const filePath = this._identityPath();
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (
          parsed?.version === 1 &&
          typeof parsed.deviceId === 'string' &&
          typeof parsed.publicKeyPem === 'string' &&
          typeof parsed.privateKeyPem === 'string'
        ) {
          const derivedId = this._fingerprintPublicKey(parsed.publicKeyPem);
          this.deviceIdentity = {
            deviceId: derivedId,
            publicKeyPem: parsed.publicKeyPem,
            privateKeyPem: parsed.privateKeyPem
          };
          return this.deviceIdentity;
        }
      }
    } catch (err) {
      console.warn('[DramEngine] Failed to read existing device identity:', err.message);
    }

    const identity = this._generateDeviceIdentity();
    this.deviceIdentity = identity;
    try {
      this._ensureParentDir(filePath);
      const stored = {
        version: 1,
        deviceId: identity.deviceId,
        publicKeyPem: identity.publicKeyPem,
        privateKeyPem: identity.privateKeyPem,
        createdAtMs: Date.now()
      };
      fs.writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
      try { fs.chmodSync(filePath, 0o600); } catch { /* noop */ }
    } catch (err) {
      console.warn('[DramEngine] Failed to persist device identity, using in-memory identity:', err.message);
    }
    return identity;
  }

  _resetDeviceIdentity() {
    this.deviceIdentity = null;
    const filePath = this._identityPath();
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn('[DramEngine] Failed to reset device identity file:', err.message);
    }
  }

  _isDeviceTokenMismatch(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('device token mismatch');
  }

  _buildDeviceAuthPayload({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
    const version = nonce ? 'v2' : 'v1';
    const base = [
      version,
      deviceId,
      clientId,
      clientMode,
      role,
      scopes.join(','),
      String(signedAtMs),
      token || ''
    ];
    if (version === 'v2') base.push(nonce);
    return base.join('|');
  }

  _buildDeviceAuthClaim({ clientId, clientMode, role, scopes, token, nonce }) {
    const identity = this._loadOrCreateDeviceIdentity();
    const signedAtMs = Date.now();
    const payload = this._buildDeviceAuthPayload({
      deviceId: identity.deviceId,
      clientId,
      clientMode,
      role,
      scopes,
      signedAtMs,
      token,
      nonce
    });
    const signature = this._base64UrlEncode(
      crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(identity.privateKeyPem))
    );
    const claim = {
      id: identity.deviceId,
      publicKey: this._base64UrlEncode(this._derivePublicKeyRaw(identity.publicKeyPem)),
      signature,
      signedAt: signedAtMs
    };
    if (nonce) claim.nonce = nonce;
    return claim;
  }

  /**
   * Initialize the engine by spawning OpenClaw process and connecting via WS.
   */
  async initialize() {
    if (this.initialized) return;
    if (this.initializingPromise) return this.initializingPromise;
    this.shuttingDown = false;

    this.initializingPromise = (async () => {
      this.debugLog('DramEngine: Starting OpenClaw integration...');

      try {
        // 1. Find OpenClaw CLI
        const hasCli = await this.findCli();
        if (!hasCli) {
          throw new Error('OpenClaw CLI not found. Please install: npm install -g openclaw');
        }
        this.debugLog('DramEngine: Found OpenClaw at:', this.cliPath);

        // 2. Ensure config directory exists
        await this.ensureConfigDir();

        // 3. Spawn OpenClaw gateway
        await this._spawnGateway();

        // 4. Connect via WebSocket
        await this._connectGateway();

        this.initialized = true;
        this.debugLog('DramEngine: Ready (OpenClaw Symbiotic Mode)');
      } catch (err) {
        console.error('[DramEngine] Initialization failed:', err.message);
        this.debugLog('DramEngine: Initialization failed:', err.message);
        throw err;
      } finally {
        this.initializingPromise = null;
      }
    })();

    return this.initializingPromise;
  }

  /**
   * Spawn OpenClaw gateway process (hidden background process)
   */
  async _spawnGateway() {
    if (this.engineProcess) return;

    const restartWaitMs = this.gatewayRestartExpectedUntil - Date.now();
    if (restartWaitMs > 0) {
      const boundedWait = Math.min(restartWaitMs, 3000);
      console.log(`[DramEngine] Gateway restart expected; waiting ${boundedWait}ms before spawn check`);
      await new Promise(r => setTimeout(r, boundedWait));
    }

    const listeningPids = await this._getListeningPidsOnGatewayPort();
    if (listeningPids.length > 0) {
      this._syncGatewayTokenFromConfig();
      this.managedGateway = false;
      console.log(`[DramEngine] Gateway already listening on port ${this.gatewayPort} (PID ${listeningPids.join(', ')}) - adopting existing process`);
      return;
    }

    console.log('[DramEngine] Spawning OpenClaw gateway in background...');

    // Ensure we have a config file with security settings but NOT our ephemeral token
    await this._prepareConfig();

    // Platform-specific spawn options to hide terminal window
    const spawnOptions = {
      env: buildNodeRuntimeEnv({
        ...process.env,
        OPENCLAW_CONFIG_PATH: this.configPath,
        // Prevent full process respawns on SIGUSR1 config reloads (Windows respawns can flash console windows).
        OPENCLAW_NO_RESPAWN: '1'
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      shell: false
    };

    // Hide console window on Windows
    if (process.platform === 'win32') {
      spawnOptions.windowsHide = true;
    }

    // Keep options scoped to "gateway run" for Commander compatibility.
    const spawnArgs = [
      'gateway', 'run',
      '--port', String(this.gatewayPort),
      '--token', this.embeddedGatewayToken
    ];

    // On Windows, prefer launching the JS entry with node to avoid terminal shim flashes.
    if (process.platform === 'win32' && !this.useNodeSpawn && this.cliPath) {
      const resolvedMjs = resolveOpenClawMjsFromShim(this.cliPath);
      if (resolvedMjs) {
        this.cliPath = resolvedMjs;
        this.useNodeSpawn = true;
      }
    }

    if (this.useNodeSpawn) {
      this.engineProcess = spawn(NODE_RUNTIME, [this.cliPath, ...spawnArgs], spawnOptions);
    } else if (process.platform === 'win32') {
      const command = [quoteForCmd(this.cliPath), ...spawnArgs.map(quoteForCmd)].join(' ').trim();
      this.engineProcess = spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', command],
        {
          ...spawnOptions,
          windowsVerbatimArguments: true
        }
      );
    } else {
      this.engineProcess = spawn(this.cliPath, spawnArgs, spawnOptions);
    }
    this.managedGateway = true;

    this.engineProcess.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[OpenClaw] ${line}`);
        this.debugLog(`[OpenClaw] ${line}`);
      }
    });

    this.engineProcess.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        console.error(`[OpenClaw] ${line}`);
        this.debugLog(`[OpenClaw:err] ${line}`);

        // Intercept agent-level errors and forward as synthetic chat error events.
        // The gateway logs these to stderr but doesn't always send WS events.
        // Only match the definitive "Embedded agent failed" line to avoid duplicates
        // from the multiple diagnostic lines the gateway emits for the same failure.
        const agentErrorMatch = line.match(/Embedded agent failed before reply:\s*(.+)/);
        if (agentErrorMatch && this.windowManager) {
          this.windowManager.sendToRenderer('socket:data', {
            type: 'event',
            event: 'chat',
            payload: {
              state: 'error',
              errorMessage: agentErrorMatch[1].trim()
            }
          });
        }
      }
    });

    this.engineProcess.on('exit', (code) => {
      console.log(`[DramEngine] OpenClaw process exited with code ${code}`);
      this.debugLog(`[DramEngine] OpenClaw process exited with code ${code}`);
      this.engineProcess = null;
      this.managedGateway = false;
      this.initialized = false;
      if (this.ws) this.ws.close();
    });

    // Wait for the server to be ready by watching logs
    return new Promise((resolve, reject) => {
      let resolved = false;
      const cleanup = () => {
        clearTimeout(timeout);
        if (this.engineProcess) {
          this.engineProcess.stdout.off('data', logHandler);
          this.engineProcess.stderr.off('data', logHandler);
          this.engineProcess.off('exit', exitHandler);
        }
      };

      const exitHandler = (code) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`OpenClaw gateway exited before ready (code ${code})`));
        }
      };

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          console.warn('[DramEngine] Gateway ready log not found, proceeding with timeout');
          resolve();
        }
      }, 10000); // 10s wait total

      const logHandler = (data) => {
        const line = data.toString();
        if (line.includes('[gateway] listening on ws://')) {
          if (!resolved) {
            resolved = true;
            cleanup();
            console.log('[DramEngine] Gateway is ready to accept connections');
            // Give it 500ms more just to be safe for the socket to fully bind
            setTimeout(resolve, 500);
          }
        }
      };

      this.engineProcess.stdout.on('data', logHandler);
      this.engineProcess.stderr.on('data', logHandler);
      this.engineProcess.on('exit', exitHandler);
    });
  }

  /**
   * Prepare OpenClaw config with security settings.
   * The gateway validates incoming tokens against gateway.auth.token from
   * the config file. We must keep our embeddedGatewayToken in sync:
   *   - If the config already has a token â†’ adopt it (source of truth)
   *   - If not â†’ write DRAM's generated token so both sides agree
   */
  async _prepareConfig() {
    let config = {};

    // Load existing config if present
    if (fs.existsSync(this.configPath)) {
      try {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        config = JSON.parse(content);
      } catch (err) {
        console.warn('[DramEngine] Failed to load existing config:', err.message);
      }
    }

    const existingToken = typeof config?.gateway?.auth?.token === 'string'
      ? config.gateway.auth.token.trim()
      : '';
    config = this._ensureGatewayDefaults(config);
    if (existingToken) {
      console.log(`[DramEngine] Adopted existing gateway token from config (masked): ${existingToken.substring(0, 4)}****`);
    } else {
      console.log(`[DramEngine] Wrote generated gateway token to config (masked): ${this.embeddedGatewayToken.substring(0, 4)}****`);
    }

    // Write a separate tokens.json for older engine versions that use it for scope mapping
    await this._ensureGatewayToken();

    // Write the structural updates back only when necessary.
    const nextRaw = JSON.stringify(config, null, 2);
    const prevRaw = fs.existsSync(this.configPath) ? fs.readFileSync(this.configPath, 'utf-8') : '';
    if (prevRaw !== nextRaw) {
      fs.writeFileSync(this.configPath, nextRaw, 'utf-8');
      console.log('[DramEngine] Config prepared with gateway token');
    } else {
      console.log('[DramEngine] Config already up to date');
    }
  }

  /**
   * Ensures a tokens.json file exists with the embedded gateway token and broad scopes.
   * This is for older engine versions that use it for scope mapping.
   */
  async _ensureGatewayToken() {
    try {
      await this.ensureConfigDir();
      const tokensPath = path.join(this.configDir, 'tokens.json');
      console.log('[DramEngine] Ensuring tokens.json exists at:', tokensPath);

      // We use a broadened scope list to ensure administration capabilities
      const extendedScopes = [
        '*', // Superuser
        'operator',
        'operator.*',
        'operator::*',
        'operator.read',
        'operator.write',
        'operator.admin',
        'admin'
      ];

      const tokens = {
        [this.embeddedGatewayToken]: {
          scopes: extendedScopes,
          name: 'DRAM Desktop Internal'
        }
      };

      fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
      console.log('[DramEngine] tokens.json created for extra authorization');
    } catch (err) {
      console.error('[DramEngine] Failed to write tokens.json:', err.message);
    }
  }

  /**
   * Handle internal management requests (plugins, skills, etc)
   */
  async _handleMgmtRequest(req, respond) {
    try {
      const isUsageMethod = req.method === 'usage.status' || req.method === 'usage.cost';

      // Usage requests are best-effort telemetry. Avoid spawning CLI during reconnect churn.
      if (isUsageMethod && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        respond(true, this._normalizeUsageFallback(req, null));
        return;
      }

      // 1. Try via WebSocket first if connected
      if (this.ws && this.ws.readyState === 1) {
        if (!isUsageMethod) {
          this.debugLog(`[DramEngine] Routing mgmt request via WS: ${req.method}`);
        }
        const id = req.id || `mgmt-${Date.now()}`;
        this.pendingRequests.set(id, {
          respond: (ok, data, error) => {
            if (ok) respond(true, data);
            else {
              if (isUsageMethod) {
                respond(true, this._normalizeUsageFallback(req, null));
                return;
              }
              this.debugLog(`[DramEngine] WS mgmt failed for ${req.method}, checking CLI fallback...`);
              this._executeMgmtCLI(req).then(res => respond(true, res)).catch(e => respond(false, null, e));
            }
          },
          timestamp: Date.now()
        });

        this._sendRaw({
          type: 'req',
          id: id,
          method: req.method,
          params: req.params || {}
        });
        return;
      }

      // 2. Fallback to CLI
      const result = await this._executeMgmtCLI(req);
      respond(true, result);
    } catch (err) {
      this.debugLog(`[DramEngine] Mgmt request failed: ${err.message}`);
      respond(false, null, err);
    }
  }

  /**
   * Execute management requests via CLI fallback if WebSocket fails or is unauthorized
   */
  async _executeMgmtCLI(req) {
    if (!this.cliPath || !fs.existsSync(this.cliPath)) {
      const hasCli = await this.findCli();
      if (!hasCli || !this.cliPath) throw new Error('CLI not available for fallback');
    }

    if (process.platform === 'win32' && !this.useNodeSpawn) {
      const resolvedMjs = resolveOpenClawMjsFromShim(this.cliPath);
      if (resolvedMjs) {
        this.cliPath = resolvedMjs;
        this.useNodeSpawn = true;
      }
    }

    const isUsageMethod = req.method === 'usage.status' || req.method === 'usage.cost';
    const cliArgs = [];

    if (isUsageMethod) {
      // OpenClaw >=2026 moved usage snapshots under `status --usage`.
      cliArgs.push('status', '--usage', '--json');
    } else {
      // Subcommands: skills.status => skills status
      const subcommand = req.method.split('.').join(' ');
      // Note: --json is not supported by all subcommands (e.g. skills status)
      const needsJson = req.method.includes('plugins') || req.method.includes('models') || req.method.includes('cron');
      cliArgs.push(...subcommand.split(' '));
      if (needsJson) cliArgs.push('--json');
    }
    cliArgs.push('--no-color');

    const fullCmd = this.useNodeSpawn
      ? `"${NODE_RUNTIME}" "${this.cliPath}" ${cliArgs.join(' ')}`
      : `"${this.cliPath}" ${cliArgs.join(' ')}`;
    if (!isUsageMethod) {
      this.debugLog(`[DramEngine] Executing CLI fallback: ${fullCmd}`);
    }

    let result;
    try {
      if (this.useNodeSpawn) {
        result = await execFileAsync(
          NODE_RUNTIME,
          [this.cliPath, ...cliArgs],
          withWindowsHide({
            timeout: 20000,
            shell: false,
            env: buildNodeRuntimeEnv({ ...process.env })
          })
        );
      } else if (process.platform === 'win32') {
        const command = [quoteForCmd(this.cliPath), ...cliArgs.map(quoteForCmd)].join(' ').trim();
        result = await execFileAsync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], withWindowsHide({
          timeout: 20000,
          shell: false,
          windowsVerbatimArguments: true
        }));
      } else {
        result = await execFileAsync(this.cliPath, cliArgs, { timeout: 20000, shell: false });
      }
    } catch (err) {
      if (isUsageMethod) {
        this.debugLog(`[DramEngine] Usage fallback unavailable, returning defaults: ${err.message}`);
        return this._normalizeUsageFallback(req, null);
      }
      throw err;
    }

    if (result.stdout) {
      try {
        const parsed = JSON.parse(result.stdout);
        return isUsageMethod ? this._normalizeUsageFallback(req, parsed) : parsed;
      } catch (e) {
        if (isUsageMethod) {
          this.debugLog(`[DramEngine] Usage fallback JSON parse failed, returning defaults: ${e.message}`);
          return this._normalizeUsageFallback(req, null);
        }
        return result.stdout;
      }
    }
    return isUsageMethod ? this._normalizeUsageFallback(req, null) : null;
  }

  _normalizeUsageFallback(req, payload) {
    const days = Number(req?.params?.days) || 30;
    if (req.method === 'usage.status') {
      const providers = payload?.usage?.providers;
      return {
        updatedAt: payload?.usage?.updatedAt || Date.now(),
        providers: Array.isArray(providers) ? providers : []
      };
    }
    return {
      days,
      updatedAt: Date.now(),
      totals: {
        totalCost: 0,
        input: 0,
        output: 0,
        requests: 0
      },
      daily: [],
      providers: []
    };
  }
  /**
   * Connect to OpenClaw gateway WebSocket
   */
  async _connectGateway(retries = 5, options = {}) {
    const { allowDeviceReset = true } = options;
    this._syncGatewayTokenFromConfig();

    return new Promise((resolve, reject) => {
      // Connect without token in URL - auth happens via message
      const url = `ws://127.0.0.1:${this.gatewayPort}`;
      console.log(`[DramEngine] Connecting to gateway: ${url}`);

      const ws = new WebSocket(url, {
        handshakeTimeout: 5000,
        origin: 'http://localhost'
      });

      const timeout = setTimeout(() => {
        ws.terminate();
        if (retries > 0) {
          console.log(`[DramEngine] Connection timeout, retrying... (${retries} left)`);
          resolve(this._connectGateway(retries - 1, options));
        } else {
          reject(new Error('Gateway connection timed out'));
        }
      }, 5000);

      let authResolved = false;

      ws.on('open', () => {
        clearTimeout(timeout);
        this._clearReconnectTimer();
        console.log('[DramEngine] Connected to Gateway WebSocket');
        this.ws = ws;

        // Auth via message after connection
        const authId = `auth-${Date.now()}`;
        this.pendingRequests.set(authId, {
          respond: (ok, data, error) => {
            if (!authResolved) {
              authResolved = true;
              if (ok) {
                this.configOnlyMode = false;
                this.gatewayRestartExpectedUntil = 0;
                const grantedScopes = Array.isArray(data?.auth?.scopes) ? data.auth.scopes.join(', ') : 'n/a';
                console.log(`[DramEngine] Auth granted scopes: ${grantedScopes}`);
                console.log('[DramEngine] Auth successful');
                this._emitSocketStatus('connected');
                resolve();
              } else {
                console.error('[DramEngine] Auth failed:', error);
                this._emitSocketStatus('error');
                if (allowDeviceReset && retries > 0 && this._isDeviceTokenMismatch(error)) {
                  console.warn('[DramEngine] Device token mismatch detected, rotating local device identity and retrying auth...');
                  this._resetDeviceIdentity();
                  ws.close();
                  resolve(this._connectGateway(retries - 1, { allowDeviceReset: false }));
                  return;
                }
                ws.close();
                reject(new Error(`Auth failed: ${error?.message || 'unknown'}`));
              }
            }
          },
          timestamp: Date.now()
        });

        // OpenClaw handshake: send 'connect'
        this._sendRaw({
          type: 'req',
          id: authId,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'cli',
              version: '1.0.0',
              platform: process.platform,
              mode: 'cli'
            },
            role: 'operator',
            scopes: this.allScopes,
            caps: [],
            auth: { token: this.embeddedGatewayToken },
            device: this._buildDeviceAuthClaim({
              clientId: 'cli',
              clientMode: 'cli',
              role: 'operator',
              scopes: this.allScopes,
              token: this.embeddedGatewayToken
            }),
            locale: 'en-US',
            userAgent: 'dram-desktop/1.0.0'
          }
        });
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleWSMessage(msg);
        } catch (err) {
          console.error('[DramEngine] Failed to parse WS message:', err.message);
        }
      });

      ws.on('error', (err) => {
        console.error('[DramEngine] WS Error:', err.message);
      });

      ws.on('close', (code, reason) => {
        const reasonText = Buffer.isBuffer(reason) ? reason.toString() : String(reason || '');
        console.log(`[DramEngine] WS Connection closed: ${code} ${reasonText}`);
        this.ws = null;

        // If auth hasn't resolved yet, we have a problem
        // But for now, let's resolve anyway to allow the app to work in "offline" mode
        // The symbiotic features (config sync) still work without WebSocket
        if (!authResolved) {
          authResolved = true;
          console.warn('[DramEngine] WebSocket auth failed, continuing in config-only mode');
          // Mark as partially initialized - config works but real-time messaging doesn't
          this.configOnlyMode = true;
          resolve();
          return;
        }

        // Established connection dropped (typically restart): reinitialize transport.
        if (!this.shuttingDown) {
          this._emitSocketStatus('disconnected');
          this.initialized = false;
          this.configOnlyMode = true;
          this._scheduleReconnect(1200);
        }
      });
    });
  }

  _handleWSMessage(msg) {
    if (this.verboseWsFrames) {
      console.log('[DramEngine] WS frame:', msg.type, msg.event || '', msg.id || '',
        msg.type === 'event' ? JSON.stringify(msg.payload || {}).substring(0, 200) : '');
    } else if (msg.type === 'event') {
      const eventName = String(msg.event || '');
      const noisyEvents = new Set(['tick', 'health', 'chat', 'agent']);
      if (eventName && !noisyEvents.has(eventName)) {
        console.log('[DramEngine] WS event:', eventName);
      }
    }

    // OpenClaw uses 'res' for responses, 'event' for events
    if (msg.type === 'res') {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        pending.respond(msg.ok, msg.payload, msg.error, msg.meta);
      }
    } else if (msg.type === 'event') {
      // Handle shutdown/restart signals
      if (msg.event === 'shutdown') {
        if (msg.payload?.restartExpectedMs) {
          const restartExpectedMs = Number(msg.payload.restartExpectedMs) || 1500;
          this.gatewayRestartExpectedUntil = Date.now() + restartExpectedMs + 2500;
          console.log(`[DramEngine] Gateway restart signal received (expected in ${restartExpectedMs}ms)`);
          this._emitSocketStatus('disconnected');
          this.initialized = false;
          this.configOnlyMode = true;
          this._scheduleReconnect(restartExpectedMs + 250);
          // Graceful disconnect so close handler runs and keeps reconnect flow unified.
          if (this.ws) {
            this.ws.close();
          }
        }
      }

      // Forward gateway events to renderer
      // OpenClaw event frames use 'payload' (per EventFrameSchema), not 'data'
      this.windowManager.sendToRenderer('socket:data', {
        type: 'event',
        event: msg.event,
        payload: msg.payload
      });
    } else {
      console.log('[DramEngine] Unknown WS frame type:', msg.type, JSON.stringify(msg).substring(0, 300));
    }
  }

  _sendRaw(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[DramEngine] Cannot send, WS not open');
      return false;
    }
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /**
   * Handle an RPC request from the renderer via the IPC bridge.
   */
  async handleRequest(req, respond, timeoutMs = 30000) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Intercept management methods for local or CLI handling (bypass WebSocket scope issues)
    const mgmtMethods = ['plugins.list', 'models.list', 'skills.status', 'channels.status', 'usage.status', 'usage.cost', 'system.version', 'config.get', 'config.patch'];
    const isUsageMethod = req.method === 'usage.status' || req.method === 'usage.cost';

    if (mgmtMethods.includes(req.method)) {
      if (!isUsageMethod) {
        this.debugLog(`[DramEngine] Intercepting management request: "${req.method}"`);
      }

      if (req.method === 'config.get') {
        const cfg = this.loadConfig();
        respond(true, { raw: JSON.stringify(cfg), hash: 'local' });
        return;
      }

      if (req.method === 'config.patch') {
        try {
          const patch = JSON.parse(req.params?.raw || '{}');
          const cfg = this.loadConfig();
          const deepMerge = (t, s) => {
            for (const k in s) {
              if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
                if (!t[k] || typeof t[k] !== 'object') t[k] = {};
                deepMerge(t[k], s[k]);
              } else t[k] = s[k];
            }
          };
          deepMerge(cfg, patch);
          this._ensureGatewayDefaults(cfg);
          await this.writeConfigFile(cfg);
          respond(true, { ok: true });
        } catch (e) {
          respond(false, null, e);
        }
        return;
      }

      return this._handleMgmtRequest(req, respond);
    }

    // Intercept voice methods for local handling
    if (req.method === 'voice.transcribe') {
      try {
        const { audio } = req.params;
        const buffer = Buffer.from(audio, 'base64');
        const config = this.loadConfig();
        const configuredStt = config?.agents?.defaults?.voice?.stt;
        const sttConfig = {
          ...(configuredStt && typeof configuredStt === 'object' ? configuredStt : {})
        };
        const requestedProvider = typeof req.params?.provider === 'string'
          ? req.params.provider.trim().toLowerCase()
          : '';
        const requestedModel = typeof req.params?.model === 'string'
          ? req.params.model.trim()
          : '';
        const requestedMimeType = typeof req.params?.mimeType === 'string'
          ? req.params.mimeType.trim().toLowerCase()
          : '';
        if (requestedProvider) sttConfig.provider = requestedProvider;
        if (requestedModel) sttConfig.model = requestedModel;
        if (requestedMimeType) sttConfig.inputMimeType = requestedMimeType;
        const envVars = config?.env?.vars;
        const text = await this.transcribeAudio(buffer, sttConfig, envVars);
        respond(true, { transcript: text });
      } catch (err) {
        respond(false, null, { message: err.message });
      }
      return;
    }

    // In config-only mode, reject requests that strictly require WebSocket (like chat)
    if (this.configOnlyMode) {
      respond(false, null, { message: 'Neural Link: Secure WebSocket disconnected. Mode: Config Only.' });
      return;
    }

    const id = req.id || crypto.randomUUID();
    this.pendingRequests.set(id, { respond, timestamp: Date.now() });

    const msg = {
      type: 'req',
      id,
      method: req.method,
      params: req.params
    };

    if (!this._sendRaw(msg)) {
      this.pendingRequests.delete(id);
      respond(false, null, { message: 'Engine disconnected' });
    }

    setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id);
        respond(false, null, { message: 'Request timed out' });
      }
    }, timeoutMs);
  }

  /**
   * Universal transcription helper
   */
  async transcribeAudio(audioBuffer, sttConfig, envVars) {
    const provider = sttConfig?.provider || 'local';
    const inputMimeType = typeof sttConfig?.inputMimeType === 'string' && sttConfig.inputMimeType.trim()
      ? sttConfig.inputMimeType.trim().toLowerCase()
      : 'audio/wav';
    const inputExt = inputMimeType.includes('webm')
      ? 'webm'
      : inputMimeType.includes('ogg')
        ? 'ogg'
        : inputMimeType.includes('mp4') || inputMimeType.includes('m4a')
          ? 'm4a'
          : 'wav';

    if (provider === 'local') {
      return this.transcribeAudioLocal(audioBuffer, sttConfig, inputExt);
    }

    if (provider === 'groq' || provider === 'openai') {
      const apiKey = provider === 'groq'
        ? (envVars?.GROQ_API_KEY || process.env.GROQ_API_KEY || '')
        : (envVars?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '');
      if (!apiKey) throw new Error(`Missing API Key for ${provider}`);

      const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/audio/transcriptions' :
        'https://api.openai.com/v1/audio/transcriptions';
      const requestedModel = typeof sttConfig?.model === 'string' ? sttConfig.model.trim() : '';
      const model = provider === 'openai'
        ? (new Set(['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe']).has(requestedModel)
          ? requestedModel
          : 'whisper-1')
        : (requestedModel || 'whisper-large-v3');

      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: inputMimeType });
      formData.append('file', blob, `audio.${inputExt}`);
      formData.append('model', model);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message || `STT API Error (${res.status})`);
      }
      if (data?.error) throw new Error(data.error.message || 'API Error');
      return data.text || '';
    }
    return '';
  }

  async transcribeAudioLocal(audioBuffer, sttConfig, inputExt = 'wav') {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dram-whisper-'));
    const safeExt = String(inputExt || 'wav').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'wav';
    const inputPath = path.join(tmpDir, `input.${safeExt}`);
    const outputPath = path.join(tmpDir, 'input.txt');
    const model = typeof sttConfig?.model === 'string' && sttConfig.model.trim()
      ? sttConfig.model.trim()
      : 'base';

    fs.writeFileSync(inputPath, audioBuffer);

    const args = [
      inputPath,
      '--model', model,
      '--task', 'transcribe',
      '--output_format', 'txt',
      '--output_dir', tmpDir
    ];

    try {
      try {
        await execFileAsync('whisper', args, withWindowsHide());
      } catch (err) {
        const message = String(err?.message || '').toLowerCase();
        const missingBinary = message.includes('not recognized')
          || message.includes('enoent')
          || message.includes('not found');
        if (!missingBinary) throw err;
        await execFileAsync('python', ['-m', 'whisper', ...args], withWindowsHide());
      }

      if (!fs.existsSync(outputPath)) {
        throw new Error('Local transcription output not found');
      }

      return String(fs.readFileSync(outputPath, 'utf-8') || '').trim();
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // noop
      }
    }
  }

  /**
   * Config IO implementation
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) return {};
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('[DramEngine] Failed to load config:', err.message);
      return {};
    }
  }

  async writeConfigFile(data) {
    try {
      const normalized = this._ensureGatewayDefaults(data);
      const nextRaw = JSON.stringify(normalized, null, 2);
      let currentRaw = '';
      try {
        currentRaw = fs.existsSync(this.configPath) ? fs.readFileSync(this.configPath, 'utf-8') : '';
      } catch {
        currentRaw = '';
      }
      if (currentRaw === nextRaw) {
        console.log('[DramEngine] Config unchanged, skipping write');
        return;
      }
      fs.writeFileSync(this.configPath, nextRaw, 'utf-8');
      console.log('[DramEngine] Config written to:', this.configPath);
    } catch (err) {
      console.error('[DramEngine] Failed to write config:', err.message);
    }
  }

  async restartGatewayForRuntimeSecrets() {
    if (this.shuttingDown) return false;

    const hasLiveTransport = Boolean(
      this.engineProcess ||
      this.initialized ||
      (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))
    );
    if (!hasLiveTransport) return false;

    console.log('[DramEngine] Runtime secrets changed; recycling gateway process to apply updated credentials');
    this._clearReconnectTimer();

    if (this.ws) {
      try { this.ws.close(); } catch { /* noop */ }
      this.ws = null;
    }

    if (this.engineProcess) {
      try { this.engineProcess.kill(); } catch { /* noop */ }
      this.engineProcess = null;
    }

    if (this.managedGateway) {
      const killedPids = killGatewayProcessesOnPort(this.gatewayPort);
      if (killedPids.length > 0) {
        console.log(`[DramEngine] Recycled gateway PIDs: ${killedPids.join(', ')}`);
      }
      this.managedGateway = false;
    } else {
      console.log('[DramEngine] Runtime secrets changed while using externally managed gateway; skipping process recycle');
    }

    this.initialized = false;
    this.configOnlyMode = true;
    this._emitSocketStatus('disconnected');
    this._scheduleReconnect(250);
    return true;
  }

  async stop() {
    this.debugLog('DramEngine: Stopping...');
    this.shuttingDown = true;
    this._clearReconnectTimer();
    this._emitSocketStatus('disconnected');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.engineProcess) {
      this.engineProcess.kill();
      this.engineProcess = null;
    }
    if (this.managedGateway) {
      const killedPids = killGatewayProcessesOnPort(this.gatewayPort);
      if (killedPids.length > 0) {
        console.log(`[DramEngine] Stopped gateway PIDs: ${killedPids.join(', ')}`);
      }
    } else {
      console.log('[DramEngine] Leaving externally managed gateway running on shutdown');
    }
    this.managedGateway = false;
    this.initialized = false;
    this.debugLog('DramEngine: Stopped');
  }
}

let instance = null;
export function getDramEngine(windowManager, debugLog) {
  if (!instance) {
    instance = new DramEngine(windowManager, debugLog);
  }
  return instance;
}

export function peekDramEngine() {
  return instance;
}

export function killGatewayProcessesOnPort(port = 18789) {
  const pids = listListeningPidsOnPortSync(port);
  const killed = [];
  for (const pid of pids) {
    if (killPidSync(pid)) killed.push(String(pid));
  }
  return killed;
}

export { OPENCLAW_CONFIG_PATH, OPENCLAW_CONFIG_DIR };


/**
 * Backward compatibility stub for getEngineRuntime
 * The bundled engine runtime is deprecated in favor of external OpenClaw.
 * This stub provides graceful degradation for code that still references it.
 */
export function getEngineRuntime(_windowManager) {
  console.warn('[EngineRuntime] Bundled engine runtime is deprecated. Using external OpenClaw instead.');

  return {
    isReady: false,
    checkInstallation: async () => false,
    import: async (_modulePath) => {
      throw new Error('Bundled engine modules are not available. Using external OpenClaw.');
    },
    require: (_modulePath) => {
      throw new Error('Bundled engine modules are not available. Using external OpenClaw.');
    },
    spawn: (_args, _options) => {
      throw new Error('Bundled engine spawn is not available. Using external OpenClaw.');
    },
    getStatus: () => ({ ready: false, engineDir: null, version: null })
  };
}

