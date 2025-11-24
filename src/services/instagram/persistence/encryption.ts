/**
 * Cookie encryption utilities for secure storage
 * @module services/instagram/persistence/encryption
 */

import * as crypto from 'crypto';

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  saltLength: number;
  iterations: number;
}

/**
 * Default encryption configuration
 */
const DEFAULT_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  saltLength: 32,
  iterations: 100000,
};

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  authTag: string;
  version: number;
}

/**
 * Cookie encryption service
 * Provides secure encryption/decryption for sensitive cookie data
 */
export class CookieEncryption {
  private config: EncryptionConfig;

  constructor(config?: Partial<EncryptionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.config.iterations,
      this.config.keyLength,
      'sha256'
    );
  }

  /**
   * Encrypt data with password
   */
  encrypt(data: string, password: string): EncryptedData {
    const salt = crypto.randomBytes(this.config.saltLength);
    const iv = crypto.randomBytes(this.config.ivLength);
    const key = this.deriveKey(password, salt);

    const cipher = crypto.createCipheriv(
      this.config.algorithm as crypto.CipherGCMTypes,
      key,
      iv
    );

    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('base64'),
      salt: salt.toString('base64'),
      authTag: authTag.toString('base64'),
      version: 1,
    };
  }

  /**
   * Decrypt data with password
   */
  decrypt(encryptedData: EncryptedData, password: string): string {
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const key = this.deriveKey(password, salt);

    const decipher = crypto.createDecipheriv(
      this.config.algorithm as crypto.CipherGCMTypes,
      key,
      iv
    );

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Check if data appears to be encrypted
   */
  isEncrypted(data: unknown): data is EncryptedData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const d = data as Record<string, unknown>;
    return (
      typeof d.encrypted === 'string' &&
      typeof d.iv === 'string' &&
      typeof d.salt === 'string' &&
      typeof d.authTag === 'string' &&
      typeof d.version === 'number'
    );
  }

  /**
   * Generate a secure random password
   */
  static generatePassword(length = 32): string {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
  }

  /**
   * Hash data for integrity verification
   */
  static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

/**
 * Default encryption instance
 */
export const cookieEncryption = new CookieEncryption();
