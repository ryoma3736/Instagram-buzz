/**
 * UserReelsService Unit Tests
 * @module tests/unit/api/userReels
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UserReelsService,
  createUserReelsService,
} from '../../../src/services/instagram/api/userReels.js';
import { InstagramApiError } from '../../../src/services/instagram/api/apiClient.js';
import type { InstagramCookies } from '../../../src/services/instagram/session/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock userResolver
vi.mock('../../../src/services/instagram/api/userResolver', () => ({
  resolveUserId: vi.fn().mockResolvedValue({
    userId: '12345678',
    username: 'testuser',
    fullName: 'Test User',
    profilePicUrl: 'https://example.com/pic.jpg',
    followerCount: 1000,
    isVerified: false,
    isPrivate: false,
  }),
}));

// Test cookies
const mockCookies: InstagramCookies = {
  sessionid: 'test_session_id',
  csrftoken: 'test_csrf_token',
  ds_user_id: '12345678',
  rur: 'test_rur',
  extractedAt: Date.now(),
  expiresAt: Date.now() + 86400000,
};

// Sample reels API response
const mockReelsResponse = {
  items: [
    {
      media: {
        pk: '111111111',
        id: '111111111_12345678',
        code: 'ABC123',
        taken_at: 1700000000,
        caption: { text: 'First reel caption' },
        like_count: 500,
        comment_count: 50,
        play_count: 10000,
        video_duration: 30.5,
        image_versions2: {
          candidates: [
            { url: 'https://example.com/thumb1.jpg', width: 640, height: 640 },
          ],
        },
        video_versions: [
          { url: 'https://example.com/video1.mp4', type: 101, width: 1080, height: 1920 },
        ],
        user: {
          pk: '12345678',
          username: 'testuser',
          full_name: 'Test User',
          profile_pic_url: 'https://example.com/pic.jpg',
          is_verified: false,
          is_private: false,
        },
      },
    },
    {
      media: {
        pk: '222222222',
        id: '222222222_12345678',
        code: 'DEF456',
        taken_at: 1700000100,
        caption: { text: 'Second reel caption' },
        like_count: 300,
        comment_count: 30,
        play_count: 5000,
        video_duration: 15.0,
        image_versions2: {
          candidates: [
            { url: 'https://example.com/thumb2.jpg', width: 640, height: 640 },
          ],
        },
        video_versions: [
          { url: 'https://example.com/video2.mp4', type: 101, width: 1080, height: 1920 },
        ],
        user: {
          pk: '12345678',
          username: 'testuser',
        },
      },
    },
  ],
  paging_info: {
    more_available: true,
    max_id: 'next_cursor_123',
  },
  status: 'ok',
};

// Sample single media response
const mockMediaInfoResponse = {
  items: [
    {
      pk: '111111111',
      code: 'ABC123',
      taken_at: 1700000000,
      caption: { text: 'Reel caption' },
      like_count: 500,
      comment_count: 50,
      play_count: 10000,
      video_duration: 30.5,
      image_versions2: {
        candidates: [{ url: 'https://example.com/thumb.jpg' }],
      },
      video_versions: [{ url: 'https://example.com/video.mp4' }],
    },
  ],
};

describe('UserReelsService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with cookies', () => {
      const service = new UserReelsService(mockCookies);
      expect(service).toBeInstanceOf(UserReelsService);
    });
  });

  describe('getReels', () => {
    it('should get reels for a user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getReels('testuser');

      expect(result.reels.length).toBeGreaterThan(0);
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('testuser');
    });

    it('should support pagination options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getReels('testuser', {
        limit: 5,
        cursor: 'prev_cursor',
      });

      expect(result.reels).toBeDefined();
      expect(result.hasMore).toBe(true);
      expect(result.endCursor).toBe('next_cursor_123');
    });

    it('should throw error for private accounts', async () => {
      const { resolveUserId } = await import('../../../src/services/instagram/api/userResolver');
      vi.mocked(resolveUserId).mockResolvedValueOnce({
        userId: '12345678',
        username: 'privateuser',
        fullName: 'Private User',
        profilePicUrl: '',
        followerCount: 100,
        followingCount: 50,
        mediaCount: 10,
        isVerified: false,
        isPrivate: true,
      });

      const service = new UserReelsService(mockCookies);

      await expect(service.getReels('privateuser')).rejects.toThrow(InstagramApiError);
    });

    it('should return empty array when no reels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], status: 'ok' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getReels('testuser');

      expect(result.reels).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getReelsByUserId', () => {
    it('should get reels by user ID directly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getReelsByUserId('12345678');

      expect(result.reels.length).toBeGreaterThan(0);
      expect(result.hasMore).toBe(true);
    });

    it('should support options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getReelsByUserId('12345678', {
        limit: 10,
        cursor: 'cursor123',
      });

      expect(result.reels).toBeDefined();
    });
  });

  describe('getReelById', () => {
    it('should get single reel by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMediaInfoResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const reel = await service.getReelById('111111111');

      expect(reel).not.toBeNull();
      expect(reel?.id).toBe('111111111');
      expect(reel?.shortcode).toBe('ABC123');
    });

    it('should return null when reel not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const service = new UserReelsService(mockCookies);
      const reel = await service.getReelById('nonexistent');

      expect(reel).toBeNull();
    });

    it('should return null when response has no items', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const reel = await service.getReelById('111111111');

      expect(reel).toBeNull();
    });
  });

  describe('resolveUserId', () => {
    it('should resolve username to user ID', async () => {
      const service = new UserReelsService(mockCookies);
      const userId = await service.resolveUserId('testuser');

      expect(userId).toBe('12345678');
    });
  });

  describe('getAllReels', () => {
    it('should fetch all reels with pagination', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // Second page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              media: {
                pk: '333333333',
                code: 'GHI789',
                taken_at: 1700000200,
                caption: { text: 'Third reel' },
                like_count: 100,
                comment_count: 10,
                play_count: 1000,
              },
            },
          ],
          paging_info: {
            more_available: false,
          },
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getAllReels('testuser', 100);

      expect(result.reels.length).toBeGreaterThan(0);
      expect(result.user).toBeDefined();
    });

    it('should respect maxReels limit', async () => {
      const manyReelsResponse = {
        items: Array(12)
          .fill(null)
          .map((_, i) => ({
            media: {
              pk: String(1000 + i),
              code: `CODE${i}`,
              taken_at: 1700000000 + i,
              caption: { text: `Reel ${i}` },
              like_count: 100,
              comment_count: 10,
              play_count: 1000,
            },
          })),
        paging_info: {
          more_available: true,
          max_id: 'next',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => manyReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getAllReels('testuser', 5);

      expect(result.reels.length).toBe(5);
    });

    it('should default maxReels to 100', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          paging_info: { more_available: false },
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      await service.getAllReels('testuser');

      // Should not throw
    });
  });

  describe('updateCookies', () => {
    it('should update cookies', () => {
      const service = new UserReelsService(mockCookies);

      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new_session_id',
      };

      expect(() => service.updateCookies(newCookies)).not.toThrow();
    });
  });

  describe('ReelData structure', () => {
    it('should transform media to correct ReelData format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getReels('testuser');

      const reel = result.reels[0];
      expect(reel).toHaveProperty('id');
      expect(reel).toHaveProperty('shortcode');
      expect(reel).toHaveProperty('url');
      expect(reel).toHaveProperty('videoUrl');
      expect(reel).toHaveProperty('thumbnailUrl');
      expect(reel).toHaveProperty('caption');
      expect(reel).toHaveProperty('viewCount');
      expect(reel).toHaveProperty('likeCount');
      expect(reel).toHaveProperty('commentCount');
      expect(reel).toHaveProperty('duration');
      expect(reel).toHaveProperty('timestamp');
    });

    it('should generate correct reel URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getReels('testuser');

      const reel = result.reels[0];
      expect(reel.url).toContain('instagram.com/reel/');
      expect(reel.url).toContain(reel.shortcode);
    });
  });

  describe('UserProfile structure', () => {
    it('should include user profile in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockReelsResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const service = new UserReelsService(mockCookies);
      const result = await service.getReels('testuser');

      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('username');
      expect(result.user).toHaveProperty('fullName');
      expect(result.user).toHaveProperty('profilePicUrl');
      expect(result.user).toHaveProperty('followerCount');
      expect(result.user).toHaveProperty('isVerified');
      expect(result.user).toHaveProperty('isPrivate');
    });
  });

  describe('error handling', () => {
    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const service = new UserReelsService(mockCookies);

      await expect(service.getReelsByUserId('12345678')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const service = new UserReelsService(mockCookies);

      await expect(service.getReelsByUserId('12345678')).rejects.toThrow();
    });
  });
});

describe('createUserReelsService', () => {
  it('should create a new UserReelsService instance', () => {
    const service = createUserReelsService(mockCookies);
    expect(service).toBeInstanceOf(UserReelsService);
  });
});
