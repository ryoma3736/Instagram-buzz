/**
 * ExpiryChecker Unit Tests
 * @module tests/session/expiryChecker.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExpiryChecker } from '../../src/services/instagram/session/expiryChecker.js';
import type { CookieData, SessionData } from '../../src/services/instagram/session/types.js';

describe('ExpiryChecker', () => {
  let checker: ExpiryChecker;

  beforeEach(() => {
    checker = new ExpiryChecker();
  });

  describe('checkSessionExpiry', () => {
    it('should return valid for non-expired session', () => {
      const now = Date.now();
      const session: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
        createdAt: now,
      };

      const result = checker.checkSessionExpiry(session);

      expect(result.isExpired).toBe(false);
      expect(result.needsRefresh).toBe(false);
      expect(result.remainingTime).toBeGreaterThan(0);
    });

    it('should detect expired session', () => {
      const now = Date.now();
      const session: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt: now - 1000, // Already expired
        createdAt: now - 100000,
      };

      const result = checker.checkSessionExpiry(session);

      expect(result.isExpired).toBe(true);
      expect(result.remainingTime).toBe(0);
    });

    it('should detect session needing refresh (within threshold)', () => {
      const now = Date.now();
      const session: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt: now + 12 * 60 * 60 * 1000, // 12 hours (within 24h default threshold)
        createdAt: now,
      };

      const result = checker.checkSessionExpiry(session);

      expect(result.isExpired).toBe(false);
      expect(result.needsRefresh).toBe(true);
    });

    it('should handle session without expiresAt (falsy value means no expiry)', () => {
      const now = Date.now();
      const session: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt: 0, // 0 is falsy - treated as no expiry
        createdAt: now,
      };

      const result = checker.checkSessionExpiry(session);

      // 0 is falsy so treated as no expiry set
      expect(result.isExpired).toBe(false);
      expect(result.expiresAt).toBeNull();
      expect(result.remainingTime).toBe(Infinity);
    });
  });

  describe('getEarliestExpiry', () => {
    it('should find earliest expiry from critical cookies', () => {
      const now = Date.now();
      const earliestExpiry = now + 12 * 60 * 60 * 1000; // 12 hours

      const cookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'abc123',
          domain: '.instagram.com',
          path: '/',
          expires: now + 30 * 24 * 60 * 60 * 1000, // 30 days
        },
        {
          name: 'csrftoken',
          value: 'csrf123',
          domain: '.instagram.com',
          path: '/',
          expires: earliestExpiry, // 12 hours
        },
        {
          name: 'ds_user_id',
          value: '12345',
          domain: '.instagram.com',
          path: '/',
          expires: now + 60 * 24 * 60 * 60 * 1000, // 60 days
        },
      ];

      const result = checker.getEarliestExpiry(cookies);

      expect(result).toEqual(new Date(earliestExpiry));
    });

    it('should return null for empty cookies', () => {
      const result = checker.getEarliestExpiry([]);
      expect(result).toBeNull();
    });

    it('should return null for non-critical cookies only', () => {
      const cookies: CookieData[] = [
        {
          name: 'other_cookie',
          value: 'value',
          domain: '.instagram.com',
          path: '/',
          expires: Date.now() + 1000,
        },
      ];

      const result = checker.getEarliestExpiry(cookies);
      expect(result).toBeNull();
    });

    it('should return null when cookies have no expiry', () => {
      const cookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'abc123',
          domain: '.instagram.com',
          path: '/',
          // No expires
        },
      ];

      const result = checker.getEarliestExpiry(cookies);
      expect(result).toBeNull();
    });
  });

  describe('checkCookiesExpiry', () => {
    it('should check cookies expiry correctly', () => {
      const now = Date.now();
      const cookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'abc123',
          domain: '.instagram.com',
          path: '/',
          expires: now + 30 * 24 * 60 * 60 * 1000,
        },
        {
          name: 'csrftoken',
          value: 'csrf123',
          domain: '.instagram.com',
          path: '/',
          expires: now + 30 * 24 * 60 * 60 * 1000,
        },
        {
          name: 'ds_user_id',
          value: '12345',
          domain: '.instagram.com',
          path: '/',
          expires: now + 30 * 24 * 60 * 60 * 1000,
        },
      ];

      const result = checker.checkCookiesExpiry(cookies);

      expect(result.isExpired).toBe(false);
      expect(result.needsRefresh).toBe(false);
      expect(result.expiresAt).not.toBeNull();
    });

    it('should detect expired cookies', () => {
      const now = Date.now();
      const cookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'abc123',
          domain: '.instagram.com',
          path: '/',
          expires: now - 1000, // Already expired
        },
      ];

      const result = checker.checkCookiesExpiry(cookies);

      expect(result.isExpired).toBe(true);
      expect(result.remainingTime).toBe(0);
    });

    it('should return no expiry for empty cookies', () => {
      const result = checker.checkCookiesExpiry([]);

      expect(result.isExpired).toBe(false);
      expect(result.expiresAt).toBeNull();
      expect(result.remainingTime).toBe(Infinity);
    });
  });

  describe('formatRemainingTime', () => {
    it('should format expired time', () => {
      expect(checker.formatRemainingTime(0)).toBe('期限切れ');
      expect(checker.formatRemainingTime(-1000)).toBe('期限切れ');
    });

    it('should format infinity', () => {
      expect(checker.formatRemainingTime(Infinity)).toBe('期限なし');
    });

    it('should format minutes', () => {
      const result = checker.formatRemainingTime(45 * 60 * 1000);
      expect(result).toBe('45分');
    });

    it('should format hours and minutes', () => {
      const result = checker.formatRemainingTime(5 * 60 * 60 * 1000 + 30 * 60 * 1000);
      expect(result).toMatch(/5時間30分/);
    });

    it('should format days and hours', () => {
      const result = checker.formatRemainingTime(10 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000);
      expect(result).toMatch(/10日5時間/);
    });
  });

  describe('setRefreshThreshold', () => {
    it('should update refresh threshold in milliseconds', () => {
      const now = Date.now();
      const session: SessionData = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 36 * 60 * 60 * 1000, // 36 hours
        createdAt: now,
      };

      // Default 24h threshold - 36h should not need refresh
      let result = checker.checkSessionExpiry(session);
      expect(result.needsRefresh).toBe(false);

      // Set to 48h threshold - now 36h should need refresh
      checker.setRefreshThreshold(48 * 60 * 60 * 1000);
      result = checker.checkSessionExpiry(session);
      expect(result.needsRefresh).toBe(true);
    });
  });

  describe('setRefreshThresholdHours', () => {
    it('should update refresh threshold in hours', () => {
      const now = Date.now();
      const session: SessionData = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 36 * 60 * 60 * 1000, // 36 hours
        createdAt: now,
      };

      // Default 24h threshold - 36h should not need refresh
      let result = checker.checkSessionExpiry(session);
      expect(result.needsRefresh).toBe(false);

      // Set to 48h threshold - now 36h should need refresh
      checker.setRefreshThresholdHours(48);
      result = checker.checkSessionExpiry(session);
      expect(result.needsRefresh).toBe(true);
    });
  });

  describe('custom threshold in constructor', () => {
    it('should respect custom threshold', () => {
      const customChecker = new ExpiryChecker(72 * 60 * 60 * 1000); // 72 hours

      const now = Date.now();
      const session: SessionData = {
        accessToken: 'test',
        tokenType: 'Bearer',
        expiresAt: now + 48 * 60 * 60 * 1000, // 48 hours
        createdAt: now,
      };

      // With 72h threshold, 48h should need refresh
      const result = customChecker.checkSessionExpiry(session);
      expect(result.needsRefresh).toBe(true);
    });
  });
});
