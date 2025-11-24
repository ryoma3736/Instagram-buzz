/**
 * Cookie Storage Tests
 * @module tests/cookieStorage.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  CookieStorage,
  saveCookies,
  loadCookies,
  deleteCookies,
  createEncryptedStorage,
} from '../src/services/instagram/cookieStorage.js';
import { InstagramCookies } from '../src/services/instagram/session/types.js';

// Test directory for cookie storage
const TEST_STORAGE_PATH = path.join(process.cwd(), 'tests', 'test-cookies');
const TEST_FILENAME = 'test_session.json';

describe('CookieStorage', () => {
  let storage: CookieStorage;

  beforeEach(() => {
    // Create test storage instance
    storage = new CookieStorage({
      storagePath: TEST_STORAGE_PATH,
      filename: TEST_FILENAME,
    });

    // Clean up test directory if it exists
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.rmSync(TEST_STORAGE_PATH, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.rmSync(TEST_STORAGE_PATH, { recursive: true });
    }
  });

  describe('save', () => {
    it('should save cookies to file', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      const result = storage.save(cookies);

      expect(result.success).toBe(true);
      expect(result.path).toBeDefined();
      expect(fs.existsSync(result.path!)).toBe(true);
    });

    it('should create storage directory if it does not exist', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      expect(fs.existsSync(TEST_STORAGE_PATH)).toBe(false);

      storage.save(cookies);

      expect(fs.existsSync(TEST_STORAGE_PATH)).toBe(true);
    });

    it('should store cookies in correct JSON format', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      const result = storage.save(cookies);
      const fileContent = fs.readFileSync(result.path!, 'utf8');
      const storedData = JSON.parse(fileContent);

      expect(storedData.encrypted).toBe(false);
      expect(storedData.version).toBe(1);
      expect(storedData.storedAt).toBeDefined();
      expect(JSON.parse(storedData.data)).toEqual(cookies);
    });
  });

  describe('load', () => {
    it('should load saved cookies', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      storage.save(cookies);
      const result = storage.load();

      expect(result.success).toBe(true);
      expect(result.cookies).toEqual(cookies);
    });

    it('should return error if cookie file does not exist', () => {
      const result = storage.load();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cookie file not found');
    });

    it('should detect expired cookies', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now() - 86400000,
        expiresAt: Date.now() - 3600000, // Expired
      };

      storage.save(cookies);
      const result = storage.load();

      expect(result.success).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.cookies).toBeDefined(); // Still returns the cookies
    });
  });

  describe('delete', () => {
    it('should delete cookie file', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      storage.save(cookies);
      const filePath = storage.getFilePath();

      expect(fs.existsSync(filePath)).toBe(true);

      const result = storage.delete();

      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should return true if file does not exist', () => {
      const result = storage.delete();
      expect(result).toBe(true);
    });
  });

  describe('exists', () => {
    it('should return false if file does not exist', () => {
      expect(storage.exists()).toBe(false);
    });

    it('should return true if file exists', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      storage.save(cookies);

      expect(storage.exists()).toBe(true);
    });
  });

  describe('getInfo', () => {
    it('should return exists: false if no file', () => {
      const info = storage.getInfo();
      expect(info.exists).toBe(false);
    });

    it('should return file metadata', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      storage.save(cookies);
      const info = storage.getInfo();

      expect(info.exists).toBe(true);
      expect(info.encrypted).toBe(false);
      expect(info.version).toBe(1);
      expect(info.storedAt).toBeDefined();
    });
  });

  describe('encrypted storage', () => {
    const ENCRYPTION_KEY = 'test-encryption-key-for-testing';

    it('should throw error if encryption enabled without key', () => {
      expect(() => {
        new CookieStorage({
          storagePath: TEST_STORAGE_PATH,
          filename: TEST_FILENAME,
          encrypt: true,
        });
      }).toThrow('Encryption key required');
    });

    it('should save encrypted cookies', () => {
      const encryptedStorage = new CookieStorage({
        storagePath: TEST_STORAGE_PATH,
        filename: TEST_FILENAME,
        encrypt: true,
        encryptionKey: ENCRYPTION_KEY,
      });

      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      const result = encryptedStorage.save(cookies);

      expect(result.success).toBe(true);

      const fileContent = fs.readFileSync(result.path!, 'utf8');
      const storedData = JSON.parse(fileContent);

      expect(storedData.encrypted).toBe(true);
      expect(storedData.iv).toBeDefined();
      expect(storedData.authTag).toBeDefined();
      // Data should not be readable as plain JSON
      expect(() => JSON.parse(storedData.data)).toThrow();
    });

    it('should load encrypted cookies', () => {
      const encryptedStorage = new CookieStorage({
        storagePath: TEST_STORAGE_PATH,
        filename: TEST_FILENAME,
        encrypt: true,
        encryptionKey: ENCRYPTION_KEY,
      });

      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      encryptedStorage.save(cookies);
      const result = encryptedStorage.load();

      expect(result.success).toBe(true);
      expect(result.cookies).toEqual(cookies);
    });

    it('should fail to load without encryption key', () => {
      const encryptedStorage = new CookieStorage({
        storagePath: TEST_STORAGE_PATH,
        filename: TEST_FILENAME,
        encrypt: true,
        encryptionKey: ENCRYPTION_KEY,
      });

      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      encryptedStorage.save(cookies);

      // Try to load with non-encrypted storage
      const plainStorage = new CookieStorage({
        storagePath: TEST_STORAGE_PATH,
        filename: TEST_FILENAME,
      });

      const result = plainStorage.load();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot decrypt cookies');
    });
  });

  describe('createEncryptedStorage', () => {
    it('should create encrypted storage with provided key', () => {
      const encryptedStorage = createEncryptedStorage('test-key');
      expect(encryptedStorage).toBeInstanceOf(CookieStorage);
    });
  });

  describe('quick functions', () => {
    // Note: These tests use the default storage path, so we need to clean up properly
    const defaultPath = path.join(process.cwd(), 'src', 'services', 'instagram', 'cookies', 'instagram_session.json');

    afterEach(() => {
      if (fs.existsSync(defaultPath)) {
        fs.unlinkSync(defaultPath);
      }
    });

    it('saveCookies and loadCookies should work together', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      const saveResult = saveCookies(cookies);
      expect(saveResult.success).toBe(true);

      const loadResult = loadCookies();
      expect(loadResult.success).toBe(true);
      expect(loadResult.cookies).toEqual(cookies);
    });

    it('deleteCookies should remove saved cookies', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      saveCookies(cookies);
      const deleted = deleteCookies();

      expect(deleted).toBe(true);
      expect(fs.existsSync(defaultPath)).toBe(false);
    });
  });
});
