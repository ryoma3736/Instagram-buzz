/**
 * TrendingService Tests
 * @module tests/instagram/api/trending.test
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

describe('TrendingService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
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
    it('should fetch trending reels successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '123456',
                code: 'ABC123',
                media_type: 2,
                video_versions: [{ url: 'https://example.com/video.mp4' }],
                caption: { text: 'Test caption #trending' },
                like_count: 1000,
                comment_count: 50,
                play_count: 5000,
                user: {
                  pk: 'user123',
                  username: 'testuser',
                  is_verified: true,
                },
                taken_at: Math.floor(Date.now() / 1000),
              },
            },
          ],
          more_available: true,
          next_max_id: 'cursor123',
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.items).toHaveLength(1);
      expect(result.data!.items[0].type).toBe('reel');
      expect(result.data!.items[0].id).toBe('123456');
      expect(result.data!.items[0].engagement.likes).toBe(1000);
      expect(result.data!.items[0].engagement.views).toBe(5000);
      expect(result.data!.hasMore).toBe(true);
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          more_available: false,
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(0);
      expect(result.data!.hasMore).toBe(false);
    });

    it('should fallback to alternative endpoint on failure', async () => {
      // First request fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Alternative endpoint succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html>"code":"XYZ789"</html>',
      });

      // Media info fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          graphql: {
            shortcode_media: {
              id: '789',
              is_video: true,
              video_url: 'https://example.com/video.mp4',
              edge_media_to_caption: { edges: [{ node: { text: 'Caption' } }] },
              edge_media_preview_like: { count: 500 },
              edge_media_to_comment: { count: 25 },
              video_view_count: 2000,
              owner: {
                id: 'owner123',
                username: 'owner',
                is_verified: false,
              },
            },
          },
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels({ limit: 5 });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should extract hashtags from caption', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '123456',
                code: 'ABC123',
                media_type: 2,
                caption: { text: 'Test #hashtag1 #hashtag2 content' },
                user: {
                  pk: 'user123',
                  username: 'testuser',
                },
              },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(true);
      expect(result.data!.items[0].hashtags).toContain('#hashtag1');
      expect(result.data!.items[0].hashtags).toContain('#hashtag2');
    });

    it('should extract mentions from caption', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '123456',
                code: 'ABC123',
                media_type: 2,
                caption: { text: 'Check out @user1 and @user2' },
                user: {
                  pk: 'user123',
                  username: 'testuser',
                },
              },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getTrendingReels();

      expect(result.success).toBe(true);
      expect(result.data!.items[0].mentions).toContain('@user1');
      expect(result.data!.items[0].mentions).toContain('@user2');
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
                pk: '999',
                code: 'REC999',
                media_type: 2,
                caption: { text: 'Recommended' },
                like_count: 2000,
                user: {
                  pk: 'recuser',
                  username: 'recuser',
                },
              },
            },
          ],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(1);
      expect(result.data!.category).toBe('recommended');
    });

    it('should handle empty tray', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tray: [],
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getRecommended();

      expect(result.success).toBe(false);
    });
  });

  describe('getMediaInfo', () => {
    it('should fetch media info by shortcode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          graphql: {
            shortcode_media: {
              id: '12345',
              is_video: true,
              video_url: 'https://example.com/video.mp4',
              display_url: 'https://example.com/thumb.jpg',
              edge_media_to_caption: {
                edges: [{ node: { text: 'Test caption' } }],
              },
              edge_media_preview_like: { count: 1000 },
              edge_media_to_comment: { count: 50 },
              video_view_count: 5000,
              owner: {
                id: 'owner1',
                username: 'testowner',
                is_verified: true,
                profile_pic_url: 'https://example.com/pic.jpg',
              },
              taken_at_timestamp: Math.floor(Date.now() / 1000),
            },
          },
        }),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getMediaInfo('ABC123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('12345');
      expect(result!.type).toBe('reel');
      expect(result!.mediaUrl).toBe('https://example.com/video.mp4');
      expect(result!.engagement.likes).toBe(1000);
      expect(result!.owner.isVerified).toBe(true);
    });

    it('should return null on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getMediaInfo('NOTFOUND');

      expect(result).toBeNull();
    });

    it('should handle missing graphql data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const service = new TrendingService(mockCookies);
      const result = await service.getMediaInfo('EMPTY');

      expect(result).toBeNull();
    });
  });

  describe('updateCookies', () => {
    it('should update cookies', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const service = new TrendingService(mockCookies);
      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new_session_id',
      };

      service.updateCookies(newCookies);

      await service.getTrendingReels();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: expect.stringContaining('sessionid=new_session_id'),
          }),
        })
      );
    });
  });
});

describe('createTrendingService', () => {
  it('should create a new TrendingService instance', () => {
    const service = createTrendingService(mockCookies);
    expect(service).toBeInstanceOf(TrendingService);
  });
});
