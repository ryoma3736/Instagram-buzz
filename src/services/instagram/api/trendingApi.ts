/**
 * Instagram Trending API Service
 * Unified service for fetching trending content with cookie-based authentication
 * Implements Issue #28: Authenticated Trend API Implementation
 * @module services/instagram/api/trendingApi
 */

import type { InstagramCookies } from '../session/types.js';
import type {
  TrendingContent,
  TrendingResult,
  ApiRequestOptions,
  ApiResponse,
} from './types.js';
import { TrendingService, createTrendingService } from './trending.js';
import { ExploreService, createExploreService } from './explore.js';
import { ApiClient, createApiClient, InstagramApiError } from './apiClient.js';
import { DEFAULT_API_CONFIG } from './types.js';

/**
 * Configuration for TrendingApiService
 */
export interface TrendingApiConfig {
  /** Enable retry on failures */
  retryOnFailure?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Default limit for fetching items */
  defaultLimit?: number;
  /** Enable caching of results */
  enableCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<TrendingApiConfig> = {
  retryOnFailure: true,
  maxRetries: 2,
  retryDelay: 1000,
  defaultLimit: 20,
  enableCache: true,
  cacheTtl: 5 * 60 * 1000, // 5 minutes
};

/**
 * Cached result entry
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * TrendingApiService - Unified API for authenticated trend fetching
 *
 * Combines functionality from TrendingService and ExploreService
 * with additional features like caching and recommendations.
 *
 * @example
 * ```typescript
 * const service = new TrendingApiService(cookies);
 *
 * // Get Explore page content
 * const explore = await service.getExplore(20);
 *
 * // Get trending reels
 * const reels = await service.getTrendingReels(10);
 *
 * // Get personalized recommendations
 * const recommended = await service.getRecommended();
 * ```
 */
export class TrendingApiService {
  private cookies: InstagramCookies;
  private config: Required<TrendingApiConfig>;
  private trendingService: TrendingService;
  private exploreService: ExploreService;
  private apiClient: ApiClient;
  private cache: Map<string, CacheEntry<unknown>> = new Map();

  constructor(cookies: InstagramCookies, config: TrendingApiConfig = {}) {
    this.cookies = cookies;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.trendingService = createTrendingService(cookies);
    this.exploreService = createExploreService(cookies);
    this.apiClient = createApiClient(cookies);
  }

  /**
   * Get Explore page content
   * Fetches trending and recommended content from Instagram's Explore page.
   *
   * @param limit - Maximum number of items to return
   * @returns Explore result with sections and top picks
   */
  async getExplore(limit?: number): Promise<ApiResponse<TrendingResult>> {
    const cacheKey = `explore_${limit || this.config.defaultLimit}`;
    const cached = this.getFromCache<TrendingResult>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      console.log(`[TrendingApi] Fetching explore content (limit: ${limit || this.config.defaultLimit})`);

      const exploreResult = await this.exploreService.getExplore({
        limit: limit || this.config.defaultLimit,
      });

      if (!exploreResult.success || !exploreResult.data) {
        return {
          success: false,
          error: exploreResult.error || 'Failed to fetch explore content',
        };
      }

      // Convert ExploreResult to TrendingResult
      const trendingResult: TrendingResult = {
        items: exploreResult.data.topPicks,
        hasMore: exploreResult.data.hasMore,
        endCursor: exploreResult.data.endCursor,
        category: 'explore',
        fetchedAt: exploreResult.data.fetchedAt,
      };

      this.setCache(cacheKey, trendingResult);

      console.log(`[TrendingApi] Found ${trendingResult.items.length} explore items`);
      return { success: true, data: trendingResult };
    } catch (error) {
      console.error('[TrendingApi] Failed to fetch explore:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get trending reels
   * Fetches currently trending reels from Instagram.
   *
   * @param limit - Maximum number of reels to return
   * @returns Trending result with reel content
   */
  async getTrendingReels(limit?: number): Promise<ApiResponse<TrendingResult>> {
    const cacheKey = `trending_reels_${limit || this.config.defaultLimit}`;
    const cached = this.getFromCache<TrendingResult>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      console.log(`[TrendingApi] Fetching trending reels (limit: ${limit || this.config.defaultLimit})`);

      const result = await this.trendingService.getTrendingReels({
        limit: limit || this.config.defaultLimit,
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || 'Failed to fetch trending reels',
        };
      }

      this.setCache(cacheKey, result.data);

      console.log(`[TrendingApi] Found ${result.data.items.length} trending reels`);
      return result;
    } catch (error) {
      console.error('[TrendingApi] Failed to fetch trending reels:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get recommended content
   * Fetches personalized recommendations based on the authenticated user.
   *
   * @returns Trending result with recommended content
   */
  async getRecommended(): Promise<ApiResponse<TrendingResult>> {
    const cacheKey = 'recommended';
    const cached = this.getFromCache<TrendingResult>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      console.log('[TrendingApi] Fetching recommended content');

      const result = await this.trendingService.getRecommended();

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || 'Failed to fetch recommended content',
        };
      }

      this.setCache(cacheKey, result.data);

      console.log(`[TrendingApi] Found ${result.data.items.length} recommended items`);
      return result;
    } catch (error) {
      console.error('[TrendingApi] Failed to fetch recommended:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get explore reels specifically
   * Fetches reels from the Explore/Discover section.
   *
   * @param limit - Maximum number of reels to return
   * @returns Array of trending reel content
   */
  async getExploreReels(limit?: number): Promise<ApiResponse<TrendingContent[]>> {
    try {
      console.log(`[TrendingApi] Fetching explore reels (limit: ${limit || this.config.defaultLimit})`);

      const result = await this.exploreService.getExploreReels({
        limit: limit || this.config.defaultLimit,
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || 'Failed to fetch explore reels',
        };
      }

      console.log(`[TrendingApi] Found ${result.data.length} explore reels`);
      return result;
    } catch (error) {
      console.error('[TrendingApi] Failed to fetch explore reels:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get content by category
   * Fetches trending content filtered by category/hashtag.
   *
   * @param category - Category or hashtag to filter by
   * @param limit - Maximum number of items to return
   * @returns Array of trending content in the category
   */
  async getByCategory(category: string, limit?: number): Promise<ApiResponse<TrendingContent[]>> {
    const cacheKey = `category_${category}_${limit || this.config.defaultLimit}`;
    const cached = this.getFromCache<TrendingContent[]>(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }

    try {
      console.log(`[TrendingApi] Fetching category content: ${category}`);

      const result = await this.exploreService.getExploreByCategory(category, {
        limit: limit || this.config.defaultLimit,
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || `Failed to fetch content for category: ${category}`,
        };
      }

      this.setCache(cacheKey, result.data);

      console.log(`[TrendingApi] Found ${result.data.length} items in category: ${category}`);
      return result;
    } catch (error) {
      console.error(`[TrendingApi] Failed to fetch category ${category}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get media details by shortcode
   * Fetches detailed information about a specific media item.
   *
   * @param shortcode - Instagram media shortcode
   * @returns Trending content details or null
   */
  async getMediaInfo(shortcode: string): Promise<TrendingContent | null> {
    try {
      return await this.trendingService.getMediaInfo(shortcode);
    } catch (error) {
      console.error(`[TrendingApi] Failed to get media info for ${shortcode}:`, error);
      return null;
    }
  }

  /**
   * Get top trending content (combined from multiple sources)
   * Aggregates trending content from explore and reels.
   *
   * @param limit - Maximum number of items to return
   * @returns Combined trending content from all sources
   */
  async getTopTrending(limit?: number): Promise<ApiResponse<TrendingResult>> {
    const effectiveLimit = limit || this.config.defaultLimit;

    try {
      console.log(`[TrendingApi] Fetching top trending content (limit: ${effectiveLimit})`);

      // Fetch from multiple sources in parallel
      const [exploreResult, reelsResult] = await Promise.allSettled([
        this.getExplore(effectiveLimit),
        this.getTrendingReels(effectiveLimit),
      ]);

      const items: TrendingContent[] = [];
      const seen = new Set<string>();

      // Add explore items
      if (exploreResult.status === 'fulfilled' && exploreResult.value.success && exploreResult.value.data) {
        for (const item of exploreResult.value.data.items) {
          if (!seen.has(item.id)) {
            items.push(item);
            seen.add(item.id);
          }
        }
      }

      // Add reels items
      if (reelsResult.status === 'fulfilled' && reelsResult.value.success && reelsResult.value.data) {
        for (const item of reelsResult.value.data.items) {
          if (!seen.has(item.id)) {
            items.push(item);
            seen.add(item.id);
          }
        }
      }

      // Sort by engagement and limit results
      const sortedItems = items
        .sort((a, b) => {
          const engagementA = a.engagement.likes + a.engagement.comments + (a.engagement.views || 0);
          const engagementB = b.engagement.likes + b.engagement.comments + (b.engagement.views || 0);
          return engagementB - engagementA;
        })
        .slice(0, effectiveLimit);

      console.log(`[TrendingApi] Combined ${sortedItems.length} top trending items`);

      return {
        success: true,
        data: {
          items: sortedItems,
          hasMore: items.length > effectiveLimit,
          endCursor: null,
          category: 'top_trending',
          fetchedAt: Date.now(),
        },
      };
    } catch (error) {
      console.error('[TrendingApi] Failed to fetch top trending:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get regional trending content
   * Fetches trending content with region-specific filtering.
   *
   * @param region - Region code (e.g., 'US', 'JP')
   * @param limit - Maximum number of items to return
   * @returns Regional trending content
   */
  async getRegionalTrending(region: string, limit?: number): Promise<ApiResponse<TrendingResult>> {
    const effectiveLimit = limit || this.config.defaultLimit;

    try {
      console.log(`[TrendingApi] Fetching regional trending for: ${region}`);

      // Use explore with region-specific headers
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/discover/topical_explore/`;

      const response = await this.apiClient.get<Record<string, unknown>>(url, {
        headers: {
          'X-IG-Region': region,
          'Accept-Language': this.getLanguageForRegion(region),
        },
      });

      const items: TrendingContent[] = [];
      const mediaItems = (response.items || response.media || []) as Array<Record<string, unknown>>;

      for (const item of mediaItems) {
        const parsed = this.parseMediaItem(item);
        if (parsed) {
          items.push(parsed);
        }
      }

      return {
        success: true,
        data: {
          items: items.slice(0, effectiveLimit),
          hasMore: mediaItems.length > effectiveLimit,
          endCursor: null,
          category: `regional_${region}`,
          fetchedAt: Date.now(),
        },
      };
    } catch (error) {
      console.error(`[TrendingApi] Failed to fetch regional trending for ${region}:`, error);

      // Fallback to general trending
      return this.getTopTrending(limit);
    }
  }

  /**
   * Test the API connection
   * Verifies that the cookies are valid and the API is accessible.
   *
   * @returns True if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/users/web_profile_info/?username=instagram`;
      const response = await this.apiClient.get<Record<string, unknown>>(url);
      return Boolean(response.data);
    } catch (error) {
      if (error instanceof InstagramApiError) {
        console.error(`[TrendingApi] Connection test failed: ${error.message}`);
        return false;
      }
      return false;
    }
  }

  /**
   * Update cookies for the service
   * @param cookies - New Instagram cookies
   */
  updateCookies(cookies: InstagramCookies): void {
    this.cookies = cookies;
    this.trendingService.updateCookies(cookies);
    this.exploreService.updateCookies(cookies);
    this.apiClient.updateCookies(cookies);
    this.clearCache();
  }

  /**
   * Get current cookies
   * @returns Current Instagram cookies
   */
  getCookies(): InstagramCookies {
    return this.cookies;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get item from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    if (!this.config.enableCache) {
      return null;
    }

    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > this.config.cacheTtl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set item in cache
   */
  private setCache<T>(key: string, data: T): void {
    if (!this.config.enableCache) {
      return;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Get Accept-Language header for region
   */
  private getLanguageForRegion(region: string): string {
    const regionLanguages: Record<string, string> = {
      'US': 'en-US,en;q=0.9',
      'JP': 'ja-JP,ja;q=0.9,en;q=0.8',
      'KR': 'ko-KR,ko;q=0.9,en;q=0.8',
      'DE': 'de-DE,de;q=0.9,en;q=0.8',
      'FR': 'fr-FR,fr;q=0.9,en;q=0.8',
      'ES': 'es-ES,es;q=0.9,en;q=0.8',
      'IT': 'it-IT,it;q=0.9,en;q=0.8',
      'BR': 'pt-BR,pt;q=0.9,en;q=0.8',
      'IN': 'hi-IN,hi;q=0.9,en;q=0.8',
      'CN': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
    return regionLanguages[region] || 'en-US,en;q=0.9';
  }

  /**
   * Parse media item from API response
   */
  private parseMediaItem(item: Record<string, unknown>): TrendingContent | null {
    try {
      const media = (item.media || item) as Record<string, unknown>;
      const id = String(media.pk || media.id || '');

      if (!id) {
        return null;
      }

      const isVideo = media.media_type === 2 || media.is_video;
      const shortcode = String(media.code || media.shortcode || '');

      const user = (media.user || media.owner || {}) as Record<string, unknown>;
      const caption = (media.caption as Record<string, unknown>)?.text || '';

      return {
        type: isVideo ? 'reel' : 'post',
        id,
        shortcode,
        url: isVideo
          ? `https://www.instagram.com/reel/${shortcode}/`
          : `https://www.instagram.com/p/${shortcode}/`,
        mediaUrl: this.extractMediaUrl(media),
        caption: String(caption),
        engagement: {
          likes: Number(media.like_count) || 0,
          comments: Number(media.comment_count) || 0,
          views: Number(media.play_count || media.view_count) || 0,
          shares: Number(media.reshare_count) || 0,
        },
        owner: {
          id: String(user.pk || user.id || ''),
          username: String(user.username || ''),
          isVerified: Boolean(user.is_verified),
          profilePicUrl: user.profile_pic_url ? String(user.profile_pic_url) : undefined,
        },
        timestamp: media.taken_at ? Number(media.taken_at) * 1000 : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract media URL from different response formats
   */
  private extractMediaUrl(media: Record<string, unknown>): string {
    // Try video versions first
    const videoVersions = media.video_versions as Array<{ url: string }>;
    if (videoVersions?.[0]?.url) {
      return videoVersions[0].url;
    }

    // Try image versions
    const imageVersions = media.image_versions2 as { candidates: Array<{ url: string }> };
    if (imageVersions?.candidates?.[0]?.url) {
      return imageVersions.candidates[0].url;
    }

    // Fallback
    return String(media.video_url || media.display_url || '');
  }
}

/**
 * Create a new TrendingApiService instance
 * @param cookies - Instagram authentication cookies
 * @param config - Optional configuration
 * @returns TrendingApiService instance
 */
export function createTrendingApiService(
  cookies: InstagramCookies,
  config?: TrendingApiConfig
): TrendingApiService {
  return new TrendingApiService(cookies, config);
}

/**
 * Convenience function to fetch trending content
 * @param cookies - Instagram authentication cookies
 * @param limit - Maximum number of items
 * @returns API response with trending content
 */
export async function fetchTrendingContent(
  cookies: InstagramCookies,
  limit?: number
): Promise<ApiResponse<TrendingResult>> {
  const service = new TrendingApiService(cookies);
  return service.getTopTrending(limit);
}

/**
 * Convenience function to fetch explore content
 * @param cookies - Instagram authentication cookies
 * @param limit - Maximum number of items
 * @returns API response with explore content
 */
export async function fetchExploreContent(
  cookies: InstagramCookies,
  limit?: number
): Promise<ApiResponse<TrendingResult>> {
  const service = new TrendingApiService(cookies);
  return service.getExplore(limit);
}
