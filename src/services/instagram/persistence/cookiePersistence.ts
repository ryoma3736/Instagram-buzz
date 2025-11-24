/**
 * Cookie persistence service for Instagram authentication
 * @module services/instagram/persistence/cookiePersistence
 */

import * as path from 'path';
import { FileStorage } from './fileStorage';
import { CookieData } from '../session/types';
import { parseLocalJson } from '../../../utils/safeJsonParse.js';

/**
 * Instagram cookies structure for authentication
 */
export interface InstagramCookies {
  sessionid: string;
  csrftoken: string;
  ds_user_id: string;
  rur?: string;
  mid?: string;
  ig_did?: string;
  ig_nrcb?: string;
}

/**
 * Stored cookie data with metadata
 */
export interface StoredCookieData {
  cookies: InstagramCookies;
  rawCookies?: CookieData[];
  metadata: {
    extractedAt: number;
    expiresAt: number;
    username?: string;
    lastValidatedAt?: number;
  };
}

/**
 * Cookie persistence configuration
 */
export interface CookiePersistenceConfig {
  storagePath?: string;
  defaultExpiryDays?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<CookiePersistenceConfig> = {
  storagePath: path.join(process.cwd(), 'data', 'cookies'),
  defaultExpiryDays: 90, // Instagram session cookies typically expire in 90 days
};

/**
 * Cookie persistence service for saving and loading Instagram cookies
 */
export class CookiePersistence {
  private storage: FileStorage;
  private config: Required<CookiePersistenceConfig>;
  private defaultFilename = 'instagram_cookies.json';

  constructor(config?: CookiePersistenceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = new FileStorage(this.config.storagePath);
  }

  /**
   * Save cookies to persistent storage
   */
  async save(
    cookies: InstagramCookies,
    options?: {
      username?: string;
      rawCookies?: CookieData[];
      expiresAt?: number;
    }
  ): Promise<void> {
    const now = Date.now();
    const expiresAt =
      options?.expiresAt ||
      now + this.config.defaultExpiryDays * 24 * 60 * 60 * 1000;

    const data: StoredCookieData = {
      cookies,
      rawCookies: options?.rawCookies,
      metadata: {
        extractedAt: now,
        expiresAt,
        username: options?.username,
        lastValidatedAt: now,
      },
    };

    const filename = this.getFilename(options?.username);
    await this.storage.writeFile(filename, JSON.stringify(data, null, 2));
  }

  /**
   * Load cookies from persistent storage
   */
  async load(username?: string): Promise<StoredCookieData | null> {
    const filename = this.getFilename(username);

    const content = await this.storage.readFile(filename);
    if (!content) {
      return null;
    }

    try {
      const data = parseLocalJson<StoredCookieData>(content, `cookies/${username || 'default'}`);

      // Validate required fields
      if (!this.isValidStoredData(data)) {
        console.warn('Invalid stored cookie data format');
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to parse stored cookies:', error);
      return null;
    }
  }

  /**
   * Check if cookies exist in storage
   */
  exists(username?: string): boolean {
    const filename = this.getFilename(username);
    return this.storage.exists(filename);
  }

  /**
   * Clear stored cookies
   */
  async clear(username?: string): Promise<void> {
    const filename = this.getFilename(username);
    await this.storage.deleteFile(filename);
  }

  /**
   * Check if stored cookies are expired
   */
  async isExpired(username?: string): Promise<boolean> {
    const data = await this.load(username);
    if (!data) {
      return true;
    }

    return Date.now() >= data.metadata.expiresAt;
  }

  /**
   * Check if cookies need refresh (within threshold of expiry)
   */
  async needsRefresh(username?: string, thresholdHours = 24): Promise<boolean> {
    const data = await this.load(username);
    if (!data) {
      return true;
    }

    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    return Date.now() >= data.metadata.expiresAt - thresholdMs;
  }

  /**
   * Update validation timestamp
   */
  async updateValidation(username?: string): Promise<void> {
    const data = await this.load(username);
    if (!data) {
      return;
    }

    data.metadata.lastValidatedAt = Date.now();
    const filename = this.getFilename(username);
    await this.storage.writeFile(filename, JSON.stringify(data, null, 2));
  }

  /**
   * List all stored cookie accounts
   */
  listAccounts(): string[] {
    const files = this.storage.listFiles(/\.json$/);
    return files.map(f => {
      const match = f.match(/^instagram_cookies_(.+)\.json$/);
      return match ? match[1] : 'default';
    });
  }

  /**
   * Get storage path
   */
  getStoragePath(): string {
    return this.config.storagePath;
  }

  /**
   * Get filename for cookies
   */
  private getFilename(username?: string): string {
    if (username) {
      return `instagram_cookies_${username}.json`;
    }
    return this.defaultFilename;
  }

  /**
   * Validate stored data structure
   */
  private isValidStoredData(data: unknown): data is StoredCookieData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const d = data as Record<string, unknown>;

    if (!d.cookies || typeof d.cookies !== 'object') {
      return false;
    }

    const cookies = d.cookies as Record<string, unknown>;
    if (
      typeof cookies.sessionid !== 'string' ||
      typeof cookies.csrftoken !== 'string' ||
      typeof cookies.ds_user_id !== 'string'
    ) {
      return false;
    }

    if (!d.metadata || typeof d.metadata !== 'object') {
      return false;
    }

    const metadata = d.metadata as Record<string, unknown>;
    if (
      typeof metadata.extractedAt !== 'number' ||
      typeof metadata.expiresAt !== 'number'
    ) {
      return false;
    }

    return true;
  }
}

/**
 * Default singleton instance
 */
export const cookiePersistence = new CookiePersistence();
