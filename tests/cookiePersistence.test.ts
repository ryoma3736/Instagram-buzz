/**
 * Cookie Persistence Service Tests
 *
 * Tests for cookie storage, loading, and file operations.
 * Run: npm test -- tests/cookiePersistence.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CookiePersistence, InstagramCookies } from '../src/services/instagram/persistence/cookiePersistence.js';
import { FileStorage } from '../src/services/instagram/persistence/fileStorage.js';

const TEST_STORAGE_PATH = path.join(process.cwd(), '.test-cookies');

describe('FileStorage', () => {
  let storage: FileStorage;

  beforeEach(() => {
    storage = new FileStorage(TEST_STORAGE_PATH);
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }
  });

  it('should create storage directory on initialization', () => {
    expect(fs.existsSync(TEST_STORAGE_PATH)).toBe(true);
  });

  it('should write and read files', async () => {
    const content = JSON.stringify({ test: 'data' });
    await storage.writeFile('test.json', content);

    const result = await storage.readFile('test.json');
    expect(result).toBe(content);
  });

  it('should return null for non-existent files', async () => {
    const result = await storage.readFile('nonexistent.json');
    expect(result).toBeNull();
  });

  it('should check file existence', async () => {
    expect(storage.exists('test.json')).toBe(false);

    await storage.writeFile('test.json', 'content');
    expect(storage.exists('test.json')).toBe(true);
  });

  it('should delete files', async () => {
    await storage.writeFile('test.json', 'content');
    expect(storage.exists('test.json')).toBe(true);

    const deleted = await storage.deleteFile('test.json');
    expect(deleted).toBe(true);
    expect(storage.exists('test.json')).toBe(false);
  });

  it('should return false when deleting non-existent file', async () => {
    const deleted = await storage.deleteFile('nonexistent.json');
    expect(deleted).toBe(false);
  });

  it('should list files', async () => {
    await storage.writeFile('file1.json', 'content1');
    await storage.writeFile('file2.json', 'content2');

    const files = storage.listFiles();
    expect(files).toContain('file1.json');
    expect(files).toContain('file2.json');
  });

  it('should filter files by pattern', async () => {
    await storage.writeFile('test.json', 'content1');
    await storage.writeFile('test.txt', 'content2');

    const jsonFiles = storage.listFiles(/\.json$/);
    expect(jsonFiles).toContain('test.json');
    expect(jsonFiles).not.toContain('test.txt');
  });

  it('should set correct file permissions (600)', async () => {
    await storage.writeFile('secure.json', 'secret');

    const filePath = storage.getFilePath('secure.json');
    const stats = fs.statSync(filePath);
    const permissions = stats.mode & 0o777;

    // On Unix-like systems, should be 0o600
    // On Windows, permissions work differently
    if (process.platform !== 'win32') {
      expect(permissions).toBe(0o600);
    }
  });
});

describe('CookiePersistence', () => {
  let persistence: CookiePersistence;
  const testCookies: InstagramCookies = {
    sessionid: 'test_session_123',
    csrftoken: 'test_csrf_456',
    ds_user_id: '12345678',
    rur: 'TEST',
    mid: 'test_mid',
  };

  beforeEach(() => {
    persistence = new CookiePersistence({ storagePath: TEST_STORAGE_PATH });
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }
  });

  describe('save and load', () => {
    it('should save and load cookies', async () => {
      await persistence.save(testCookies);

      const loaded = await persistence.load();
      expect(loaded).not.toBeNull();
      expect(loaded?.cookies.sessionid).toBe(testCookies.sessionid);
      expect(loaded?.cookies.csrftoken).toBe(testCookies.csrftoken);
      expect(loaded?.cookies.ds_user_id).toBe(testCookies.ds_user_id);
    });

    it('should save with username', async () => {
      await persistence.save(testCookies, { username: 'testuser' });

      const loaded = await persistence.load('testuser');
      expect(loaded).not.toBeNull();
      expect(loaded?.metadata.username).toBe('testuser');
    });

    it('should include metadata', async () => {
      await persistence.save(testCookies);

      const loaded = await persistence.load();
      expect(loaded?.metadata.extractedAt).toBeDefined();
      expect(loaded?.metadata.expiresAt).toBeDefined();
      expect(loaded?.metadata.lastValidatedAt).toBeDefined();
    });

    it('should return null for non-existent cookies', async () => {
      const loaded = await persistence.load('nonexistent');
      expect(loaded).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return false when cookies do not exist', () => {
      expect(persistence.exists()).toBe(false);
    });

    it('should return true when cookies exist', async () => {
      await persistence.save(testCookies);
      expect(persistence.exists()).toBe(true);
    });

    it('should check specific username', async () => {
      await persistence.save(testCookies, { username: 'user1' });

      expect(persistence.exists('user1')).toBe(true);
      expect(persistence.exists('user2')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear stored cookies', async () => {
      await persistence.save(testCookies);
      expect(persistence.exists()).toBe(true);

      await persistence.clear();
      expect(persistence.exists()).toBe(false);
    });

    it('should clear specific username', async () => {
      await persistence.save(testCookies, { username: 'user1' });
      await persistence.save(testCookies, { username: 'user2' });

      await persistence.clear('user1');
      expect(persistence.exists('user1')).toBe(false);
      expect(persistence.exists('user2')).toBe(true);
    });
  });

  describe('isExpired', () => {
    it('should return true for non-existent cookies', async () => {
      const expired = await persistence.isExpired();
      expect(expired).toBe(true);
    });

    it('should return false for fresh cookies', async () => {
      await persistence.save(testCookies);

      const expired = await persistence.isExpired();
      expect(expired).toBe(false);
    });

    it('should return true for expired cookies', async () => {
      // Save with past expiry
      await persistence.save(testCookies, {
        expiresAt: Date.now() - 1000,
      });

      const expired = await persistence.isExpired();
      expect(expired).toBe(true);
    });
  });

  describe('needsRefresh', () => {
    it('should return true for non-existent cookies', async () => {
      const needs = await persistence.needsRefresh();
      expect(needs).toBe(true);
    });

    it('should return false for cookies far from expiry', async () => {
      // Default expiry is 90 days
      await persistence.save(testCookies);

      const needs = await persistence.needsRefresh(undefined, 24);
      expect(needs).toBe(false);
    });

    it('should return true for cookies close to expiry', async () => {
      // Save with expiry in 12 hours
      await persistence.save(testCookies, {
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      });

      const needs = await persistence.needsRefresh(undefined, 24);
      expect(needs).toBe(true);
    });
  });

  describe('updateValidation', () => {
    it('should update lastValidatedAt timestamp', async () => {
      await persistence.save(testCookies);
      const before = (await persistence.load())?.metadata.lastValidatedAt || 0;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await persistence.updateValidation();
      const after = (await persistence.load())?.metadata.lastValidatedAt || 0;

      expect(after).toBeGreaterThan(before);
    });
  });

  describe('listAccounts', () => {
    it('should return empty array when no cookies stored', () => {
      const accounts = persistence.listAccounts();
      expect(accounts).toEqual([]);
    });

    it('should list all stored accounts', async () => {
      await persistence.save(testCookies, { username: 'user1' });
      await persistence.save(testCookies, { username: 'user2' });

      const accounts = persistence.listAccounts();
      expect(accounts).toContain('user1');
      expect(accounts).toContain('user2');
    });
  });

  describe('getStoragePath', () => {
    it('should return configured storage path', () => {
      expect(persistence.getStoragePath()).toBe(TEST_STORAGE_PATH);
    });
  });

  describe('validation', () => {
    it('should reject invalid stored data', async () => {
      // Manually write invalid data
      const storage = new FileStorage(TEST_STORAGE_PATH);
      await storage.writeFile('instagram_cookies.json', JSON.stringify({ invalid: 'data' }));

      const loaded = await persistence.load();
      expect(loaded).toBeNull();
    });

    it('should reject data with missing required cookie fields', async () => {
      const storage = new FileStorage(TEST_STORAGE_PATH);
      await storage.writeFile(
        'instagram_cookies.json',
        JSON.stringify({
          cookies: { sessionid: 'test' }, // missing csrftoken and ds_user_id
          metadata: { extractedAt: Date.now(), expiresAt: Date.now() + 1000 },
        })
      );

      const loaded = await persistence.load();
      expect(loaded).toBeNull();
    });
  });
});
