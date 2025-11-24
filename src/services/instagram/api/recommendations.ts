/**
 * Instagram Recommendations Service
 * Fetches personalized recommended content using authenticated cookies
 * @module services/instagram/api/recommendations
 */

import type { InstagramCookies } from '../session/types.js';
import type {
  TrendingContent,
  TrendingResult,
  ApiRequestOptions,
  ApiResponse,
} from './types.js';
import { DEFAULT_API_CONFIG } from './types.js';

/**
 * Build request headers for authenticated Instagram API requests
 */
function buildHeaders(cookies: InstagramCookies): Record<string, string> {
  return {
    'User-Agent': DEFAULT_API_CONFIG.userAgent,
    'X-IG-App-ID': DEFAULT_API_CONFIG.appId,
    'X-CSRFToken': cookies.csrftoken,
    'X-IG-WWW-Claim': '0',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': buildCookieString(cookies),
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/',
  };
}

/**
 * Build cookie string from InstagramCookies
 */
function buildCookieString(cookies: InstagramCookies): string {
  return [
    `sessionid=${cookies.sessionid}`,
    `csrftoken=${cookies.csrftoken}`,
    `ds_user_id=${cookies.ds_user_id}`,
    `rur=${cookies.rur}`,
  ].join('; ');
}

/**
 * Parse recommended content from API response
 */
function parseRecommendedItem(item: any): TrendingContent | null {
  try {
    const media = item.media || item;

    if (!media.pk && !media.id) {
      return null;
    }

    const isVideo = media.media_type === 2 || media.is_video;

    return {
      type: isVideo ? 'reel' : 'post',
      id: String(media.pk || media.id),
      shortcode: media.code || '',
      url: isVideo
        ? `https://www.instagram.com/reel/${media.code}/`
        : `https://www.instagram.com/p/${media.code}/`,
      mediaUrl: media.video_versions?.[0]?.url ||
                media.image_versions2?.candidates?.[0]?.url || '',
      caption: media.caption?.text || '',
      engagement: {
        likes: media.like_count || 0,
        comments: media.comment_count || 0,
        views: media.play_count || media.view_count || 0,
        shares: media.reshare_count || 0,
      },
      owner: {
        id: String(media.user?.pk || ''),
        username: media.user?.username || '',
        isVerified: media.user?.is_verified || false,
        profilePicUrl: media.user?.profile_pic_url,
      },
      timestamp: media.taken_at ? media.taken_at * 1000 : undefined,
      hashtags: extractHashtags(media.caption?.text || ''),
      mentions: extractMentions(media.caption?.text || ''),
    };
  } catch {
    return null;
  }
}

/**
 * Extract hashtags from caption
 */
function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g);
  return matches || [];
}

/**
 * Extract mentions from caption
 */
function extractMentions(text: string): string[] {
  const matches = text.match(/@[\w.]+/g);
  return matches || [];
}

/**
 * Recommendations API endpoints
 */
export const RECOMMENDATIONS_ENDPOINTS = {
  /** Get recommended feed */
  RECOMMENDED_FEED: '/api/v1/feed/reels_tray/',
  /** Get suggested accounts */
  SUGGESTED_USERS: '/api/v1/discover/ayml/',
  /** Get chaining accounts (similar to user) */
  CHAINING: '/api/v1/discover/chaining/',
  /** Blended feed with recommendations */
  BLENDED_FEED: '/api/v1/feed/timeline/',
} as const;

/**
 * Recommendation type for filtering
 */
export type RecommendationType = 'reels' | 'posts' | 'all';

/**
 * Options for recommendations
 */
export interface RecommendationsOptions extends ApiRequestOptions {
  /** Type of content to fetch */
  type?: RecommendationType;
  /** User ID for personalized recommendations */
  userId?: string;
}

/**
 * Recommendations Service for authenticated Instagram content fetching
 */
export class RecommendationsService {
  private cookies: InstagramCookies;

  constructor(cookies: InstagramCookies) {
    this.cookies = cookies;
  }

  /**
   * Get recommended content from the reels tray
   */
  async getRecommended(options: RecommendationsOptions = {}): Promise<ApiResponse<TrendingResult>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}${RECOMMENDATIONS_ENDPOINTS.RECOMMENDED_FEED}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(this.cookies),
      });

      if (!response.ok) {
        // Try alternative endpoint
        return await this.getRecommendedFromTimeline(options);
      }

      const data = await response.json() as Record<string, any>;
      const items: TrendingContent[] = [];

      // Parse reels from tray
      const reels = data.tray || data.reels || [];
      for (const reel of reels) {
        if (reel.media) {
          const parsed = parseRecommendedItem(reel.media);
          if (parsed) {
            items.push(parsed);
          }
        } else if (reel.items && Array.isArray(reel.items)) {
          // Story-style items
          for (const item of reel.items) {
            const parsed = parseRecommendedItem(item);
            if (parsed) {
              items.push(parsed);
            }
          }
        }
      }

      return {
        success: true,
        data: {
          items: items.slice(0, limit),
          hasMore: items.length > limit,
          endCursor: null,
          category: 'recommended',
          fetchedAt: Date.now(),
        },
      };
    } catch (error) {
      console.error('Failed to fetch recommended:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get recommendations from timeline feed
   */
  private async getRecommendedFromTimeline(options: RecommendationsOptions = {}): Promise<ApiResponse<TrendingResult>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}${RECOMMENDATIONS_ENDPOINTS.BLENDED_FEED}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...buildHeaders(this.cookies),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          is_async_ads_in_headload_enabled: '0',
          is_async_ads_double_request: '0',
          is_async_ads_rti: '0',
          rti_delivery_backend: '0',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as Record<string, any>;
      const items: TrendingContent[] = [];

      // Parse feed items
      const feedItems = data.feed_items || data.items || [];
      for (const feedItem of feedItems) {
        const media = feedItem.media_or_ad || feedItem.media || feedItem;
        if (media && !media.ad_id) {
          const parsed = parseRecommendedItem(media);
          if (parsed) {
            items.push(parsed);
          }
        }
      }

      return {
        success: true,
        data: {
          items: items.slice(0, limit),
          hasMore: data.more_available || false,
          endCursor: data.next_max_id || null,
          category: 'timeline',
          fetchedAt: Date.now(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get suggested users based on current account
   */
  async getSuggestedUsers(limit: number = 20): Promise<ApiResponse<Array<{
    id: string;
    username: string;
    fullName: string;
    profilePicUrl?: string;
    isVerified: boolean;
  }>>> {
    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}${RECOMMENDATIONS_ENDPOINTS.SUGGESTED_USERS}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...buildHeaders(this.cookies),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          phone_id: '',
          module: 'discover_people',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as Record<string, any>;
      const users: Array<{
        id: string;
        username: string;
        fullName: string;
        profilePicUrl?: string;
        isVerified: boolean;
      }> = [];

      const suggestions = data.users || data.suggested_users || [];
      for (const suggestion of suggestions.slice(0, limit)) {
        const user = suggestion.user || suggestion;
        users.push({
          id: String(user.pk || user.id),
          username: user.username,
          fullName: user.full_name || '',
          profilePicUrl: user.profile_pic_url,
          isVerified: user.is_verified || false,
        });
      }

      return {
        success: true,
        data: users,
      };
    } catch (error) {
      console.error('Failed to fetch suggested users:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get similar users (chaining) based on a specific user
   */
  async getSimilarUsers(userId: string, limit: number = 20): Promise<ApiResponse<Array<{
    id: string;
    username: string;
    fullName: string;
    profilePicUrl?: string;
    isVerified: boolean;
  }>>> {
    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}${RECOMMENDATIONS_ENDPOINTS.CHAINING}?target_id=${userId}`;

      const response = await fetch(url, {
        headers: buildHeaders(this.cookies),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as Record<string, any>;
      const users: Array<{
        id: string;
        username: string;
        fullName: string;
        profilePicUrl?: string;
        isVerified: boolean;
      }> = [];

      const chainedUsers = data.users || data.chaining_users || [];
      for (const user of chainedUsers.slice(0, limit)) {
        users.push({
          id: String(user.pk || user.id),
          username: user.username,
          fullName: user.full_name || '',
          profilePicUrl: user.profile_pic_url,
          isVerified: user.is_verified || false,
        });
      }

      return {
        success: true,
        data: users,
      };
    } catch (error) {
      console.error('Failed to fetch similar users:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update cookies for the service
   */
  updateCookies(cookies: InstagramCookies): void {
    this.cookies = cookies;
  }
}

/**
 * Create a new RecommendationsService instance
 */
export function createRecommendationsService(cookies: InstagramCookies): RecommendationsService {
  return new RecommendationsService(cookies);
}
