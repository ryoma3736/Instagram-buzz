// Instagram Scraper Service テスト
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock cookieAuthService before importing InstagramScraperService
vi.mock('../src/services/instagram/cookieAuthService.js', () => ({
  cookieAuthService: {
    isConfigured: () => false,
    clearCookies: () => {},
  },
}));

vi.mock('../src/services/instagram/authenticatedScraperService.js', () => ({
  authenticatedScraperService: {
    getUserReels: async () => [],
    getReelByUrl: async () => null,
    searchByHashtag: async () => [],
    getTrendingReels: async () => [],
  },
}));

import { InstagramScraperService } from '../src/services/instagramScraperService.js';

describe('InstagramScraperService', () => {
  let service: InstagramScraperService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new InstagramScraperService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPublicReels', () => {
    it('should return an array of reels', async () => {
      // Mock fetch
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '<html></html>',
      }));

      const reels = await service.getPublicReels('testuser', 5);
      expect(Array.isArray(reels)).toBe(true);
    }, 10000);
  });

  describe('getReelByUrl', () => {
    it('should extract shortcode from reel URL', async () => {
      const mockFetch = vi.fn();
      // First call - oEmbed API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Test Reel',
          author_name: 'testuser'
        }),
        text: async () => JSON.stringify({
          title: 'Test Reel',
          author_name: 'testuser'
        }),
      });
      // Second call - info API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{
            id: 'ABC123_id',
            code: 'ABC123',
            taken_at: 1700000000,
          }]
        }),
        text: async () => JSON.stringify({
          items: [{
            id: 'ABC123_id',
            code: 'ABC123',
            taken_at: 1700000000,
          }]
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const reel = await service.getReelByUrl('https://www.instagram.com/reel/ABC123/');
      expect(reel).not.toBeNull();
      if (reel) {
        expect(reel.shortcode).toBe('ABC123');
      }
    }, 10000);

    it('should return null for invalid URL', async () => {
      const reel = await service.getReelByUrl('invalid-url');
      expect(reel).toBeNull();
    }, 10000);
  });

  describe('searchByHashtag', () => {
    it('should return array for hashtag search', async () => {
      const mockFetch = vi.fn();
      // First call - hashtag page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html>"shortcode":"TEST123"</html>',
      });
      // Subsequent calls for getReelByUrl - oEmbed
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Test Reel',
          author_name: 'testuser'
        }),
        text: async () => JSON.stringify({
          title: 'Test Reel',
          author_name: 'testuser'
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const reels = await service.searchByHashtag('test', 5);
      expect(Array.isArray(reels)).toBe(true);
    }, 15000);
  });

  describe('getTrendingReels', () => {
    it('should return array of trending reels', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<html>"code":"TREND123"</html>',
      }));

      const reels = await service.getTrendingReels(5);
      expect(Array.isArray(reels)).toBe(true);
    }, 15000);
  });
});
