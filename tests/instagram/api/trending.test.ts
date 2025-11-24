/**
 * TrendingService Unit Tests
 * @module tests/instagram/api/trending.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrendingService, createTrendingService } from '../../../src/services/instagram/api/trending.js';
import type { InstagramCookies } from '../../../src/services/instagram/session/types.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TrendingService', () => {
  let service: TrendingService;
  const mockCookies: InstagramCookies = {
    sessionid: 'test-session-id',
    csrftoken: 'test-csrf-token',
    ds_user_id: '12345678',
    rur: 'FTW',
    extractedAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrendingService(mockCookies);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with cookies', () => {
      expect(service).toBeInstanceOf(TrendingService);
    });
  });

  describe('getTrendingReels', () => {
    it('should fetch trending reels successfully', async () => {
      const mockResponse = {
        items: [
          {
            media: {
              pk: '123',
              code: 'ABC123',
              media_type: 2,
              like_count: 1000,
              comment_count: 50,
              play_count: 10000,
              user: {
                pk: 'user1',
                username: 'testuser',
                is_verified: false,
              },
              caption: { text: 'Test caption #test' },
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

      const result = await service.getTrendingReels({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.items.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await service.getTrendingReels();

      expect(result.success).toBe(false);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.getTrendingReels();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should use default limit when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await service.getTrendingReels();

      expect(mockFetch).toHaveBeenCalled();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('count=');
    });
  });

  describe('getRecommended', () => {
    it('should fetch recommended content successfully', async () => {
      const mockResponse = {
        tray: [
          {
            media: {
              pk: '456',
              code: 'DEF456',
              media_type: 2,
              like_count: 500,
              user: {
                pk: 'user2',
                username: 'anotheruser',
              },
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.getRecommended({ limit: 5 });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tray: [] }),
      });

      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(0);
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await service.getRecommended();

      expect(result.success).toBe(false);
    });
  });

  describe('getMediaInfo', () => {
    it('should fetch media info successfully', async () => {
      const mockResponse = {
        graphql: {
          shortcode_media: {
            id: '789',
            is_video: true,
            video_url: 'https://example.com/video.mp4',
            display_url: 'https://example.com/thumb.jpg',
            video_view_count: 5000,
            edge_media_preview_like: { count: 200 },
            edge_media_to_comment: { count: 30 },
            edge_media_to_caption: {
              edges: [{ node: { text: 'Test #hashtag @mention' } }],
            },
            owner: {
              id: 'owner1',
              username: 'mediaowner',
              is_verified: true,
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.getMediaInfo('ABC123');

      expect(result).not.toBeNull();
      expect(result!.shortcode).toBe('ABC123');
      expect(result!.type).toBe('reel');
    });

    it('should return null for non-existent media', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.getMediaInfo('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should extract hashtags from caption', async () => {
      const mockResponse = {
        graphql: {
          shortcode_media: {
            id: '101',
            is_video: true,
            edge_media_to_caption: {
              edges: [{ node: { text: 'Check this out! #trending #viral' } }],
            },
            owner: { id: '1', username: 'test' },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.getMediaInfo('TEST123');

      expect(result).not.toBeNull();
      expect(result!.hashtags).toContain('#trending');
      expect(result!.hashtags).toContain('#viral');
    });

    it('should extract mentions from caption', async () => {
      const mockResponse = {
        graphql: {
          shortcode_media: {
            id: '102',
            is_video: false,
            edge_media_to_caption: {
              edges: [{ node: { text: 'Thanks @user1 and @user2!' } }],
            },
            owner: { id: '1', username: 'test' },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.getMediaInfo('TEST456');

      expect(result).not.toBeNull();
      expect(result!.mentions).toContain('@user1');
      expect(result!.mentions).toContain('@user2');
    });
  });

  describe('updateCookies', () => {
    it('should update cookies without error', () => {
      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new-session-id',
      };

      expect(() => service.updateCookies(newCookies)).not.toThrow();
    });
  });
});

describe('createTrendingService', () => {
  it('should create new TrendingService instance', () => {
    const cookies: InstagramCookies = {
      sessionid: 'test',
      csrftoken: 'test',
      ds_user_id: 'test',
      rur: 'test',
      extractedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };

    const service = createTrendingService(cookies);
    expect(service).toBeInstanceOf(TrendingService);
  });
});
