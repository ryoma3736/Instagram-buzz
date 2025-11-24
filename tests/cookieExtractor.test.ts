/**
 * Cookie Extractor Tests
 * @module tests/cookieExtractor.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractInstagramCookies,
  validateCookies,
  cookiesToCookieData,
  parseCookieString,
  getCookieRemainingTime,
  shouldRefreshCookies,
} from '../src/services/instagram/cookieExtractor.js';
import { CookieData, InstagramCookies } from '../src/services/instagram/session/types.js';

describe('CookieExtractor', () => {
  describe('extractInstagramCookies', () => {
    it('should successfully extract all required cookies', () => {
      const rawCookies: CookieData[] = [
        { name: 'sessionid', value: 'test-session-id', domain: '.instagram.com', path: '/' },
        { name: 'csrftoken', value: 'test-csrf-token', domain: '.instagram.com', path: '/' },
        { name: 'ds_user_id', value: '12345678', domain: '.instagram.com', path: '/' },
        { name: 'rur', value: 'FTW', domain: '.instagram.com', path: '/' },
        { name: 'other_cookie', value: 'other_value', domain: '.instagram.com', path: '/' },
      ];

      const result = extractInstagramCookies(rawCookies);

      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();
      expect(result.cookies?.sessionid).toBe('test-session-id');
      expect(result.cookies?.csrftoken).toBe('test-csrf-token');
      expect(result.cookies?.ds_user_id).toBe('12345678');
      expect(result.cookies?.rur).toBe('FTW');
      expect(result.cookies?.extractedAt).toBeDefined();
      expect(result.cookies?.expiresAt).toBeDefined();
    });

    it('should fail when missing required cookies', () => {
      const rawCookies: CookieData[] = [
        { name: 'sessionid', value: 'test-session-id', domain: '.instagram.com', path: '/' },
        { name: 'csrftoken', value: 'test-csrf-token', domain: '.instagram.com', path: '/' },
        // Missing ds_user_id and rur
      ];

      const result = extractInstagramCookies(rawCookies);

      expect(result.success).toBe(false);
      expect(result.missingCookies).toContain('ds_user_id');
      expect(result.missingCookies).toContain('rur');
      expect(result.error).toBeDefined();
    });

    it('should filter cookies by Instagram domain', () => {
      const rawCookies: CookieData[] = [
        { name: 'sessionid', value: 'test-session-id', domain: '.instagram.com', path: '/' },
        { name: 'csrftoken', value: 'test-csrf-token', domain: 'instagram.com', path: '/' },
        { name: 'ds_user_id', value: '12345678', domain: 'www.instagram.com', path: '/' },
        { name: 'rur', value: 'FTW', domain: '.instagram.com', path: '/' },
        { name: 'other_cookie', value: 'value', domain: '.facebook.com', path: '/' },
      ];

      const result = extractInstagramCookies(rawCookies);

      expect(result.success).toBe(true);
      expect(result.rawCookies?.length).toBe(4); // Only Instagram cookies
    });

    it('should use cookie expiry time if available', () => {
      const futureExpiry = Date.now() + 60 * 24 * 60 * 60 * 1000; // 60 days
      const rawCookies: CookieData[] = [
        { name: 'sessionid', value: 'test-session-id', domain: '.instagram.com', path: '/', expires: futureExpiry },
        { name: 'csrftoken', value: 'test-csrf-token', domain: '.instagram.com', path: '/' },
        { name: 'ds_user_id', value: '12345678', domain: '.instagram.com', path: '/' },
        { name: 'rur', value: 'FTW', domain: '.instagram.com', path: '/' },
      ];

      const result = extractInstagramCookies(rawCookies);

      expect(result.success).toBe(true);
      expect(result.cookies?.expiresAt).toBe(futureExpiry);
    });
  });

  describe('validateCookies', () => {
    it('should return true for valid non-expired cookies', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000, // 24 hours from now
      };

      expect(validateCookies(cookies)).toBe(true);
    });

    it('should return false for expired cookies', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now() - 86400000, // 24 hours ago
        expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
      };

      expect(validateCookies(cookies)).toBe(false);
    });

    it('should return false for cookies with empty required fields', () => {
      const cookies: InstagramCookies = {
        sessionid: '',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      expect(validateCookies(cookies)).toBe(false);
    });

    it('should return false for cookies with whitespace-only fields', () => {
      const cookies: InstagramCookies = {
        sessionid: '   ',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      expect(validateCookies(cookies)).toBe(false);
    });
  });

  describe('cookiesToCookieData', () => {
    it('should convert InstagramCookies to CookieData array', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      const cookieData = cookiesToCookieData(cookies);

      expect(cookieData).toHaveLength(4);
      expect(cookieData.find(c => c.name === 'sessionid')?.value).toBe('test-session-id');
      expect(cookieData.find(c => c.name === 'csrftoken')?.value).toBe('test-csrf-token');
      expect(cookieData.find(c => c.name === 'ds_user_id')?.value).toBe('12345678');
      expect(cookieData.find(c => c.name === 'rur')?.value).toBe('FTW');
    });

    it('should set correct cookie attributes', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test-session-id',
        csrftoken: 'test-csrf-token',
        ds_user_id: '12345678',
        rur: 'FTW',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      const cookieData = cookiesToCookieData(cookies);

      // All cookies should have correct domain
      cookieData.forEach(c => {
        expect(c.domain).toBe('.instagram.com');
        expect(c.path).toBe('/');
        expect(c.secure).toBe(true);
        expect(c.sameSite).toBe('Lax');
      });

      // csrftoken should not be httpOnly (needs to be accessible by JavaScript)
      const csrfCookie = cookieData.find(c => c.name === 'csrftoken');
      expect(csrfCookie?.httpOnly).toBe(false);

      // Other cookies should be httpOnly
      const sessionCookie = cookieData.find(c => c.name === 'sessionid');
      expect(sessionCookie?.httpOnly).toBe(true);
    });
  });

  describe('parseCookieString', () => {
    it('should parse a simple cookie string', () => {
      const cookieString = 'sessionid=abc123';
      const result = parseCookieString(cookieString);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('sessionid');
      expect(result?.value).toBe('abc123');
    });

    it('should parse cookie with attributes', () => {
      const cookieString = 'sessionid=abc123; Domain=.instagram.com; Path=/; HttpOnly; Secure; SameSite=Lax';
      const result = parseCookieString(cookieString);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('sessionid');
      expect(result?.value).toBe('abc123');
      expect(result?.domain).toBe('.instagram.com');
      expect(result?.path).toBe('/');
      expect(result?.httpOnly).toBe(true);
      expect(result?.secure).toBe(true);
    });

    it('should parse cookie with expires attribute', () => {
      const futureDate = new Date(Date.now() + 86400000).toUTCString();
      const cookieString = `sessionid=abc123; Expires=${futureDate}`;
      const result = parseCookieString(cookieString);

      expect(result).not.toBeNull();
      expect(result?.expires).toBeDefined();
      expect(result?.expires).toBeGreaterThan(Date.now());
    });

    it('should parse cookie with max-age attribute', () => {
      const cookieString = 'sessionid=abc123; Max-Age=3600';
      const before = Date.now();
      const result = parseCookieString(cookieString);
      const after = Date.now();

      expect(result).not.toBeNull();
      expect(result?.expires).toBeDefined();
      expect(result?.expires).toBeGreaterThanOrEqual(before + 3600000);
      expect(result?.expires).toBeLessThanOrEqual(after + 3600000);
    });

    it('should return null for invalid cookie string', () => {
      expect(parseCookieString('')).toBeNull();
      expect(parseCookieString('invalid')).toBeNull();
    });
  });

  describe('getCookieRemainingTime', () => {
    it('should return positive remaining time for valid cookies', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test',
        csrftoken: 'test',
        ds_user_id: 'test',
        rur: 'test',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000, // 24 hours
      };

      const remaining = getCookieRemainingTime(cookies);

      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(86400000);
    });

    it('should return 0 for expired cookies', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test',
        csrftoken: 'test',
        ds_user_id: 'test',
        rur: 'test',
        extractedAt: Date.now() - 86400000,
        expiresAt: Date.now() - 3600000, // Expired 1 hour ago
      };

      expect(getCookieRemainingTime(cookies)).toBe(0);
    });
  });

  describe('shouldRefreshCookies', () => {
    it('should return false when cookies are not near expiry', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test',
        csrftoken: 'test',
        ds_user_id: 'test',
        rur: 'test',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      };

      expect(shouldRefreshCookies(cookies, 24)).toBe(false);
    });

    it('should return true when cookies are near expiry', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test',
        csrftoken: 'test',
        ds_user_id: 'test',
        rur: 'test',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
      };

      expect(shouldRefreshCookies(cookies, 24)).toBe(true);
    });

    it('should return true for expired cookies', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test',
        csrftoken: 'test',
        ds_user_id: 'test',
        rur: 'test',
        extractedAt: Date.now() - 86400000,
        expiresAt: Date.now() - 3600000,
      };

      expect(shouldRefreshCookies(cookies, 24)).toBe(true);
    });

    it('should use custom threshold', () => {
      const cookies: InstagramCookies = {
        sessionid: 'test',
        csrftoken: 'test',
        ds_user_id: 'test',
        rur: 'test',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 48 * 60 * 60 * 1000, // 48 hours
      };

      expect(shouldRefreshCookies(cookies, 24)).toBe(false);
      expect(shouldRefreshCookies(cookies, 72)).toBe(true);
    });
  });
});
