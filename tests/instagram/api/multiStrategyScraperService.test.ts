/**
 * Multi-Strategy Instagram Scraper Service Tests
 * @see Issue #15 - Instagram scraping breakthrough
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MultiStrategyScraper,
  createMultiStrategyScraper,
  getReelInfo,
  searchHashtagMultiStrategy,
  getTrendingReelsMultiStrategy,
  type ReelInfo,
  type MultiStrategyHashtagResult,
  type ScrapingStrategy,
} from '../../../src/services/instagram/api/multiStrategyScraperService.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MultiStrategyScraper', () => {
  let scraper: MultiStrategyScraper;

  beforeEach(() => {
    vi.clearAllMocks();
    scraper = new MultiStrategyScraper({
      timeout: 5000,
      maxRetries: 1,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const defaultScraper = new MultiStrategyScraper();
      expect(defaultScraper).toBeInstanceOf(MultiStrategyScraper);
    });

    it('should create instance with custom config', () => {
      const customScraper = new MultiStrategyScraper({
        enableOEmbed: false,
        enableGraphQLPublic: true,
        enableWebScraping: false,
        timeout: 15000,
      });
      expect(customScraper).toBeInstanceOf(MultiStrategyScraper);
    });
  });

  describe('createMultiStrategyScraper', () => {
    it('should create a new MultiStrategyScraper instance', () => {
      const instance = createMultiStrategyScraper();
      expect(instance).toBeInstanceOf(MultiStrategyScraper);
    });

    it('should accept custom configuration', () => {
      const instance = createMultiStrategyScraper({
        timeout: 20000,
        enableOEmbed: false,
      });
      expect(instance).toBeInstanceOf(MultiStrategyScraper);
    });
  });

  describe('getReelInfo', () => {
    const mockOEmbedResponse = {
      version: '1.0',
      title: 'Test Reel Caption',
      author_name: 'testuser',
      author_url: 'https://www.instagram.com/testuser',
      author_id: 12345678,
      media_id: '3123456789012345678',
      provider_name: 'Instagram',
      provider_url: 'https://www.instagram.com',
      type: 'rich' as const,
      width: 326,
      height: null,
      html: '<blockquote>Test</blockquote>',
      thumbnail_url: 'https://example.com/thumb.jpg',
      thumbnail_width: 640,
      thumbnail_height: 640,
    };

    it('should extract shortcode from reel URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOEmbedResponse,
      });

      const result = await scraper.getReelInfo('https://www.instagram.com/reel/ABC123xyz/');

      expect(result.success).toBe(true);
      expect(result.data?.shortcode).toBe('ABC123xyz');
    });

    it('should extract shortcode from post URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOEmbedResponse,
      });

      const result = await scraper.getReelInfo('https://www.instagram.com/p/XYZ789abc/');

      expect(result.success).toBe(true);
      expect(result.data?.shortcode).toBe('XYZ789abc');
    });

    it('should handle shortcode directly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOEmbedResponse,
      });

      const result = await scraper.getReelInfo('DirectShortcode123');

      expect(result.success).toBe(true);
      expect(result.data?.shortcode).toBe('DirectShortcode123');
    });

    it('should use oEmbed strategy first', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOEmbedResponse,
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('oembed');
      expect(result.data?.id).toBe('3123456789012345678');
      expect(result.data?.owner.username).toBe('testuser');
      expect(result.data?.thumbnailUrl).toBe('https://example.com/thumb.jpg');
    });

    it('should fall back to GraphQL when oEmbed fails', async () => {
      // oEmbed fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // GraphQL succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            id: '987654321',
            shortcode: 'ABC123',
            video_url: 'https://example.com/video.mp4',
            thumbnail_src: 'https://example.com/thumb.jpg',
            edge_media_preview_like: { count: 1000 },
            edge_media_to_comment: { count: 50 },
            video_view_count: 50000,
            video_duration: 30,
            owner: {
              id: '12345',
              username: 'graphqluser',
              profile_pic_url: 'https://example.com/pic.jpg',
            },
            edge_media_to_caption: {
              edges: [{ node: { text: 'GraphQL Caption' } }],
            },
          }],
        }),
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('graphql_public');
      expect(result.data?.viewCount).toBe(50000);
    });

    it('should fall back to web scraping when both oEmbed and GraphQL fail', async () => {
      // oEmbed fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // GraphQL fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      // Alternative GraphQL fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      // Web scraping succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <script type="application/ld+json">
            {
              "name": "Web Scraped Caption",
              "author": {
                "name": "webuser",
                "identifier": { "value": "webuser" }
              },
              "thumbnailUrl": ["https://example.com/web-thumb.jpg"],
              "interactionStatistic": [
                { "interactionType": "WatchAction", "userInteractionCount": 75000 },
                { "interactionType": "LikeAction", "userInteractionCount": 2500 }
              ]
            }
            </script>
          </html>
        `,
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('web_scraping');
      expect(result.data?.caption).toBe('Web Scraped Caption');
    });

    it('should return failure when all strategies fail', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('All strategies failed');
    });

    it('should include execution time in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOEmbedResponse,
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(false);
      // When all strategies fail, the error message is a generic one
      expect(result.error).toBeDefined();
    });

    it('should respect disabled strategies', async () => {
      const limitedScraper = new MultiStrategyScraper({
        enableOEmbed: false,
        enableGraphQLPublic: false,
        enableWebScraping: false,
      });

      const result = await limitedScraper.getReelInfo('ABC123');

      expect(result.success).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('searchHashtag', () => {
    const mockExplorePageHtml = `
      <html>
        <script>
          {"shortcode":"POST1abc","is_video":false,"id":"111","username":"user1","edge_liked_by":{"count":100}}
          {"shortcode":"REEL2xyz","is_video":true,"id":"222","username":"user2","video_view_count":5000}
        </script>
      </html>
    `;

    it('should search hashtag and return results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockExplorePageHtml,
      });

      const result = await scraper.searchHashtag('travel');

      expect(result.success).toBe(true);
      expect(result.data?.hashtag).toBe('travel');
    });

    it('should normalize hashtag by removing # prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockExplorePageHtml,
      });

      const result = await scraper.searchHashtag('#photography');

      expect(result.data?.hashtag).toBe('photography');
    });

    it('should respect limit option', async () => {
      const manyPostsHtml = Array(30)
        .fill(null)
        .map((_, i) => `"shortcode":"POST${i}","is_video":false,"id":"${i}"`)
        .join('\n');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html>${manyPostsHtml}</html>`,
      });

      const result = await scraper.searchHashtag('test', { limit: 10 });

      expect(result.data?.posts.length).toBeLessThanOrEqual(10);
    });

    it('should track strategies used', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockExplorePageHtml,
      });

      const result = await scraper.searchHashtag('food');

      expect(result.data?.strategiesUsed).toContain('explore_anonymous');
    });

    it('should return hasMore flag', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockExplorePageHtml,
      });

      const result = await scraper.searchHashtag('nature', { limit: 1 });

      expect(result.data?.hasMore).toBeDefined();
    });

    it('should handle empty results gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html></html>',
      });

      const result = await scraper.searchHashtag('nonexistenttag12345');

      expect(result.success).toBe(false);
      expect(result.data?.totalFound).toBe(0);
    });
  });

  describe('getTrendingReels', () => {
    const mockExploreHtml = `
      <html>
        <script>
          {"shortcode":"TREND1","is_video":true,"username":"trendy1","video_view_count":100000}
          {"shortcode":"TREND2","is_video":true,"username":"trendy2","video_view_count":200000}
        </script>
      </html>
    `;

    it('should fetch trending reels from explore page', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockExploreHtml,
      });

      const result = await scraper.getTrendingReels();

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('explore_anonymous');
    });

    it('should respect limit parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockExploreHtml,
      });

      const result = await scraper.getTrendingReels(5);

      expect(result.data?.length).toBeLessThanOrEqual(5);
    });

    it('should extract engagement data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            {"shortcode":"VIRAL","is_video":true,"username":"viral","video_view_count":1000000,"edge_liked_by":{"count":50000}}
          </html>
        `,
      });

      const result = await scraper.getTrendingReels();

      expect(result.success).toBe(true);
      if (result.data && result.data.length > 0) {
        expect(result.data[0].engagement.views).toBe(1000000);
        expect(result.data[0].engagement.likes).toBe(50000);
      }
    });

    it('should handle explore page errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const result = await scraper.getTrendingReels();

      expect(result.success).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', async () => {
      const scraper = new MultiStrategyScraper({ enableOEmbed: true });

      // Update to disable oEmbed
      scraper.updateConfig({ enableOEmbed: false });

      // Now even a good response shouldn't be processed
      const result = await scraper.getReelInfo('ABC123');

      // oEmbed should be skipped, going to graphql
      expect(result.strategy !== 'oembed' || !result.success).toBe(true);
    });
  });

  describe('convenience functions', () => {
    describe('getReelInfo', () => {
      it('should return ReelInfo or null', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            version: '1.0',
            title: 'Test',
            author_name: 'user',
            author_id: 123,
            media_id: '456',
            provider_name: 'Instagram',
            provider_url: 'https://instagram.com',
            type: 'rich',
            width: 326,
            height: null,
            html: '<div></div>',
            thumbnail_url: 'https://example.com/thumb.jpg',
            thumbnail_width: 640,
            thumbnail_height: 640,
          }),
        });

        const result = await getReelInfo('ABC123');

        expect(result).toBeDefined();
        expect(result?.shortcode).toBe('ABC123');
      });

      it('should return null on failure', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
        });

        const result = await getReelInfo('ABC123');

        expect(result).toBeNull();
      });
    });

    describe('searchHashtagMultiStrategy', () => {
      it('should return MultiStrategyHashtagResult or null', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: async () => '<html>{"shortcode":"TEST1","is_video":false}</html>',
        });

        const result = await searchHashtagMultiStrategy('test');

        expect(result).toBeDefined();
        expect(result?.hashtag).toBe('test');
      });
    });

    describe('getTrendingReelsMultiStrategy', () => {
      it('should return array of TrendingContent', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: async () => '<html>{"shortcode":"TREND","is_video":true}</html>',
        });

        const result = await getTrendingReelsMultiStrategy();

        expect(Array.isArray(result)).toBe(true);
      });

      it('should return empty array on failure', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
        });

        const result = await getTrendingReelsMultiStrategy();

        expect(result).toEqual([]);
      });
    });
  });

  describe('error handling', () => {
    it('should handle timeout errors', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('AbortError'));
          }, 100);
        });
      });

      const timeoutScraper = new MultiStrategyScraper({ timeout: 50 });
      const result = await timeoutScraper.getReelInfo('ABC123');

      expect(result.success).toBe(false);
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      // Falls through to next strategies
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(false);
    });

    it('should handle rate limiting (429)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('HTML parsing edge cases', () => {
    it('should handle HTML without JSON-LD data', async () => {
      // oEmbed and GraphQL fail
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      // Web scraping with regex-parseable HTML
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            "media_id":"123456"
            "caption": "Regex Caption"
            "username":"regexuser"
            "thumbnail_src":"https://example.com/regex-thumb.jpg"
            "video_view_count":9999
          </html>
        `,
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(true);
      expect(result.data?.owner.username).toBe('regexuser');
    });

    it('should handle completely unparseable HTML', async () => {
      // All API strategies fail
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      // Web scraping returns unparseable content
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body>No data here</body></html>',
      });

      const result = await scraper.getReelInfo('ABC123');

      expect(result.success).toBe(false);
    });
  });
});

describe('ReelInfo type', () => {
  it('should have all required fields', () => {
    const reelInfo: ReelInfo = {
      id: '123',
      shortcode: 'ABC',
      url: 'https://instagram.com/reel/ABC/',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      caption: 'Test caption',
      viewCount: 1000,
      likeCount: 100,
      commentCount: 10,
      owner: {
        username: 'testuser',
      },
    };

    expect(reelInfo.id).toBe('123');
    expect(reelInfo.shortcode).toBe('ABC');
    expect(reelInfo.viewCount).toBe(1000);
  });

  it('should allow optional fields', () => {
    const reelInfo: ReelInfo = {
      id: '123',
      shortcode: 'ABC',
      url: 'https://instagram.com/reel/ABC/',
      thumbnailUrl: '',
      caption: '',
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      duration: 30,
      videoUrl: 'https://example.com/video.mp4',
      timestamp: Date.now(),
      owner: {
        id: '456',
        username: 'testuser',
        profilePicUrl: 'https://example.com/pic.jpg',
      },
    };

    expect(reelInfo.duration).toBe(30);
    expect(reelInfo.videoUrl).toBe('https://example.com/video.mp4');
    expect(reelInfo.owner.id).toBe('456');
  });
});

describe('ScrapingStrategy type', () => {
  it('should include all valid strategies', () => {
    const strategies: ScrapingStrategy[] = [
      'oembed',
      'graphql_public',
      'web_scraping',
      'explore_anonymous',
    ];

    expect(strategies).toContain('oembed');
    expect(strategies).toContain('graphql_public');
    expect(strategies).toContain('web_scraping');
    expect(strategies).toContain('explore_anonymous');
  });
});
