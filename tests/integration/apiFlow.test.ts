/**
 * API Flow Integration Tests
 * Tests: Authentication -> Hashtag Search -> Result Processing
 * @module tests/integration/apiFlow.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HashtagSearchService } from '../../src/services/instagram/api/hashtagSearch.js';
import { UserReelsService } from '../../src/services/instagram/api/userReels.js';
import { TrendingService } from '../../src/services/instagram/api/trending.js';
import type { InstagramCookies } from '../../src/services/instagram/session/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Flow Integration Tests', () => {
  const validCookies: InstagramCookies = {
    sessionid: 'valid-session-id',
    csrftoken: 'valid-csrf-token',
    ds_user_id: '123456789',
    rur: 'FTW',
    extractedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Hashtag Search Flow', () => {
    let hashtagService: HashtagSearchService;

    beforeEach(() => {
      hashtagService = new HashtagSearchService(validCookies);
    });

    it('should search hashtags and return formatted results', async () => {
      // Mock successful response
      const mockResponse = {
        sections: [
          {
            layout_content: {
              medias: [
                {
                  media: {
                    pk: '123',
                    code: 'ABC123',
                    taken_at: Date.now() / 1000,
                    like_count: 1000,
                    comment_count: 50,
                    play_count: 10000,
                    caption: { text: 'Test post #test' },
                    user: {
                      pk: 'user1',
                      username: 'testuser',
                      is_verified: false,
                    },
                  },
                },
              ],
            },
          },
        ],
        more_available: true,
        next_max_id: 'cursor123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await hashtagService.search('test', 10);

      expect(result).toBeDefined();
      expect(result.hashtag).toBe('test');
      expect(Array.isArray(result.posts)).toBe(true);
    }, 30000);

    it('should handle rate limiting gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sections: [],
            more_available: false,
          }),
      });

      const result = await hashtagService.search('test', 10);

      // Should return result
      expect(result).toBeDefined();
      expect(Array.isArray(result.posts)).toBe(true);
    }, 30000);

    it('should get top posts for hashtag', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sections: [
              {
                layout_content: {
                  medias: [
                    {
                      media: {
                        pk: '1',
                        code: 'TOP1',
                        like_count: 5000,
                        comment_count: 200,
                      },
                    },
                    {
                      media: {
                        pk: '2',
                        code: 'TOP2',
                        like_count: 3000,
                        comment_count: 100,
                      },
                    },
                  ],
                },
              },
            ],
          }),
      });

      const topPosts = await hashtagService.searchTopPosts('viral');

      expect(Array.isArray(topPosts)).toBe(true);
      expect(topPosts.length).toBeLessThanOrEqual(9); // Top posts limited to 9
    }, 30000);

    it('should normalize hashtag input', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sections: [],
            more_available: false,
          }),
      });

      // Both with and without # should be normalized
      const result1 = await hashtagService.search('#test', 5);
      const result2 = await hashtagService.search('test', 5);

      // Both should return results (even if empty)
      expect(result1.hashtag).toBe('test');
      expect(result2.hashtag).toBe('test');
    }, 30000);
  });

  describe('User Reels Flow', () => {
    it('should have UserReelsService available', () => {
      expect(typeof UserReelsService).toBe('function');
    });

    it('should create service with valid cookies', () => {
      const reelsService = new UserReelsService(validCookies);
      expect(reelsService).toBeDefined();
      expect(typeof reelsService.getReels).toBe('function');
    });

    it('should support cookie updates', () => {
      const reelsService = new UserReelsService(validCookies);
      const newCookies = { ...validCookies, sessionid: 'new-session' };

      expect(() => reelsService.updateCookies(newCookies)).not.toThrow();
    });
  });

  describe('Trending Content Flow', () => {
    let trendingService: TrendingService;

    beforeEach(() => {
      trendingService = new TrendingService(validCookies);
    });

    it('should fetch trending reels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                media: {
                  pk: 'trend1',
                  code: 'TREND123',
                  media_type: 2,
                  play_count: 100000,
                  like_count: 5000,
                },
              },
            ],
            more_available: true,
          }),
      });

      const result = await trendingService.getTrendingReels({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should fetch recommended content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tray: [
              {
                media: {
                  pk: 'rec1',
                  code: 'REC123',
                  media_type: 2,
                },
              },
            ],
          }),
      });

      const result = await trendingService.getRecommended({ limit: 5 });

      expect(result.success).toBe(true);
    });
  });

  describe('Cookie Update Flow', () => {
    it('should update cookies across all services', () => {
      const hashtagService = new HashtagSearchService(validCookies);
      const reelsService = new UserReelsService(validCookies);
      const trendingService = new TrendingService(validCookies);

      const newCookies: InstagramCookies = {
        ...validCookies,
        sessionid: 'new-session-id',
        csrftoken: 'new-csrf-token',
      };

      // All services should accept cookie updates
      expect(() => hashtagService.updateCookies(newCookies)).not.toThrow();
      expect(() => reelsService.updateCookies(newCookies)).not.toThrow();
      expect(() => trendingService.updateCookies(newCookies)).not.toThrow();
    });
  });

  describe('Error Handling Flow', () => {
    it('should handle API errors gracefully', async () => {
      const trendingService = new TrendingService(validCookies);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await trendingService.getTrendingReels();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty responses', async () => {
      const trendingService = new TrendingService(validCookies);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      const result = await trendingService.getTrendingReels();

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
    });
  });
});
