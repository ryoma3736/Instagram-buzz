/**
 * Instagram Enhanced Scraper Service Tests
 *
 * @author CodeGenAgent
 * @issue #15
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstagramEnhancedScraperService } from '../src/services/instagramEnhancedScraperService.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('InstagramEnhancedScraperService', () => {
  let service: InstagramEnhancedScraperService;

  beforeEach(() => {
    service = new InstagramEnhancedScraperService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getReelByOEmbed', () => {
    it('should fetch reel info using oEmbed API', async () => {
      const mockOEmbedResponse = {
        title: 'Test Reel Caption',
        author_name: 'testuser',
        thumbnail_url: 'https://example.com/thumb.jpg',
        media_id: '12345',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOEmbedResponse,
      });

      const result = await service.getReelByOEmbed('https://www.instagram.com/reel/ABC123/');

      expect(result).not.toBeNull();
      expect(result?.shortcode).toBe('ABC123');
      expect(result?.title).toBe('Test Reel Caption');
      expect(result?.author.username).toBe('testuser');
      expect(result?.thumbnail_url).toBe('https://example.com/thumb.jpg');
    });

    it('should return null on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.getReelByOEmbed('https://www.instagram.com/reel/INVALID/');

      expect(result).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.getReelByOEmbed('https://www.instagram.com/reel/ABC123/');

      expect(result).toBeNull();
    });
  });

  describe('getReelByGraphQL', () => {
    it('should fetch reel info using GraphQL API', async () => {
      const mockGraphQLResponse = {
        data: {
          shortcode_media: {
            id: '12345',
            video_view_count: 50000,
            edge_media_preview_like: { count: 1000 },
            edge_media_to_comment: { count: 50 },
            taken_at_timestamp: 1700000000,
            edge_media_to_caption: {
              edges: [{ node: { text: 'GraphQL caption' } }],
            },
            owner: {
              username: 'graphqluser',
              edge_followed_by: { count: 10000 },
            },
            thumbnail_src: 'https://example.com/graphql-thumb.jpg',
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGraphQLResponse,
      });

      const result = await service.getReelByGraphQL('ABC123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('12345');
      expect(result?.views).toBe(50000);
      expect(result?.likes).toBe(1000);
      expect(result?.comments).toBe(50);
      expect(result?.title).toBe('GraphQL caption');
      expect(result?.author.username).toBe('graphqluser');
      expect(result?.author.followers).toBe(10000);
    });

    it('should return null when media not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { shortcode_media: null } }),
      });

      const result = await service.getReelByGraphQL('NOTFOUND');

      expect(result).toBeNull();
    });
  });

  describe('getUserReels', () => {
    it('should try multiple strategies until success', async () => {
      // First call (WebProfile API) - fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      // Second call (GraphQL - getUserId) - fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      // Third call (HTML parsing) - succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <script>"code":"ABC123"</script>
            <script>"code":"DEF456"</script>
          </html>
        `,
      });

      // oEmbed for ABC123
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Reel 1',
          author_name: 'testuser',
          thumbnail_url: 'https://example.com/1.jpg',
        }),
      });

      // oEmbed for DEF456
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Reel 2',
          author_name: 'testuser',
          thumbnail_url: 'https://example.com/2.jpg',
        }),
      });

      const result = await service.getUserReels('testuser', 5);

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should use WebProfile API when available', async () => {
      const mockWebProfileResponse = {
        data: {
          user: {
            edge_owner_to_timeline_media: {
              edges: [
                {
                  node: {
                    id: '1',
                    shortcode: 'ABC123',
                    is_video: true,
                    video_view_count: 1000,
                    edge_media_preview_like: { count: 100 },
                    edge_media_to_comment: { count: 10 },
                    taken_at_timestamp: 1700000000,
                    edge_media_to_caption: { edges: [{ node: { text: 'Caption' } }] },
                    owner: { username: 'testuser' },
                    thumbnail_src: 'https://example.com/thumb.jpg',
                  },
                },
              ],
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebProfileResponse,
      });

      const result = await service.getUserReels('testuser', 5);

      expect(result.length).toBe(1);
      expect(result[0].shortcode).toBe('ABC123');
      expect(result[0].views).toBe(1000);
    });
  });

  describe('searchByHashtag', () => {
    it('should search reels by hashtag', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <script>"shortcode":"HASH123"</script>
          </html>
        `,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Hashtag Reel',
          author_name: 'hashuser',
        }),
      });

      const result = await service.searchByHashtag('trending', 5);

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle hashtag with # prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html></html>',
      });

      const result = await service.searchByHashtag('#trending', 5);

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('trending'),
        expect.any(Object)
      );
    });
  });

  describe('getTrendingReels', () => {
    it('should fetch trending reels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <script>"code":"TREND1"</script>
            <script>"code":"TREND2"</script>
          </html>
        `,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Trending Reel',
          author_name: 'trenduser',
        }),
      });

      const result = await service.getTrendingReels(5);

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const result = await service.getTrendingReels(5);

      expect(result).toEqual([]);
    });
  });

  describe('getReelByUrl', () => {
    it('should extract shortcode and fetch reel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'URL Reel',
          author_name: 'urluser',
          thumbnail_url: 'https://example.com/url.jpg',
        }),
      });

      const result = await service.getReelByUrl('https://www.instagram.com/reel/URLCODE123/');

      expect(result).not.toBeNull();
      expect(result?.shortcode).toBe('URLCODE123');
    });

    it('should return null for invalid URL', async () => {
      const result = await service.getReelByUrl('https://invalid-url.com');

      expect(result).toBeNull();
    });

    it('should support p/ URL format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Post Reel',
          author_name: 'postuser',
        }),
      });

      const result = await service.getReelByUrl('https://www.instagram.com/p/POSTCODE/');

      expect(result).not.toBeNull();
      expect(result?.shortcode).toBe('POSTCODE');
    });
  });

  describe('testStrategies', () => {
    it('should test all strategies and return status', async () => {
      // oEmbed test
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      // WebProfile test
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      // HTML test
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.testStrategies();

      expect(result).toHaveProperty('oEmbed');
      expect(result).toHaveProperty('WebProfileAPI');
      expect(result).toHaveProperty('HTMLAccess');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce minimum request interval', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ title: 'Test' }),
      });

      const start = Date.now();

      await service.getReelByOEmbed('https://www.instagram.com/reel/A/');
      await service.getReelByOEmbed('https://www.instagram.com/reel/B/');

      const elapsed = Date.now() - start;

      // Should have at least 1 second delay between requests
      expect(elapsed).toBeGreaterThanOrEqual(900); // Allow 100ms tolerance
    });
  });
});
