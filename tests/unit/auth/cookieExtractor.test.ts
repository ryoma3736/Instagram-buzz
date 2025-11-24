/**
 * CookieExtractor Unit Tests
 * @module tests/unit/auth/cookieExtractor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractInstagramCookies,
  validateCookies,
  cookiesToCookieData,
  parseCookieString,
  getCookieRemainingTime,
  shouldRefreshCookies,
  CookieExtractionResult,
} from '../../../src/services/instagram/cookieExtractor.js';
import type { CookieData, InstagramCookies } from '../../../src/services/instagram/session/types.js';

describe('CookieExtractor', () => {
  // Sample valid cookies
  const validRawCookies: CookieData[] = [
    {
      name: 'sessionid',
      value: 'test_session_id_123',
      domain: '.instagram.com',
      path: '/',
      expires: Date.now() + 86400000 * 90, // 90 days
      httpOnly: true,
      secure: true,
    },
    {
      name: 'csrftoken',
      value: 'test_csrf_token_456',
      domain: '.instagram.com',
      path: '/',
      expires: Date.now() + 86400000 * 365,
      httpOnly: false,
      secure: true,
    },
    {
      name: 'ds_user_id',
      value: '12345678901',
      domain: '.instagram.com',
      path: '/',
      expires: Date.now() + 86400000 * 90,
      httpOnly: true,
      secure: true,
    },
    {
      name: 'rur',
      value: 'FTW',
      domain: '.instagram.com',
      path: '/',
      expires: Date.now() + 86400000,
      httpOnly: true,
      secure: true,
    },
  ];

  // Sample valid InstagramCookies
  const validCookies: InstagramCookies = {
    sessionid: 'test_session_id_123',
    csrftoken: 'test_csrf_token_456',
    ds_user_id: '12345678901',
    rur: 'FTW',
    extractedAt: Date.now(),
    expiresAt: Date.now() + 86400000 * 90,
  };

  describe('extractInstagramCookies', () => {
    it('should extract valid Instagram cookies', () => {
      const result = extractInstagramCookies(validRawCookies);

      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();
      expect(result.cookies?.sessionid).toBe('test_session_id_123');
      expect(result.cookies?.csrftoken).toBe('test_csrf_token_456');
      expect(result.cookies?.ds_user_id).toBe('12345678901');
      expect(result.cookies?.rur).toBe('FTW');
    });

    it('should filter cookies by Instagram domain', () => {
      const mixedCookies: CookieData[] = [
        ...validRawCookies,
        {
          name: 'other_cookie',
          value: 'other_value',
          domain: '.google.com',
          path: '/',
        },
      ];

      const result = extractInstagramCookies(mixedCookies);

      expect(result.success).toBe(true);
      expect(result.rawCookies?.length).toBe(4);
    });

    it('should accept various Instagram domain formats', () => {
      const domainVariants: CookieData[] = [
        { name: 'sessionid', value: 'val1', domain: '.instagram.com', path: '/' },
        { name: 'csrftoken', value: 'val2', domain: 'instagram.com', path: '/' },
        { name: 'ds_user_id', value: 'val3', domain: 'www.instagram.com', path: '/' },
        { name: 'rur', value: 'val4', domain: '.instagram.com', path: '/' },
      ];

      const result = extractInstagramCookies(domainVariants);

      expect(result.success).toBe(true);
    });

    it('should return error when required cookies are missing', () => {
      const incompleteCookies: CookieData[] = [
        { name: 'sessionid', value: 'val', domain: '.instagram.com', path: '/' },
        // Missing csrftoken, ds_user_id, rur
      ];

      const result = extractInstagramCookies(incompleteCookies);

      expect(result.success).toBe(false);
      expect(result.missingCookies).toBeDefined();
      expect(result.missingCookies?.length).toBeGreaterThan(0);
      expect(result.error).toContain('Missing required cookies');
    });

    it('should include extractedAt timestamp', () => {
      const result = extractInstagramCookies(validRawCookies);

      expect(result.success).toBe(true);
      expect(result.cookies?.extractedAt).toBeDefined();
      expect(result.cookies?.extractedAt).toBeGreaterThan(0);
    });

    it('should use session cookie expiry for expiresAt', () => {
      const result = extractInstagramCookies(validRawCookies);

      expect(result.success).toBe(true);
      expect(result.cookies?.expiresAt).toBeDefined();
      expect(result.cookies?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should use default expiry when cookie has no expires', () => {
      const cookiesWithoutExpiry: CookieData[] = [
        { name: 'sessionid', value: 'val1', domain: '.instagram.com', path: '/' },
        { name: 'csrftoken', value: 'val2', domain: '.instagram.com', path: '/' },
        { name: 'ds_user_id', value: 'val3', domain: '.instagram.com', path: '/' },
        { name: 'rur', value: 'val4', domain: '.instagram.com', path: '/' },
      ];

      const result = extractInstagramCookies(cookiesWithoutExpiry);

      expect(result.success).toBe(true);
      expect(result.cookies?.expiresAt).toBeDefined();
    });

    it('should include raw cookies in result', () => {
      const result = extractInstagramCookies(validRawCookies);

      expect(result.rawCookies).toBeDefined();
      expect(result.rawCookies?.length).toBe(4);
    });
  });

  describe('validateCookies', () => {
    it('should return true for valid non-expired cookies', () => {
      const isValid = validateCookies(validCookies);
      expect(isValid).toBe(true);
    });

    it('should return false for expired cookies', () => {
      const expiredCookies: InstagramCookies = {
        ...validCookies,
        expiresAt: Date.now() - 1000, // Expired
      };

      const isValid = validateCookies(expiredCookies);
      expect(isValid).toBe(false);
    });

    it('should return false when required fields are empty', () => {
      const emptyCookies: InstagramCookies = {
        ...validCookies,
        sessionid: '',
      };

      const isValid = validateCookies(emptyCookies);
      expect(isValid).toBe(false);
    });

    it('should return false when required fields are whitespace only', () => {
      const whitespaceCookies: InstagramCookies = {
        ...validCookies,
        csrftoken: '   ',
      };

      const isValid = validateCookies(whitespaceCookies);
      expect(isValid).toBe(false);
    });
  });

  describe('cookiesToCookieData', () => {
    it('should convert InstagramCookies to CookieData array', () => {
      const cookieData = cookiesToCookieData(validCookies);

      expect(Array.isArray(cookieData)).toBe(true);
      expect(cookieData.length).toBe(4);
    });

    it('should include all required cookies', () => {
      const cookieData = cookiesToCookieData(validCookies);
      const names = cookieData.map(c => c.name);

      expect(names).toContain('sessionid');
      expect(names).toContain('csrftoken');
      expect(names).toContain('ds_user_id');
      expect(names).toContain('rur');
    });

    it('should set correct domain for all cookies', () => {
      const cookieData = cookiesToCookieData(validCookies);

      cookieData.forEach(cookie => {
        expect(cookie.domain).toBe('.instagram.com');
      });
    });

    it('should set correct security attributes', () => {
      const cookieData = cookiesToCookieData(validCookies);

      cookieData.forEach(cookie => {
        expect(cookie.secure).toBe(true);
        expect(cookie.path).toBe('/');
        expect(cookie.sameSite).toBe('Lax');
      });
    });

    it('should set csrftoken as non-httpOnly', () => {
      const cookieData = cookiesToCookieData(validCookies);
      const csrfCookie = cookieData.find(c => c.name === 'csrftoken');

      expect(csrfCookie?.httpOnly).toBe(false);
    });

    it('should set other cookies as httpOnly', () => {
      const cookieData = cookiesToCookieData(validCookies);
      const otherCookies = cookieData.filter(c => c.name !== 'csrftoken');

      otherCookies.forEach(cookie => {
        expect(cookie.httpOnly).toBe(true);
      });
    });

    it('should use expiresAt for cookie expiry', () => {
      const cookieData = cookiesToCookieData(validCookies);

      cookieData.forEach(cookie => {
        expect(cookie.expires).toBe(validCookies.expiresAt);
      });
    });
  });

  describe('parseCookieString', () => {
    it('should parse simple cookie string', () => {
      const cookieString = 'sessionid=abc123';
      const cookie = parseCookieString(cookieString);

      expect(cookie).not.toBeNull();
      expect(cookie?.name).toBe('sessionid');
      expect(cookie?.value).toBe('abc123');
    });

    it('should parse cookie with domain attribute', () => {
      const cookieString = 'sessionid=abc123; Domain=.instagram.com';
      const cookie = parseCookieString(cookieString);

      expect(cookie?.domain).toBe('.instagram.com');
    });

    it('should parse cookie with path attribute', () => {
      const cookieString = 'sessionid=abc123; Path=/api';
      const cookie = parseCookieString(cookieString);

      expect(cookie?.path).toBe('/api');
    });

    it('should parse cookie with expires attribute', () => {
      const futureDate = new Date(Date.now() + 86400000).toUTCString();
      const cookieString = `sessionid=abc123; Expires=${futureDate}`;
      const cookie = parseCookieString(cookieString);

      expect(cookie?.expires).toBeDefined();
      expect(cookie?.expires).toBeGreaterThan(Date.now());
    });

    it('should parse cookie with Max-Age attribute', () => {
      const cookieString = 'sessionid=abc123; Max-Age=3600';
      const cookie = parseCookieString(cookieString);

      expect(cookie?.expires).toBeDefined();
      expect(cookie?.expires).toBeGreaterThan(Date.now());
    });

    it('should parse HttpOnly attribute', () => {
      const cookieString = 'sessionid=abc123; HttpOnly';
      const cookie = parseCookieString(cookieString);

      expect(cookie?.httpOnly).toBe(true);
    });

    it('should parse Secure attribute', () => {
      const cookieString = 'sessionid=abc123; Secure';
      const cookie = parseCookieString(cookieString);

      expect(cookie?.secure).toBe(true);
    });

    it('should parse SameSite attribute', () => {
      const strictCookie = parseCookieString('test=val; SameSite=Strict');
      const laxCookie = parseCookieString('test=val; SameSite=Lax');
      const noneCookie = parseCookieString('test=val; SameSite=None');

      expect(strictCookie?.sameSite).toBe('Strict');
      expect(laxCookie?.sameSite).toBe('Lax');
      expect(noneCookie?.sameSite).toBe('None');
    });

    it('should return null for empty string', () => {
      const cookie = parseCookieString('');
      expect(cookie).toBeNull();
    });

    it('should return null for invalid format', () => {
      const cookie = parseCookieString('invalidcookieformat');
      expect(cookie).toBeNull();
    });

    it('should handle cookie values with equals sign', () => {
      const cookieString = 'token=abc=def=123';
      const cookie = parseCookieString(cookieString);

      expect(cookie?.name).toBe('token');
      expect(cookie?.value).toBe('abc=def=123');
    });
  });

  describe('getCookieRemainingTime', () => {
    it('should return positive time for valid cookies', () => {
      const remaining = getCookieRemainingTime(validCookies);
      expect(remaining).toBeGreaterThan(0);
    });

    it('should return 0 for expired cookies', () => {
      const expiredCookies: InstagramCookies = {
        ...validCookies,
        expiresAt: Date.now() - 1000,
      };

      const remaining = getCookieRemainingTime(expiredCookies);
      expect(remaining).toBe(0);
    });

    it('should return correct approximate remaining time', () => {
      const oneDayFromNow: InstagramCookies = {
        ...validCookies,
        expiresAt: Date.now() + 86400000, // 1 day
      };

      const remaining = getCookieRemainingTime(oneDayFromNow);
      // Allow for some execution time variance
      expect(remaining).toBeGreaterThan(86400000 - 1000);
      expect(remaining).toBeLessThanOrEqual(86400000);
    });
  });

  describe('shouldRefreshCookies', () => {
    it('should return false for cookies with lots of time remaining', () => {
      const shouldRefresh = shouldRefreshCookies(validCookies);
      expect(shouldRefresh).toBe(false);
    });

    it('should return true for cookies within threshold', () => {
      const almostExpired: InstagramCookies = {
        ...validCookies,
        expiresAt: Date.now() + 3600000, // 1 hour
      };

      const shouldRefresh = shouldRefreshCookies(almostExpired, 24); // 24 hour threshold
      expect(shouldRefresh).toBe(true);
    });

    it('should return true for expired cookies', () => {
      const expiredCookies: InstagramCookies = {
        ...validCookies,
        expiresAt: Date.now() - 1000,
      };

      const shouldRefresh = shouldRefreshCookies(expiredCookies);
      expect(shouldRefresh).toBe(true);
    });

    it('should use custom threshold', () => {
      const cookies: InstagramCookies = {
        ...validCookies,
        expiresAt: Date.now() + 48 * 3600000, // 48 hours
      };

      // With 24 hour threshold, should not refresh
      expect(shouldRefreshCookies(cookies, 24)).toBe(false);

      // With 72 hour threshold, should refresh
      expect(shouldRefreshCookies(cookies, 72)).toBe(true);
    });

    it('should default to 24 hour threshold', () => {
      const cookies: InstagramCookies = {
        ...validCookies,
        expiresAt: Date.now() + 12 * 3600000, // 12 hours
      };

      const shouldRefresh = shouldRefreshCookies(cookies);
      expect(shouldRefresh).toBe(true);
    });
  });
});
