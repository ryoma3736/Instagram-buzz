/**
 * Instagram RapidAPI Integration Service
 *
 * Uses RapidAPI Instagram scrapers as a premium fallback
 * when direct scraping fails.
 *
 * Supported APIs:
 * - instagram-scraper-api2 (Free tier: 100 req/month)
 * - instagram-data1 (Free tier: 500 req/month)
 * - instagram-bulk-profile-scrapper (Free tier: 50 req/month)
 *
 * @author CodeGenAgent
 * @issue #15
 */

import { BuzzReel } from '../types/index.js';

/**
 * RapidAPI Configuration
 */
interface RapidApiConfig {
  apiKey?: string;
  host: string;
  baseUrl: string;
  freeQuota: number;
}

/**
 * Available RapidAPI providers
 */
const RAPIDAPI_PROVIDERS: Record<string, RapidApiConfig> = {
  'scraper-api2': {
    host: 'instagram-scraper-api2.p.rapidapi.com',
    baseUrl: 'https://instagram-scraper-api2.p.rapidapi.com',
    freeQuota: 100,
  },
  'data1': {
    host: 'instagram-data1.p.rapidapi.com',
    baseUrl: 'https://instagram-data1.p.rapidapi.com',
    freeQuota: 500,
  },
  'bulk-scrapper': {
    host: 'instagram-bulk-profile-scrapper.p.rapidapi.com',
    baseUrl: 'https://instagram-bulk-profile-scrapper.p.rapidapi.com',
    freeQuota: 50,
  },
};

/**
 * Instagram RapidAPI Service
 */
export class InstagramRapidApiService {
  private apiKey: string | null = null;
  private currentProvider: string = 'scraper-api2';
  private requestCount: Record<string, number> = {};

  constructor() {
    // Load API key from environment
    this.apiKey = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || null;

    // Initialize request counters
    for (const provider of Object.keys(RAPIDAPI_PROVIDERS)) {
      this.requestCount[provider] = 0;
    }
  }

  /**
   * Check if RapidAPI is available
   */
  isAvailable(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Set API key programmatically
   */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /**
   * Get current provider config
   */
  private getProviderConfig(): RapidApiConfig | null {
    const config = RAPIDAPI_PROVIDERS[this.currentProvider];
    if (config && this.apiKey) {
      return { ...config, apiKey: this.apiKey };
    }
    return null;
  }

  /**
   * Rotate to next available provider
   */
  private rotateProvider(): boolean {
    const providers = Object.keys(RAPIDAPI_PROVIDERS);
    const currentIndex = providers.indexOf(this.currentProvider);
    const nextIndex = (currentIndex + 1) % providers.length;

    if (nextIndex === 0) {
      return false; // Cycled through all providers
    }

    this.currentProvider = providers[nextIndex];
    console.log(`[RapidAPI] Switched to provider: ${this.currentProvider}`);
    return true;
  }

  /**
   * Make RapidAPI request
   */
  private async makeRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    const config = this.getProviderConfig();
    if (!config) {
      console.warn('[RapidAPI] No API key configured');
      return null;
    }

    // Check quota
    if (this.requestCount[this.currentProvider] >= config.freeQuota) {
      console.warn(`[RapidAPI] Quota exceeded for ${this.currentProvider}`);
      if (!this.rotateProvider()) {
        return null;
      }
      return this.makeRequest(endpoint, params);
    }

    const url = new URL(`${config.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': config.apiKey!,
          'X-RapidAPI-Host': config.host,
        },
      });

      this.requestCount[this.currentProvider]++;

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('[RapidAPI] Rate limited, trying next provider');
          if (this.rotateProvider()) {
            return this.makeRequest(endpoint, params);
          }
        }
        console.error(`[RapidAPI] Error: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json() as T;
    } catch (error) {
      console.error('[RapidAPI] Request failed:', error);
      return null;
    }
  }

  /**
   * Get user profile and reels
   */
  async getUserReels(username: string, limit: number = 12): Promise<BuzzReel[]> {
    if (!this.isAvailable()) {
      console.log('[RapidAPI] Skipping - no API key');
      return [];
    }

    console.log(`[RapidAPI] Fetching reels from @${username}`);

    // Try different endpoints based on provider
    const endpoints: Record<string, string> = {
      'scraper-api2': `/v1.2/reels?username_or_id_or_url=${username}`,
      'data1': `/user/reels?username=${username}`,
      'bulk-scrapper': `/ig/reels?username=${username}`,
    };

    const endpoint = endpoints[this.currentProvider] || endpoints['scraper-api2'];
    const data = await this.makeRequest<any>(endpoint, { count: String(limit) });

    if (!data) return [];

    return this.transformReels(data);
  }

  /**
   * Get single reel by shortcode
   */
  async getReelByShortcode(shortcode: string): Promise<BuzzReel | null> {
    if (!this.isAvailable()) return null;

    console.log(`[RapidAPI] Fetching reel: ${shortcode}`);

    const endpoints: Record<string, string> = {
      'scraper-api2': `/v1/media_info?code_or_id_or_url=${shortcode}`,
      'data1': `/media/info?code=${shortcode}`,
      'bulk-scrapper': `/ig/media?code=${shortcode}`,
    };

    const endpoint = endpoints[this.currentProvider] || endpoints['scraper-api2'];
    const data = await this.makeRequest<any>(endpoint);

    if (!data) return null;

    const reels = this.transformReels(data);
    return reels[0] || null;
  }

  /**
   * Search by hashtag
   */
  async searchByHashtag(hashtag: string, limit: number = 20): Promise<BuzzReel[]> {
    if (!this.isAvailable()) return [];

    console.log(`[RapidAPI] Searching #${hashtag}`);

    const tag = hashtag.replace(/^#/, '');
    const endpoints: Record<string, string> = {
      'scraper-api2': `/v1/hashtag?hashtag=${tag}`,
      'data1': `/tag/medias?name=${tag}`,
      'bulk-scrapper': `/ig/hashtag?tag=${tag}`,
    };

    const endpoint = endpoints[this.currentProvider] || endpoints['scraper-api2'];
    const data = await this.makeRequest<any>(endpoint, { count: String(limit) });

    if (!data) return [];

    return this.transformReels(data);
  }

  /**
   * Get trending/explore reels
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    if (!this.isAvailable()) return [];

    console.log('[RapidAPI] Fetching trending reels');

    // Not all providers support explore, try different endpoints
    const data = await this.makeRequest<any>('/v1/explore', { count: String(limit) });

    if (!data) return [];

    return this.transformReels(data);
  }

  /**
   * Transform various API response formats to BuzzReel
   */
  private transformReels(data: any): BuzzReel[] {
    const reels: BuzzReel[] = [];

    // Handle different response structures
    const items = data?.data?.items ||
                  data?.items ||
                  data?.medias ||
                  data?.data?.medias ||
                  data?.data?.reels ||
                  (Array.isArray(data) ? data : [data]);

    if (!Array.isArray(items)) return reels;

    for (const item of items) {
      try {
        // Skip non-video content
        if (item.media_type !== 2 && item.media_type !== 'VIDEO' && !item.is_video) {
          continue;
        }

        const reel: BuzzReel = {
          id: item.pk || item.id || item.media_id || '',
          url: item.url || item.permalink || `https://www.instagram.com/reel/${item.code || item.shortcode}/`,
          shortcode: item.code || item.shortcode || '',
          title: item.caption?.text?.slice(0, 100) ||
                 item.caption_text?.slice(0, 100) ||
                 item.title?.slice(0, 100) ||
                 '',
          views: item.play_count || item.video_play_count || item.view_count || 0,
          likes: item.like_count || item.likes_count || 0,
          comments: item.comment_count || item.comments_count || 0,
          posted_at: item.taken_at
            ? new Date(typeof item.taken_at === 'number' ? item.taken_at * 1000 : item.taken_at)
            : new Date(),
          author: {
            username: item.user?.username ||
                     item.owner?.username ||
                     item.username ||
                     '',
            followers: item.user?.follower_count ||
                      item.owner?.follower_count ||
                      0
          },
          thumbnail_url: item.thumbnail_url ||
                        item.display_url ||
                        item.image_versions2?.candidates?.[0]?.url
        };

        reels.push(reel);
      } catch (e) {
        console.warn('[RapidAPI] Failed to parse item:', e);
        continue;
      }
    }

    return reels;
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): { provider: string; used: number; limit: number }[] {
    return Object.entries(RAPIDAPI_PROVIDERS).map(([name, config]) => ({
      provider: name,
      used: this.requestCount[name] || 0,
      limit: config.freeQuota,
    }));
  }

  /**
   * Reset usage counters (for testing)
   */
  resetUsage(): void {
    for (const provider of Object.keys(RAPIDAPI_PROVIDERS)) {
      this.requestCount[provider] = 0;
    }
  }
}

export const instagramRapidApiService = new InstagramRapidApiService();
