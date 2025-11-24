/**
 * CookiePersistence Unit Tests
 * @module tests/unit/session/cookiePersistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CookiePersistence,
  InstagramCookies,
  StoredCookieData,
  CookiePersistenceConfig,
  cookiePersistence,
} from '../../../src/services/instagram/persistence/cookiePersistence.js';

// Mock FileStorage
vi.mock('../../../src/services/instagram/persistence/fileStorage', () => ({
  FileStorage: vi.fn().mockImplementation(() => ({
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(null),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockReturnValue(false),
    listFiles: vi.fn().mockReturnValue([]),
  })),
}));

describe('CookiePersistence', () => {
  let persistence: CookiePersistence;
  let mockFileStorage: any;

  // Sample cookies
  const sampleCookies: InstagramCookies = {
    sessionid: 'test_session_id',
    csrftoken: 'test_csrf_token',
    ds_user_id: '12345678',
    rur: 'FTW',
    mid: 'test_mid',
    ig_did: 'test_ig_did',
  };

  // Sample stored data
  const sampleStoredData: StoredCookieData = {
    cookies: sampleCookies,
    metadata: {
      extractedAt: Date.now(),
      expiresAt: Date.now() + 86400000 * 90,
      username: 'testuser',
      lastValidatedAt: Date.now(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked FileStorage
    const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
    persistence = new CookiePersistence();
    mockFileStorage = (FileStorage as any).mock.results[0]?.value;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const p = new CookiePersistence();
      expect(p).toBeInstanceOf(CookiePersistence);
    });

    it('should create instance with custom config', () => {
      const config: CookiePersistenceConfig = {
        storagePath: '/custom/path',
        defaultExpiryDays: 30,
      };
      const p = new CookiePersistence(config);
      expect(p).toBeInstanceOf(CookiePersistence);
    });
  });

  describe('save', () => {
    it('should save cookies to storage', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[1]?.value;

      await p.save(sampleCookies);

      expect(storage.writeFile).toHaveBeenCalled();
    });

    it('should save with username in filename', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[2]?.value;

      await p.save(sampleCookies, { username: 'testuser' });

      expect(storage.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('testuser'),
        expect.any(String)
      );
    });

    it('should include raw cookies if provided', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[3]?.value;

      const rawCookies = [
        { name: 'sessionid', value: 'val', domain: '.instagram.com', path: '/' },
      ];

      await p.save(sampleCookies, { rawCookies });

      const writeCall = storage.writeFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);
      expect(savedData.rawCookies).toBeDefined();
    });

    it('should use custom expiry if provided', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[4]?.value;

      const customExpiry = Date.now() + 3600000;
      await p.save(sampleCookies, { expiresAt: customExpiry });

      const writeCall = storage.writeFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);
      expect(savedData.metadata.expiresAt).toBe(customExpiry);
    });
  });

  describe('load', () => {
    it('should return null when no cookies exist', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[5]?.value;
      storage.readFile.mockResolvedValue(null);

      const result = await p.load();

      expect(result).toBeNull();
    });

    it('should load and parse stored cookies', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[6]?.value;
      storage.readFile.mockResolvedValue(JSON.stringify(sampleStoredData));

      const result = await p.load();

      expect(result).not.toBeNull();
      expect(result?.cookies.sessionid).toBe(sampleCookies.sessionid);
    });

    it('should load cookies for specific username', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[7]?.value;
      storage.readFile.mockResolvedValue(JSON.stringify(sampleStoredData));

      await p.load('testuser');

      expect(storage.readFile).toHaveBeenCalledWith(
        expect.stringContaining('testuser')
      );
    });

    it('should return null for invalid JSON', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[8]?.value;
      storage.readFile.mockResolvedValue('invalid json');

      const result = await p.load();

      expect(result).toBeNull();
    });

    it('should return null for invalid data structure', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[9]?.value;
      storage.readFile.mockResolvedValue(JSON.stringify({ invalid: 'data' }));

      const result = await p.load();

      expect(result).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true when cookies exist', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[10]?.value;
      storage.exists.mockReturnValue(true);

      const result = p.exists();

      expect(result).toBe(true);
    });

    it('should return false when cookies do not exist', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[11]?.value;
      storage.exists.mockReturnValue(false);

      const result = p.exists();

      expect(result).toBe(false);
    });

    it('should check for specific username', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[12]?.value;

      p.exists('testuser');

      expect(storage.exists).toHaveBeenCalledWith(
        expect.stringContaining('testuser')
      );
    });
  });

  describe('clear', () => {
    it('should delete stored cookies', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[13]?.value;

      await p.clear();

      expect(storage.deleteFile).toHaveBeenCalled();
    });

    it('should delete cookies for specific username', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[14]?.value;

      await p.clear('testuser');

      expect(storage.deleteFile).toHaveBeenCalledWith(
        expect.stringContaining('testuser')
      );
    });
  });

  describe('isExpired', () => {
    it('should return true when no cookies exist', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[15]?.value;
      storage.readFile.mockResolvedValue(null);

      const result = await p.isExpired();

      expect(result).toBe(true);
    });

    it('should return true when cookies are expired', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[16]?.value;
      const expiredData = {
        ...sampleStoredData,
        metadata: {
          ...sampleStoredData.metadata,
          expiresAt: Date.now() - 1000,
        },
      };
      storage.readFile.mockResolvedValue(JSON.stringify(expiredData));

      const result = await p.isExpired();

      expect(result).toBe(true);
    });

    it('should return false when cookies are valid', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[17]?.value;
      storage.readFile.mockResolvedValue(JSON.stringify(sampleStoredData));

      const result = await p.isExpired();

      expect(result).toBe(false);
    });
  });

  describe('needsRefresh', () => {
    it('should return true when no cookies exist', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[18]?.value;
      storage.readFile.mockResolvedValue(null);

      const result = await p.needsRefresh();

      expect(result).toBe(true);
    });

    it('should return true when within refresh threshold', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[19]?.value;
      const almostExpiredData = {
        ...sampleStoredData,
        metadata: {
          ...sampleStoredData.metadata,
          expiresAt: Date.now() + 3600000, // 1 hour
        },
      };
      storage.readFile.mockResolvedValue(JSON.stringify(almostExpiredData));

      const result = await p.needsRefresh('testuser', 24); // 24 hour threshold

      expect(result).toBe(true);
    });

    it('should return false when not within refresh threshold', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[20]?.value;
      storage.readFile.mockResolvedValue(JSON.stringify(sampleStoredData));

      const result = await p.needsRefresh('testuser', 24);

      expect(result).toBe(false);
    });
  });

  describe('updateValidation', () => {
    it('should update lastValidatedAt timestamp', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[21]?.value;
      storage.readFile.mockResolvedValue(JSON.stringify(sampleStoredData));

      await p.updateValidation();

      expect(storage.writeFile).toHaveBeenCalled();
      const writeCall = storage.writeFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);
      expect(savedData.metadata.lastValidatedAt).toBeGreaterThan(0);
    });

    it('should do nothing when no cookies exist', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[22]?.value;
      storage.readFile.mockResolvedValue(null);

      await p.updateValidation();

      expect(storage.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('listAccounts', () => {
    it('should return list of stored accounts', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[23]?.value;
      storage.listFiles.mockReturnValue([
        'instagram_cookies_user1.json',
        'instagram_cookies_user2.json',
        'instagram_cookies.json',
      ]);

      const accounts = p.listAccounts();

      expect(accounts).toContain('user1');
      expect(accounts).toContain('user2');
      expect(accounts).toContain('default');
    });

    it('should return empty array when no accounts', async () => {
      const { FileStorage } = await import('../../../src/services/instagram/persistence/fileStorage');
      const p = new CookiePersistence();
      const storage = (FileStorage as any).mock.results[24]?.value;
      storage.listFiles.mockReturnValue([]);

      const accounts = p.listAccounts();

      expect(accounts).toEqual([]);
    });
  });

  describe('getStoragePath', () => {
    it('should return configured storage path', () => {
      const config: CookiePersistenceConfig = {
        storagePath: '/custom/path/to/cookies',
      };
      const p = new CookiePersistence(config);

      expect(p.getStoragePath()).toBe('/custom/path/to/cookies');
    });
  });

  describe('default instance', () => {
    it('should export default singleton instance', () => {
      expect(cookiePersistence).toBeInstanceOf(CookiePersistence);
    });
  });
});
