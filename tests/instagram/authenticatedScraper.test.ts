/**
 * Authenticated Scraper Service Tests
 * Tests for Issue #19: Cookie-authenticated Instagram scraping
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthenticatedScraperService } from '../../src/services/instagram/authenticatedScraperService.js';
import { cookieAuthService } from '../../src/services/instagram/cookieAuthService.js';

describe('AuthenticatedScraperService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    cookieAuthService.clearCookies();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isAuthenticated', () => {
    it('should return false when no cookies configured', () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      const service = new AuthenticatedScraperService();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should return true when cookies are configured', () => {
      process.env.INSTAGRAM_SESSION_ID = 'test_session';
      process.env.INSTAGRAM_CSRF_TOKEN = 'test_csrf';

      const service = new AuthenticatedScraperService();
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe('searchByHashtag', () => {
    it('should return empty array when not authenticated', async () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      // Disable Playwright fallback to test API-only behavior
      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: false,
      });
      const result = await service.searchByHashtag('test', 5);

      expect(result).toEqual([]);
    });
  });

  describe('getUserReels', () => {
    it('should return empty array when not authenticated', async () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      // Disable Playwright fallback to test API-only behavior
      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: false,
      });
      const result = await service.getUserReels('testuser', 5);

      expect(result).toEqual([]);
    });
  });

  describe('getTrendingReels', () => {
    it('should return empty array when not authenticated', async () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      const service = new AuthenticatedScraperService();
      const result = await service.getTrendingReels(5);

      expect(result).toEqual([]);
    });
  });

  describe('getReelByUrl', () => {
    it('should return null for invalid URL', async () => {
      const service = new AuthenticatedScraperService();
      const result = await service.getReelByUrl('invalid-url');

      expect(result).toBeNull();
    });

    it('should return null when not authenticated', async () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      // Disable Playwright fallback to test API-only behavior
      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: false,
      });
      const result = await service.getReelByUrl('https://www.instagram.com/reel/ABC123/');

      expect(result).toBeNull();
    });
  });

  describe('testConnection', () => {
    it('should return unauthenticated result when no cookies', async () => {
      delete process.env.INSTAGRAM_SESSION_ID;
      delete process.env.INSTAGRAM_CSRF_TOKEN;

      const service = new AuthenticatedScraperService();
      const result = await service.testConnection();

      expect(result.authenticated).toBe(false);
      expect(result.canFetchReels).toBe(false);
      expect(result.error).toContain('No cookies configured');
    });
  });

  describe('configuration', () => {
    it('should use default config values', () => {
      const service = new AuthenticatedScraperService();
      // Service should be created without errors
      expect(service).toBeInstanceOf(AuthenticatedScraperService);
    });

    it('should accept custom config', () => {
      const service = new AuthenticatedScraperService({
        fallbackToUnauthenticated: false,
        timeout: 60000,
        maxRetries: 5,
      });
      expect(service).toBeInstanceOf(AuthenticatedScraperService);
    });

    it('should accept usePlaywrightFallback config (Issue #45)', () => {
      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: true,
      });
      expect(service).toBeInstanceOf(AuthenticatedScraperService);
    });

    it('should allow disabling Playwright fallback (Issue #45)', () => {
      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: false,
      });
      expect(service).toBeInstanceOf(AuthenticatedScraperService);
    });
  });

  describe('Playwright fallback (Issue #45)', () => {
    it('should have isPlaywrightFallbackAvailable method', () => {
      const service = new AuthenticatedScraperService();
      expect(typeof service.isPlaywrightFallbackAvailable).toBe('function');
    });

    it('should return false when fallback is disabled', async () => {
      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: false,
      });
      const result = await service.isPlaywrightFallbackAvailable();
      expect(result).toBe(false);
    });

    it('should return boolean when checking availability', async () => {
      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: true,
      });
      const result = await service.isPlaywrightFallbackAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});
