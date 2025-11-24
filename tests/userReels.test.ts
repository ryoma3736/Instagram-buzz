/**
 * User Reels Service Tests
 * @module tests/userReels.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InstagramCookies } from '../src/services/instagram/session/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import {
  UserReelsService,
  createUserReelsService,
} from '../src/services/instagram/api/userReels.js';
import {
  UserResolver,
  createUserResolver,
} from '../src/services/instagram/api/userResolver.js';
import type {
  ReelData,
  UserReelsResult,
  UserResolverResult,
} from '../src/services/instagram/api/types.js';

// Test fixtures
const mockCookies: InstagramCookies = {
  sessionid: 'test-session-id',
  csrftoken: 'test-csrf-token',
  ds_user_id: '12345678',
  rur: 'test-rur',
  extractedAt: Date.now(),
  expiresAt: Date.now() + 86400000,
};

const mockUserWebProfileResponse = {
  data: {
    user: {
      id: '123456789',
      username: 'testuser',
      full_name: 'Test User',
      profile_pic_url: 'https://example.com/pic.jpg',
      is_private: false,
      is_verified: true,
      edge_followed_by: { count: 10000 },
      edge_follow: { count: 500 },
      edge_owner_to_timeline_media: { count: 100 },
    },
  },
  status: 'ok',
};

const mockClipsResponse = {
  items: [
    {
      media: {
        pk: 'reel_001',
        code: 'ABC123',
        taken_at: 1700000000,
        caption: { text: 'Test reel caption' },
        like_count: 1000,
        comment_count: 50,
        play_count: 50000,
        video_duration: 30,
        image_versions2: {
          candidates: [{ url: 'https://example.com/thumb.jpg', width: 1080, height: 1920 }],
        },
        video_versions: [
          { url: 'https://example.com/video.mp4', type: 101, width: 1080, height: 1920 },
        ],
      },
    },
    {
      media: {
        pk: 'reel_002',
        code: 'DEF456',
        taken_at: 1700000100,
        caption: { text: 'Another reel' },
        like_count: 2000,
        comment_count: 100,
        play_count: 100000,
        video_duration: 15,
        image_versions2: {
          candidates: [{ url: 'https://example.com/thumb2.jpg', width: 1080, height: 1920 }],
        },
        video_versions: [
          { url: 'https://example.com/video2.mp4', type: 101, width: 1080, height: 1920 },
        ],
      },
    },
  ],
  paging_info: {
    more_available: true,
    max_id: 'next_cursor_123',
  },
  status: 'ok',
};

const mockMediaInfoResponse = {
  items: [
    {
      pk: 'reel_001',
      code: 'ABC123',
      taken_at: 1700000000,
      caption: { text: 'Test reel caption' },
      like_count: 1000,
      comment_count: 50,
      play_count: 50000,
      video_duration: 30,
      image_versions2: {
        candidates: [{ url: 'https://example.com/thumb.jpg', width: 1080, height: 1920 }],
      },
      video_versions: [
        { url: 'https://example.com/video.mp4', type: 101, width: 1080, height: 1920 },
      ],
    },
  ],
  status: 'ok',
};

describe('UserReelsService', () => {
  let service: UserReelsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createUserReelsService(mockCookies);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getReels', () => {
    it('should fetch reels for a public user', async () => {
      // Mock user profile resolution
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockUserWebProfileResponse,
        })
        // Mock clips fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockClipsResponse,
        });

      const result = await service.getReels('testuser');

      expect(result.reels).toHaveLength(2);
      expect(result.user.username).toBe('testuser');
      expect(result.user.id).toBe('123456789');
      expect(result.hasMore).toBe(true);
      expect(result.endCursor).toBe('next_cursor_123');
    });

    it('should throw error for private accounts', async () => {
      const privateUserResponse = {
        data: {
          user: {
            ...mockUserWebProfileResponse.data.user,
            is_private: true,
          },
        },
        status: 'ok',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => privateUserResponse,
      });

      await expect(service.getReels('privateuser')).rejects.toThrow(
        'Cannot fetch reels from private account'
      );
    });

    it('should handle pagination with cursor', async () => {
      // Use a different username to avoid cache from previous test
      const paginationUserResponse = {
        data: {
          user: {
            ...mockUserWebProfileResponse.data.user,
            username: 'paginationuser',
          },
        },
        status: 'ok',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => paginationUserResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => mockClipsResponse,
        });

      await service.getReels('paginationuser', {
        limit: 10,
        cursor: 'some_cursor',
      });

      // Verify cursor was included in request
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const clipsCall = mockFetch.mock.calls[1];
      expect(clipsCall[0]).toContain('max_id=some_cursor');
    });
  });

  describe('getReelById', () => {
    it('should fetch a single reel by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockMediaInfoResponse,
      });

      const result = await service.getReelById('reel_001');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('reel_001');
      expect(result?.shortcode).toBe('ABC123');
      expect(result?.viewCount).toBe(50000);
    });

    it('should return null for non-existent reel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'fail', message: 'Not found' }),
      });

      const result = await service.getReelById('non_existent');

      expect(result).toBeNull();
    });
  });

  describe('resolveUserId', () => {
    it('should resolve username to user ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockUserWebProfileResponse,
      });

      const userId = await service.resolveUserId('testuser');

      expect(userId).toBe('123456789');
    });

    it('should clean username with @ prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockUserWebProfileResponse,
      });

      const userId = await service.resolveUserId('@testuser');

      expect(userId).toBe('123456789');
    });
  });
});

describe('UserResolver', () => {
  let resolver: UserResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = createUserResolver(mockCookies);
    resolver.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolve', () => {
    it('should resolve username to full user info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockUserWebProfileResponse,
      });

      const result = await resolver.resolve('testuser');

      expect(result.userId).toBe('123456789');
      expect(result.username).toBe('testuser');
      expect(result.fullName).toBe('Test User');
      expect(result.isPrivate).toBe(false);
      expect(result.isVerified).toBe(true);
      expect(result.followerCount).toBe(10000);
    });

    it('should use cached result on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockUserWebProfileResponse,
      });

      // First call
      await resolver.resolve('testuser');
      // Second call should use cache
      await resolver.resolve('testuser');

      // Should only make one API call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error for empty username', async () => {
      await expect(resolver.resolve('')).rejects.toThrow('Username cannot be empty');
    });

    it('should throw error for non-existent user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'fail' }),
      });

      await expect(resolver.resolve('nonexistent')).rejects.toThrow();
    });
  });

  describe('clearCache', () => {
    it('should clear cached user data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockUserWebProfileResponse,
      });

      await resolver.resolve('testuser');
      resolver.clearCache();
      await resolver.resolve('testuser');

      // Should make two API calls after cache clear
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ReelData type validation', () => {
  it('should have correct structure', () => {
    const reel: ReelData = {
      id: 'test_id',
      shortcode: 'ABC123',
      url: 'https://www.instagram.com/reel/ABC123/',
      videoUrl: 'https://example.com/video.mp4',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      caption: 'Test caption',
      viewCount: 50000,
      likeCount: 1000,
      commentCount: 50,
      duration: 30,
      timestamp: 1700000000,
    };

    expect(reel.id).toBeDefined();
    expect(reel.shortcode).toBeDefined();
    expect(typeof reel.viewCount).toBe('number');
    expect(typeof reel.duration).toBe('number');
  });
});

describe('UserReelsResult type validation', () => {
  it('should have correct structure', () => {
    const result: UserReelsResult = {
      reels: [],
      hasMore: false,
      endCursor: null,
      user: {
        id: '123',
        username: 'test',
        fullName: 'Test User',
      },
    };

    expect(result.reels).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.hasMore).toBe(false);
    expect(result.endCursor).toBeNull();
  });
});
