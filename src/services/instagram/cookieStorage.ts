/**
 * Instagram Cookie Storage
 * @module services/instagram/cookieStorage
 *
 * Handles saving and loading Instagram session cookies with optional encryption
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { InstagramCookies } from './session/types.js';
import { validateCookies } from './cookieExtractor.js';
import { parseLocalJson } from '../../utils/safeJsonParse.js';

/**
 * Storage configuration options
 */
export interface CookieStorageOptions {
  /** Directory path for storing cookies (default: src/services/instagram/cookies) */
  storagePath?: string;
  /** Filename for the cookie file (default: instagram_session.json) */
  filename?: string;
  /** Enable encryption for stored cookies (default: false) */
  encrypt?: boolean;
  /** Encryption key (required if encrypt is true, uses env var COOKIE_ENCRYPTION_KEY if not provided) */
  encryptionKey?: string;
}

/**
 * Stored cookie data structure (with optional encryption)
 */
interface StoredCookieData {
  encrypted: boolean;
  data: string;
  iv?: string;
  authTag?: string;
  version: number;
  storedAt: number;
}

/**
 * Default storage path
 */
const DEFAULT_STORAGE_PATH = path.join(
  process.cwd(),
  'src',
  'services',
  'instagram',
  'cookies'
);

/**
 * Default filename
 */
const DEFAULT_FILENAME = 'instagram_session.json';

/**
 * Current storage format version
 */
const STORAGE_VERSION = 1;

/**
 * Encryption algorithm
 */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * Result of storage operations
 */
export interface StorageResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Result of load operations
 */
export interface LoadResult {
  success: boolean;
  cookies?: InstagramCookies;
  expired?: boolean;
  error?: string;
}

/**
 * CookieStorage class for managing Instagram session cookies
 */
export class CookieStorage {
  private readonly storagePath: string;
  private readonly filename: string;
  private readonly encrypt: boolean;
  private readonly encryptionKey: string | null;

  constructor(options: CookieStorageOptions = {}) {
    this.storagePath = options.storagePath || DEFAULT_STORAGE_PATH;
    this.filename = options.filename || DEFAULT_FILENAME;
    this.encrypt = options.encrypt || false;
    this.encryptionKey =
      options.encryptionKey || process.env.COOKIE_ENCRYPTION_KEY || null;

    if (this.encrypt && !this.encryptionKey) {
      throw new Error(
        'Encryption key required when encryption is enabled. Set COOKIE_ENCRYPTION_KEY environment variable or provide encryptionKey option.'
      );
    }
  }

  /**
   * Gets the full file path for cookie storage
   */
  getFilePath(): string {
    return path.join(this.storagePath, this.filename);
  }

  /**
   * Ensures the storage directory exists
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Encrypts data using AES-256-GCM
   */
  private encryptData(data: string): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    const key = crypto.scryptSync(this.encryptionKey!, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  /**
   * Decrypts data using AES-256-GCM
   */
  private decryptData(encrypted: string, iv: string, authTag: string): string {
    const key = crypto.scryptSync(this.encryptionKey!, 'salt', 32);
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Saves Instagram cookies to file
   * @param cookies - Instagram cookies to save
   * @returns Storage result with success status and file path
   */
  save(cookies: InstagramCookies): StorageResult {
    try {
      this.ensureDirectory();

      const jsonData = JSON.stringify(cookies);
      let storedData: StoredCookieData;

      if (this.encrypt) {
        const { encrypted, iv, authTag } = this.encryptData(jsonData);
        storedData = {
          encrypted: true,
          data: encrypted,
          iv,
          authTag,
          version: STORAGE_VERSION,
          storedAt: Date.now(),
        };
      } else {
        storedData = {
          encrypted: false,
          data: jsonData,
          version: STORAGE_VERSION,
          storedAt: Date.now(),
        };
      }

      const filePath = this.getFilePath();
      fs.writeFileSync(filePath, JSON.stringify(storedData, null, 2), 'utf8');

      // Set restrictive permissions (owner read/write only)
      fs.chmodSync(filePath, 0o600);

      return {
        success: true,
        path: filePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Loads Instagram cookies from file
   * @returns Load result with cookies if successful
   */
  load(): LoadResult {
    try {
      const filePath = this.getFilePath();

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'Cookie file not found',
        };
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const storedData: StoredCookieData = parseLocalJson<StoredCookieData>(fileContent, filePath);

      let cookies: InstagramCookies;

      if (storedData.encrypted) {
        if (!this.encryptionKey) {
          return {
            success: false,
            error:
              'Cannot decrypt cookies: encryption key not provided. Set COOKIE_ENCRYPTION_KEY environment variable.',
          };
        }

        if (!storedData.iv || !storedData.authTag) {
          return {
            success: false,
            error: 'Invalid encrypted cookie data: missing iv or authTag',
          };
        }

        const decrypted = this.decryptData(
          storedData.data,
          storedData.iv,
          storedData.authTag
        );
        cookies = parseLocalJson<InstagramCookies>(decrypted, 'decrypted cookies');
      } else {
        cookies = parseLocalJson<InstagramCookies>(storedData.data, 'cookie data');
      }

      // Validate cookies
      const isValid = validateCookies(cookies);

      if (!isValid) {
        return {
          success: false,
          expired: true,
          cookies,
          error: 'Cookies have expired or are invalid',
        };
      }

      return {
        success: true,
        cookies,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Deletes stored cookies
   * @returns true if deletion was successful or file didn't exist
   */
  delete(): boolean {
    try {
      const filePath = this.getFilePath();

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if cookie file exists
   */
  exists(): boolean {
    return fs.existsSync(this.getFilePath());
  }

  /**
   * Gets information about stored cookies without loading full data
   */
  getInfo(): {
    exists: boolean;
    storedAt?: number;
    encrypted?: boolean;
    version?: number;
  } {
    try {
      const filePath = this.getFilePath();

      if (!fs.existsSync(filePath)) {
        return { exists: false };
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const storedData: StoredCookieData = parseLocalJson<StoredCookieData>(fileContent, filePath);

      return {
        exists: true,
        storedAt: storedData.storedAt,
        encrypted: storedData.encrypted,
        version: storedData.version,
      };
    } catch {
      return { exists: false };
    }
  }
}

/**
 * Default cookie storage instance (without encryption)
 */
export const cookieStorage = new CookieStorage();

/**
 * Creates an encrypted cookie storage instance
 * @param encryptionKey - Optional encryption key (uses COOKIE_ENCRYPTION_KEY env var if not provided)
 */
export function createEncryptedStorage(encryptionKey?: string): CookieStorage {
  return new CookieStorage({
    encrypt: true,
    encryptionKey,
  });
}

/**
 * Quick save function using default storage
 */
export function saveCookies(cookies: InstagramCookies): StorageResult {
  return cookieStorage.save(cookies);
}

/**
 * Quick load function using default storage
 */
export function loadCookies(): LoadResult {
  return cookieStorage.load();
}

/**
 * Quick delete function using default storage
 */
export function deleteCookies(): boolean {
  return cookieStorage.delete();
}
