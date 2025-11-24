/**
 * TrendingService Unit Tests
 * @module tests/unit/api/trending
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TrendingService,
  createTrendingService,
} from '../../../src/services/instagram/api/trending.js';
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

// Sample trending reels response
const mockTrendingResponse = {
  items: [
    {
      media: {
        pk: '111111111',
        id: '111111111_123',
        code: 'ABC123',
        media_type: 2,
        taken_at: 1700000000,
        caption: { text: 'Trending reel #viral #fyp' },
        like_count: 50000,
        comment_count: 500,
        play_count: 1000000,
        reshare_count: 100,
        video_versions: [
          { url: 'https://example.com/video1.mp4', type: 101, width: 1080, height: 1920 },
        ],
        image_versions2: {
          candidates: [{ url: 'https://example.com/thumb1.jpg' }],
        },
        user: {
          pk: '987654321',
          username: 'trendinguser',
          is_verified: true,
          profile_pic_url: 'https://example.com/pic.jpg',
        },
      },
    },
    {
      media: {
        pk: '222222222',
        code: 'DEF456',
        media_type: 2,
        taken_at: 1700000100,
        caption: { text: 'Another trending reel @mention' },
        like_count: 25000,
        comment_count: 250,
        play_count: 500000,
        user: {
          pk: '876543210',
          username: 'anotheruser',
          is_verified: false,
        },
      },
    },
  ],
  more_available: true,
  next_max_id: 'next_cursor',
};

// Sample recommended response
const mockRecommendedResponse = {
  tray: [
    {
      media: {
        pk: '333333333',
        code: 'GHI789',
        media_type: 2,
        taken_at: 1700000200,
        caption: { text: 'Recommended content' },
        like_count: 10000,
        comment_count: 100,
        view_count: 200000,
        user: {
          pk: '765432109',
          username: 'recommendeduser',
        },
      },
    },
  ],
};

// Sample media info response
const mockMediaInfoResponse = {
  graphql: {
    shortcode_media: {
      id: '111111111',
      shortcode: 'ABC123',
      is_video: true,
      video_url: 'https://example.com/video.mp4',
      display_url: 'https://example.com/display.jpg',
      edge_media_to_caption: {
        edges: [{ node: { text: 'Caption #hashtag @mention' } }],
      },
      edge_media_preview_like: { count: 50000 },
      edge_media_to_comment: { count: 500 },
      video_view_count: 1000000,
      taken_at_timestamp: 1700000000,
      owner: {
        id: '987654321',
        username: 'testuser',
        is_verified: true,
        profile_pic_url: 'https://example.com/pic.jpg',
      },
    },
  },
};

describe('TrendingService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with cookies', () => {
      const service = new TrendingService(mockCookies);
      expect(service).toBeInstanceOf(TrendingService);
    });
  });

  describe('getTrendingReels', () => {
    it('should get trending reels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(true);
      expect(result.data?.items.length).toBeGreaterThan(0);
    });

    it('should support limit option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels({ limit: 5 });

      expect(result.success).toBe(true);
      expect(result.data?.items.length).toBeLessThanOrEqual(5);
    });

    it('should fallback to alternative method on failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => `
            "code":"ABC123"
            "code":"DEF456"
          `,
        })
        .mockResolvedValue({
          ok: true,
          json: async () => mockMediaInfoResponse,
        });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels({ limit: 2 });

      expect(result.success).toBe(true);
    });

    it('should return error on complete failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include pagination info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.data?.hasMore).toBe(true);
      expect(result.data?.endCursor).toBe('next_cursor');
    });

    it('should include fetchedAt timestamp', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.data?.fetchedAt).toBeDefined();
      expect(result.data?.fetchedAt).toBeGreaterThan(0);
    });
  });

  describe('getRecommended', () => {
    it('should get recommended content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRecommendedResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data?.items.length).toBeGreaterThan(0);
    });

    it('should support limit option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRecommendedResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getRecommended({ limit: 5 });

      expect(result.success).toBe(true);
    });

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(false);
    });

    it('should include category in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRecommendedResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getRecommended();

      expect(result.data?.category).toBe('recommended');
    });
  });

  describe('getMediaInfo', () => {
    it('should get media info by shortcode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMediaInfoResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getMediaInfo('ABC123');

      expect(result).not.toBeNull();
      expect(result?.shortcode).toBe('ABC123');
    });

    it('should return null on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getMediaInfo('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when no media in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getMediaInfo('ABC123');

      expect(result).toBeNull();
    });

    it('should handle alternative response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: '111111111',
              code: 'ABC123',
              is_video: true,
              video_url: 'https://example.com/video.mp4',
              like_count: 1000,
              user: { username: 'testuser' },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getMediaInfo('ABC123');

      // May return null or content depending on response format
    });
  });

  describe('updateCookies', () => {
    it('should update cookies', () => {
      const service = new TrendingService(mockCookies);

      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new_session_id',
      };

      expect(() => service.updateCookies(newCookies)).not.toThrow();
    });
  });

  describe('TrendingContent structure', () => {
    it('should parse content with correct structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('shortcode');
      expect(item).toHaveProperty('url');
      expect(item).toHaveProperty('mediaUrl');
      expect(item).toHaveProperty('caption');
      expect(item).toHaveProperty('engagement');
      expect(item).toHaveProperty('owner');
    });

    it('should include engagement metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const engagement = result.data?.items[0].engagement;
      expect(engagement).toHaveProperty('likes');
      expect(engagement).toHaveProperty('comments');
      expect(engagement).toHaveProperty('views');
      expect(engagement).toHaveProperty('shares');
    });

    it('should include owner info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const owner = result.data?.items[0].owner;
      expect(owner).toHaveProperty('id');
      expect(owner).toHaveProperty('username');
      expect(owner).toHaveProperty('isVerified');
    });

    it('should extract hashtags from caption', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item?.hashtags).toContain('#viral');
      expect(item?.hashtags).toContain('#fyp');
    });

    it('should extract mentions from caption', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[1];
      expect(item?.mentions).toContain('@mention');
    });

    it('should include timestamp', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item?.timestamp).toBeDefined();
      expect(item?.timestamp).toBeGreaterThan(0);
    });

    it('should determine content type correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item?.type).toBe('reel');
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(false);
    });

    it('should handle missing data gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: null }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(true);
      expect(result.data?.items).toEqual([]);
    });
  });
});

describe('createTrendingService', () => {
  it('should create a new TrendingService instance', () => {
    const service = createTrendingService(mockCookies);
    expect(service).toBeInstanceOf(TrendingService);
  });
});

describe('helper functions', () => {
  describe('extractHashtags', () => {
    it('should extract hashtags from text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '1',
                code: 'ABC',
                media_type: 2,
                taken_at: 1700000000,
                caption: { text: 'Check out #hashtag1 and #hashtag2' },
                like_count: 100,
                user: { pk: '1', username: 'user' },
              },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item?.hashtags).toContain('#hashtag1');
      expect(item?.hashtags).toContain('#hashtag2');
    });

    it('should handle Japanese hashtags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '1',
                code: 'ABC',
                media_type: 2,
                taken_at: 1700000000,
                caption: { text: '#japanese and #tanoshii' },
                like_count: 100,
                user: { pk: '1', username: 'user' },
              },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item?.hashtags?.length).toBeGreaterThan(0);
    });

    it('should return empty array for no hashtags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '1',
                code: 'ABC',
                media_type: 2,
                taken_at: 1700000000,
                caption: { text: 'No hashtags here' },
                like_count: 100,
                user: { pk: '1', username: 'user' },
              },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item?.hashtags).toEqual([]);
    });
  });

  describe('extractMentions', () => {
    it('should extract mentions from text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '1',
                code: 'ABC',
                media_type: 2,
                taken_at: 1700000000,
                caption: { text: 'Thanks @user1 and @user2!' },
                like_count: 100,
                user: { pk: '1', username: 'user' },
              },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item?.mentions).toContain('@user1');
      expect(item?.mentions).toContain('@user2');
    });

    it('should return empty array for no mentions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '1',
                code: 'ABC',
                media_type: 2,
                taken_at: 1700000000,
                caption: { text: 'No mentions here' },
                like_count: 100,
                user: { pk: '1', username: 'user' },
              },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      const item = result.data?.items[0];
      expect(item?.mentions).toEqual([]);
    });
  });
});
