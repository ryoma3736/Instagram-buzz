/**
 * Session Management Flow Integration Tests
 * Tests: Cookie loading -> Session validation -> API calls
 * @module tests/integration/sessionFlow.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/services/instagram/session/sessionManager.js';
import { SessionRefresher } from '../../src/services/instagram/session/sessionRefresher.js';
import {
  validateCookies,
  getCookieRemainingTime,
  shouldRefreshCookies,
} from '../../src/services/instagram/cookieExtractor.js';
import type {
  SessionData,
  CookieData,
  InstagramCookies,
} from '../../src/services/instagram/session/types.js';

// Mock fs for session storage
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('Session Management Flow Integration', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    sessionManager.destroy();
    vi.useRealTimers();
  });

  describe('Complete Session Lifecycle', () => {
    it('should manage session from creation to expiry', async () => {
      const now = Date.now();

      // Step 1: Create new session from cookies
      const cookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'session123',
          domain: '.instagram.com',
          path: '/',
          expires: now + 30 * 24 * 60 * 60 * 1000, // 30 days
        },
        {
          name: 'csrftoken',
          value: 'csrf456',
          domain: '.instagram.com',
          path: '/',
          expires: now + 30 * 24 * 60 * 60 * 1000,
        },
        {
          name: 'ds_user_id',
          value: '789',
          domain: '.instagram.com',
          path: '/',
          expires: now + 30 * 24 * 60 * 60 * 1000,
        },
      ];

      sessionManager.setCookies(cookies);

      // Step 2: Verify session is valid
      const status = sessionManager.getStatus();
      expect(status.isValid).toBe(true);
      expect(status.needsRefresh).toBe(false);
      expect(status.health).toBe('healthy');

      // Step 3: Check remaining time
      const remaining = sessionManager.getTimeRemaining();
      expect(remaining).toBeGreaterThan(0);

      // Step 4: Session should not be expired
      expect(sessionManager.isExpired()).toBe(false);

      // Step 5: Advance time to near expiry
      vi.advanceTimersByTime(29 * 24 * 60 * 60 * 1000); // 29 days

      const statusNearExpiry = sessionManager.getStatus();
      expect(statusNearExpiry.needsRefresh).toBe(true);
      expect(statusNearExpiry.health).toBe('warning');

      // Step 6: Advance past expiry
      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000); // 2 more days

      expect(sessionManager.isExpired()).toBe(true);
      const expiredStatus = sessionManager.getStatus();
      expect(expiredStatus.isValid).toBe(false);
      expect(expiredStatus.health).toBe('expired');
    });

    it('should trigger callbacks at appropriate times', async () => {
      const now = Date.now();
      const expiringSoonCallback = vi.fn();
      const sessionInvalidCallback = vi.fn();

      sessionManager.onExpiringSoon(expiringSoonCallback);
      sessionManager.onSessionInvalid(sessionInvalidCallback);

      // Create session expiring in 12 hours (within 24h threshold)
      const sessionData: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt: now + 12 * 60 * 60 * 1000,
        createdAt: now,
      };

      sessionManager.setSession(sessionData);

      // Check validity should trigger expiringSoon
      await sessionManager.checkValidity();
      expect(expiringSoonCallback).toHaveBeenCalled();

      // Now create an expired session
      const expiredSession: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt: now - 1000,
        createdAt: now - 86400000,
      };

      sessionManager.setSession(expiredSession);
      await sessionManager.checkValidity();

      expect(sessionInvalidCallback).toHaveBeenCalled();
    });
  });

  describe('Cookie Validation Integration', () => {
    it('should validate cookies end-to-end', () => {
      const now = Date.now();

      // Valid cookies
      const validCookies: InstagramCookies = {
        sessionid: 'valid-session',
        csrftoken: 'valid-csrf',
        ds_user_id: 'valid-user',
        rur: 'FTW',
        extractedAt: now,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
      };

      expect(validateCookies(validCookies)).toBe(true);
      expect(getCookieRemainingTime(validCookies)).toBeGreaterThan(0);
      expect(shouldRefreshCookies(validCookies, 24)).toBe(false);

      // Cookies near expiry
      const nearExpiryCookies: InstagramCookies = {
        ...validCookies,
        expiresAt: now + 12 * 60 * 60 * 1000, // 12 hours
      };

      expect(validateCookies(nearExpiryCookies)).toBe(true);
      expect(shouldRefreshCookies(nearExpiryCookies, 24)).toBe(true);

      // Expired cookies
      const expiredCookies: InstagramCookies = {
        ...validCookies,
        expiresAt: now - 1000,
      };

      expect(validateCookies(expiredCookies)).toBe(false);
      expect(getCookieRemainingTime(expiredCookies)).toBe(0);
    });
  });

  describe('Session Summary Display', () => {
    it('should provide accurate status summaries', () => {
      const now = Date.now();

      // No session
      expect(sessionManager.getSummary()).toBe('セッションなし');

      // Healthy session
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        createdAt: now,
      });
      expect(sessionManager.getSummary()).toContain('有効');

      // Session needing refresh
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 12 * 60 * 60 * 1000,
        createdAt: now,
      });
      expect(sessionManager.getSummary()).toContain('要リフレッシュ');

      // Expired session
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now - 1000,
        createdAt: now - 86400000,
      });
      expect(sessionManager.getSummary()).toContain('期限切れ');
    });
  });

  describe('Configuration Updates', () => {
    it('should respond to threshold configuration changes', async () => {
      const now = Date.now();

      // Session expiring in 48 hours
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 48 * 60 * 60 * 1000,
        createdAt: now,
      });

      // Default 24h threshold - should not need refresh
      let status = await sessionManager.checkValidity();
      expect(status.needsRefresh).toBe(false);

      // Update threshold to 72h - should now need refresh
      sessionManager.updateConfig({ refreshThreshold: 72 });
      status = await sessionManager.checkValidity();
      expect(status.needsRefresh).toBe(true);
    });
  });
});

describe('Session Refresher Integration', () => {
  describe('Refresh Scheduling', () => {
    it('should integrate with SessionManager for scheduling', () => {
      const refresher = new SessionRefresher({
        refreshThreshold: 24,
        maxRetries: 3,
      });

      const manager = refresher.getSessionManager();
      expect(manager).toBeDefined();
      expect(typeof manager.getStatus).toBe('function');

      refresher.destroy();
    });

    it('should respect refresh status states', () => {
      const refresher = new SessionRefresher();

      // Initial state
      expect(refresher.getStatus()).toBe('idle');

      // After cancellation
      refresher.cancelScheduled();
      expect(refresher.getStatus()).toBe('idle');

      refresher.destroy();
    });
  });
});
