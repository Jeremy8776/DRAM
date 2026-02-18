/**
 * DRAM Token Manager
 * Handles secure token storage, rotation, and refresh for Gateway authentication.
 * Implements SEC-004: Token refresh mechanism with expiration tracking.
 */

import crypto from 'crypto';

/**
 * Token metadata structure
 * @typedef {Object} TokenMetadata
 * @property {string} token - The actual token (encrypted)
 * @property {number} createdAt - Timestamp when token was created
 * @property {number} expiresAt - Timestamp when token expires (null if never)
 * @property {number} lastUsed - Timestamp of last successful use
 * @property {number} useCount - Number of times token has been used
 */

export class TokenManager {
  constructor(secureStorage) {
    this.secureStorage = secureStorage;
    this.tokenCache = new Map();
    this.REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // Refresh if expires within 24h
    this.DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days default expiry
  }

  /**
   * Store a token with metadata
   * @param {string} key - Token identifier (e.g., 'gateway.token')
   * @param {string} token - The token to store
   * @param {Object} options - Storage options
   * @param {number} [options.expiresInMs] - Time until expiry in milliseconds
   * @param {boolean} [options.allowRefresh] - Whether this token can be refreshed
   * @returns {Promise<boolean>}
   */
  async storeToken(key, token, options = {}) {
    try {
      const now = Date.now();
      const metadata = {
        token,
        createdAt: now,
        expiresAt: options.expiresInMs ? now + options.expiresInMs : null,
        lastUsed: now,
        useCount: 0,
        allowRefresh: options.allowRefresh !== false
      };

      // Store encrypted in secure storage
      await this.secureStorage.set(`token.${key}`, metadata);
      
      // Cache in memory for quick access
      this.tokenCache.set(key, metadata);
      
      console.log(`[TokenManager] Stored token: ${key}`);
      return true;
    } catch (err) {
      console.error(`[TokenManager] Failed to store token ${key}:`, err);
      return false;
    }
  }

  /**
   * Retrieve a token and update usage statistics
   * @param {string} key - Token identifier
   * @returns {Promise<string|null>} The token or null if not found/expired
   */
  async getToken(key) {
    try {
      // Check cache first
      let metadata = this.tokenCache.get(key);
      
      if (!metadata) {
        // Load from secure storage
        metadata = await this.secureStorage.get(`token.${key}`);
        if (!metadata) return null;
        this.tokenCache.set(key, metadata);
      }

      // Check expiration
      if (metadata.expiresAt && Date.now() > metadata.expiresAt) {
        console.warn(`[TokenManager] Token expired: ${key}`);
        await this.invalidateToken(key);
        return null;
      }

      // Update usage stats
      metadata.lastUsed = Date.now();
      metadata.useCount++;
      
      // Async save updated stats (don't await to avoid blocking)
      this.secureStorage.set(`token.${key}`, metadata).catch(() => {});

      return metadata.token;
    } catch (err) {
      console.error(`[TokenManager] Failed to get token ${key}:`, err);
      return null;
    }
  }

  /**
   * Check if a token needs refreshing
   * @param {string} key - Token identifier
   * @returns {Promise<boolean>}
   */
  async needsRefresh(key) {
    try {
      const metadata = await this.secureStorage.get(`token.${key}`);
      if (!metadata) return false;
      if (!metadata.allowRefresh) return false;
      if (!metadata.expiresAt) return false;

      const timeUntilExpiry = metadata.expiresAt - Date.now();
      return timeUntilExpiry < this.REFRESH_THRESHOLD_MS;
    } catch {
      return false;
    }
  }

  /**
   * Invalidate (delete) a token
   * @param {string} key - Token identifier
   * @returns {Promise<boolean>}
   */
  async invalidateToken(key) {
    try {
      this.tokenCache.delete(key);
      await this.secureStorage.delete(`token.${key}`);
      console.log(`[TokenManager] Invalidated token: ${key}`);
      return true;
    } catch (err) {
      console.error(`[TokenManager] Failed to invalidate token ${key}:`, err);
      return false;
    }
  }

  /**
   * Rotate a token (generate new, invalidate old)
   * @param {string} key - Token identifier
   * @param {Function} fetchNewToken - Async function to fetch new token from server
   * @returns {Promise<string|null>} New token or null if rotation failed
   */
  async rotateToken(key, fetchNewToken) {
    try {
      console.log(`[TokenManager] Rotating token: ${key}`);
      
      // Get new token from server
      const newToken = await fetchNewToken();
      if (!newToken) {
        throw new Error('Server returned no token');
      }

      // Store new token
      const oldMetadata = await this.secureStorage.get(`token.${key}`);
      await this.storeToken(key, newToken, {
        expiresInMs: this.DEFAULT_EXPIRY_MS,
        allowRefresh: oldMetadata?.allowRefresh !== false
      });

      console.log(`[TokenManager] Token rotated successfully: ${key}`);
      return newToken;
    } catch (err) {
      console.error(`[TokenManager] Token rotation failed for ${key}:`, err);
      return null;
    }
  }

  /**
   * Get token status for UI display
   * @param {string} key - Token identifier
   * @returns {Promise<Object>} Token status
   */
  async getTokenStatus(key) {
    try {
      const metadata = await this.secureStorage.get(`token.${key}`);
      if (!metadata) return { exists: false };

      const now = Date.now();
      const expiresAt = metadata.expiresAt;
      
      return {
        exists: true,
        createdAt: metadata.createdAt,
        expiresAt: expiresAt,
        isExpired: expiresAt ? now > expiresAt : false,
        needsRefresh: expiresAt ? (expiresAt - now) < this.REFRESH_THRESHOLD_MS : false,
        lastUsed: metadata.lastUsed,
        useCount: metadata.useCount,
        allowRefresh: metadata.allowRefresh
      };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  }

  /**
   * Generate a cryptographically secure random token
   * @param {number} length - Token length in bytes (default: 32)
   * @returns {string} Hex-encoded token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash a token for comparison (e.g., verifying token matches without storing plaintext)
   * @param {string} token - Token to hash
   * @returns {string} SHA-256 hash of token
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

// Singleton instance
let instance = null;
export function getTokenManager(secureStorage) {
  if (!instance && secureStorage) {
    instance = new TokenManager(secureStorage);
  }
  return instance;
}
