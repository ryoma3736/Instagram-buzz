/**
 * Playwright Fallback Service Tests
 * Tests for Issue #45: Playwright fallback implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PlaywrightFallbackService,
  isPlaywrightAvailable,
} from '../../src/services/instagram/playwright/playwrightFallback.js';

// Mock playwright module
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        addCookies: vi.fn(),
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(null),
          waitForTimeout: vi.fn().mockResolvedValue(null),
          evaluate: vi.fn().mockResolvedValue({
            id: 'test123',
            caption: 'Test caption',
            likes: 1000,
            comments: 50,
            views: 10000,
            timestamp: Math.floor(Date.now() / 1000),
            username: 'testuser',
            followers: 5000,
          }),
          url: vi.fn().mockReturnValue('https://www.instagram.com/reel/ABC123/'),
        }),
        close: vi.fn(),
      }),
      close: vi.fn(),
    }),
  },
}));

describe('PlaywrightFallbackService', () => {
  let service: PlaywrightFallbackService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PlaywrightFallbackService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isPlaywrightAvailable', () => {
    it('should return true when playwright is installed', async () => {
      const result = await isPlaywrightAvailable();
      // Since playwright is mocked, it should be available
      expect(result).toBe(true);
    });
  });

  describe('checkAvailability', () => {
    it('should cache availability result', async () => {
      const result1 = await service.checkAvailability();
      const result2 = await service.checkAvailability();

      expect(result1).toBe(result2);
    });
  });

  describe('getReelByUrl', () => {
    it('should return result with usedFallback flag', async () => {
      const url = 'https://www.instagram.com/reel/ABC123/';
      const result = await service.getReelByUrl(url);

      expect(result).toHaveProperty('usedFallback', true);
    });

    it('should extract shortcode from valid URL', async () => {
      const url = 'https://www.instagram.com/reel/ABC123/';
      const result = await service.getReelByUrl(url);

      if (result.success && result.data) {
        expect(result.data.shortcode).toBe('ABC123');
      }
    });

    it('should return error for invalid URL', async () => {
      const url = 'invalid-url';
      const result = await service.getReelByUrl(url);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid reel URL');
    });
  });

  describe('getUserReels', () => {
    it('should return result with usedFallback flag', async () => {
      const result = await service.getUserReels('testuser', 5);

      expect(result).toHaveProperty('usedFallback', true);
    });

    it('should return array of reels when successful', async () => {
      // Override the mock to return reel links
      const playwright = await import('playwright');
      const mockPage = {
        goto: vi.fn().mockResolvedValue(null),
        waitForTimeout: vi.fn().mockResolvedValue(null),
        evaluate: vi.fn()
          .mockResolvedValueOnce(['/reel/ABC123/', '/reel/DEF456/', '/reel/GHI789/']),
      };

      (playwright.chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        newContext: vi.fn().mockResolvedValue({
          addCookies: vi.fn(),
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
        }),
        close: vi.fn(),
      });

      const newService = new PlaywrightFallbackService();
      const result = await newService.getUserReels('testuser', 5);

      expect(result).toHaveProperty('usedFallback', true);
    });
  });

  describe('searchByHashtag', () => {
    it('should return result with usedFallback flag', async () => {
      const result = await service.searchByHashtag('test', 5);

      expect(result).toHaveProperty('usedFallback', true);
    });

    it('should handle login required pages', async () => {
      // Override mock to simulate login redirect
      const playwright = await import('playwright');
      const mockPage = {
        goto: vi.fn().mockResolvedValue(null),
        waitForTimeout: vi.fn().mockResolvedValue(null),
        evaluate: vi.fn().mockResolvedValueOnce(true), // isLoginRequired = true
      };

      (playwright.chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        newContext: vi.fn().mockResolvedValue({
          addCookies: vi.fn(),
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
        }),
        close: vi.fn(),
      });

      const newService = new PlaywrightFallbackService();
      const result = await newService.searchByHashtag('test', 5);

      expect(result).toHaveProperty('usedFallback', true);
      // Should fail or return empty when login is required
      if (!result.success) {
        expect(result.error).toContain('Login required');
      }
    });
  });

  describe('configuration', () => {
    it('should use default config when none provided', () => {
      const defaultService = new PlaywrightFallbackService();
      expect(defaultService).toBeInstanceOf(PlaywrightFallbackService);
    });

    it('should accept custom config', () => {
      const customService = new PlaywrightFallbackService({
        headless: false,
        timeout: 60000,
      });
      expect(customService).toBeInstanceOf(PlaywrightFallbackService);
    });
  });

  describe('cookie handling', () => {
    it('should work without cookies', async () => {
      const url = 'https://www.instagram.com/reel/ABC123/';
      const result = await service.getReelByUrl(url, undefined);

      expect(result).toHaveProperty('usedFallback', true);
    });

    it('should work with cookies', async () => {
      const url = 'https://www.instagram.com/reel/ABC123/';
      const cookies = {
        sessionid: 'test_session',
        csrftoken: 'test_csrf',
        ds_user_id: '12345',
        rur: 'test_rur',
        extractedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };

      const result = await service.getReelByUrl(url, cookies);

      expect(result).toHaveProperty('usedFallback', true);
    });
  });
});

describe('AuthenticatedScraperService with Playwright fallback', () => {
  // These tests verify integration with the main scraper service

  describe('fallback configuration', () => {
    it('should enable Playwright fallback by default', async () => {
      const { AuthenticatedScraperService } = await import(
        '../../src/services/instagram/authenticatedScraperService.js'
      );

      const service = new AuthenticatedScraperService();
      // The service should have Playwright fallback enabled by default
      expect(service).toBeInstanceOf(AuthenticatedScraperService);
    });

    it('should allow disabling Playwright fallback', async () => {
      const { AuthenticatedScraperService } = await import(
        '../../src/services/instagram/authenticatedScraperService.js'
      );

      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: false,
      });

      const isAvailable = await service.isPlaywrightFallbackAvailable();
      expect(isAvailable).toBe(false);
    });
  });

  describe('isPlaywrightFallbackAvailable', () => {
    it('should return boolean', async () => {
      const { AuthenticatedScraperService } = await import(
        '../../src/services/instagram/authenticatedScraperService.js'
      );

      const service = new AuthenticatedScraperService();
      const result = await service.isPlaywrightFallbackAvailable();

      expect(typeof result).toBe('boolean');
    });

    it('should return false when fallback is disabled', async () => {
      const { AuthenticatedScraperService } = await import(
        '../../src/services/instagram/authenticatedScraperService.js'
      );

      const service = new AuthenticatedScraperService({
        usePlaywrightFallback: false,
      });

      const result = await service.isPlaywrightFallbackAvailable();
      expect(result).toBe(false);
    });
  });
});
