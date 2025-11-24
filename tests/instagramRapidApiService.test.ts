/**
 * Instagram RapidAPI Service Tests
 *
 * @author CodeGenAgent
 * @issue #15
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstagramRapidApiService } from '../src/services/instagramRapidApiService.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('InstagramRapidApiService', () => {
  let service: InstagramRapidApiService;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.RAPIDAPI_KEY;
    delete process.env.RAPID_API_KEY;
    service = new InstagramRapidApiService();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  describe('isAvailable', () => {
    it('should return false when no API key is set', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return true when API key is set via environment', () => {
      process.env.RAPIDAPI_KEY = 'test-api-key';
      service = new InstagramRapidApiService();

      expect(service.isAvailable()).toBe(true);
    });

    it('should return true when API key is set via setApiKey', () => {
      service.setApiKey('test-api-key');

      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('getUserReels', () => {
    it('should skip when no API key', async () => {
      const result = await service.getUserReels('testuser');

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch user reels when API key is set', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            items: [
              {
                pk: '12345',
                code: 'ABC123',
                media_type: 2,
                caption: { text: 'Test caption' },
                play_count: 10000,
                like_count: 500,
                comment_count: 50,
                taken_at: 1700000000,
                user: { username: 'testuser', follower_count: 1000 },
                thumbnail_url: 'https://example.com/thumb.jpg',
              },
            ],
          },
        }),
      });

      const result = await service.getUserReels('testuser', 10);

      expect(result).toHaveLength(1);
      expect(result[0].shortcode).toBe('ABC123');
      expect(result[0].views).toBe(10000);
      expect(result[0].author.username).toBe('testuser');
    });

    it('should handle different response formats', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: '12345',
              shortcode: 'DEF456',
              is_video: true,
              caption_text: 'Alternative format',
              video_play_count: 5000,
              likes_count: 200,
              comments_count: 20,
              taken_at: '2023-11-15T10:00:00Z',
              owner: { username: 'altuser' },
            },
          ],
        }),
      });

      const result = await service.getUserReels('altuser', 10);

      expect(result).toHaveLength(1);
      expect(result[0].shortcode).toBe('DEF456');
      expect(result[0].views).toBe(5000);
    });
  });

  describe('getReelByShortcode', () => {
    it('should fetch single reel by shortcode', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            items: [
              {
                pk: '12345',
                code: 'ABC123',
                media_type: 2,
                play_count: 10000,
                like_count: 500,
              },
            ],
          },
        }),
      });

      const result = await service.getReelByShortcode('ABC123');

      expect(result).not.toBeNull();
      expect(result?.shortcode).toBe('ABC123');
    });

    it('should return null when no API key', async () => {
      const result = await service.getReelByShortcode('ABC123');

      expect(result).toBeNull();
    });
  });

  describe('searchByHashtag', () => {
    it('should search by hashtag', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          medias: [
            {
              pk: '12345',
              code: 'HASH123',
              media_type: 2,
              play_count: 50000,
            },
          ],
        }),
      });

      const result = await service.searchByHashtag('trending', 20);

      expect(result).toHaveLength(1);
      expect(result[0].shortcode).toBe('HASH123');
    });

    it('should strip # from hashtag', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ medias: [] }),
      });

      await service.searchByHashtag('#trending', 20);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('trending'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('%23'),
        expect.any(Object)
      );
    });
  });

  describe('getTrendingReels', () => {
    it('should return empty array when no API key', async () => {
      const result = await service.getTrendingReels();

      expect(result).toEqual([]);
    });

    it('should fetch trending reels', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            reels: [
              {
                pk: '12345',
                code: 'TREND123',
                media_type: 2,
                play_count: 100000,
              },
            ],
          },
        }),
      });

      const result = await service.getTrendingReels(10);

      expect(result).toHaveLength(1);
      expect(result[0].views).toBe(100000);
    });
  });

  describe('Rate Limiting', () => {
    it('should rotate provider on 429 error', async () => {
      service.setApiKey('test-api-key');

      // First request - rate limited
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      // Second request after rotation - succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { items: [] },
        }),
      });

      await service.getUserReels('testuser', 10);

      // Should have made two requests (original + retry with new provider)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', () => {
      const stats = service.getUsageStats();

      expect(stats).toHaveLength(3); // 3 providers
      expect(stats[0]).toHaveProperty('provider');
      expect(stats[0]).toHaveProperty('used');
      expect(stats[0]).toHaveProperty('limit');
    });

    it('should track request count', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { items: [] } }),
      });

      await service.getUserReels('user1', 10);
      await service.getUserReels('user2', 10);

      const stats = service.getUsageStats();
      const mainProvider = stats.find(s => s.provider === 'scraper-api2');

      expect(mainProvider?.used).toBe(2);
    });
  });

  describe('resetUsage', () => {
    it('should reset all usage counters', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { items: [] } }),
      });

      await service.getUserReels('user1', 10);

      let stats = service.getUsageStats();
      expect(stats.some(s => s.used > 0)).toBe(true);

      service.resetUsage();

      stats = service.getUsageStats();
      expect(stats.every(s => s.used === 0)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      service.setApiKey('test-api-key');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.getUserReels('testuser', 10);

      expect(result).toEqual([]);
    });

    it('should handle malformed response', async () => {
      service.setApiKey('test-api-key');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      const result = await service.getUserReels('testuser', 10);

      expect(result).toEqual([]);
    });

    it('should skip non-video content', async () => {
      service.setApiKey('test-api-key');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            items: [
              { pk: '1', code: 'IMG1', media_type: 1 }, // Image - should be skipped
              { pk: '2', code: 'VID1', media_type: 2 }, // Video - should be included
              { pk: '3', code: 'CAR1', media_type: 8 }, // Carousel - should be skipped
            ],
          },
        }),
      });

      const result = await service.getUserReels('testuser', 10);

      expect(result).toHaveLength(1);
      expect(result[0].shortcode).toBe('VID1');
    });
  });
});
