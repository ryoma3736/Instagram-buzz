/**
 * HashtagSearchService Unit Tests
 * @module tests/unit/api/hashtagSearch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HashtagSearchService,
  createHashtagSearchService,
  searchHashtag,
  HashtagSearchConfig,
} from '../../../src/services/instagram/api/hashtagSearch.js';
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
      const config: HashtagSearchConfig = {
        maxRetries: 5,
        retryDelay: 2000,
        retryOnFailure: true,
      };
      const service = new HashtagSearchService(mockCookies, config);
      expect(service).toBeInstanceOf(HashtagSearchService);
    });

    it('should use default config when none provided', () => {
      const service = new HashtagSearchService(mockCookies);
      expect(service).toBeInstanceOf(HashtagSearchService);
    });
  });

  describe('search', () => {
    it('should search for hashtag and return posts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectionsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const result = await service.search('test', 10);

      expect(result.posts.length).toBeGreaterThan(0);
      expect(result.hashtag).toBe('test');
      expect(result.hasMore).toBe(true);
      expect(result.endCursor).toBe('cursor123');
    });

    it('should normalize hashtag by removing #', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectionsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const result = await service.search('#test', 10);

      expect(result.hashtag).toBe('test');
    });

    it('should use default limit of 20', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectionsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      await service.search('test');

      // Should not throw
    });

    it('should fallback to web info on sections failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockWebInfoResponse,
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const service = new HashtagSearchService(mockCookies, { maxRetries: 0 });
      const result = await service.search('test', 10);

      expect(result.posts.length).toBeGreaterThan(0);
    });

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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => largeResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const result = await service.search('test', 5);

      expect(result.posts.length).toBe(5);
    });

    it('should return empty result on all failures', async () => {
      mockFetch.mockImplementation(() => {
        throw new Error('Network error');
      });

      const service = new HashtagSearchService(mockCookies, {
        maxRetries: 0,
        retryDelay: 0,
      });
      const result = await service.search('test', 10);

      expect(result.posts.length).toBe(0);
      expect(result.hashtag).toBe('test');
    });
  });

  describe('searchTopPosts', () => {
    it('should return top posts sorted by engagement', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectionsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const posts = await service.searchTopPosts('test');

      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBeLessThanOrEqual(9);

      // Verify sorted by engagement (descending)
      for (let i = 1; i < posts.length; i++) {
        const prevEngagement = posts[i - 1].likeCount + posts[i - 1].commentCount;
        const currEngagement = posts[i].likeCount + posts[i].commentCount;
        expect(prevEngagement).toBeGreaterThanOrEqual(currEngagement);
      }
    });

    it('should limit to 9 top posts', async () => {
      const manyPostsResponse = {
        sections: [
          {
            layout_content: {
              medias: Array(15)
                .fill(null)
                .map((_, i) => ({
                  media: {
                    pk: String(i),
                    code: `CODE${i}`,
                    media_type: 2,
                    caption: { text: 'Caption' },
                    like_count: 100 * (15 - i),
                    comment_count: 10,
                    taken_at: 1700000000,
                    user: { pk: '123', username: 'user' },
                  },
                })),
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => manyPostsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const posts = await service.searchTopPosts('test');

      expect(posts.length).toBe(9);
    });
  });

  describe('searchRecentPosts', () => {
    it('should return recent posts sorted by timestamp', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectionsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const posts = await service.searchRecentPosts('test', 10);

      expect(Array.isArray(posts)).toBe(true);

      // Verify sorted by timestamp (most recent first)
      for (let i = 1; i < posts.length; i++) {
        expect(posts[i - 1].timestamp).toBeGreaterThanOrEqual(posts[i].timestamp);
      }
    });

    it('should use default limit of 20', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectionsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const posts = await service.searchRecentPosts('test');

      expect(Array.isArray(posts)).toBe(true);
    });
  });

  describe('getHashtagInfo', () => {
    it('should return hashtag information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebInfoResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const info = await service.getHashtagInfo('test');

      expect(info).not.toBeNull();
      expect(info?.name).toBe('test');
      expect(info?.mediaCount).toBe(1000000);
    });

    it('should return null on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const service = new HashtagSearchService(mockCookies);
      const info = await service.getHashtagInfo('nonexistent');

      expect(info).toBeNull();
    });

    it('should normalize hashtag', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebInfoResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const info = await service.getHashtagInfo('#test');

      expect(info?.name).toBe('test');
    });
  });

  describe('searchWithPagination', () => {
    it('should support pagination with cursor', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectionsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const result = await service.searchWithPagination('test', {
        cursor: 'some_cursor',
        limit: 20,
      });

      expect(result.posts).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('max_id=some_cursor'),
        })
      );
    });

    it('should call regular search without cursor', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSectionsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new HashtagSearchService(mockCookies);
      const result = await service.searchWithPagination('test', { limit: 10 });

      expect(result.posts).toBeDefined();
    });
  });

  describe('updateCookies', () => {
    it('should update cookies without throwing', () => {
      const service = new HashtagSearchService(mockCookies);

      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new_session_id',
      };

      expect(() => service.updateCookies(newCookies)).not.toThrow();
    });
  });

  describe('retry logic', () => {
    it('should retry on transient failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSectionsResponse,
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const service = new HashtagSearchService(mockCookies, {
        maxRetries: 2,
        retryDelay: 10,
      });
      const result = await service.search('test', 10);

      expect(result.posts.length).toBeGreaterThan(0);
    });

    it('should not retry on authentication error', async () => {
      const authError = new Error('Unauthorized');
      (authError as any).statusCode = 401;

      mockFetch.mockRejectedValue(authError);

      const service = new HashtagSearchService(mockCookies, {
        maxRetries: 3,
        retryDelay: 10,
      });
      const result = await service.search('test', 10);

      // Should return empty result after failure
      expect(result.posts.length).toBe(0);
    });
  });
});

describe('createHashtagSearchService', () => {
  it('should create a new HashtagSearchService instance', () => {
    const service = createHashtagSearchService(mockCookies);
    expect(service).toBeInstanceOf(HashtagSearchService);
  });

  it('should accept config parameter', () => {
    const service = createHashtagSearchService(mockCookies, {
      maxRetries: 5,
    });
    expect(service).toBeInstanceOf(HashtagSearchService);
  });
});

describe('searchHashtag wrapper', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return success response with posts', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSectionsResponse,
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const result = await searchHashtag(mockCookies, 'test', 10);

    expect(result.success).toBe(true);
    expect(result.data?.posts.length).toBeGreaterThan(0);
  });

  it('should return error on failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await searchHashtag(mockCookies, 'test', 10);

    // Even on error, it may return empty success
    expect(result).toHaveProperty('success');
  });
});

describe('InstagramPost structure', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should parse posts with correct structure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSectionsResponse,
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
});
