/**
 * Instagram Explore Service
 * Fetches Explore page content using authenticated cookies
 * @module services/instagram/api/explore
 */

import type { InstagramCookies } from '../session/types.js';
import type {
  TrendingContent,
  ExploreResult,
  ExploreSection,
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
    'Referer': 'https://www.instagram.com/explore/',
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
 * Parse content item from explore response
 */
function parseExploreItem(item: any): TrendingContent | null {
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
                media.image_versions2?.candidates?.[0]?.url ||
                media.display_url || '',
      caption: media.caption?.text || '',
      engagement: {
        likes: media.like_count || 0,
        comments: media.comment_count || 0,
        views: media.play_count || media.view_count || media.video_view_count || 0,
        shares: media.reshare_count || 0,
      },
      owner: {
        id: String(media.user?.pk || media.owner?.id || ''),
        username: media.user?.username || media.owner?.username || '',
        isVerified: media.user?.is_verified || media.owner?.is_verified || false,
        profilePicUrl: media.user?.profile_pic_url || media.owner?.profile_pic_url,
      },
      timestamp: media.taken_at ? media.taken_at * 1000 : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Explore Service for authenticated Instagram content fetching
 */
export class ExploreService {
  private cookies: InstagramCookies;

  constructor(cookies: InstagramCookies) {
    this.cookies = cookies;
  }

  /**
   * Get Explore page content
   */
  async getExplore(options: ApiRequestOptions = {}): Promise<ApiResponse<ExploreResult>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      // Try the graphql explore endpoint
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/discover/web/explore_grid/`;

      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(this.cookies),
      });

      if (!response.ok) {
        // Fallback to web scraping
        return await this.getExploreFromWeb(options);
      }

      const data = await response.json() as Record<string, any>;
      const sections: ExploreSection[] = [];
      const topPicks: TrendingContent[] = [];

      // Parse sectioned media
      if (data.sectional_items) {
        for (const section of data.sectional_items) {
          if (section.layout_content?.medias) {
            const sectionItems: TrendingContent[] = [];
            for (const mediaWrapper of section.layout_content.medias) {
              const parsed = parseExploreItem(mediaWrapper);
              if (parsed) {
                sectionItems.push(parsed);
              }
            }
            if (sectionItems.length > 0) {
              sections.push({
                id: section.explore_item_info?.explore_item_id || `section_${sections.length}`,
                title: section.explore_item_info?.title || 'Explore',
                type: 'mixed',
                items: sectionItems,
              });
            }
          }
        }
      }

      // Parse top picks / featured content
      if (data.items) {
        for (const item of data.items.slice(0, limit)) {
          const parsed = parseExploreItem(item);
          if (parsed) {
            topPicks.push(parsed);
          }
        }
      }

      return {
        success: true,
        data: {
          sections,
          topPicks,
          hasMore: data.more_available || false,
          endCursor: data.next_max_id || null,
          fetchedAt: Date.now(),
        },
      };
    } catch (error) {
      console.error('Failed to fetch explore:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get Explore content from web page
   */
  private async getExploreFromWeb(options: ApiRequestOptions = {}): Promise<ApiResponse<ExploreResult>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      const url = 'https://www.instagram.com/explore/';

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html',
          'Cookie': buildCookieString(this.cookies),
        },
      });

      const html = await response.text();
      const topPicks: TrendingContent[] = [];

      // Extract shortcodes from HTML
      const codeMatches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
      const codes = [...new Set([...codeMatches].map(m => m[1]))].slice(0, limit);

      // Fetch details for each media
      for (const code of codes.slice(0, 10)) {
        const item = await this.getMediaByShortcode(code);
        if (item) {
          topPicks.push(item);
        }
      }

      return {
        success: true,
        data: {
          sections: [],
          topPicks,
          hasMore: codes.length > topPicks.length,
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
   * Get Explore Reels specifically
   */
  async getExploreReels(options: ApiRequestOptions = {}): Promise<ApiResponse<TrendingContent[]>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/clips/discover/`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...buildHeaders(this.cookies),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          max_id: options.cursor || '',
          page_size: String(limit),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as Record<string, any>;
      const items: TrendingContent[] = [];

      const reels = data.items || [];
      for (const reel of reels) {
        const parsed = parseExploreItem(reel);
        if (parsed) {
          items.push(parsed);
        }
      }

      return {
        success: true,
        data: items,
      };
    } catch (error) {
      console.error('Failed to fetch explore reels:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search Explore by category
   */
  async getExploreByCategory(category: string, options: ApiRequestOptions = {}): Promise<ApiResponse<TrendingContent[]>> {
    const limit = options.limit || DEFAULT_API_CONFIG.defaultLimit;

    try {
      // Use hashtag search as category proxy
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/tags/web_info/?tag_name=${encodeURIComponent(category)}`;

      const response = await fetch(url, {
        headers: buildHeaders(this.cookies),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as Record<string, any>;
      const items: TrendingContent[] = [];

      const edges = data.data?.hashtag?.edge_hashtag_to_media?.edges ||
                   data.data?.hashtag?.edge_hashtag_to_top_posts?.edges || [];

      for (const edge of edges.slice(0, limit)) {
        const node = edge.node;
        if (node) {
          const item: TrendingContent = {
            type: node.is_video ? 'reel' : 'post',
            id: node.id,
            shortcode: node.shortcode,
            url: node.is_video
              ? `https://www.instagram.com/reel/${node.shortcode}/`
              : `https://www.instagram.com/p/${node.shortcode}/`,
            mediaUrl: node.display_url || '',
            caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
            engagement: {
              likes: node.edge_liked_by?.count || 0,
              comments: node.edge_media_to_comment?.count || 0,
              views: node.video_view_count || 0,
            },
            owner: {
              id: node.owner?.id || '',
              username: node.owner?.username || '',
              isVerified: false,
            },
            timestamp: node.taken_at_timestamp ? node.taken_at_timestamp * 1000 : undefined,
          };
          items.push(item);
        }
      }

      return {
        success: true,
        data: items,
      };
    } catch (error) {
      console.error('Failed to fetch explore by category:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get media details by shortcode
   */
  private async getMediaByShortcode(shortcode: string): Promise<TrendingContent | null> {
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
        url: media.is_video
          ? `https://www.instagram.com/reel/${shortcode}/`
          : `https://www.instagram.com/p/${shortcode}/`,
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
 * Create a new ExploreService instance
 */
export function createExploreService(cookies: InstagramCookies): ExploreService {
  return new ExploreService(cookies);
}
