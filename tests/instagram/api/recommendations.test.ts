/**
 * RecommendationsService Tests
 * @module tests/instagram/api/recommendations.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RecommendationsService,
  createRecommendationsService,
  RECOMMENDATIONS_ENDPOINTS,
} from '../../../src/services/instagram/api/recommendations.js';
import type { InstagramCookies } from '../../../src/services/instagram/session/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test cookies
const mockCookies: InstagramCookies = {
  sessionid: 'test_session_id',
  csrftoken: 'test_csrf_token',
  ds_user_id: '12345678',
  rur: 'test_rur',
  extractedAt: Date.now(),
  expiresAt: Date.now() + 86400000,
};

describe('RecommendationsService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with cookies', () => {
      const service = new RecommendationsService(mockCookies);
      expect(service).toBeInstanceOf(RecommendationsService);
    });
  });

  describe('getRecommended', () => {
    it('should fetch recommended content successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tray: [
            {
              media: {
                pk: '123456',
                code: 'REC123',
                media_type: 2,
                video_versions: [{ url: 'https://example.com/video.mp4' }],
                caption: { text: 'Recommended #content' },
                like_count: 1500,
                comment_count: 75,
                play_count: 8000,
                user: {
                  pk: 'user123',
                  username: 'recuser',
                  is_verified: false,
                },
                taken_at: Math.floor(Date.now() / 1000),
              },
            },
          ],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getRecommended({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.items).toHaveLength(1);
      expect(result.data!.items[0].type).toBe('reel');
      expect(result.data!.items[0].id).toBe('123456');
      expect(result.data!.category).toBe('recommended');
    });

    it('should parse items from story-style reels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tray: [
            {
              items: [
                {
                  pk: '111',
                  code: 'STORY111',
                  media_type: 2,
                  caption: { text: 'Story item' },
                  user: {
                    pk: 'storyuser',
                    username: 'storyuser',
                  },
                },
              ],
            },
          ],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(1);
      expect(result.data!.items[0].id).toBe('111');
    });

    it('should handle empty tray', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tray: [],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(0);
    });

    it('should fallback to timeline on API failure', async () => {
      // First request fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Timeline fallback succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feed_items: [
            {
              media_or_ad: {
                pk: '555',
                code: 'FEED555',
                media_type: 2,
                caption: { text: 'Timeline item' },
                user: {
                  pk: 'feeduser',
                  username: 'feeduser',
                },
              },
            },
          ],
          more_available: true,
          next_max_id: 'next123',
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(1);
      expect(result.data!.category).toBe('timeline');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should filter out ads from timeline', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feed_items: [
            {
              media_or_ad: {
                pk: '555',
                code: 'FEED555',
                ad_id: 'ad123', // This is an ad
                caption: { text: 'Ad content' },
                user: { pk: 'aduser', username: 'aduser' },
              },
            },
            {
              media_or_ad: {
                pk: '666',
                code: 'FEED666',
                caption: { text: 'Organic content' },
                user: { pk: 'orguser', username: 'orguser' },
              },
            },
          ],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(1);
      expect(result.data!.items[0].id).toBe('666');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const service = new RecommendationsService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should extract hashtags and mentions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tray: [
            {
              media: {
                pk: '123',
                code: 'TEST',
                caption: { text: 'Check out @influencer #viral #trending' },
                user: { pk: 'user1', username: 'user1' },
              },
            },
          ],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data!.items[0].hashtags).toContain('#viral');
      expect(result.data!.items[0].hashtags).toContain('#trending');
      expect(result.data!.items[0].mentions).toContain('@influencer');
    });
  });

  describe('getSuggestedUsers', () => {
    it('should fetch suggested users successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [
            {
              user: {
                pk: 'user1',
                username: 'suggested1',
                full_name: 'Suggested User 1',
                profile_pic_url: 'https://example.com/pic1.jpg',
                is_verified: true,
              },
            },
            {
              user: {
                pk: 'user2',
                username: 'suggested2',
                full_name: 'Suggested User 2',
                is_verified: false,
              },
            },
          ],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getSuggestedUsers(10);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].username).toBe('suggested1');
      expect(result.data![0].isVerified).toBe(true);
      expect(result.data![1].username).toBe('suggested2');
    });

    it('should handle alternative response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          suggested_users: [
            {
              pk: 'user1',
              username: 'alt_user',
              full_name: 'Alt User',
            },
          ],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getSuggestedUsers();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].username).toBe('alt_user');
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getSuggestedUsers();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getSuggestedUsers();

      expect(result.success).toBe(false);
    });
  });

  describe('getSimilarUsers', () => {
    it('should fetch similar users successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [
            {
              pk: 'similar1',
              username: 'similar_user1',
              full_name: 'Similar User 1',
              profile_pic_url: 'https://example.com/similar1.jpg',
              is_verified: true,
            },
          ],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getSimilarUsers('target_user_id');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].username).toBe('similar_user1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('target_id=target_user_id'),
        expect.any(Object)
      );
    });

    it('should handle chaining_users response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chaining_users: [
            {
              pk: 'chain1',
              username: 'chain_user',
              full_name: 'Chain User',
            },
          ],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getSimilarUsers('user123');

      expect(result.success).toBe(true);
      expect(result.data![0].username).toBe('chain_user');
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [],
        }),
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getSimilarUsers('user123');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const service = new RecommendationsService(mockCookies);
      const result = await service.getSimilarUsers('user123');

      expect(result.success).toBe(false);
    });
  });

  describe('updateCookies', () => {
    it('should update cookies', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ tray: [] }),
      });

      const service = new RecommendationsService(mockCookies);
      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'updated_session_id',
      };

      service.updateCookies(newCookies);

      await service.getRecommended();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: expect.stringContaining('sessionid=updated_session_id'),
          }),
        })
      );
    });
  });
});

describe('createRecommendationsService', () => {
  it('should create a new RecommendationsService instance', () => {
    const service = createRecommendationsService(mockCookies);
    expect(service).toBeInstanceOf(RecommendationsService);
  });
});

describe('RECOMMENDATIONS_ENDPOINTS', () => {
  it('should have all required endpoints defined', () => {
    expect(RECOMMENDATIONS_ENDPOINTS.RECOMMENDED_FEED).toBeDefined();
    expect(RECOMMENDATIONS_ENDPOINTS.SUGGESTED_USERS).toBeDefined();
    expect(RECOMMENDATIONS_ENDPOINTS.CHAINING).toBeDefined();
    expect(RECOMMENDATIONS_ENDPOINTS.BLENDED_FEED).toBeDefined();
  });
});
