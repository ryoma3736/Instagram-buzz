/**
 * SessionValidator Unit Tests
 * @module tests/session/sessionValidator.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionValidator } from '../../src/services/instagram/session/sessionValidator.js';
import type { CookieData, SessionData } from '../../src/services/instagram/session/types.js';

describe('SessionValidator', () => {
  let validator: SessionValidator;

  beforeEach(() => {
    validator = new SessionValidator();
  });

  const createValidCookies = (): CookieData[] => {
    return [
      {
        name: 'sessionid',
        value: 'session123456789',
        domain: '.instagram.com',
        path: '/',
      },
      {
        name: 'csrftoken',
        value: 'csrf123456789',
        domain: '.instagram.com',
        path: '/',
      },
      {
        name: 'ds_user_id',
        value: '1234567890',
        domain: '.instagram.com',
        path: '/',
      },
    ];
  };

  const createValidSession = (): SessionData => {
    const now = Date.now();
    return {
      accessToken: 'test-token',
      tokenType: 'Bearer',
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      createdAt: now,
      cookies: createValidCookies(),
    };
  };

  describe('validateSession', () => {
    it('should return invalid when no cookies are set', async () => {
      const session: SessionData = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 1000,
        createdAt: Date.now(),
        cookies: [],
      };

      const result = await validator.validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Cookie');
    });

    it('should return invalid when cookies is undefined', async () => {
      const session: SessionData = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 1000,
        createdAt: Date.now(),
      };

      const result = await validator.validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Cookie');
    });

    it('should return invalid when sessionid is missing', async () => {
      const session = createValidSession();
      session.cookies = session.cookies!.filter((c) => c.name !== 'sessionid');

      const result = await validator.validateSession(session);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('sessionid');
    });

    it('should call validateCookies for valid session', async () => {
      const session = createValidSession();

      // Mock fetch to simulate network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await validator.validateSession(session);

      expect(result.checkedAt).toBeInstanceOf(Date);
    });
  });

  describe('validateCookies', () => {
    it('should handle successful API response', async () => {
      const cookies = createValidCookies();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await validator.validateCookies(cookies);

      expect(result.isValid).toBe(true);
      expect(result.userId).toBe('1234567890');
    });

    it('should handle 401 response as invalid session', async () => {
      const cookies = createValidCookies();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await validator.validateCookies(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('認証エラー');
    });

    it('should handle 403 response as invalid session', async () => {
      const cookies = createValidCookies();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await validator.validateCookies(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('認証エラー');
    });

    it('should handle 429 response as rate limited', async () => {
      const cookies = createValidCookies();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await validator.validateCookies(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('レート制限');
    });

    it('should handle other HTTP errors', async () => {
      const cookies = createValidCookies();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await validator.validateCookies(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('APIエラー');
    });

    it('should handle network errors', async () => {
      const cookies = createValidCookies();

      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const result = await validator.validateCookies(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('検証エラー');
    });
  });

  describe('validateCookiePresence', () => {
    it('should return valid when all required cookies are present', () => {
      const cookies = createValidCookies();

      const result = validator.validateCookiePresence(cookies);

      expect(result.isValid).toBe(true);
      expect(result.userId).toBe('1234567890');
    });

    it('should return invalid when sessionid is missing', () => {
      const cookies = createValidCookies().filter((c) => c.name !== 'sessionid');

      const result = validator.validateCookiePresence(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('sessionid');
    });

    it('should return invalid when csrftoken is missing', () => {
      const cookies = createValidCookies().filter((c) => c.name !== 'csrftoken');

      const result = validator.validateCookiePresence(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('csrftoken');
    });

    it('should return invalid when ds_user_id is missing', () => {
      const cookies = createValidCookies().filter((c) => c.name !== 'ds_user_id');

      const result = validator.validateCookiePresence(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('ds_user_id');
    });

    it('should return invalid when multiple cookies are missing', () => {
      const cookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'session123',
          domain: '.instagram.com',
          path: '/',
        },
      ];

      const result = validator.validateCookiePresence(cookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('csrftoken');
      expect(result.reason).toContain('ds_user_id');
    });
  });

  describe('quickCheck', () => {
    it('should return true for valid session', () => {
      const session = createValidSession();

      expect(validator.quickCheck(session)).toBe(true);
    });

    it('should return false when no cookies', () => {
      const session: SessionData = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 1000,
        createdAt: Date.now(),
        cookies: [],
      };

      expect(validator.quickCheck(session)).toBe(false);
    });

    it('should return false when cookies is undefined', () => {
      const session: SessionData = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 1000,
        createdAt: Date.now(),
      };

      expect(validator.quickCheck(session)).toBe(false);
    });

    it('should return false when required cookie is missing', () => {
      const session = createValidSession();
      session.cookies = session.cookies!.filter((c) => c.name !== 'sessionid');

      expect(validator.quickCheck(session)).toBe(false);
    });
  });

  describe('checkedAt timestamp', () => {
    it('should include timestamp in validateSession result', async () => {
      const session = createValidSession();

      const before = new Date();
      const result = await validator.validateSession(session);
      const after = new Date();

      expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include timestamp in validateCookiePresence result', () => {
      const cookies = createValidCookies();

      const before = new Date();
      const result = validator.validateCookiePresence(cookies);
      const after = new Date();

      expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
