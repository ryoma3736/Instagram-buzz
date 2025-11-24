/**
 * Instagram Authenticated Scraper Service
 * Provides cookie-authenticated access to Instagram data
 * @module services/instagram/authenticatedScraperService
 */

import { BuzzReel } from '../../types/index.js';
import { cookieAuthService } from './cookieAuthService.js';
import { createApiClient, ApiClient, InstagramApiError } from './api/apiClient.js';
import { HashtagSearchService, createHashtagSearchService } from './api/hashtagSearch.js';
import type { InstagramCookies } from './session/types.js';
import { DEFAULT_API_CONFIG } from './api/types.js';

/**
 * Configuration for authenticated scraper
 */
export interface AuthenticatedScraperConfig {
  /** Whether to fallback to unauthenticated methods on failure */
  fallbackToUnauthenticated?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
}

const DEFAULT_CONFIG: Required<AuthenticatedScraperConfig> = {
  fallbackToUnauthenticated: true,
  timeout: 30000,
  maxRetries: 2,
};

/**
 * Authenticated Scraper Service
 * Uses cookie authentication to access Instagram APIs
 */
export class AuthenticatedScraperService {
  private config: Required<AuthenticatedScraperConfig>;
  private apiClient: ApiClient | null = null;
  private hashtagService: HashtagSearchService | null = null;

  constructor(config: AuthenticatedScraperConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize API client with cookies
   */
  private initializeClient(): boolean {
    if (this.apiClient) return true;

    const cookies = cookieAuthService.getCookies();
    if (!cookies) {
      console.log('[AuthScraper] No cookies available');
      return false;
    }

    this.apiClient = createApiClient(cookies);
    this.hashtagService = createHashtagSearchService(cookies);
    console.log('[AuthScraper] Initialized with cookie authentication');
    return true;
  }

  /**
   * Check if authenticated mode is available
   */
  isAuthenticated(): boolean {
    return cookieAuthService.isConfigured();
  }

  /**
   * Search reels by hashtag using authenticated API
   */
  async searchByHashtag(hashtag: string, limit: number = 20): Promise<BuzzReel[]> {
    console.log(`[AuthScraper] Searching #${hashtag} (authenticated: ${this.isAuthenticated()})`);

    if (!this.initializeClient() || !this.hashtagService) {
      console.log('[AuthScraper] Falling back to unauthenticated search');
      return [];
    }

    try {
      const result = await this.hashtagService.search(hashtag, limit);

      // Convert to BuzzReel format
      const reels = result.posts
        .filter(post => post.mediaType === 'video')
        .map(post => this.convertToBuzzReel(post));

      console.log(`[AuthScraper] Found ${reels.length} reels for #${hashtag}`);
      return reels;
    } catch (error) {
      console.error('[AuthScraper] Hashtag search failed:', error);

      if (error instanceof InstagramApiError) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          console.log('[AuthScraper] Authentication failed - cookies may be expired');
          cookieAuthService.clearCookies();
        }
      }

      return [];
    }
  }

  /**
   * Get user's reels using authenticated API
   */
  async getUserReels(username: string, limit: number = 12): Promise<BuzzReel[]> {
    console.log(`[AuthScraper] Getting reels for @${username}`);

    if (!this.initializeClient() || !this.apiClient) {
      return [];
    }

    try {
      // Get user ID first
      const userInfo = await this.getUserInfo(username);
      if (!userInfo) {
        console.log(`[AuthScraper] User @${username} not found`);
        return [];
      }

      // Fetch user's clips/reels
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/clips/user/${userInfo.userId}/`;
      const response = await this.apiClient.post<Record<string, unknown>>(url, {
        target_user_id: userInfo.userId,
        page_size: limit,
        include_feed_video: true,
      });

      const items = (response.items as Array<Record<string, unknown>>) || [];
      const reels = items
        .map(item => this.parseReelItem(item, username))
        .filter((r): r is BuzzReel => r !== null);

      console.log(`[AuthScraper] Found ${reels.length} reels for @${username}`);
      return reels;
    } catch (error) {
      console.error('[AuthScraper] User reels fetch failed:', error);
      return [];
    }
  }

  /**
   * Get user information by username
   */
  private async getUserInfo(username: string): Promise<{ userId: string; username: string } | null> {
    if (!this.apiClient) return null;

    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
      const response = await this.apiClient.get<Record<string, unknown>>(url);

      const userData = (response.data as Record<string, unknown>)?.user as Record<string, unknown>;
      if (!userData) return null;

      return {
        userId: String(userData.pk || userData.id || ''),
        username: String(userData.username || username),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get trending reels using authenticated API
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    console.log('[AuthScraper] Fetching trending reels');

    if (!this.initializeClient() || !this.apiClient) {
      return [];
    }

    try {
      const url = `${DEFAULT_API_CONFIG.baseUrl}/api/v1/clips/trending/`;
      const response = await this.apiClient.post<Record<string, unknown>>(url, {
        include_feed_video: true,
        paging_token: '',
      });

      const items = (response.items as Array<Record<string, unknown>>) || [];
      const reels = items
        .map(item => this.parseReelItem(item))
        .filter((r): r is BuzzReel => r !== null);

      console.log(`[AuthScraper] Found ${reels.length} trending reels`);
      return reels.slice(0, limit);
    } catch (error) {
      console.error('[AuthScraper] Trending reels fetch failed:', error);
      return [];
    }
  }

  /**
   * Get reel by URL
   */
  async getReelByUrl(url: string): Promise<BuzzReel | null> {
    const shortcode = this.extractShortcode(url);
    if (!shortcode) {
      console.log('[AuthScraper] Invalid reel URL');
      return null;
    }

    console.log(`[AuthScraper] Fetching reel: ${shortcode}`);

    if (!this.initializeClient() || !this.apiClient) {
      return null;
    }

    try {
      const apiUrl = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/media/${shortcode}/info/`;
      const response = await this.apiClient.get<Record<string, unknown>>(apiUrl);

      const items = (response.items as Array<Record<string, unknown>>) || [];
      if (items.length === 0) {
        // Try alternative endpoint
        return this.getReelByShortcode(shortcode);
      }

      return this.parseReelItem(items[0]);
    } catch (error) {
      console.error('[AuthScraper] Reel fetch failed:', error);
      return this.getReelByShortcode(shortcode);
    }
  }

  /**
   * Get reel by shortcode (alternative method)
   */
  private async getReelByShortcode(shortcode: string): Promise<BuzzReel | null> {
    if (!this.apiClient) return null;

    try {
      const url = `${DEFAULT_API_CONFIG.webBaseUrl}/p/${shortcode}/?__a=1&__d=dis`;
      const response = await this.apiClient.get<Record<string, unknown>>(url);

      const media =
        (response.graphql as Record<string, unknown>)?.shortcode_media ||
        (response.items as Array<Record<string, unknown>>)?.[0];

      if (!media) return null;

      return this.parseGraphqlMedia(media as Record<string, unknown>, shortcode);
    } catch {
      return null;
    }
  }

  /**
   * Parse reel item from API response
   */
  private parseReelItem(item: Record<string, unknown>, defaultUsername?: string): BuzzReel | null {
    const media = (item.media as Record<string, unknown>) || item;

    const code = String(media.code || media.shortcode || '');
    if (!code) return null;

    const owner = media.owner as Record<string, unknown> | undefined;
    const user = media.user as Record<string, unknown> | undefined;
    const caption = media.caption as Record<string, unknown> | undefined;

    return {
      id: String(media.pk || media.id || code),
      url: `https://www.instagram.com/reel/${code}/`,
      shortcode: code,
      title: String(caption?.text || media.caption || '').slice(0, 100),
      views: Number(media.play_count || media.video_view_count || 0),
      likes: Number(media.like_count || 0),
      comments: Number(media.comment_count || 0),
      posted_at: new Date((Number(media.taken_at) || 0) * 1000),
      author: {
        username: String(
          owner?.username || user?.username || defaultUsername || 'unknown'
        ),
        followers: Number(
          (owner as Record<string, unknown>)?.follower_count ||
            (user as Record<string, unknown>)?.follower_count ||
            0
        ),
      },
      thumbnail_url: this.extractThumbnail(media),
    };
  }

  /**
   * Parse GraphQL media response
   */
  private parseGraphqlMedia(media: Record<string, unknown>, shortcode: string): BuzzReel {
    const owner = media.owner as Record<string, unknown> | undefined;
    const captionEdges =
      (media.edge_media_to_caption as Record<string, unknown>)?.edges as
        | Array<Record<string, unknown>>
        | undefined;
    const captionText = captionEdges?.[0]?.node
      ? String((captionEdges[0].node as Record<string, unknown>).text || '')
      : '';

    return {
      id: String(media.id || shortcode),
      url: `https://www.instagram.com/reel/${shortcode}/`,
      shortcode,
      title: captionText.slice(0, 100),
      views: Number(media.video_view_count || 0),
      likes: Number(
        (media.edge_media_preview_like as Record<string, unknown>)?.count ||
          media.like_count ||
          0
      ),
      comments: Number(
        (media.edge_media_to_comment as Record<string, unknown>)?.count ||
          media.comment_count ||
          0
      ),
      posted_at: new Date((Number(media.taken_at_timestamp) || 0) * 1000),
      author: {
        username: String(owner?.username || 'unknown'),
        followers: Number(
          (owner?.edge_followed_by as Record<string, unknown>)?.count || 0
        ),
      },
      thumbnail_url: String(media.thumbnail_src || media.display_url || ''),
    };
  }

  /**
   * Convert InstagramPost to BuzzReel
   */
  private convertToBuzzReel(post: {
    id: string;
    shortcode: string;
    url: string;
    caption: string;
    likeCount: number;
    commentCount: number;
    timestamp: number;
    owner: { id: string; username: string };
  }): BuzzReel {
    return {
      id: post.id,
      url: post.url,
      shortcode: post.shortcode,
      title: post.caption.slice(0, 100),
      views: 0, // Not available from hashtag search
      likes: post.likeCount,
      comments: post.commentCount,
      posted_at: new Date(post.timestamp * 1000),
      author: {
        username: post.owner.username,
        followers: 0,
      },
    };
  }

  /**
   * Extract thumbnail URL from media object
   */
  private extractThumbnail(media: Record<string, unknown>): string | undefined {
    const imageVersions = media.image_versions2 as Record<string, unknown> | undefined;
    const candidates = imageVersions?.candidates as Array<Record<string, unknown>> | undefined;

    if (candidates && candidates.length > 0) {
      return String(candidates[0].url || '');
    }

    return String(media.thumbnail_src || media.display_url || '');
  }

  /**
   * Extract shortcode from URL
   */
  private extractShortcode(url: string): string | null {
    const match = url.match(/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    return match?.[1] || null;
  }

  /**
   * Test authentication and API access
   */
  async testConnection(): Promise<{
    authenticated: boolean;
    canFetchReels: boolean;
    error?: string;
  }> {
    if (!this.isAuthenticated()) {
      return {
        authenticated: false,
        canFetchReels: false,
        error: 'No cookies configured. ' + CookieAuthService.getSetupInstructions(),
      };
    }

    if (!this.initializeClient() || !this.apiClient) {
      return {
        authenticated: false,
        canFetchReels: false,
        error: 'Failed to initialize API client',
      };
    }

    try {
      // Test with a simple hashtag search
      const result = await this.searchByHashtag('instagram', 3);

      return {
        authenticated: true,
        canFetchReels: result.length > 0,
        error: result.length === 0 ? 'Search returned no results' : undefined,
      };
    } catch (error) {
      return {
        authenticated: false,
        canFetchReels: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Import for setup instructions
import { CookieAuthService } from './cookieAuthService.js';

// Singleton instance
export const authenticatedScraperService = new AuthenticatedScraperService();
