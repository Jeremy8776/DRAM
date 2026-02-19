/**
 * DRAM Desktop - Auto Updater
 * 
 * Handles automatic updates using electron-updater.
 * Updates are downloaded in the background and installed on quit.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const GITHUB_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

function parseGitHubRepo(value: any) {
  const input = typeof value === 'string'
    ? value
    : (value && typeof value === 'object' ? String(value.url || '') : '');
  const normalized = input.trim();
  if (!normalized) return null;

  const gitSsh = normalized.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (gitSsh) {
    return { owner: gitSsh[1], repo: gitSsh[2] };
  }

  const stripped = normalized.replace(/^git\+/, '').replace(/\.git$/, '');
  try {
    const url = new URL(stripped);
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

function parseSemver(versionRaw: any) {
  const input = String(versionRaw || '').trim().replace(/^v/i, '');
  const match = input.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || ''
  };
}

function compareSemver(leftRaw: any, rightRaw: any) {
  const left = parseSemver(leftRaw);
  const right = parseSemver(rightRaw);
  if (!left || !right) return 0;
  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  if (!left.prerelease && right.prerelease) return 1;
  if (left.prerelease && !right.prerelease) return -1;
  if (left.prerelease === right.prerelease) return 0;
  return left.prerelease > right.prerelease ? 1 : -1;
}

export class AutoUpdater {
  [key: string]: any;

  constructor(windowManager, secureStorage) {
    this.windowManager = windowManager;
    this.secureStorage = secureStorage;
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.enabledSettingKey = 'settings.autoUpdateEnabled';
    this.autoUpdateEnabled = true;
    this.lastError = null;
    this.githubLatest = null;
    this.githubPollTimer = null;
    this.githubRepo = this.resolveGitHubRepo();
    this.currentVersion = app.getVersion();
    this.lastElectronCheckAt = null;
    this.lastGitHubCheckAt = null;
    this.lastGithubEtag = null;

    // Configure auto-updater
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set up event handlers
    this.setupEventHandlers();
    void this.refreshEnabledState();
    this.startGitHubReleaseListener();
  }

  /**
   * Set up auto-updater event handlers
   */
  setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
      this.sendStatusToRenderer('checking');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      this.lastError = null;
      this.updateAvailable = true;
      this.sendStatusToRenderer('available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('No updates available');
      this.lastError = null;
      this.sendStatusToRenderer('not-available', info);
    });

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent);
      console.log(`Download progress: ${percent}%`);
      this.sendStatusToRenderer('downloading', { percent });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      this.lastError = null;
      this.updateDownloaded = true;
      this.sendStatusToRenderer('downloaded', info);
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      this.lastError = err?.message || 'Unknown updater error';
      this.sendStatusToRenderer('error', { message: err.message });
    });
  }

  resolveGitHubRepo() {
    try {
      const appPath = app.getAppPath();
      const packagePath = path.join(appPath, 'package.json');
      const content = fs.readFileSync(packagePath, 'utf-8');
      const parsed = JSON.parse(content);
      return parseGitHubRepo(parsed.repository) || parseGitHubRepo(parsed.homepage);
    } catch {
      return null;
    }
  }

  async refreshEnabledState() {
    try {
      const stored = await this.secureStorage?.get?.(this.enabledSettingKey);
      this.autoUpdateEnabled = stored !== false;
    } catch {
      this.autoUpdateEnabled = true;
    }
    return this.autoUpdateEnabled;
  }

  async isEnabled() {
    return this.refreshEnabledState();
  }

  async setEnabled(enabled) {
    const next = enabled !== false;
    try {
      await this.secureStorage?.set?.(this.enabledSettingKey, next);
    } catch {
      // ignore storage write errors; keep in-memory setting
    }
    this.autoUpdateEnabled = next;
    this.sendStatusToRenderer('enabled-changed', { enabled: next });
    if (next) {
      await this.checkForUpdates({ force: true, reason: 'enabled-toggle' });
    }
    return next;
  }

  startGitHubReleaseListener() {
    if (!this.githubRepo) return;
    if (this.githubPollTimer) {
      clearInterval(this.githubPollTimer);
      this.githubPollTimer = null;
    }

    void this.checkGitHubRelease({ reason: 'startup' });
    this.githubPollTimer = setInterval(() => {
      void this.checkGitHubRelease({ reason: 'poll' });
    }, GITHUB_POLL_INTERVAL_MS);
    if (typeof this.githubPollTimer.unref === 'function') {
      this.githubPollTimer.unref();
    }
  }

  async checkGitHubRelease(options: any = {}) {
    const { force = false, reason = 'manual' } = options;
    if (!this.githubRepo) return { ok: false, reason: 'no-github-repo' };

    const enabled = await this.refreshEnabledState();
    if (!enabled && !force) {
      this.sendStatusToRenderer('github-skip-disabled', { reason });
      return { ok: true, skipped: true };
    }

    this.sendStatusToRenderer('github-checking', {
      reason,
      owner: this.githubRepo.owner,
      repo: this.githubRepo.repo
    });

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dram-desktop-updater'
    };
    if (this.lastGithubEtag) headers['If-None-Match'] = this.lastGithubEtag;

    const url = `https://api.github.com/repos/${this.githubRepo.owner}/${this.githubRepo.repo}/releases/latest`;

    try {
      const response = await fetch(url, { headers });
      this.lastGitHubCheckAt = Date.now();

      if (response.status === 304) {
        this.sendStatusToRenderer('github-not-modified', { reason });
        return { ok: true, notModified: true };
      }

      if (!response.ok) {
        const message = `GitHub release check failed (${response.status})`;
        this.lastError = message;
        this.sendStatusToRenderer('github-error', { reason, message, code: response.status });
        return { ok: false, message };
      }

      const etag = response.headers.get('etag');
      if (etag) this.lastGithubEtag = etag;

      const payload = await response.json();
      const tagName = String(payload?.tag_name || '').trim();
      const latestVersion = tagName.replace(/^v/i, '');
      const releaseUrl = String(payload?.html_url || '').trim();
      const publishedAt = payload?.published_at || null;

      if (!latestVersion) {
        this.sendStatusToRenderer('github-no-version', { reason });
        return { ok: true, latestVersion: null };
      }

      const cmp = compareSemver(latestVersion, this.currentVersion);
      if (cmp > 0) {
        this.githubLatest = { version: latestVersion, tagName, releaseUrl, publishedAt };
        this.sendStatusToRenderer('github-release-available', {
          reason,
          currentVersion: this.currentVersion,
          latestVersion,
          tagName,
          releaseUrl,
          publishedAt
        });
      } else {
        this.sendStatusToRenderer('github-release-current', {
          reason,
          currentVersion: this.currentVersion,
          latestVersion,
          tagName
        });
      }

      return { ok: true, currentVersion: this.currentVersion, latestVersion, tagName, releaseUrl, publishedAt };
    } catch (err: any) {
      const message = err?.message || 'GitHub release check failed';
      this.lastError = message;
      this.sendStatusToRenderer('github-error', { reason, message });
      return { ok: false, message };
    }
  }

  /**
   * Check for updates
   */
  async checkForUpdates(options: any = {}) {
    const { force = false, reason = 'manual' } = options;
    const enabled = await this.refreshEnabledState();
    if (!enabled && !force) {
      this.sendStatusToRenderer('disabled', { reason });
      return { ok: true, skipped: true };
    }

    try {
      this.lastElectronCheckAt = Date.now();
      await autoUpdater.checkForUpdates();
      await this.checkGitHubRelease({ force, reason });
      return { ok: true };
    } catch (err) {
      console.error('Failed to check for updates:', err);
      this.lastError = err?.message || 'Failed to check for updates';
      this.sendStatusToRenderer('error', { message: this.lastError });
      await this.checkGitHubRelease({ force, reason });
      return { ok: false, message: this.lastError };
    }
  }

  /**
   * Send update status to renderer
   */
  sendStatusToRenderer(status, data = {}) {
    this.windowManager.sendToRenderer('updater:status', { status, ...data });
  }

  /**
   * Manually trigger update installation
   */
  installUpdate() {
    if (this.updateDownloaded) {
      autoUpdater.quitAndInstall();
    }
  }

  /**
   * Check if update is available
   */
  isUpdateAvailable() {
    return this.updateAvailable;
  }

  /**
   * Check if update is downloaded and ready
   */
  isUpdateReady() {
    return this.updateDownloaded;
  }

  getStatus() {
    return {
      enabled: this.autoUpdateEnabled !== false,
      updateAvailable: this.updateAvailable,
      updateReady: this.updateDownloaded,
      currentVersion: this.currentVersion,
      github: {
        repo: this.githubRepo,
        latest: this.githubLatest,
        lastCheckedAt: this.lastGitHubCheckAt
      },
      lastElectronCheckAt: this.lastElectronCheckAt,
      lastError: this.lastError
    };
  }

  dispose() {
    if (this.githubPollTimer) {
      clearInterval(this.githubPollTimer);
      this.githubPollTimer = null;
    }
  }
}








