/**
 * Instagram Hashtag Search Service
 * Authenticated hashtag search using stored cookies
 * @module services/instagram/api/hashtagSearch
 */

import type { InstagramCookies } from '../session/types.js';
import type {
  InstagramPost,
  HashtagSearchResult,
  HashtagSearchOptions,
  HashtagInfo,
  ApiResponse,
} from './types.js';
import { DEFAULT_API_CONFIG, HASHTAG_API_ENDPOINTS } from './types.js';
import { ApiClient, InstagramApiError, createApiClient } from './apiClient.js';
import {
  parseHashtagRestResponse,
  parseHashtagWebInfoResponse,
  parseMediaItem,
} from './responseParser.js';

/**
 * HashtagSearchService configuration
 */
export interface HashtagSearchConfig {
  /** Retry failed requests */
  retryOnFailure?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<HashtagSearchConfig> = {
  retryOnFailure: true,
  maxRetries: 2,
  retryDelay: 1000,
};

/**
 * HashtagSearchService - Authenticated hashtag search
 *
 * Implements the interface specified in Issue #26:
 * - search(hashtag, limit): Search for posts by hashtag
 * - searchTopPosts(hashtag): Get top posts for a hashtag
 * - searchRecentPosts(hashtag, limit): Get recent posts for a hashtag
 */
export class HashtagSearchService {
  private client: ApiClient;
  private config: Required<HashtagSearchConfig>;

  constructor(cookies: InstagramCookies, config: HashtagSearchConfig = {}) {
    this.client = createApiClient(cookies);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Search for posts by hashtag
   * @param hashtag - Hashtag to search (with or without #)
   * @param limit - Maximum number of posts to retrieve
   * @returns Search result with posts and pagination info
   */
  async search(
    hashtag: string,
    limit: number = 20
  ): Promise<HashtagSearchResult> {
    const tag = this.normalizeHashtag(hashtag);
    console.log(`[HashtagSearch] Searching for #${tag} (limit: ${limit})`);

    // Try multiple endpoints for best results
    let result = await this.searchViaSections(tag, limit);

    if (result.posts.length === 0) {
      console.log('[HashtagSearch] Sections endpoint failed, trying web info...');
      result = await this.searchViaWebInfo(tag);
    }

    if (result.posts.length === 0) {
      console.log('[HashtagSearch] Web info failed, trying explore page...');
      result = await this.searchViaExplorePage(tag, limit);
    }

    // Limit results
    if (result.posts.length > limit) {
      result.posts = result.posts.slice(0, limit);
    }

    console.log(`[HashtagSearch] Found ${result.posts.length} posts for #${tag}`);
    return result;
  }

  /**
   * Get top posts for a hashtag
   * @param hashtag - Hashtag to search
   * @returns Array of top posts
   */
  async searchTopPosts(hashtag: string): Promise<InstagramPost[]> {
    const tag = this.normalizeHashtag(hashtag);
    console.log(`[HashtagSearch] Getting top posts for #${tag}`);

    const result = await this.search(tag, 9); // Top posts are usually limited to 9

    // Filter for posts with higher engagement
    const sorted = result.posts.sort(
      (a, b) => b.likeCount + b.commentCount - (a.likeCount + a.commentCount)
    );

    return sorted.slice(0, 9);
  }

  /**
   * Get recent posts for a hashtag
   * @param hashtag - Hashtag to search
   * @param limit - Maximum number of posts
   * @returns Array of recent posts
   */
  async searchRecentPosts(
    hashtag: string,
    limit: number = 20
  ): Promise<InstagramPost[]> {
    const tag = this.normalizeHashtag(hashtag);
    console.log(`[HashtagSearch] Getting recent posts for #${tag}`);

    // Use sections endpoint which returns recent posts
    const result = await this.searchViaSections(tag, limit);

    // Sort by timestamp (most recent first)
    return result.posts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get hashtag info (post count, etc.)
   * @param hashtag - Hashtag to look up
   * @returns Hashtag information or null if not found
   */
  async getHashtagInfo(hashtag: string): Promise<HashtagInfo | null> {
    const tag = this.normalizeHashtag(hashtag);

    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}${HASHTAG_API_ENDPOINTS.HASHTAG_WEB_INFO}?tag_name=${encodeURIComponent(tag)}`;
      const response = await this.client.get<Record<string, unknown>>(url);

      const hashtagData = (response.data as Record<string, unknown>)?.hashtag as Record<string, unknown>;
      if (!hashtagData) return null;

      return {
        id: String(hashtagData.id || ''),
        name: String(hashtagData.name || tag),
        mediaCount: Number(hashtagData.media_count) || 0,
        profilePicUrl: hashtagData.profile_pic_url
          ? String(hashtagData.profile_pic_url)
          : undefined,
      };
    } catch (error) {
      console.error('[HashtagSearch] Failed to get hashtag info:', error);
      return null;
    }
  }

  /**
   * Search with pagination support
   * @param hashtag - Hashtag to search
   * @param options - Search options including cursor
   * @returns Search result with pagination info
   */
  async searchWithPagination(
    hashtag: string,
    options: HashtagSearchOptions = {}
  ): Promise<HashtagSearchResult> {
    const tag = this.normalizeHashtag(hashtag);
    const limit = options.limit || 20;

    if (options.cursor) {
      // Use cursor for pagination
      return this.searchViaSectionsWithCursor(tag, limit, options.cursor);
    }

    return this.search(tag, limit);
  }

  /**
   * Search via sections endpoint (primary method)
   */
  private async searchViaSections(
    tag: string,
    _limit: number
  ): Promise<HashtagSearchResult> {
    return this.withRetry(async () => {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/tags/${encodeURIComponent(tag)}/sections/`;

      const response = await this.client.post<Record<string, unknown>>(
        url,
        new URLSearchParams({
          include_persistent: '0',
          tab: 'recent',
          surface: 'grid',
          page: '0',
        }),
        { contentType: 'form' }
      );

      return parseHashtagRestResponse(response, tag);
    }, tag);
  }

  /**
   * Search via sections with cursor
   */
  private async searchViaSectionsWithCursor(
    tag: string,
    limit: number,
    cursor: string
  ): Promise<HashtagSearchResult> {
    return this.withRetry(async () => {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/tags/${encodeURIComponent(tag)}/sections/`;

      const response = await this.client.post<Record<string, unknown>>(
        url,
        new URLSearchParams({
          include_persistent: '0',
          tab: 'recent',
          surface: 'grid',
          max_id: cursor,
        }),
        { contentType: 'form' }
      );

      return parseHashtagRestResponse(response, tag);
    }, tag);
  }

  /**
   * Search via web info endpoint
   */
  private async searchViaWebInfo(tag: string): Promise<HashtagSearchResult> {
    return this.withRetry(async () => {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/tags/web_info/?tag_name=${encodeURIComponent(tag)}`;

      const response = await this.client.get<Record<string, unknown>>(url);
      return parseHashtagWebInfoResponse(response, tag);
    }, tag);
  }

  /**
   * Search via explore/tags page scraping
   */
  private async searchViaExplorePage(
    tag: string,
    limit: number
  ): Promise<HashtagSearchResult> {
    const result: HashtagSearchResult = {
      posts: [],
      hasMore: false,
      endCursor: null,
      totalCount: 0,
      hashtag: tag,
    };

    try {
      const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;

      const response = await this.client.fetch(url, {
        headers: {
          Accept: 'text/html',
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        },
      });

      const html = await response.text();

      // Extract shortcodes from HTML
      const shortcodeMatches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
      const shortcodes = [...new Set([...shortcodeMatches].map((m) => m[1]))];

      // Fetch details for each post
      for (const shortcode of shortcodes.slice(0, limit)) {
        const post = await this.getPostByShortcode(shortcode);
        if (post) {
          result.posts.push(post);
        }
      }

      result.hasMore = shortcodes.length > result.posts.length;
    } catch (error) {
      console.error('[HashtagSearch] Explore page search failed:', error);
    }

    return result;
  }

  /**
   * Get post details by shortcode
   */
  private async getPostByShortcode(shortcode: string): Promise<InstagramPost | null> {
    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/p/${shortcode}/?__a=1&__d=dis`;
      const response = await this.client.get<Record<string, unknown>>(url);

      const media =
        (response.graphql as Record<string, unknown>)?.shortcode_media ||
        (response.items as Array<Record<string, unknown>>)?.[0];

      return parseMediaItem(media);
    } catch {
      return null;
    }
  }

  /**
   * Normalize hashtag (remove # if present)
   */
  private normalizeHashtag(hashtag: string): string {
    return hashtag.replace(/^#/, '').trim();
  }

  /**
   * Execute with retry logic
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors
        if (error instanceof InstagramApiError) {
          if (error.statusCode === 401 || error.statusCode === 403) {
            throw error;
          }

          // Increase delay for rate limit errors
          if (error.isRateLimited && attempt < this.config.maxRetries) {
            const delay = this.config.retryDelay * (attempt + 2);
            console.log(
              `[HashtagSearch] Rate limited for ${context}, waiting ${delay}ms...`
            );
            await this.sleep(delay);
            continue;
          }
        }

        if (attempt < this.config.maxRetries && this.config.retryOnFailure) {
          console.log(
            `[HashtagSearch] Attempt ${attempt + 1} failed for ${context}, retrying...`
          );
          await this.sleep(this.config.retryDelay);
        }
      }
    }

    // Return empty result instead of throwing for hashtag search
    console.error(`[HashtagSearch] All attempts failed for ${context}:`, lastError);
    return {
      posts: [],
      hasMore: false,
      endCursor: null,
      totalCount: 0,
      hashtag: context,
    } as T;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update cookies
   */
  updateCookies(cookies: InstagramCookies): void {
    this.client.updateCookies(cookies);
  }
}

/**
 * Create a new HashtagSearchService instance
 */
export function createHashtagSearchService(
  cookies: InstagramCookies,
  config?: HashtagSearchConfig
): HashtagSearchService {
  return new HashtagSearchService(cookies, config);
}

/**
 * Wrapper for ApiResponse type
 */
export async function searchHashtag(
  cookies: InstagramCookies,
  hashtag: string,
  limit?: number
): Promise<ApiResponse<HashtagSearchResult>> {
  try {
    const service = new HashtagSearchService(cookies);
    const result = await service.search(hashtag, limit);

    return {
      success: result.posts.length > 0,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
