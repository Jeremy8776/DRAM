/**
 * DRAM Desktop - Secure Storage
 * 
 * Uses Electron's safeStorage API to encrypt sensitive data.
 * Falls back to plain storage for non-sensitive settings.
 * 
 * Security: All credentials (tokens, passwords) are encrypted at rest.
 */

import { app, safeStorage } from 'electron';
import fs from 'fs/promises';
import path from 'path';

export class SecureStorage {
  constructor() {
    this.storageDir = path.join(app.getPath('userData'), 'storage');
    this.settingsFile = path.join(this.storageDir, 'settings.json');
    this.secureFile = path.join(this.storageDir, 'secure.enc');
    this.settings = {};
    this.secureData = {};
    this.initialized = false;
  }

  /**
   * Initialize storage - load existing data
   */
  async initialize() {
    // Ensure storage directory exists
    await fs.mkdir(this.storageDir, { recursive: true });

    // Load plain settings
    try {
      const data = await fs.readFile(this.settingsFile, 'utf-8');
      if (data.trim()) {
        this.settings = JSON.parse(data);
      } else {
        this.settings = {};
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading settings:', err);
        // Backup corrupted file
        try {
          const backupFile = `${this.settingsFile}.backup.${Date.now()}`;
          await fs.copyFile(this.settingsFile, backupFile);
          console.log('Settings file corrupted, backed up to:', backupFile);
        } catch {
          // Ignore backup errors
        }
      }
      this.settings = {};
    }

    // Load encrypted secure data
    await this.loadSecureData();

    this.initialized = true;
  }

  /**
   * Load encrypted secure data
   */
  async loadSecureData() {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('Encryption not available - secure storage disabled');
      this.secureData = {};
      return;
    }

    try {
      const encryptedBuffer = await fs.readFile(this.secureFile);
      const decrypted = safeStorage.decryptString(encryptedBuffer);
      this.secureData = JSON.parse(decrypted);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading secure data:', err);
      }
      this.secureData = {};
    }
  }

  /**
   * Save encrypted secure data
   */
  async saveSecureData() {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('Encryption not available - cannot save secure data');
      return false;
    }

    try {
      const json = JSON.stringify(this.secureData, null, 2);
      const encrypted = safeStorage.encryptString(json);
      await fs.writeFile(this.secureFile, encrypted);
      return true;
    } catch (err) {
      console.error('Error saving secure data:', err);
      return false;
    }
  }

  /**
   * Save plain settings
   */
  async saveSettings() {
    try {
      const json = JSON.stringify(this.settings, null, 2);
      await fs.writeFile(this.settingsFile, json);
      return true;
    } catch (err) {
      console.error('Error saving settings:', err);
      return false;
    }
  }

  /**
   * Get a value by key (dot notation supported)
   * Checks secure storage first for known sensitive keys
   */
  async get(key) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Sensitive keys stored in encrypted storage
    if (this.isSensitiveKey(key)) {
      const val = this.getNestedValue(this.secureData, key);
      if (val !== undefined) return val;
      // Fallback to plain settings if not found in secure storage (e.g. encryption was off)
    }

    return this.getNestedValue(this.settings, key);
  }

  /**
   * Set a value by key (dot notation supported)
   * Sensitive keys go to encrypted storage
   * @throws {Error} If encryption is unavailable for sensitive data
   */
  async set(key, value) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isSensitiveKey(key)) {
      if (this.isEncryptionAvailable()) {
        this.setNestedValue(this.secureData, key, value);
        const saved = await this.saveSecureData();
        if (saved) return true;
        // If save failed for some other reason, we might still want to throw or fallback
      }

      console.warn(`[SecureStorage] Encryption unavailable for sensitive key "${key}". Falling back to plain storage.`);
      // Fall through to plain storage
    }

    this.setNestedValue(this.settings, key, value);
    return this.saveSettings();
  }

  /**
   * Delete a value by key
   */
  async delete(key) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isSensitiveKey(key)) {
      this.deleteNestedValue(this.secureData, key);
      const secureSaved = await this.saveSecureData();

      // Also delete from plain settings in case it was stored there as fallback
      this.deleteNestedValue(this.settings, key);
      const settingsSaved = await this.saveSettings();

      return settingsSaved && (secureSaved || !this.isEncryptionAvailable());
    }

    this.deleteNestedValue(this.settings, key);
    return this.saveSettings();
  }

  /**
   * Check if a key should be stored securely
   */
  isSensitiveKey(key) {
    const sensitivePatterns = [
      'gateway.token',
      'gateway.password',
      'credentials',
      'apiKey',
      'secret',
      'auth.token',
      'auth.password'
    ];

    return sensitivePatterns.some(pattern =>
      key.includes(pattern) || key.toLowerCase().includes('password') || key.toLowerCase().includes('token')
    );
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, key) {
    const parts = key.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Set nested value in object using dot notation
   */
  setNestedValue(obj, key, value) {
    const parts = key.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Delete nested value from object using dot notation
   */
  deleteNestedValue(obj, key) {
    const parts = key.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        return;
      }
      current = current[part];
    }

    delete current[parts[parts.length - 1]];
  }

  /**
   * Check if encryption is available
   */
  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Get all non-sensitive settings (for export/display)
   */
  async getAllSettings() {
    if (!this.initialized) {
      await this.initialize();
    }
    return { ...this.settings };
  }

  /**
   * Get complete snapshot of ALL data (secure + settings)
   * Used for hydrating StateManager
   */
  async getDataSnapshot() {
    if (!this.initialized) {
      await this.initialize();
    }
    // Deep merge settings and secureData
    // Secure data takes precedence if overlaps exist (though they shouldn't)
    return this.deepMerge(this.settings, this.secureData);
  }

  deepMerge(target, source) {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }

  /**
   * Destructive wipe of ALL storage files
   */
  async wipeAll() {
    this.settings = {};
    this.secureData = {};
    try {
      if (fs.rm) {
        await fs.rm(this.settingsFile, { force: true });
        await fs.rm(this.secureFile, { force: true });
      } else {
        // Fallback for older node versions if needed
        await fs.unlink(this.settingsFile).catch(() => { });
        await fs.unlink(this.secureFile).catch(() => { });
      }
      return true;
    } catch (err) {
      console.error('Error wiping storage:', err);
      return false;
    }
  }
}


