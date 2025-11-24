/**
 * Instagram Trending Content Service
 * Fetches trending reels and content using authenticated cookies
 * @module services/instagram/api/trending
 */

import type { InstagramCookies } from '../session/types.js';
import type {
  TrendingContent,
  TrendingResult,
  ApiRequestOptions,
  ApiResponse,
} from './types.js';
import { DEFAULT_API_CONFIG, API_ENDPOINTS } from './types.js';

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
 * Parse trending content from API response
 */
function parseTrendingItem(item: any): TrendingContent | null {
  try {
    const media = item.media || item;

    return {
      type: media.media_type === 2 ? 'reel' : 'post',
      id: media.pk || media.id,
      shortcode: media.code || '',
      url: `https://www.instagram.com/reel/${media.code}/`,
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
        id: media.user?.pk || '',
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
 * Trending Service for authenticated Instagram content fetching
 */
export class TrendingService {
  private cookies: InstagramCookies;

  constructor(cookies: InstagramCookies) {
    this.cookies = cookies;
  }

  /**
   * Get trending reels
   */
  async getTrendingReels(options: ApiRequestOptions = {}): Promise<ApiResponse<TrendingResult>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      // Use web API for better compatibility
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/clips/trending/?count=${limit}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(this.cookies),
      });

      if (!response.ok) {
        // Try alternative endpoint
        return await this.getTrendingReelsAlternative(options);
      }

      const data = await response.json() as Record<string, any>;
      const items: TrendingContent[] = [];

      // Parse items from response
      const mediaItems = data.items || data.media || [];
      for (const item of mediaItems) {
        const parsed = parseTrendingItem(item);
        if (parsed) {
          items.push(parsed);
        }
      }

      return {
        success: true,
        data: {
          items: items.slice(0, limit),
          hasMore: data.more_available || false,
          endCursor: data.next_max_id || null,
          fetchedAt: Date.now(),
        },
      };
    } catch (error) {
      console.error('Failed to fetch trending reels:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Alternative method for trending reels using web scraping
   */
  private async getTrendingReelsAlternative(options: ApiRequestOptions = {}): Promise<ApiResponse<TrendingResult>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      const url = 'https://www.instagram.com/reels/';

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html',
          'Cookie': buildCookieString(this.cookies),
        },
      });

      const html = await response.text();
      const items: TrendingContent[] = [];

      // Extract media codes from HTML
      const codeMatches = html.matchAll(/"code":"([A-Za-z0-9_-]+)"/g);
      const codes = [...new Set([...codeMatches].map(m => m[1]))].slice(0, limit);

      // Fetch details for each reel
      for (const code of codes.slice(0, 10)) {
        const item = await this.getMediaInfo(code);
        if (item) {
          items.push(item);
        }
      }

      return {
        success: true,
        data: {
          items,
          hasMore: codes.length > items.length,
          endCursor: null,
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
   * Get recommended content
   */
  async getRecommended(options: ApiRequestOptions = {}): Promise<ApiResponse<TrendingResult>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/feed/reels_tray/`;

      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(this.cookies),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as Record<string, any>;
      const items: TrendingContent[] = [];

      const reels = data.tray || data.reels || [];
      for (const reel of reels) {
        if (reel.media) {
          const parsed = parseTrendingItem(reel.media);
          if (parsed) {
            items.push(parsed);
          }
        }
      }

      return {
        success: true,
        data: {
          items: items.slice(0, limit),
          hasMore: false,
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
   * Get media info by shortcode
   */
  async getMediaInfo(shortcode: string): Promise<TrendingContent | null> {
    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/p/${shortcode}/?__a=1&__d=dis`;

      const response = await fetch(url, {
        headers: buildHeaders(this.cookies),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as Record<string, any>;
      const media = data.graphql?.shortcode_media || data.items?.[0];

      if (!media) {
        return null;
      }

      return {
        type: media.is_video ? 'reel' : 'post',
        id: media.id,
        shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        mediaUrl: media.video_url || media.display_url || '',
        caption: media.edge_media_to_caption?.edges?.[0]?.node?.text || '',
        engagement: {
          likes: media.edge_media_preview_like?.count || 0,
          comments: media.edge_media_to_comment?.count || 0,
          views: media.video_view_count || 0,
        },
        owner: {
          id: media.owner?.id || '',
          username: media.owner?.username || '',
          isVerified: media.owner?.is_verified || false,
          profilePicUrl: media.owner?.profile_pic_url,
        },
        timestamp: media.taken_at_timestamp ? media.taken_at_timestamp * 1000 : undefined,
        hashtags: extractHashtags(media.edge_media_to_caption?.edges?.[0]?.node?.text || ''),
        mentions: extractMentions(media.edge_media_to_caption?.edges?.[0]?.node?.text || ''),
      };
    } catch {
      return null;
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
 * Create a new TrendingService instance
 */
export function createTrendingService(cookies: InstagramCookies): TrendingService {
  return new TrendingService(cookies);
}
