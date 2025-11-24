/**
 * HashtagSearchService Tests
 * @module tests/instagram/api/hashtagSearch.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InstagramCookies } from '../../../src/services/instagram/session/types.js';

// Mock fetch globally before importing modules that use it
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
import {
  HashtagSearchService,
  createHashtagSearchService,
  searchHashtag,
} from '../../../src/services/instagram/api/hashtagSearch.js';

// Test cookies
const mockCookies: InstagramCookies = {
  sessionid: 'test_session_id',
  csrftoken: 'test_csrf_token',
  ds_user_id: '12345678',
  rur: 'test_rur',
  extractedAt: Date.now(),
  expiresAt: Date.now() + 86400000,
};

// Sample API response for sections endpoint
const mockSectionsResponse = {
  sections: [
    {
      layout_content: {
        medias: [
          {
            media: {
              pk: '123456789',
              code: 'ABC123',
              media_type: 2,
              caption: { text: 'Test caption #test' },
              like_count: 1000,
              comment_count: 50,
              taken_at: 1700000000,
              user: {
                pk: '987654321',
                username: 'testuser',
              },
            },
          },
          {
            media: {
              pk: '223456789',
              code: 'DEF456',
              media_type: 1,
              caption: { text: 'Another caption #test #photo' },
              like_count: 500,
              comment_count: 25,
              taken_at: 1700000100,
              user: {
                pk: '887654321',
                username: 'anotheruser',
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

// Sample API response for web info endpoint
const mockWebInfoResponse = {
  data: {
    hashtag: {
      id: '17841401234567890',
      name: 'test',
      media_count: 1000000,
      edge_hashtag_to_top_posts: {
        edges: [
          {
            node: {
              id: '333456789',
              shortcode: 'GHI789',
              is_video: true,
              edge_media_to_caption: {
                edges: [{ node: { text: 'Top post caption' } }],
              },
              edge_liked_by: { count: 5000 },
              edge_media_to_comment: { count: 200 },
              taken_at_timestamp: 1700000200,
              owner: {
                id: '777654321',
                username: 'topuser',
              },
            },
          },
        ],
      },
      edge_hashtag_to_media: {
        edges: [],
        page_info: {
          has_next_page: true,
          end_cursor: 'graphql_cursor',
        },
      },
    },
  },
};

describe('HashtagSearchService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with cookies', () => {
      const service = new HashtagSearchService(mockCookies);
      expect(service).toBeInstanceOf(HashtagSearchService);
    });

    it('should create service with custom config', () => {
      const service = new HashtagSearchService(mockCookies, {
        maxRetries: 5,
        retryDelay: 2000,
      });
      expect(service).toBeInstanceOf(HashtagSearchService);
    });
  });

  describe('search', () => {
    it('should search for hashtag and return posts', async () => {
      const responseText = JSON.stringify(mockSectionsResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSectionsResponse,
        text: async () => responseText,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const result = await service.search('test', 10);

      expect(result.posts.length).toBeGreaterThan(0);
      expect(result.hashtag).toBe('test');
      expect(result.hasMore).toBe(true);
      expect(result.endCursor).toBe('cursor123');
    }, 10000);

    it('should normalize hashtag by removing #', async () => {
      const responseText = JSON.stringify(mockSectionsResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSectionsResponse,
        text: async () => responseText,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const result = await service.search('#test', 10);

      expect(result.hashtag).toBe('test');
    }, 10000);

    it('should fallback to web info on sections failure', async () => {
      // First call (sections) fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal Server Error',
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      // Second call (web info) succeeds
      const webInfoText = JSON.stringify(mockWebInfoResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockWebInfoResponse,
        text: async () => webInfoText,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const result = await service.search('test', 10);

      expect(result.posts.length).toBeGreaterThan(0);
    }, 10000);

    it('should limit results to specified limit', async () => {
      const largeResponse = {
        sections: [
          {
            layout_content: {
              medias: Array(20)
                .fill(null)
                .map((_, i) => ({
                  media: {
                    pk: String(1000 + i),
                    code: `CODE${i}`,
                    media_type: 2,
                    caption: { text: `Caption ${i}` },
                    like_count: 100,
                    comment_count: 10,
                    taken_at: 1700000000 + i,
                    user: { pk: '123', username: 'user' },
                  },
                })),
            },
          },
        ],
        more_available: true,
      };

      const responseText = JSON.stringify(largeResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => largeResponse,
        text: async () => responseText,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const result = await service.search('test', 5);

      expect(result.posts.length).toBe(5);
    }, 10000);
  });

  describe('searchTopPosts', () => {
    it('should return top posts sorted by engagement', async () => {
      const responseText = JSON.stringify(mockSectionsResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSectionsResponse,
        text: async () => responseText,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const posts = await service.searchTopPosts('test');

      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBeLessThanOrEqual(9);

      // Verify sorted by engagement
      for (let i = 1; i < posts.length; i++) {
        const prevEngagement =
          posts[i - 1].likeCount + posts[i - 1].commentCount;
        const currEngagement = posts[i].likeCount + posts[i].commentCount;
        expect(prevEngagement).toBeGreaterThanOrEqual(currEngagement);
      }
    }, 10000);
  });

  describe('searchRecentPosts', () => {
    it('should return recent posts sorted by timestamp', async () => {
      const responseText = JSON.stringify(mockSectionsResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSectionsResponse,
        text: async () => responseText,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const posts = await service.searchRecentPosts('test', 10);

      expect(Array.isArray(posts)).toBe(true);

      // Verify sorted by timestamp (most recent first)
      for (let i = 1; i < posts.length; i++) {
        expect(posts[i - 1].timestamp).toBeGreaterThanOrEqual(
          posts[i].timestamp
        );
      }
    }, 10000);
  });

  describe('getHashtagInfo', () => {
    it('should return hashtag information', async () => {
      const webInfoText = JSON.stringify(mockWebInfoResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockWebInfoResponse,
        text: async () => webInfoText,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const info = await service.getHashtagInfo('test');

      expect(info).not.toBeNull();
      expect(info?.name).toBe('test');
      expect(info?.mediaCount).toBe(1000000);
    }, 10000);

    it('should return null on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not Found',
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const info = await service.getHashtagInfo('nonexistent');

      expect(info).toBeNull();
    }, 10000);
  });

  describe('searchWithPagination', () => {
    it('should support pagination with cursor', async () => {
      const responseText = JSON.stringify(mockSectionsResponse);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSectionsResponse,
        text: async () => responseText,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0, retryDelay: 0 });
      const result = await service.searchWithPagination('test', {
        cursor: 'some_cursor',
        limit: 20,
      });

      expect(result.posts).toBeDefined();

      // Verify the cursor was sent
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('max_id=some_cursor'),
        })
      );
    }, 10000);
  });

  describe('updateCookies', () => {
    it('should update cookies', () => {
      const service = new HashtagSearchService(mockCookies);

      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new_session_id',
      };

      // Should not throw
      expect(() => service.updateCookies(newCookies)).not.toThrow();
    });
  });
});

describe('createHashtagSearchService', () => {
  it('should create a new HashtagSearchService instance', () => {
    const service = createHashtagSearchService(mockCookies);
    expect(service).toBeInstanceOf(HashtagSearchService);
  });
});

describe('searchHashtag', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return success response with posts', async () => {
    const responseJson = JSON.stringify(mockSectionsResponse);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSectionsResponse,
      text: async () => responseJson,
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const result = await searchHashtag(mockCookies, 'test', 10);

    expect(result.success).toBe(true);
    expect(result.data?.posts.length).toBeGreaterThan(0);
  });

  it('should return empty result when all methods fail', async () => {
    // Mock all fetch calls to fail
    mockFetch.mockImplementation(() => {
      throw new Error('Network error');
    });

    // Create service with no retries to speed up test
    const service = new HashtagSearchService(mockCookies, {
      maxRetries: 0,
      retryDelay: 0,
    });
    const result = await service.search('test', 10);

    // Service returns empty results on failure
    expect(result.posts.length).toBe(0);
    expect(result.hashtag).toBe('test');
  }, 10000);
});

describe('InstagramPost structure', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should parse posts with correct structure', async () => {
    const responseJson = JSON.stringify(mockSectionsResponse);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSectionsResponse,
      text: async () => responseJson,
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const service = new HashtagSearchService(mockCookies);
    const result = await service.search('test', 10);

    const post = result.posts[0];
    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('shortcode');
    expect(post).toHaveProperty('url');
    expect(post).toHaveProperty('mediaType');
    expect(post).toHaveProperty('caption');
    expect(post).toHaveProperty('likeCount');
    expect(post).toHaveProperty('commentCount');
    expect(post).toHaveProperty('timestamp');
    expect(post).toHaveProperty('owner');
    expect(post.owner).toHaveProperty('id');
    expect(post.owner).toHaveProperty('username');
  });

  it('should generate correct URLs for video posts', async () => {
    const responseJson = JSON.stringify(mockSectionsResponse);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSectionsResponse,
      text: async () => responseJson,
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const service = new HashtagSearchService(mockCookies);
    const result = await service.search('test', 10);

    const videoPost = result.posts.find((p) => p.mediaType === 'video');
    if (videoPost) {
      expect(videoPost.url).toContain('instagram.com/reel/');
    }
  });

  it('should generate correct URLs for image posts', async () => {
    const responseJson = JSON.stringify(mockSectionsResponse);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSectionsResponse,
      text: async () => responseJson,
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const service = new HashtagSearchService(mockCookies);
    const result = await service.search('test', 10);

    const imagePost = result.posts.find((p) => p.mediaType === 'image');
    if (imagePost) {
      expect(imagePost.url).toContain('instagram.com/p/');
    }
  });
});
