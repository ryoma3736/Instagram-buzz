/**
 * Multi-Strategy Instagram Scraper Service
 * Implements multiple fallback strategies for bypassing Instagram blocks
 *
 * Strategies (in order of priority):
 * 1. Instagram oEmbed API - No API key required, public endpoint
 * 2. Instagram GraphQL Public API - Public web endpoint
 * 3. Web Scraping Fallback - Direct HTML parsing
 *
 * @module services/instagram/api/multiStrategyScraperService
 * @see Issue #15 - Instagram scraping breakthrough
 */

import type {
  InstagramPost,
  HashtagSearchResult,
  ReelData,
  TrendingContent,
} from './types.js';

// ============================================
// Types
// ============================================

/**
 * Scraping strategy identifier
 */
export type ScrapingStrategy =
  | 'oembed'
  | 'graphql_public'
  | 'web_scraping'
  | 'explore_anonymous';

/**
 * Strategy result with metadata
 */
export interface StrategyResult<T> {
  /** Whether the strategy succeeded */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Strategy that was used */
  strategy: ScrapingStrategy;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Multi-strategy scraper configuration
 */
export interface MultiStrategyScraperConfig {
  /** Enable oEmbed strategy (default: true) */
  enableOEmbed?: boolean;
  /** Enable GraphQL public strategy (default: true) */
  enableGraphQLPublic?: boolean;
  /** Enable web scraping fallback (default: true) */
  enableWebScraping?: boolean;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** User agent for requests */
  userAgent?: string;
  /** Maximum retries per strategy (default: 2) */
  maxRetries?: number;
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
}

/**
 * oEmbed API response
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
  type: 'rich';
  width: number;
  height: number | null;
  html: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
}

/**
 * Reel info extracted from various sources
 */
export interface ReelInfo {
  id: string;
  shortcode: string;
  url: string;
  videoUrl?: string;
  thumbnailUrl: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration?: number;
  timestamp?: number;
  owner: {
    id?: string;
    username: string;
    profilePicUrl?: string;
  };
}

/**
 * Hashtag search result from multi-strategy
 */
export interface MultiStrategyHashtagResult {
  hashtag: string;
  posts: InstagramPost[];
  reels: ReelInfo[];
  totalFound: number;
  strategiesUsed: ScrapingStrategy[];
  hasMore: boolean;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: Required<MultiStrategyScraperConfig> = {
  enableOEmbed: true,
  enableGraphQLPublic: true,
  enableWebScraping: true,
  timeout: 10000,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  maxRetries: 2,
  retryDelay: 1000,
};

/**
 * Instagram oEmbed API endpoint
 */
const OEMBED_ENDPOINT = 'https://api.instagram.com/oembed';

/**
 * Instagram public GraphQL endpoints
 */
const GRAPHQL_ENDPOINTS = {
  /** Tag page data */
  TAG_PAGE: 'https://www.instagram.com/explore/tags/',
  /** Reel page data */
  REEL_PAGE: 'https://www.instagram.com/reel/',
  /** Profile page data */
  PROFILE_PAGE: 'https://www.instagram.com/',
  /** Explore page */
  EXPLORE_PAGE: 'https://www.instagram.com/explore/',
} as const;

// ============================================
// Multi-Strategy Scraper Service
// ============================================

/**
 * Multi-Strategy Instagram Scraper
 *
 * Provides multiple fallback strategies for scraping Instagram data
 * without requiring API keys or authenticated sessions.
 *
 * @example
 * ```typescript
 * const scraper = new MultiStrategyScraper();
 *
 * // Get reel info by URL
 * const reelInfo = await scraper.getReelInfo('https://instagram.com/reel/ABC123');
 *
 * // Search hashtag
 * const results = await scraper.searchHashtag('travel', { limit: 20 });
 * ```
 */
export class MultiStrategyScraper {
  private config: Required<MultiStrategyScraperConfig>;

  constructor(config: MultiStrategyScraperConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================
  // Public Methods
  // ============================================

  /**
   * Get reel information by URL or shortcode
   * Tries multiple strategies in order of priority
   *
   * @param urlOrShortcode - Instagram reel URL or shortcode
   * @returns Reel information
   */
  async getReelInfo(urlOrShortcode: string): Promise<StrategyResult<ReelInfo>> {
    const startTime = Date.now();
    const shortcode = this.extractShortcode(urlOrShortcode);
    const url = `https://www.instagram.com/reel/${shortcode}/`;

    console.log(`[MultiStrategyScraper] Getting reel info for: ${shortcode}`);

    // Strategy 1: oEmbed API
    if (this.config.enableOEmbed) {
      const oembedResult = await this.getReelViaOEmbed(url);
      if (oembedResult.success) {
        return {
          ...oembedResult,
          executionTimeMs: Date.now() - startTime,
        };
      }
      console.log(`[MultiStrategyScraper] oEmbed failed: ${oembedResult.error}`);
    }

    // Strategy 2: GraphQL Public
    if (this.config.enableGraphQLPublic) {
      const graphqlResult = await this.getReelViaGraphQL(shortcode);
      if (graphqlResult.success) {
        return {
          ...graphqlResult,
          executionTimeMs: Date.now() - startTime,
        };
      }
      console.log(`[MultiStrategyScraper] GraphQL failed: ${graphqlResult.error}`);
    }

    // Strategy 3: Web Scraping
    if (this.config.enableWebScraping) {
      const webResult = await this.getReelViaWebScraping(url);
      if (webResult.success) {
        return {
          ...webResult,
          executionTimeMs: Date.now() - startTime,
        };
      }
      console.log(`[MultiStrategyScraper] Web scraping failed: ${webResult.error}`);
    }

    return {
      success: false,
      error: 'All strategies failed to retrieve reel info',
      strategy: 'web_scraping',
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Search hashtag for posts and reels
   *
   * @param hashtag - Hashtag to search (with or without #)
   * @param options - Search options
   * @returns Search results
   */
  async searchHashtag(
    hashtag: string,
    options: { limit?: number } = {}
  ): Promise<StrategyResult<MultiStrategyHashtagResult>> {
    const startTime = Date.now();
    const tag = hashtag.replace(/^#/, '').trim();
    const limit = options.limit || 20;

    console.log(`[MultiStrategyScraper] Searching hashtag: #${tag} (limit: ${limit})`);

    const strategiesUsed: ScrapingStrategy[] = [];
    const allPosts: InstagramPost[] = [];
    const allReels: ReelInfo[] = [];

    // Strategy 1: Explore anonymous (public tag page)
    if (this.config.enableWebScraping) {
      const exploreResult = await this.searchHashtagViaExplorePage(tag, limit);
      if (exploreResult.success && exploreResult.data) {
        strategiesUsed.push('explore_anonymous');
        allPosts.push(...exploreResult.data.posts);
        allReels.push(...exploreResult.data.reels);
      }
    }

    // Strategy 2: GraphQL public
    if (this.config.enableGraphQLPublic && allPosts.length < limit) {
      const graphqlResult = await this.searchHashtagViaGraphQL(tag, limit - allPosts.length);
      if (graphqlResult.success && graphqlResult.data) {
        strategiesUsed.push('graphql_public');
        // Merge unique posts
        for (const post of graphqlResult.data.posts) {
          if (!allPosts.some(p => p.id === post.id)) {
            allPosts.push(post);
          }
        }
      }
    }

    // Strategy 3: Get reel details via oEmbed for found shortcodes
    if (this.config.enableOEmbed && allReels.length > 0) {
      strategiesUsed.push('oembed');
      // Enhance reel data with oEmbed (already done in explore)
    }

    const result: MultiStrategyHashtagResult = {
      hashtag: tag,
      posts: allPosts.slice(0, limit),
      reels: allReels.slice(0, limit),
      totalFound: allPosts.length + allReels.length,
      strategiesUsed,
      hasMore: allPosts.length > limit || allReels.length > limit,
    };

    return {
      success: result.totalFound > 0,
      data: result,
      strategy: strategiesUsed[0] || 'explore_anonymous',
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get trending reels from explore page
   *
   * @param limit - Maximum number of reels to retrieve
   * @returns Array of trending content
   */
  async getTrendingReels(limit: number = 20): Promise<StrategyResult<TrendingContent[]>> {
    const startTime = Date.now();

    console.log(`[MultiStrategyScraper] Getting trending reels (limit: ${limit})`);

    // Try explore page scraping
    const result = await this.getExplorePageReels(limit);

    return {
      ...result,
      executionTimeMs: Date.now() - startTime,
    };
  }

  // ============================================
  // Strategy: oEmbed API
  // ============================================

  /**
   * Get reel info via Instagram oEmbed API
   * This is a public API that doesn't require authentication
   */
  private async getReelViaOEmbed(url: string): Promise<StrategyResult<ReelInfo>> {
    try {
      const oembedUrl = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}&omitscript=true`;

      const response = await this.fetchWithTimeout(oembedUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': this.config.userAgent,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `oEmbed API returned ${response.status}`,
          strategy: 'oembed',
          executionTimeMs: 0,
        };
      }

      const data = await response.json() as OEmbedResponse;

      // Extract shortcode from URL
      const shortcode = this.extractShortcode(url);

      const reelInfo: ReelInfo = {
        id: data.media_id,
        shortcode,
        url,
        thumbnailUrl: data.thumbnail_url,
        caption: data.title || '',
        viewCount: 0, // Not available in oEmbed
        likeCount: 0, // Not available in oEmbed
        commentCount: 0, // Not available in oEmbed
        owner: {
          id: String(data.author_id),
          username: data.author_name,
        },
      };

      // Try to extract more data from HTML embed
      const htmlData = this.parseOEmbedHtml(data.html);
      if (htmlData) {
        reelInfo.viewCount = htmlData.viewCount || 0;
        reelInfo.likeCount = htmlData.likeCount || 0;
      }

      return {
        success: true,
        data: reelInfo,
        strategy: 'oembed',
        executionTimeMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        strategy: 'oembed',
        executionTimeMs: 0,
      };
    }
  }

  /**
   * Parse oEmbed HTML for additional data
   */
  private parseOEmbedHtml(html: string): { viewCount?: number; likeCount?: number } | null {
    try {
      // Try to extract view/like counts from embedded HTML
      const viewMatch = html.match(/(\d[\d,]*)\s*(?:views|再生)/i);
      const likeMatch = html.match(/(\d[\d,]*)\s*(?:likes|いいね)/i);

      return {
        viewCount: viewMatch ? parseInt(viewMatch[1].replace(/,/g, ''), 10) : undefined,
        likeCount: likeMatch ? parseInt(likeMatch[1].replace(/,/g, ''), 10) : undefined,
      };
    } catch {
      return null;
    }
  }

  // ============================================
  // Strategy: GraphQL Public API
  // ============================================

  /**
   * Get reel info via GraphQL public endpoint
   */
  private async getReelViaGraphQL(shortcode: string): Promise<StrategyResult<ReelInfo>> {
    try {
      const url = `${GRAPHQL_ENDPOINTS.REEL_PAGE}${shortcode}/?__a=1&__d=dis`;

      const response = await this.fetchWithTimeout(url, {
        headers: this.getPublicHeaders(),
      });

      if (!response.ok) {
        // Try alternative endpoint
        return this.getReelViaAlternativeGraphQL(shortcode);
      }

      const data = await response.json() as Record<string, unknown>;
      const media = this.extractMediaFromResponse(data);

      if (!media) {
        return {
          success: false,
          error: 'Could not extract media from GraphQL response',
          strategy: 'graphql_public',
          executionTimeMs: 0,
        };
      }

      const reelInfo = this.parseGraphQLMedia(media, shortcode);

      return {
        success: true,
        data: reelInfo,
        strategy: 'graphql_public',
        executionTimeMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        strategy: 'graphql_public',
        executionTimeMs: 0,
      };
    }
  }

  /**
   * Alternative GraphQL endpoint for reels
   */
  private async getReelViaAlternativeGraphQL(shortcode: string): Promise<StrategyResult<ReelInfo>> {
    try {
      // Try the post endpoint instead
      const url = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;

      const response = await this.fetchWithTimeout(url, {
        headers: this.getPublicHeaders(),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Alternative GraphQL returned ${response.status}`,
          strategy: 'graphql_public',
          executionTimeMs: 0,
        };
      }

      const data = await response.json() as Record<string, unknown>;
      const media = this.extractMediaFromResponse(data);

      if (!media) {
        return {
          success: false,
          error: 'Could not extract media from alternative GraphQL response',
          strategy: 'graphql_public',
          executionTimeMs: 0,
        };
      }

      const reelInfo = this.parseGraphQLMedia(media, shortcode);

      return {
        success: true,
        data: reelInfo,
        strategy: 'graphql_public',
        executionTimeMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        strategy: 'graphql_public',
        executionTimeMs: 0,
      };
    }
  }

  /**
   * Search hashtag via GraphQL
   */
  private async searchHashtagViaGraphQL(
    tag: string,
    limit: number
  ): Promise<StrategyResult<{ posts: InstagramPost[] }>> {
    try {
      const url = `${GRAPHQL_ENDPOINTS.TAG_PAGE}${encodeURIComponent(tag)}/?__a=1&__d=dis`;

      const response = await this.fetchWithTimeout(url, {
        headers: this.getPublicHeaders(),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `GraphQL hashtag search returned ${response.status}`,
          strategy: 'graphql_public',
          executionTimeMs: 0,
        };
      }

      const data = await response.json() as Record<string, unknown>;
      const posts = this.extractHashtagPosts(data, limit);

      return {
        success: posts.length > 0,
        data: { posts },
        strategy: 'graphql_public',
        executionTimeMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        strategy: 'graphql_public',
        executionTimeMs: 0,
      };
    }
  }

  // ============================================
  // Strategy: Web Scraping
  // ============================================

  /**
   * Get reel info via web scraping
   */
  private async getReelViaWebScraping(url: string): Promise<StrategyResult<ReelInfo>> {
    try {
      const response = await this.fetchWithTimeout(url, {
        headers: this.getPublicHeaders(),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Web scraping returned ${response.status}`,
          strategy: 'web_scraping',
          executionTimeMs: 0,
        };
      }

      const html = await response.text();
      const reelInfo = this.parseReelFromHtml(html, url);

      if (!reelInfo) {
        return {
          success: false,
          error: 'Could not parse reel info from HTML',
          strategy: 'web_scraping',
          executionTimeMs: 0,
        };
      }

      return {
        success: true,
        data: reelInfo,
        strategy: 'web_scraping',
        executionTimeMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        strategy: 'web_scraping',
        executionTimeMs: 0,
      };
    }
  }

  /**
   * Search hashtag via explore page scraping
   */
  private async searchHashtagViaExplorePage(
    tag: string,
    limit: number
  ): Promise<StrategyResult<{ posts: InstagramPost[]; reels: ReelInfo[] }>> {
    try {
      const url = `${GRAPHQL_ENDPOINTS.TAG_PAGE}${encodeURIComponent(tag)}/`;

      const response = await this.fetchWithTimeout(url, {
        headers: {
          ...this.getPublicHeaders(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Explore page returned ${response.status}`,
          strategy: 'explore_anonymous',
          executionTimeMs: 0,
        };
      }

      const html = await response.text();
      const { posts, reels } = this.parseHashtagPageHtml(html, tag, limit);

      return {
        success: posts.length > 0 || reels.length > 0,
        data: { posts, reels },
        strategy: 'explore_anonymous',
        executionTimeMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        strategy: 'explore_anonymous',
        executionTimeMs: 0,
      };
    }
  }

  /**
   * Get trending reels from explore page
   */
  private async getExplorePageReels(limit: number): Promise<StrategyResult<TrendingContent[]>> {
    try {
      const response = await this.fetchWithTimeout(GRAPHQL_ENDPOINTS.EXPLORE_PAGE, {
        headers: {
          ...this.getPublicHeaders(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Explore page returned ${response.status}`,
          strategy: 'explore_anonymous',
          executionTimeMs: 0,
        };
      }

      const html = await response.text();
      const reels = this.parseExplorePageHtml(html, limit);

      return {
        success: reels.length > 0,
        data: reels,
        strategy: 'explore_anonymous',
        executionTimeMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        strategy: 'explore_anonymous',
        executionTimeMs: 0,
      };
    }
  }

  // ============================================
  // HTML Parsing Helpers
  // ============================================

  /**
   * Parse reel info from HTML page
   */
  private parseReelFromHtml(html: string, url: string): ReelInfo | null {
    try {
      const shortcode = this.extractShortcode(url);

      // Try to find JSON data in page
      const scriptMatch = html.match(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
      );

      if (scriptMatch) {
        try {
          const jsonData = JSON.parse(scriptMatch[1]) as Record<string, unknown>;
          return this.parseJsonLdData(jsonData, shortcode, url);
        } catch {
          // Continue with regex parsing
        }
      }

      // Fallback: regex parsing for key data
      const idMatch = html.match(/"media_id":"(\d+)"/);
      const captionMatch = html.match(/"caption":\s*"([^"]+)"/);
      const usernameMatch = html.match(/"username":"([^"]+)"/);
      const thumbnailMatch = html.match(/"thumbnail_src":"([^"]+)"/);
      const viewMatch = html.match(/"video_view_count":(\d+)/);
      const likeMatch = html.match(/"edge_media_preview_like":\s*\{\s*"count":\s*(\d+)/);
      const commentMatch = html.match(/"edge_media_to_comment":\s*\{\s*"count":\s*(\d+)/);

      if (!usernameMatch) {
        return null;
      }

      return {
        id: idMatch?.[1] || shortcode,
        shortcode,
        url,
        thumbnailUrl: thumbnailMatch?.[1]?.replace(/\\u0026/g, '&') || '',
        caption: captionMatch?.[1] || '',
        viewCount: viewMatch ? parseInt(viewMatch[1], 10) : 0,
        likeCount: likeMatch ? parseInt(likeMatch[1], 10) : 0,
        commentCount: commentMatch ? parseInt(commentMatch[1], 10) : 0,
        owner: {
          username: usernameMatch[1],
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse JSON-LD data from HTML
   */
  private parseJsonLdData(
    data: Record<string, unknown>,
    shortcode: string,
    url: string
  ): ReelInfo | null {
    try {
      const name = (data.name as string) || '';
      const author = data.author as Record<string, unknown>;
      const thumbnailUrl = ((data.thumbnailUrl as string[]) || [])[0] || '';
      const interactionStatistic = data.interactionStatistic as Array<Record<string, unknown>>;

      let viewCount = 0;
      let likeCount = 0;
      let commentCount = 0;

      if (interactionStatistic) {
        for (const stat of interactionStatistic) {
          const type = stat.interactionType as string;
          const count = (stat.userInteractionCount as number) || 0;
          if (type?.includes('Watch')) viewCount = count;
          if (type?.includes('Like')) likeCount = count;
          if (type?.includes('Comment')) commentCount = count;
        }
      }

      return {
        id: shortcode,
        shortcode,
        url,
        thumbnailUrl,
        caption: name,
        viewCount,
        likeCount,
        commentCount,
        owner: {
          username: ((author?.identifier as Record<string, unknown>)?.value as string) ||
                    (author?.name as string) ||
                    '',
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse hashtag page HTML for posts and reels
   */
  private parseHashtagPageHtml(
    html: string,
    _tag: string,
    limit: number
  ): { posts: InstagramPost[]; reels: ReelInfo[] } {
    const posts: InstagramPost[] = [];
    const reels: ReelInfo[] = [];

    try {
      // Extract shortcodes from the page
      const shortcodeMatches = html.matchAll(/"shortcode"\s*:\s*"([A-Za-z0-9_-]+)"/g);
      const shortcodes = [...new Set([...shortcodeMatches].map(m => m[1]))];

      // Try to find media type for each shortcode
      for (const shortcode of shortcodes.slice(0, limit)) {
        // Check if it's a video/reel
        const isVideoRegex = new RegExp(
          `"shortcode"\\s*:\\s*"${shortcode}"[^}]*"is_video"\\s*:\\s*true`
        );
        const isVideo = isVideoRegex.test(html);

        // Extract basic data
        const mediaIdMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*"id"\\s*:\\s*"(\\d+)"`));
        const captionMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*?"text"\\s*:\\s*"([^"]{0,500})"`));
        const usernameMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*?"username"\\s*:\\s*"([^"]+)"`));
        const likeMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*?"edge_liked_by"\\s*:\\s*\\{\\s*"count"\\s*:\\s*(\\d+)`));

        if (isVideo) {
          // It's a reel
          const viewMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*?"video_view_count"\\s*:\\s*(\\d+)`));

          reels.push({
            id: mediaIdMatch?.[1] || shortcode,
            shortcode,
            url: `https://www.instagram.com/reel/${shortcode}/`,
            thumbnailUrl: '',
            caption: captionMatch?.[1] || '',
            viewCount: viewMatch ? parseInt(viewMatch[1], 10) : 0,
            likeCount: likeMatch ? parseInt(likeMatch[1], 10) : 0,
            commentCount: 0,
            owner: {
              username: usernameMatch?.[1] || '',
            },
          });
        } else {
          // It's a post
          posts.push({
            id: mediaIdMatch?.[1] || shortcode,
            shortcode,
            url: `https://www.instagram.com/p/${shortcode}/`,
            mediaType: 'image',
            caption: captionMatch?.[1] || '',
            likeCount: likeMatch ? parseInt(likeMatch[1], 10) : 0,
            commentCount: 0,
            timestamp: Date.now(),
            owner: {
              id: '',
              username: usernameMatch?.[1] || '',
            },
          });
        }
      }
    } catch {
      // Return whatever we have
    }

    return { posts, reels };
  }

  /**
   * Parse explore page HTML for trending content
   */
  private parseExplorePageHtml(html: string, limit: number): TrendingContent[] {
    const content: TrendingContent[] = [];

    try {
      // Extract shortcodes
      const shortcodeMatches = html.matchAll(/"shortcode"\s*:\s*"([A-Za-z0-9_-]+)"/g);
      const shortcodes = [...new Set([...shortcodeMatches].map(m => m[1]))];

      for (const shortcode of shortcodes.slice(0, limit)) {
        const isVideoRegex = new RegExp(
          `"shortcode"\\s*:\\s*"${shortcode}"[^}]*"is_video"\\s*:\\s*true`
        );
        const isVideo = isVideoRegex.test(html);

        const usernameMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*?"username"\\s*:\\s*"([^"]+)"`));
        const captionMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*?"text"\\s*:\\s*"([^"]{0,500})"`));
        const likeMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*?"edge_liked_by"\\s*:\\s*\\{\\s*"count"\\s*:\\s*(\\d+)`));
        const viewMatch = html.match(new RegExp(`"shortcode"\\s*:\\s*"${shortcode}"[^}]*?"video_view_count"\\s*:\\s*(\\d+)`));

        content.push({
          type: isVideo ? 'reel' : 'post',
          id: shortcode,
          shortcode,
          url: `https://www.instagram.com/${isVideo ? 'reel' : 'p'}/${shortcode}/`,
          mediaUrl: '',
          caption: captionMatch?.[1] || '',
          engagement: {
            likes: likeMatch ? parseInt(likeMatch[1], 10) : 0,
            comments: 0,
            views: viewMatch ? parseInt(viewMatch[1], 10) : undefined,
          },
          owner: {
            id: '',
            username: usernameMatch?.[1] || '',
            isVerified: false,
          },
        });
      }
    } catch {
      // Return whatever we have
    }

    return content;
  }

  // ============================================
  // GraphQL Response Parsing
  // ============================================

  /**
   * Extract media data from GraphQL response
   */
  private extractMediaFromResponse(data: Record<string, unknown>): Record<string, unknown> | null {
    // Try different response structures
    if (data.items && Array.isArray(data.items)) {
      return (data.items as Array<Record<string, unknown>>)[0] || null;
    }

    if (data.graphql) {
      const graphql = data.graphql as Record<string, unknown>;
      if (graphql.shortcode_media) {
        return graphql.shortcode_media as Record<string, unknown>;
      }
    }

    if (data.data) {
      const dataObj = data.data as Record<string, unknown>;
      if (dataObj.xdt_shortcode_media) {
        return dataObj.xdt_shortcode_media as Record<string, unknown>;
      }
    }

    return null;
  }

  /**
   * Parse GraphQL media object into ReelInfo
   */
  private parseGraphQLMedia(media: Record<string, unknown>, shortcode: string): ReelInfo {
    const owner = media.owner as Record<string, unknown> || {};
    const edgeLikedBy = media.edge_media_preview_like as Record<string, unknown> ||
                        media.edge_liked_by as Record<string, unknown> || {};
    const edgeComment = media.edge_media_to_comment as Record<string, unknown> ||
                        media.edge_media_to_parent_comment as Record<string, unknown> || {};
    const caption = (media.edge_media_to_caption as Record<string, unknown>)?.edges as Array<Record<string, unknown>>;
    const captionText = caption?.[0]?.node as Record<string, unknown>;

    return {
      id: String(media.id || shortcode),
      shortcode,
      url: `https://www.instagram.com/reel/${shortcode}/`,
      videoUrl: (media.video_url as string) || '',
      thumbnailUrl: (media.thumbnail_src as string) || (media.display_url as string) || '',
      caption: (captionText?.text as string) || '',
      viewCount: (media.video_view_count as number) || 0,
      likeCount: (edgeLikedBy.count as number) || 0,
      commentCount: (edgeComment.count as number) || 0,
      duration: (media.video_duration as number) || 0,
      timestamp: (media.taken_at_timestamp as number) || Date.now() / 1000,
      owner: {
        id: String(owner.id || ''),
        username: (owner.username as string) || '',
        profilePicUrl: (owner.profile_pic_url as string) || '',
      },
    };
  }

  /**
   * Extract posts from hashtag GraphQL response
   */
  private extractHashtagPosts(data: Record<string, unknown>, limit: number): InstagramPost[] {
    const posts: InstagramPost[] = [];

    try {
      // Navigate through response structure
      const graphql = data.graphql as Record<string, unknown>;
      const hashtag = graphql?.hashtag as Record<string, unknown>;

      // Try recent posts first
      const edgeRecentMedia = hashtag?.edge_hashtag_to_media as Record<string, unknown>;
      const edges = edgeRecentMedia?.edges as Array<Record<string, unknown>> || [];

      for (const edge of edges.slice(0, limit)) {
        const node = edge.node as Record<string, unknown>;
        if (!node) continue;

        const owner = node.owner as Record<string, unknown> || {};
        const edgeLikedBy = node.edge_liked_by as Record<string, unknown> || {};
        const edgeComment = node.edge_media_to_comment as Record<string, unknown> || {};
        const caption = (node.edge_media_to_caption as Record<string, unknown>)?.edges as Array<Record<string, unknown>>;
        const captionText = caption?.[0]?.node as Record<string, unknown>;

        posts.push({
          id: String(node.id || node.shortcode),
          shortcode: (node.shortcode as string) || '',
          url: `https://www.instagram.com/p/${node.shortcode}/`,
          mediaType: node.is_video ? 'video' : 'image',
          caption: (captionText?.text as string) || '',
          likeCount: (edgeLikedBy.count as number) || 0,
          commentCount: (edgeComment.count as number) || 0,
          timestamp: (node.taken_at_timestamp as number) || Date.now() / 1000,
          owner: {
            id: String(owner.id || ''),
            username: (owner.username as string) || '',
          },
        });
      }
    } catch {
      // Return whatever we have
    }

    return posts;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Extract shortcode from URL or return as-is
   */
  private extractShortcode(urlOrShortcode: string): string {
    // If it's already a shortcode
    if (!urlOrShortcode.includes('/')) {
      return urlOrShortcode;
    }

    // Extract from URL patterns
    const reelMatch = urlOrShortcode.match(/\/reel\/([A-Za-z0-9_-]+)/);
    if (reelMatch) return reelMatch[1];

    const postMatch = urlOrShortcode.match(/\/p\/([A-Za-z0-9_-]+)/);
    if (postMatch) return postMatch[1];

    // Fallback: last path segment
    const parts = urlOrShortcode.split('/').filter(Boolean);
    return parts[parts.length - 1] || urlOrShortcode;
  }

  /**
   * Get headers for public (unauthenticated) requests
   */
  private getPublicHeaders(): Record<string, string> {
    return {
      'User-Agent': this.config.userAgent,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
      'X-Requested-With': 'XMLHttpRequest',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MultiStrategyScraperConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new MultiStrategyScraper instance
 */
export function createMultiStrategyScraper(
  config?: MultiStrategyScraperConfig
): MultiStrategyScraper {
  return new MultiStrategyScraper(config);
}

/**
 * Default scraper instance
 */
export const multiStrategyScraper = new MultiStrategyScraper();

// ============================================
// Convenience Functions
// ============================================

/**
 * Get reel info using multi-strategy approach
 */
export async function getReelInfo(urlOrShortcode: string): Promise<ReelInfo | null> {
  const result = await multiStrategyScraper.getReelInfo(urlOrShortcode);
  return result.success ? result.data! : null;
}

/**
 * Search hashtag using multi-strategy approach
 */
export async function searchHashtagMultiStrategy(
  hashtag: string,
  options?: { limit?: number }
): Promise<MultiStrategyHashtagResult | null> {
  const result = await multiStrategyScraper.searchHashtag(hashtag, options);
  return result.success ? result.data! : null;
}

/**
 * Get trending reels using multi-strategy approach
 */
export async function getTrendingReelsMultiStrategy(
  limit?: number
): Promise<TrendingContent[]> {
  const result = await multiStrategyScraper.getTrendingReels(limit);
  return result.success ? result.data! : [];
}
