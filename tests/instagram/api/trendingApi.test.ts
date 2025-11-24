/**
 * TrendingApiService Tests
 * @module tests/instagram/api/trendingApi.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Import after mocking fetch
import {
  TrendingApiService,
  createTrendingApiService,
  fetchTrendingContent,
  fetchExploreContent,
} from '../../../src/services/instagram/api/trendingApi.js';

// Mock trending response
const mockTrendingResponse = {
  items: [
    {
      media: {
        pk: '123456789',
        code: 'ABC123',
        media_type: 2,
        caption: { text: 'Test caption #trending' },
        like_count: 1000,
        comment_count: 50,
        play_count: 10000,
        user: {
          pk: '987654321',
          username: 'testuser',
          is_verified: true,
        },
        taken_at: Math.floor(Date.now() / 1000),
        video_versions: [{ url: 'https://example.com/video.mp4' }],
      },
    },
    {
      media: {
        pk: '223456789',
        code: 'DEF456',
        media_type: 2,
        caption: { text: 'Another test #viral' },
        like_count: 2000,
        comment_count: 100,
        play_count: 20000,
        user: {
          pk: '887654321',
          username: 'anotheruser',
          is_verified: false,
        },
        taken_at: Math.floor(Date.now() / 1000),
        video_versions: [{ url: 'https://example.com/video2.mp4' }],
      },
    },
  ],
  more_available: true,
  next_max_id: 'cursor123',
};

// Mock explore response
const mockExploreResponse = {
  items: [
    {
      pk: '333456789',
      code: 'GHI789',
      media_type: 1,
      caption: { text: 'Explore content' },
      like_count: 5000,
      comment_count: 200,
      user: {
        pk: '777654321',
        username: 'exploreuser',
        is_verified: true,
      },
      taken_at: Math.floor(Date.now() / 1000),
      image_versions2: { candidates: [{ url: 'https://example.com/image.jpg' }] },
    },
  ],
  more_available: false,
};

describe('TrendingApiService', () => {
  let service: TrendingApiService;

  beforeEach(() => {
    mockFetch.mockReset();
    service = new TrendingApiService(mockCookies);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const svc = new TrendingApiService(mockCookies);
      expect(svc).toBeInstanceOf(TrendingApiService);
    });

    it('should create service with custom config', () => {
      const svc = new TrendingApiService(mockCookies, {
        maxRetries: 5,
        retryDelay: 2000,
        defaultLimit: 50,
        enableCache: false,
      });
      expect(svc).toBeInstanceOf(TrendingApiService);
    });
  });

  describe('getExplore', () => {
    it('should fetch explore content successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockExploreResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getExplore(10);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.items).toBeDefined();
    });

    it('should handle explore fetch failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await service.getExplore(10);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should use cached results on second call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockExploreResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // First call
      const result1 = await service.getExplore(10);
      // Second call should use cache
      const result2 = await service.getExplore(10);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('getTrendingReels', () => {
    it('should fetch trending reels successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTrendingResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getTrendingReels(20);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.items).toBeDefined();
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const result = await service.getTrendingReels(10);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getRecommended', () => {
    it('should fetch recommended content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ tray: mockTrendingResponse.items }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getRecommended();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('getExploreReels', () => {
    it('should fetch explore reels', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ items: mockTrendingResponse.items }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getExploreReels(10);

      expect(result.success).toBe(true);
    });
  });

  describe('getByCategory', () => {
    it('should fetch content by category', async () => {
      const mockHashtagResponse = {
        data: {
          hashtag: {
            edge_hashtag_to_media: {
              count: 1000,
              edges: [
                {
                  node: {
                    id: '444456789',
                    shortcode: 'JKL012',
                    is_video: true,
                    display_url: 'https://example.com/hashtag.jpg',
                    edge_liked_by: { count: 3000 },
                    edge_media_to_comment: { count: 150 },
                    taken_at_timestamp: Math.floor(Date.now() / 1000),
                    owner: { id: '666654321', username: 'hashtaguser' },
                  },
                },
              ],
            },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockHashtagResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getByCategory('fashion', 10);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should use cached category results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { hashtag: { edge_hashtag_to_media: { edges: [] } } } }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // First call
      await service.getByCategory('travel', 10);
      // Second call should use cache
      await service.getByCategory('travel', 10);

      // Check that fetch was called only once for this endpoint
      const travelCalls = mockFetch.mock.calls.filter(c =>
        typeof c[0] === 'string' && c[0].includes('travel')
      );
      expect(travelCalls.length).toBe(1);
    });
  });

  describe('getMediaInfo', () => {
    it('should fetch media info by shortcode', async () => {
      const mockMediaResponse = {
        graphql: {
          shortcode_media: {
            id: '555456789',
            is_video: true,
            video_url: 'https://example.com/media.mp4',
            edge_media_preview_like: { count: 5000 },
            edge_media_to_comment: { count: 250 },
            video_view_count: 50000,
            owner: {
              id: '555654321',
              username: 'mediaowner',
              is_verified: true,
              profile_pic_url: 'https://example.com/pic.jpg',
            },
            edge_media_to_caption: {
              edges: [{ node: { text: 'Media caption' } }],
            },
            taken_at_timestamp: Math.floor(Date.now() / 1000),
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockMediaResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getMediaInfo('XYZ789');

      expect(result).toBeDefined();
      expect(result?.shortcode).toBe('XYZ789');
    });

    it('should return null for invalid shortcode', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await service.getMediaInfo('invalid');

      expect(result).toBeNull();
    });
  });

  describe('getTopTrending', () => {
    it('should combine trending from multiple sources', async () => {
      // First call for explore
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockExploreResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // Second call for trending reels
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrendingResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getTopTrending(20);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.category).toBe('top_trending');
    });

    it('should deduplicate items from multiple sources', async () => {
      const duplicateResponse = {
        items: [
          {
            pk: '123456789', // Same ID as mockTrendingResponse
            code: 'ABC123',
            media_type: 2,
            caption: { text: 'Duplicate content' },
            like_count: 1000,
            comment_count: 50,
            user: { pk: '987654321', username: 'testuser' },
          },
        ],
        more_available: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => duplicateResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getTopTrending(20);

      expect(result.success).toBe(true);
      // Should not have duplicate items
      const ids = result.data?.items.map(i => i.id) || [];
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getRegionalTrending', () => {
    it('should fetch regional trending content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTrendingResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getRegionalTrending('JP', 10);

      expect(result.success).toBe(true);
      expect(result.data?.category).toContain('regional');
    });

    it('should include correct language header for region', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTrendingResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await service.getRegionalTrending('JP', 10);

      const fetchCalls = mockFetch.mock.calls;
      const regionalCall = fetchCalls.find(c =>
        c[1]?.headers?.['Accept-Language']?.includes('ja-JP')
      );
      expect(regionalCall).toBeDefined();
    });

    it('should fallback to general trending on error', async () => {
      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      // Fallback calls succeed
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTrendingResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.getRegionalTrending('CN', 10);

      expect(result.success).toBe(true);
    });
  });

  describe('testConnection', () => {
    it('should return true for valid connection', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { user: { id: '12345' } } }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.testConnection();

      expect(result).toBe(true);
    });

    it('should return false for invalid connection', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('updateCookies', () => {
    it('should update cookies and clear cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockExploreResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // First call to populate cache
      await service.getExplore(10);

      // Update cookies
      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new_session_id',
      };
      service.updateCookies(newCookies);

      // Second call should not use cache
      await service.getExplore(10);

      // Verify cookies were updated
      expect(service.getCookies().sessionid).toBe('new_session_id');
    });
  });

  describe('getCookies', () => {
    it('should return current cookies', () => {
      const cookies = service.getCookies();

      expect(cookies.sessionid).toBe('test_session_id');
      expect(cookies.csrftoken).toBe('test_csrf_token');
    });
  });

  describe('clearCache', () => {
    it('should clear cached results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockExploreResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // First call
      await service.getExplore(10);
      const fetchCountBefore = mockFetch.mock.calls.length;

      // Clear cache
      service.clearCache();

      // Second call should make new request
      await service.getExplore(10);
      const fetchCountAfter = mockFetch.mock.calls.length;

      expect(fetchCountAfter).toBeGreaterThan(fetchCountBefore);
    });
  });

  describe('caching behavior', () => {
    it('should not use cache when disabled', async () => {
      const noCacheService = new TrendingApiService(mockCookies, {
        enableCache: false,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockExploreResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // Two calls should both make requests
      await noCacheService.getExplore(10);
      const countAfterFirst = mockFetch.mock.calls.length;
      await noCacheService.getExplore(10);
      const countAfterSecond = mockFetch.mock.calls.length;

      expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
    });
  });
});

describe('createTrendingApiService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should create a TrendingApiService instance', () => {
    const service = createTrendingApiService(mockCookies);
    expect(service).toBeInstanceOf(TrendingApiService);
  });

  it('should create service with custom config', () => {
    const service = createTrendingApiService(mockCookies, {
      defaultLimit: 50,
      enableCache: false,
    });
    expect(service).toBeInstanceOf(TrendingApiService);
  });
});

describe('fetchTrendingContent', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch trending content using convenience function', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockTrendingResponse,
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const result = await fetchTrendingContent(mockCookies, 10);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

describe('fetchExploreContent', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch explore content using convenience function', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockExploreResponse,
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const result = await fetchExploreContent(mockCookies, 10);

    expect(result.success).toBe(true);
  });
});
