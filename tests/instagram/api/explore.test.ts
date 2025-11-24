/**
 * ExploreService Tests
 * @module tests/instagram/api/explore.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExploreService,
  createExploreService,
} from '../../../src/services/instagram/api/explore.js';
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

describe('ExploreService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with cookies', () => {
      const service = new ExploreService(mockCookies);
      expect(service).toBeInstanceOf(ExploreService);
    });
  });

  describe('getExplore', () => {
    it('should fetch explore content successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              pk: '123456',
              code: 'EXP123',
              media_type: 2,
              video_versions: [{ url: 'https://example.com/video.mp4' }],
              caption: { text: 'Explore content' },
              like_count: 2000,
              comment_count: 100,
              play_count: 10000,
              user: {
                pk: 'expuser',
                username: 'exploreuser',
                is_verified: true,
              },
              taken_at: Math.floor(Date.now() / 1000),
            },
          ],
          more_available: true,
          next_max_id: 'cursor456',
        }),
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExplore({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.topPicks).toHaveLength(1);
      expect(result.data!.topPicks[0].type).toBe('reel');
      expect(result.data!.hasMore).toBe(true);
    });

    it('should parse sectional items', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sectional_items: [
            {
              explore_item_info: {
                explore_item_id: 'section1',
                title: 'For You',
              },
              layout_content: {
                medias: [
                  {
                    pk: '111',
                    code: 'SEC111',
                    media_type: 1,
                    caption: { text: 'Section item' },
                    user: { pk: 'secuser', username: 'sectionuser' },
                  },
                ],
              },
            },
          ],
          items: [],
        }),
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExplore();

      expect(result.success).toBe(true);
      expect(result.data!.sections).toHaveLength(1);
      expect(result.data!.sections[0].id).toBe('section1');
      expect(result.data!.sections[0].title).toBe('For You');
      expect(result.data!.sections[0].items).toHaveLength(1);
    });

    it('should fallback to web scraping on API failure', async () => {
      // First request fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      // Web fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html>"shortcode":"WEB123"</html>',
      });

      // Media detail fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          graphql: {
            shortcode_media: {
              id: 'webmedia',
              is_video: false,
              display_url: 'https://example.com/image.jpg',
              edge_media_to_caption: { edges: [{ node: { text: 'Web content' } }] },
              edge_media_preview_like: { count: 500 },
              edge_media_to_comment: { count: 25 },
              owner: { id: 'webowner', username: 'webowner' },
            },
          },
        }),
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExplore({ limit: 5 });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          sectional_items: [],
        }),
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExplore();

      expect(result.success).toBe(true);
      expect(result.data!.topPicks).toHaveLength(0);
      expect(result.data!.sections).toHaveLength(0);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const service = new ExploreService(mockCookies);
      const result = await service.getExplore();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('getExploreReels', () => {
    it('should fetch explore reels successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              pk: '789',
              code: 'REEL789',
              media_type: 2,
              caption: { text: 'Discover reel' },
              user: { pk: 'reeluser', username: 'reelcreator' },
            },
          ],
        }),
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExploreReels({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].type).toBe('reel');
    });

    it('should handle pagination cursor', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
        }),
      });

      const service = new ExploreService(mockCookies);
      await service.getExploreReels({ cursor: 'page2cursor' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.any(URLSearchParams),
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExploreReels();

      expect(result.success).toBe(false);
    });
  });

  describe('getExploreByCategory', () => {
    it('should fetch content by category', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            hashtag: {
              edge_hashtag_to_top_posts: {
                edges: [
                  {
                    node: {
                      id: 'cat123',
                      shortcode: 'CAT123',
                      is_video: true,
                      display_url: 'https://example.com/cat.jpg',
                      edge_media_to_caption: { edges: [{ node: { text: '#fitness' } }] },
                      edge_liked_by: { count: 3000 },
                      edge_media_to_comment: { count: 150 },
                      video_view_count: 15000,
                      owner: { id: 'catowner', username: 'fitnessguru' },
                      taken_at_timestamp: Math.floor(Date.now() / 1000),
                    },
                  },
                ],
              },
            },
          },
        }),
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExploreByCategory('fitness');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].type).toBe('reel');
      expect(result.data![0].engagement.views).toBe(15000);
    });

    it('should handle alternative response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            hashtag: {
              edge_hashtag_to_media: {
                edges: [
                  {
                    node: {
                      id: 'alt123',
                      shortcode: 'ALT123',
                      is_video: false,
                      display_url: 'https://example.com/alt.jpg',
                      owner: { id: 'altowner' },
                    },
                  },
                ],
              },
            },
          },
        }),
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExploreByCategory('travel');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].type).toBe('post');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const service = new ExploreService(mockCookies);
      const result = await service.getExploreByCategory('invalid');

      expect(result.success).toBe(false);
    });

    it('should URL encode category name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { hashtag: { edge_hashtag_to_top_posts: { edges: [] } } },
        }),
      });

      const service = new ExploreService(mockCookies);
      await service.getExploreByCategory('special chars!');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('special chars!')),
        expect.any(Object)
      );
    });
  });

  describe('updateCookies', () => {
    it('should update cookies', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ items: [], sectional_items: [] }),
      });

      const service = new ExploreService(mockCookies);
      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new_explore_session',
      };

      service.updateCookies(newCookies);

      await service.getExplore();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: expect.stringContaining('sessionid=new_explore_session'),
          }),
        })
      );
    });
  });
});

describe('createExploreService', () => {
  it('should create a new ExploreService instance', () => {
    const service = createExploreService(mockCookies);
    expect(service).toBeInstanceOf(ExploreService);
  });
});
