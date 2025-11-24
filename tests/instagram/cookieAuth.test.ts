/**
 * Cookie Authentication Service Tests
 * Tests for Issue #19: Instagram Cookie Authentication
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CookieAuthService, cookieAuthService } from '../../src/services/instagram/cookieAuthService.js';

describe('CookieAuthService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment and service state
    vi.resetModules();
    process.env = { ...originalEnv };
    cookieAuthService.clearCookies();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initialize', () => {
    it('should fail when INSTAGRAM_SESSION_ID is not set', () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      const service = new CookieAuthService();
      const result = service.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toContain('INSTAGRAM_SESSION_ID');
    });

    it('should fail when INSTAGRAM_CSRF_TOKEN is not set', () => {
      process.env.INSTAGRAM_SESSION_ID = 'test_session_id';
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      const service = new CookieAuthService();
      const result = service.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toContain('INSTAGRAM_CSRF_TOKEN');
    });

    it('should succeed with valid cookies', () => {
      process.env.INSTAGRAM_SESSION_ID = '12345678%3Atest_session';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf_token';

      const service = new CookieAuthService();
      const result = service.initialize();

      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();
      expect(result.cookies?.sessionid).toBe('12345678%3Atest_session');
      expect(result.cookies?.csrftoken).toBe('test_csrf_token');
    });

    it('should extract user ID from session ID', () => {
      process.env.INSTAGRAM_SESSION_ID = '12345678%3Atimestamp%3Ahash';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';

      const service = new CookieAuthService();
      const result = service.initialize();

      expect(result.success).toBe(true);
      expect(result.cookies?.ds_user_id).toBe('12345678');
    });

    it('should use provided ds_user_id if available', () => {
      process.env.INSTAGRAM_SESSION_ID = 'session_without_user_id';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';
      process.env.INSTAGRAM_DS_USER_ID = '99999999';

      const service = new CookieAuthService();
      const result = service.initialize();

      expect(result.success).toBe(true);
      expect(result.cookies?.ds_user_id).toBe('99999999');
    });

    it('should use default RUR value', () => {
      process.env.INSTAGRAM_SESSION_ID = '12345678%3Atest';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';

      const service = new CookieAuthService();
      const result = service.initialize();

      expect(result.success).toBe(true);
      expect(result.cookies?.rur).toBe('FTW');
    });

    it('should use custom RUR value if provided', () => {
      process.env.INSTAGRAM_SESSION_ID = '12345678%3Atest';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';
      process.env.INSTAGRAM_RUR = 'CUSTOM_RUR';

      const service = new CookieAuthService();
      const result = service.initialize();

      expect(result.success).toBe(true);
      expect(result.cookies?.rur).toBe('CUSTOM_RUR');
    });
  });

  describe('getCookies', () => {
    it('should auto-initialize when getting cookies', () => {
      process.env.INSTAGRAM_SESSION_ID = '12345678%3Atest';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';

      const service = new CookieAuthService();
      const cookies = service.getCookies();

      expect(cookies).toBeDefined();
      expect(cookies?.sessionid).toBe('12345678%3Atest');
    });

    it('should return null when cookies are not configured', () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      const service = new CookieAuthService();
      const cookies = service.getCookies();

      expect(cookies).toBeNull();
    });
  });

  describe('isConfigured', () => {
    it('should return true when cookies are configured', () => {
      process.env.INSTAGRAM_SESSION_ID = 'test_session';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';

      const service = new CookieAuthService();
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when session ID is missing', () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';

      const service = new CookieAuthService();
      expect(service.isConfigured()).toBe(false);
    });

    it('should return false when csrf token is missing', () => {
      process.env.INSTAGRAM_SESSION_ID = 'test_session';
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      const service = new CookieAuthService();
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('isSessionValid', () => {
    it('should return false when no cookies', () => {
      const service = new CookieAuthService();
      expect(service.isSessionValid()).toBe(false);
    });

    it('should return true when session is not expired', () => {
      process.env.INSTAGRAM_SESSION_ID = '12345678%3Atest';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';

      const service = new CookieAuthService();
      service.initialize();

      expect(service.isSessionValid()).toBe(true);
    });

    it('should return false when session is expired', () => {
      const service = new CookieAuthService();
      service.setCookies({
        sessionid: 'test',
        csrftoken: 'test',
        ds_user_id: '123',
        rur: 'FTW',
        extractedAt: Date.now() - 100 * 24 * 60 * 60 * 1000, // 100 days ago
        expiresAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
      });

      expect(service.isSessionValid()).toBe(false);
    });
  });

  describe('buildCookieHeader', () => {
    it('should return empty string when no cookies', () => {
      const service = new CookieAuthService();
      expect(service.buildCookieHeader()).toBe('');
    });

    it('should build correct cookie header', () => {
      process.env.INSTAGRAM_SESSION_ID = 'session123';
      process.env.INSTAGRAM_CSRF_TOKEN = 'csrf456';
      process.env.INSTAGRAM_DS_USER_ID = '789';
      process.env.INSTAGRAM_RUR = 'RUR123';

      const service = new CookieAuthService();
      service.initialize();

      const header = service.buildCookieHeader();

      expect(header).toContain('sessionid=session123');
      expect(header).toContain('csrftoken=csrf456');
      expect(header).toContain('ds_user_id=789');
      expect(header).toContain('rur=RUR123');
    });
  });

  describe('getSessionRemainingHours', () => {
    it('should return 0 when no cookies', () => {
      const service = new CookieAuthService();
      expect(service.getSessionRemainingHours()).toBe(0);
    });

    it('should return positive hours for valid session', () => {
      process.env.INSTAGRAM_SESSION_ID = '12345678%3Atest';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';

      const service = new CookieAuthService();
      service.initialize();

      const hours = service.getSessionRemainingHours();
      expect(hours).toBeGreaterThan(0);
      expect(hours).toBeLessThanOrEqual(90 * 24); // Max 90 days
    });
  });

  describe('setCookies and clearCookies', () => {
    it('should allow manual cookie setting', () => {
      const service = new CookieAuthService();

      service.setCookies({
        sessionid: 'manual_session',
        csrftoken: 'manual_csrf',
        ds_user_id: '111',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
      });

      const cookies = service.getCookies();
      expect(cookies?.sessionid).toBe('manual_session');
    });

    it('should clear cookies', () => {
      // Set up with cookies that won't auto-reinitialize
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      const service = new CookieAuthService();

      // Manually set cookies
      service.setCookies({
        sessionid: 'test_session',
        csrftoken: 'test_csrf',
        ds_user_id: '123',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
      });

      expect(service.getCookies()).not.toBeNull();

      service.clearCookies();

      // Now getCookies will return null because:
      // 1. Cookies were cleared
      // 2. No env vars to reinitialize from
      expect(service.getCookies()).toBeNull();
    });
  });

  describe('getSetupInstructions', () => {
    it('should return setup instructions', () => {
      const instructions = CookieAuthService.getSetupInstructions();

      expect(instructions).toContain('INSTAGRAM_SESSION_ID');
      expect(instructions).toContain('INSTAGRAM_CSRF_TOKEN');
      expect(instructions).toContain('Developer Tools');
    });
  });
});
