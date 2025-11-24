/**
 * SessionManager Unit Tests
 * @module tests/session/sessionManager.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/services/instagram/session/sessionManager.js';
import type { SessionData, CookieData } from '../../src/services/instagram/session/types.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    sessionManager.stopPeriodicCheck();
    vi.useRealTimers();
  });

  describe('checkValidity', () => {
    it('should return invalid status when no session is set', async () => {
      const status = await sessionManager.checkValidity();

      expect(status.isValid).toBe(false);
      expect(status.expiresAt).toBeNull();
      expect(status.remainingTime).toBe(0);
      expect(status.needsRefresh).toBe(false);
    });

    it('should return valid status for valid session with long expiry', async () => {
      const now = Date.now();
      const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days from now

      const sessionData: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt,
        createdAt: now,
      };

      sessionManager.setSession(sessionData);
      const status = await sessionManager.checkValidity();

      expect(status.isValid).toBe(true);
      expect(status.needsRefresh).toBe(false);
      expect(status.expiresAt).toEqual(new Date(expiresAt));
    });

    it('should return needsRefresh true when session expires within threshold', async () => {
      const now = Date.now();
      const expiresAt = now + 12 * 60 * 60 * 1000; // 12 hours from now (within 24h threshold)

      const sessionData: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt,
        createdAt: now,
      };

      sessionManager.setSession(sessionData);
      const status = await sessionManager.checkValidity();

      expect(status.isValid).toBe(true);
      expect(status.needsRefresh).toBe(true);
    });

    it('should return expired status when session has expired', async () => {
      const now = Date.now();
      const expiresAt = now - 1000; // Already expired

      const sessionData: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt,
        createdAt: now - 24 * 60 * 60 * 1000,
      };

      sessionManager.setSession(sessionData);
      const status = await sessionManager.checkValidity();

      expect(status.isValid).toBe(false);
      expect(status.remainingTime).toBe(0);
    });
  });

  describe('isExpired', () => {
    it('should return true when no session is set', () => {
      expect(sessionManager.isExpired()).toBe(true);
    });

    it('should return false for valid session', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 60000,
        createdAt: now,
      });

      expect(sessionManager.isExpired()).toBe(false);
    });

    it('should return true for expired session', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now - 1000,
        createdAt: now - 120000,
      });

      expect(sessionManager.isExpired()).toBe(true);
    });
  });

  describe('getTimeRemaining', () => {
    it('should return 0 when no session is set', () => {
      expect(sessionManager.getTimeRemaining()).toBe(0);
    });

    it('should return correct remaining time', () => {
      const now = Date.now();
      const expiresAt = now + 3600000; // 1 hour

      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt,
        createdAt: now,
      });

      const remaining = sessionManager.getTimeRemaining();
      expect(remaining).toBeLessThanOrEqual(3600000);
      expect(remaining).toBeGreaterThan(3599000);
    });

    it('should return 0 for expired session', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now - 1000,
        createdAt: now - 120000,
      });

      expect(sessionManager.getTimeRemaining()).toBe(0);
    });
  });

  describe('getFormattedTimeRemaining', () => {
    it('should format days correctly', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 5 * 24 * 60 * 60 * 1000, // 5 days
        createdAt: now,
      });

      const formatted = sessionManager.getFormattedTimeRemaining();
      expect(formatted).toMatch(/\d+日/);
    });

    it('should format hours correctly', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 5 * 60 * 60 * 1000, // 5 hours
        createdAt: now,
      });

      const formatted = sessionManager.getFormattedTimeRemaining();
      expect(formatted).toMatch(/\d+時間/);
    });
  });

  describe('event callbacks', () => {
    it('should call expiringSoon callback when session needs refresh', async () => {
      const callback = vi.fn();
      sessionManager.onExpiringSoon(callback);

      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 12 * 60 * 60 * 1000, // 12 hours (within refresh threshold)
        createdAt: now,
      });

      await sessionManager.checkValidity();

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].needsRefresh).toBe(true);
    });

    it('should call sessionInvalid callback when session is expired', async () => {
      const callback = vi.fn();
      sessionManager.onSessionInvalid(callback);

      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now - 1000,
        createdAt: now - 120000,
      });

      await sessionManager.checkValidity();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('clearSession', () => {
    it('should clear the session', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 3600000,
        createdAt: now,
      });

      expect(sessionManager.isExpired()).toBe(false);

      sessionManager.clearSession();

      expect(sessionManager.isExpired()).toBe(true);
      expect(sessionManager.getTimeRemaining()).toBe(0);
    });
  });

  describe('setCookies', () => {
    it('should set session from cookies', () => {
      const now = Date.now();
      const cookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'session123',
          domain: '.instagram.com',
          path: '/',
          expires: now + 30 * 24 * 60 * 60 * 1000,
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

      const session = sessionManager.getSession();
      expect(session).not.toBeNull();
      expect(session?.accessToken).toBe('session123');
      expect(session?.cookies).toHaveLength(3);
    });
  });

  describe('getSummary', () => {
    it('should return no session message when no session', () => {
      expect(sessionManager.getSummary()).toBe('セッションなし');
    });

    it('should return valid status for healthy session', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        createdAt: now,
      });

      const summary = sessionManager.getSummary();
      expect(summary).toContain('有効');
    });

    it('should return refresh warning for expiring session', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 12 * 60 * 60 * 1000, // 12 hours
        createdAt: now,
      });

      const summary = sessionManager.getSummary();
      expect(summary).toContain('要リフレッシュ');
    });

    it('should return expired status for expired session', () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now - 1000,
        createdAt: now - 120000,
      });

      const summary = sessionManager.getSummary();
      expect(summary).toContain('期限切れ');
    });
  });

  describe('updateConfig', () => {
    it('should update refresh threshold', async () => {
      const now = Date.now();
      sessionManager.setSession({
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 48 * 60 * 60 * 1000, // 48 hours
        createdAt: now,
      });

      // Default threshold is 24h, so 48h should not need refresh
      let status = await sessionManager.checkValidity();
      expect(status.needsRefresh).toBe(false);

      // Update threshold to 72h
      sessionManager.updateConfig({ refreshThreshold: 72 });

      // Now 48h should need refresh
      status = await sessionManager.checkValidity();
      expect(status.needsRefresh).toBe(true);
    });
  });
});
