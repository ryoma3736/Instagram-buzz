/**
 * oEmbed API Strategy for Instagram Scraping
 * Issue #15: Uses Instagram's official oEmbed API (no authentication required)
 * @module services/multiStrategy/strategies/oembedStrategy
 */

import { BuzzReel } from '../../../types/index.js';
import { StrategyResult, StrategyConfig } from '../types.js';
import { BaseStrategy, USER_AGENTS } from './baseStrategy.js';

/**
 * oEmbed API response structure
 */
interface OEmbedResponse {
  version: string;
  title: string;
  author_name: string;
  author_url: string;
  author_id: number;
  media_id: string;
  provider_name: string;
  provider_url: string;
  type: string;
  width: number;
  height: number;
  html: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
}

/**
 * oEmbed API Strategy
 * Uses Instagram's official oEmbed API which is rate-limited but reliable
 * Best for: Getting basic info for known URLs
 * Limitations: Cannot search, requires known URLs
 */
export class OEmbedStrategy extends BaseStrategy {
  private readonly oembedUrl = 'https://api.instagram.com/oembed/';
  private readonly alternativeOembedUrl = 'https://www.instagram.com/api/v1/oembed/';

  constructor(config: StrategyConfig) {
    super('oembed_api', config);
  }

  /**
   * Search by hashtag - Not supported by oEmbed
   * Falls back to web scraping to find URLs, then uses oEmbed for details
   */
  async searchByHashtag(
    hashtag: string,
    limit: number
  ): Promise<StrategyResult> {
    const startTime = Date.now();
    const tag = hashtag.replace(/^#/, '');

    this.log(`Searching hashtag #${tag} via oEmbed (indirect method)`);

    try {
      const result = await this.withRetry(async () => {
        // First, scrape hashtag page to get URLs
        const urls = await this.scrapeHashtagUrls(tag, limit);

        if (urls.length === 0) {
          return [];
        }

        // Then use oEmbed to get details for each URL
        const reels: BuzzReel[] = [];

        for (const url of urls) {
          try {
            const reel = await this.fetchOEmbed(url);
            if (reel) {
              reels.push(reel);
            }
            // Add small delay to avoid rate limiting
            await this.sleep(200);
          } catch {
            // Continue with other URLs
          }
        }

        return reels;
      }, `hashtagSearch:${tag}`);

      const executionTimeMs = Date.now() - startTime;
      return this.createSuccessResult(result, executionTimeMs);
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return this.createFailedResult(
        (error as Error).message,
        executionTimeMs
      );
    }
  }

  /**
   * Get user reels - Not directly supported by oEmbed
   * Falls back to web scraping to find URLs, then uses oEmbed for details
   */
  async getUserReels(username: string, limit: number): Promise<StrategyResult> {
    const startTime = Date.now();

    this.log(`Fetching reels from @${username} via oEmbed (indirect method)`);

    try {
      const result = await this.withRetry(async () => {
        // Scrape user's reels page to get URLs
        const urls = await this.scrapeUserReelUrls(username, limit);

        if (urls.length === 0) {
          return [];
        }

        // Use oEmbed to get details
        const reels: BuzzReel[] = [];

        for (const url of urls) {
          try {
            const reel = await this.fetchOEmbed(url);
            if (reel) {
              reels.push(reel);
            }
            await this.sleep(200);
          } catch {
            // Continue with other URLs
          }
        }

        return reels;
      }, `userReels:${username}`);

      const executionTimeMs = Date.now() - startTime;
      return this.createSuccessResult(result, executionTimeMs);
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return this.createFailedResult(
        (error as Error).message,
        executionTimeMs
      );
    }
  }

  /**
   * Get single reel by URL - This is the primary use case for oEmbed
   */
  async getReelByUrl(url: string): Promise<StrategyResult> {
    const startTime = Date.now();

    this.log(`Fetching reel via oEmbed: ${url}`);

    try {
      const reel = await this.withRetry(async () => {
        return await this.fetchOEmbed(url);
      }, `getReelByUrl:${url}`);

      const executionTimeMs = Date.now() - startTime;
      return this.createSuccessResult(reel ? [reel] : [], executionTimeMs);
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return this.createFailedResult(
        (error as Error).message,
        executionTimeMs
      );
    }
  }

  /**
   * Get trending reels - Not supported by oEmbed
   */
  async getTrendingReels(limit: number): Promise<StrategyResult> {
    const startTime = Date.now();

    this.log(`Fetching trending reels via oEmbed (indirect method)`);

    try {
      const result = await this.withRetry(async () => {
        // Scrape trending page to get URLs
        const urls = await this.scrapeTrendingUrls(limit);

        if (urls.length === 0) {
          return [];
        }

        // Use oEmbed to get details
        const reels: BuzzReel[] = [];

        for (const url of urls) {
          try {
            const reel = await this.fetchOEmbed(url);
            if (reel) {
              reels.push(reel);
            }
            await this.sleep(200);
          } catch {
            // Continue
          }
        }

        return reels;
      }, 'trendingReels');

      const executionTimeMs = Date.now() - startTime;
      return this.createSuccessResult(result, executionTimeMs);
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return this.createFailedResult(
        (error as Error).message,
        executionTimeMs
      );
    }
  }

  /**
   * Fetch oEmbed data for a URL
   */
  private async fetchOEmbed(url: string): Promise<BuzzReel | null> {
    // Normalize URL
    const normalizedUrl = this.normalizeUrl(url);
    const shortcode = this.extractShortcode(normalizedUrl);

    // Try primary oEmbed endpoint
    let response = await fetch(
      `${this.oembedUrl}?url=${encodeURIComponent(normalizedUrl)}&maxwidth=320&omitscript=true`,
      {
        headers: {
          'User-Agent': USER_AGENTS.desktop,
          Accept: 'application/json',
        },
      }
    );

    // If primary fails, try alternative endpoint
    if (!response.ok) {
      response = await fetch(
        `${this.alternativeOembedUrl}?url=${encodeURIComponent(normalizedUrl)}`,
        {
          headers: {
            'User-Agent': USER_AGENTS.ios,
            Accept: 'application/json',
          },
        }
      );
    }

    if (!response.ok) {
      throw new Error(`oEmbed request failed: ${response.status}`);
    }

    const text = await response.text();

    // Check for HTML response
    if (this.isHtmlResponse(text)) {
      throw new Error('Received HTML instead of JSON from oEmbed');
    }

    const data = this.safeJsonParse<OEmbedResponse>(text, 'oembed');
    if (!data) {
      throw new Error('Failed to parse oEmbed response');
    }

    return this.transformOEmbedToReel(data, shortcode || '', normalizedUrl);
  }

  /**
   * Scrape hashtag page for URLs
   */
  private async scrapeHashtagUrls(
    tag: string,
    limit: number
  ): Promise<string[]> {
    const pageUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;

    const response = await fetch(pageUrl, {
      headers: this.buildHeaders({
        userAgent: USER_AGENTS.ios,
        accept: 'text/html',
      }),
    });

    const html = await response.text();

    // Check for blocking
    const blockDetection = this.detectBlock(response, html);
    if (blockDetection.blocked) {
      throw new Error(`Blocked: ${blockDetection.blockType}`);
    }

    // Extract shortcodes
    const shortcodeMatches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
    const shortcodes = [...new Set([...shortcodeMatches].map((m) => m[1]))];

    return shortcodes
      .slice(0, limit)
      .map((code) => `https://www.instagram.com/reel/${code}/`);
  }

  /**
   * Scrape user reels page for URLs
   */
  private async scrapeUserReelUrls(
    username: string,
    limit: number
  ): Promise<string[]> {
    const pageUrl = `https://www.instagram.com/${username}/reels/`;

    const response = await fetch(pageUrl, {
      headers: this.buildHeaders({
        userAgent: USER_AGENTS.ios,
        accept: 'text/html',
      }),
    });

    const html = await response.text();

    // Check for blocking
    const blockDetection = this.detectBlock(response, html);
    if (blockDetection.blocked) {
      throw new Error(`Blocked: ${blockDetection.blockType}`);
    }

    // Extract shortcodes
    const codeMatches = html.matchAll(/"code":"([A-Za-z0-9_-]+)"/g);
    const codes = [...new Set([...codeMatches].map((m) => m[1]))];

    return codes
      .slice(0, limit)
      .map((code) => `https://www.instagram.com/reel/${code}/`);
  }

  /**
   * Scrape trending page for URLs
   */
  private async scrapeTrendingUrls(limit: number): Promise<string[]> {
    const pageUrl = 'https://www.instagram.com/reels/';

    const response = await fetch(pageUrl, {
      headers: this.buildHeaders({
        userAgent: USER_AGENTS.ios,
        accept: 'text/html',
      }),
    });

    const html = await response.text();

    // Check for blocking
    const blockDetection = this.detectBlock(response, html);
    if (blockDetection.blocked) {
      throw new Error(`Blocked: ${blockDetection.blockType}`);
    }

    // Extract codes
    const codeMatches = html.matchAll(/"code":"([A-Za-z0-9_-]+)"/g);
    const codes = [...new Set([...codeMatches].map((m) => m[1]))];

    return codes
      .slice(0, limit)
      .map((code) => `https://www.instagram.com/reel/${code}/`);
  }

  /**
   * Normalize Instagram URL
   */
  private normalizeUrl(url: string): string {
    // Convert reel URLs to post format for oEmbed compatibility
    const shortcode = this.extractShortcode(url);
    if (shortcode) {
      return `https://www.instagram.com/p/${shortcode}/`;
    }
    return url;
  }

  /**
   * Transform oEmbed response to BuzzReel
   */
  private transformOEmbedToReel(
    data: OEmbedResponse,
    shortcode: string,
    url: string
  ): BuzzReel {
    return {
      id: data.media_id || shortcode,
      url: url.replace('/p/', '/reel/'),
      shortcode,
      title: data.title || '',
      views: 0, // oEmbed doesn't provide view count
      likes: 0, // oEmbed doesn't provide like count
      comments: 0, // oEmbed doesn't provide comment count
      posted_at: new Date(), // oEmbed doesn't provide timestamp
      author: {
        username: data.author_name || 'unknown',
        followers: 0,
      },
      thumbnail_url: data.thumbnail_url,
    };
  }
}
