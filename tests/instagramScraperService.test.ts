// Instagram Scraper Service テスト
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramScraperService } from '../src/services/instagramScraperService.js';

describe('InstagramScraperService', () => {
  let service: InstagramScraperService;

  beforeEach(() => {
    service = new InstagramScraperService();
  });

  describe('getPublicReels', () => {
    it('should return an array of reels', async () => {
      // Mock fetch
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('<html></html>')
      }));

      const reels = await service.getPublicReels('testuser', 5);
      expect(Array.isArray(reels)).toBe(true);
    });
  });

  describe('getReelByUrl', () => {
    it('should extract shortcode from reel URL', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          title: 'Test Reel',
          author_name: 'testuser'
        })
      }));

      const reel = await service.getReelByUrl('https://www.instagram.com/reel/ABC123/');
      expect(reel).not.toBeNull();
      if (reel) {
        expect(reel.shortcode).toBe('ABC123');
      }
    });

    it('should return null for invalid URL', async () => {
      const reel = await service.getReelByUrl('invalid-url');
      expect(reel).toBeNull();
    });
  });

  describe('searchByHashtag', () => {
    it('should return array for hashtag search', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>"shortcode":"TEST123"</html>')
      }));

      const reels = await service.searchByHashtag('test', 5);
      expect(Array.isArray(reels)).toBe(true);
    });
  });

  describe('getTrendingReels', () => {
    it('should return array of trending reels', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>"code":"TREND123"</html>')
      }));

      const reels = await service.getTrendingReels(5);
      expect(Array.isArray(reels)).toBe(true);
    });
  });
});
