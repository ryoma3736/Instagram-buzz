/**
 * Instagram Enhanced Scraper Service
 *
 * Multiple API strategies to bypass Instagram blocks:
 * 1. oEmbed API (official, most reliable)
 * 2. GraphQL API (undocumented but effective)
 * 3. Web Profile API with session
 * 4. i.instagram.com mobile API
 * 5. Fallback HTML parsing
 *
 * @author CodeGenAgent
 * @issue #15
 */

import { BuzzReel } from '../types/index.js';

// User agents for different strategies
const USER_AGENTS = {
  mobile: 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-S908B; b0q; exynos2200; en_US; 458229258)',
  ios: 'Instagram 275.0.0.27.98 (iPhone14,3; iOS 16_6; en_US; en-US; scale=3.00; 1284x2778; 458229258)',
  web: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  mobileWeb: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
};

// Instagram App IDs for authentication
const IG_APP_IDS = [
  '936619743392459',
  '238260118726877',
  '1217981644879628',
];

/**
 * Scraper strategy result
 */
interface StrategyResult {
  success: boolean;
  data: BuzzReel[];
  strategy: string;
  error?: string;
}

/**
 * Enhanced Instagram Scraper with multiple fallback strategies
 */
export class InstagramEnhancedScraperService {
  private currentAppIdIndex = 0;
  private requestCount = 0;
  private lastRequestTime = 0;
  private minRequestInterval = 1000; // 1 second between requests

  /**
   * Rate limiting delay
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Get current App ID with rotation
   */
  private getAppId(): string {
    const appId = IG_APP_IDS[this.currentAppIdIndex];
    this.currentAppIdIndex = (this.currentAppIdIndex + 1) % IG_APP_IDS.length;
    return appId;
  }

  /**
   * Get reel information using oEmbed API (most reliable)
   */
  async getReelByOEmbed(url: string): Promise<BuzzReel | null> {
    console.log(`[oEmbed] Fetching: ${url}`);
    await this.rateLimit();

    try {
      const cleanUrl = this.normalizeUrl(url);
      const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(cleanUrl)}&omitscript=true`;

      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent': USER_AGENTS.web,
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        console.log(`[oEmbed] Failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as any;
      const shortcode = this.extractShortcode(url);

      return {
        id: shortcode || data.media_id || '',
        url: cleanUrl,
        shortcode: shortcode || '',
        title: data.title || '',
        views: 0, // oEmbed doesn't provide views
        likes: 0,
        comments: 0,
        posted_at: new Date(),
        author: {
          username: data.author_name || '',
          followers: 0
        },
        thumbnail_url: data.thumbnail_url
      };
    } catch (error) {
      console.error('[oEmbed] Error:', error);
      return null;
    }
  }

  /**
   * Get reel information using i.instagram.com mobile API
   */
  async getReelByMobileApi(shortcode: string): Promise<BuzzReel | null> {
    console.log(`[MobileAPI] Fetching: ${shortcode}`);
    await this.rateLimit();

    try {
      // Try multiple endpoints
      const endpoints = [
        `https://i.instagram.com/api/v1/media/${shortcode}/info/`,
        `https://www.instagram.com/api/v1/media/${shortcode}/info/`,
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            headers: {
              'User-Agent': USER_AGENTS.mobile,
              'X-IG-App-ID': this.getAppId(),
              'X-IG-WWW-Claim': '0',
              'Accept': '*/*',
              'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
            }
          });

          if (response.ok) {
            const data = await response.json() as any;
            const item = data.items?.[0];

            if (item) {
              return this.transformMobileApiItem(item);
            }
          }
        } catch {
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error('[MobileAPI] Error:', error);
      return null;
    }
  }

  /**
   * Get reel by GraphQL API
   */
  async getReelByGraphQL(shortcode: string): Promise<BuzzReel | null> {
    console.log(`[GraphQL] Fetching: ${shortcode}`);
    await this.rateLimit();

    try {
      // GraphQL query hash for media info
      const queryHash = 'b3055c01b4b222b8a47dc12b090e4e64';
      const variables = JSON.stringify({ shortcode });

      const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(variables)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS.web,
          'X-IG-App-ID': this.getAppId(),
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': '*/*',
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as any;
      const media = data.data?.shortcode_media;

      if (!media) return null;

      return {
        id: media.id,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        shortcode,
        title: media.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) || '',
        views: media.video_view_count || media.play_count || 0,
        likes: media.edge_media_preview_like?.count || media.like_count || 0,
        comments: media.edge_media_to_comment?.count || media.comment_count || 0,
        posted_at: new Date((media.taken_at_timestamp || 0) * 1000),
        author: {
          username: media.owner?.username || '',
          followers: media.owner?.edge_followed_by?.count || 0
        },
        thumbnail_url: media.thumbnail_src || media.display_url
      };
    } catch (error) {
      console.error('[GraphQL] Error:', error);
      return null;
    }
  }

  /**
   * Get user reels using web profile API
   */
  async getUserReels(username: string, limit: number = 12): Promise<BuzzReel[]> {
    console.log(`[WebProfile] Fetching reels from @${username}`);

    const strategies: Array<() => Promise<StrategyResult>> = [
      () => this.getUserReelsFromWebApi(username, limit),
      () => this.getUserReelsFromGraphQL(username, limit),
      () => this.getUserReelsFromHTML(username, limit),
    ];

    for (const strategy of strategies) {
      const result = await strategy();
      if (result.success && result.data.length > 0) {
        console.log(`[${result.strategy}] Success: ${result.data.length} reels`);
        return result.data;
      }
      console.log(`[${result.strategy}] Failed: ${result.error || 'No data'}`);
    }

    return [];
  }

  /**
   * Strategy 1: Web Profile API
   */
  private async getUserReelsFromWebApi(username: string, limit: number): Promise<StrategyResult> {
    await this.rateLimit();

    try {
      const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS.web,
          'X-IG-App-ID': this.getAppId(),
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': '*/*',
          'Accept-Language': 'ja-JP,ja;q=0.9',
        }
      });

      if (!response.ok) {
        return { success: false, data: [], strategy: 'WebProfileAPI', error: `Status ${response.status}` };
      }

      const data = await response.json() as any;
      const user = data.data?.user;

      if (!user) {
        return { success: false, data: [], strategy: 'WebProfileAPI', error: 'No user data' };
      }

      const edges = user.edge_owner_to_timeline_media?.edges || [];
      const reels = edges
        .filter((e: any) => e.node.is_video)
        .slice(0, limit)
        .map((e: any) => this.transformGraphQLNode(e.node, username));

      return { success: true, data: reels, strategy: 'WebProfileAPI' };
    } catch (error) {
      return { success: false, data: [], strategy: 'WebProfileAPI', error: String(error) };
    }
  }

  /**
   * Strategy 2: GraphQL user clips
   */
  private async getUserReelsFromGraphQL(username: string, limit: number): Promise<StrategyResult> {
    await this.rateLimit();

    try {
      // First get user ID
      const userIdResult = await this.getUserId(username);
      if (!userIdResult) {
        return { success: false, data: [], strategy: 'GraphQLClips', error: 'Could not get user ID' };
      }

      const queryHash = '45246d3fe16ccc6577e0bd297a5db1ab';
      const variables = JSON.stringify({
        id: userIdResult,
        first: limit,
      });

      const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(variables)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS.web,
          'X-IG-App-ID': this.getAppId(),
          'Accept': '*/*',
        }
      });

      if (!response.ok) {
        return { success: false, data: [], strategy: 'GraphQLClips', error: `Status ${response.status}` };
      }

      const data = await response.json() as any;
      const edges = data.data?.user?.edge_owner_to_timeline_media?.edges || [];

      const reels = edges
        .filter((e: any) => e.node.is_video)
        .slice(0, limit)
        .map((e: any) => this.transformGraphQLNode(e.node, username));

      return { success: true, data: reels, strategy: 'GraphQLClips' };
    } catch (error) {
      return { success: false, data: [], strategy: 'GraphQLClips', error: String(error) };
    }
  }

  /**
   * Strategy 3: HTML parsing fallback
   */
  private async getUserReelsFromHTML(username: string, limit: number): Promise<StrategyResult> {
    await this.rateLimit();

    try {
      const url = `https://www.instagram.com/${username}/reels/`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS.mobileWeb,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        }
      });

      if (!response.ok) {
        return { success: false, data: [], strategy: 'HTMLParse', error: `Status ${response.status}` };
      }

      const html = await response.text();
      const reels: BuzzReel[] = [];

      // Try to find JSON data in script tags
      const scriptPatterns = [
        /<script type="application\/json"[^>]*>(\{"require".*?xdt_api__v1__clips.*?\})<\/script>/s,
        /window\._sharedData\s*=\s*(\{.+?\});<\/script>/,
        /window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*(\{.+?\})\s*\)/,
      ];

      for (const pattern of scriptPatterns) {
        const match = html.match(pattern);
        if (match) {
          try {
            const jsonData = JSON.parse(match[1]);
            const extractedReels = this.extractReelsFromJson(jsonData, username, limit);
            if (extractedReels.length > 0) {
              return { success: true, data: extractedReels, strategy: 'HTMLParse' };
            }
          } catch {
            continue;
          }
        }
      }

      // Fallback: extract shortcodes from HTML
      const shortcodePattern = /"code":"([A-Za-z0-9_-]+)"/g;
      const matches = [...html.matchAll(shortcodePattern)];
      const shortcodes = [...new Set(matches.map(m => m[1]))].slice(0, limit);

      for (const shortcode of shortcodes.slice(0, 5)) {
        const reel = await this.getReelByUrl(`https://www.instagram.com/reel/${shortcode}/`);
        if (reel) {
          reels.push(reel);
        }
      }

      if (reels.length > 0) {
        return { success: true, data: reels, strategy: 'HTMLParse' };
      }

      return { success: false, data: [], strategy: 'HTMLParse', error: 'No reels found' };
    } catch (error) {
      return { success: false, data: [], strategy: 'HTMLParse', error: String(error) };
    }
  }

  /**
   * Search reels by hashtag
   */
  async searchByHashtag(hashtag: string, limit: number = 20): Promise<BuzzReel[]> {
    console.log(`[Hashtag] Searching #${hashtag}`);

    const tag = hashtag.replace(/^#/, '');
    const strategies: Array<() => Promise<StrategyResult>> = [
      () => this.searchHashtagByExplore(tag, limit),
      () => this.searchHashtagByGraphQL(tag, limit),
    ];

    for (const strategy of strategies) {
      const result = await strategy();
      if (result.success && result.data.length > 0) {
        console.log(`[${result.strategy}] Success: ${result.data.length} reels`);
        return result.data;
      }
    }

    return [];
  }

  /**
   * Hashtag search via explore page
   */
  private async searchHashtagByExplore(tag: string, limit: number): Promise<StrategyResult> {
    await this.rateLimit();

    try {
      const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS.mobileWeb,
          'Accept': 'text/html',
        }
      });

      if (!response.ok) {
        return { success: false, data: [], strategy: 'HashtagExplore', error: `Status ${response.status}` };
      }

      const html = await response.text();
      const shortcodePattern = /"shortcode":"([A-Za-z0-9_-]+)"/g;
      const matches = [...html.matchAll(shortcodePattern)];
      const shortcodes = [...new Set(matches.map(m => m[1]))].slice(0, limit);

      const reels: BuzzReel[] = [];
      for (const shortcode of shortcodes.slice(0, 5)) {
        const reel = await this.getReelByUrl(`https://www.instagram.com/reel/${shortcode}/`);
        if (reel) {
          reels.push(reel);
        }
      }

      return { success: reels.length > 0, data: reels, strategy: 'HashtagExplore' };
    } catch (error) {
      return { success: false, data: [], strategy: 'HashtagExplore', error: String(error) };
    }
  }

  /**
   * Hashtag search via GraphQL
   */
  private async searchHashtagByGraphQL(tag: string, limit: number): Promise<StrategyResult> {
    await this.rateLimit();

    try {
      const queryHash = '9b498c08113f1a09f0ee6d78ade0ff93';
      const variables = JSON.stringify({
        tag_name: tag,
        first: limit,
      });

      const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(variables)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS.web,
          'X-IG-App-ID': this.getAppId(),
          'Accept': '*/*',
        }
      });

      if (!response.ok) {
        return { success: false, data: [], strategy: 'HashtagGraphQL', error: `Status ${response.status}` };
      }

      const data = await response.json() as any;
      const edges = data.data?.hashtag?.edge_hashtag_to_media?.edges || [];

      const reels = edges
        .filter((e: any) => e.node.is_video)
        .slice(0, limit)
        .map((e: any) => this.transformGraphQLNode(e.node, ''));

      return { success: reels.length > 0, data: reels, strategy: 'HashtagGraphQL' };
    } catch (error) {
      return { success: false, data: [], strategy: 'HashtagGraphQL', error: String(error) };
    }
  }

  /**
   * Get trending reels
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    console.log('[Trending] Fetching trending reels...');
    await this.rateLimit();

    try {
      const response = await fetch('https://www.instagram.com/reels/', {
        headers: {
          'User-Agent': USER_AGENTS.mobileWeb,
          'Accept': 'text/html',
        }
      });

      if (!response.ok) {
        console.log('[Trending] Failed to fetch');
        return [];
      }

      const html = await response.text();
      const codePattern = /"code":"([A-Za-z0-9_-]+)"/g;
      const matches = [...html.matchAll(codePattern)];
      const codes = [...new Set(matches.map(m => m[1]))].slice(0, limit);

      const reels: BuzzReel[] = [];
      for (const code of codes.slice(0, 10)) {
        const reel = await this.getReelByUrl(`https://www.instagram.com/reel/${code}/`);
        if (reel && reel.views > 0) {
          reels.push(reel);
        }
      }

      return reels.sort((a, b) => b.views - a.views);
    } catch (error) {
      console.error('[Trending] Error:', error);
      return [];
    }
  }

  /**
   * Get reel by URL with multiple strategy fallback
   */
  async getReelByUrl(url: string): Promise<BuzzReel | null> {
    const shortcode = this.extractShortcode(url);
    if (!shortcode) return null;

    console.log(`[Multi] Fetching reel: ${shortcode}`);

    // Try strategies in order of reliability
    const strategies: Array<() => Promise<BuzzReel | null>> = [
      () => this.getReelByOEmbed(url),
      () => this.getReelByGraphQL(shortcode),
      () => this.getReelByMobileApi(shortcode),
    ];

    for (const strategy of strategies) {
      const result = await strategy();
      if (result) {
        return result;
      }
    }

    return null;
  }

  // === Helper Methods ===

  /**
   * Get user ID from username
   */
  private async getUserId(username: string): Promise<string | null> {
    try {
      const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
        headers: {
          'User-Agent': USER_AGENTS.web,
          'X-IG-App-ID': this.getAppId(),
        }
      });

      if (!response.ok) return null;

      const data = await response.json() as any;
      return data.data?.user?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Transform mobile API item to BuzzReel
   */
  private transformMobileApiItem(item: any): BuzzReel {
    return {
      id: item.pk || item.id || '',
      url: `https://www.instagram.com/reel/${item.code}/`,
      shortcode: item.code || '',
      title: item.caption?.text?.slice(0, 100) || '',
      views: item.play_count || item.view_count || 0,
      likes: item.like_count || 0,
      comments: item.comment_count || 0,
      posted_at: new Date((item.taken_at || 0) * 1000),
      author: {
        username: item.user?.username || '',
        followers: item.user?.follower_count || 0
      },
      thumbnail_url: item.image_versions2?.candidates?.[0]?.url
    };
  }

  /**
   * Transform GraphQL node to BuzzReel
   */
  private transformGraphQLNode(node: any, defaultUsername: string): BuzzReel {
    return {
      id: node.id,
      url: `https://www.instagram.com/reel/${node.shortcode}/`,
      shortcode: node.shortcode,
      title: node.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) || '',
      views: node.video_view_count || 0,
      likes: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
      comments: node.edge_media_to_comment?.count || 0,
      posted_at: new Date((node.taken_at_timestamp || 0) * 1000),
      author: {
        username: node.owner?.username || defaultUsername,
        followers: node.owner?.edge_followed_by?.count || 0
      },
      thumbnail_url: node.thumbnail_src || node.display_url
    };
  }

  /**
   * Extract reels from JSON data
   */
  private extractReelsFromJson(data: any, username: string, limit: number): BuzzReel[] {
    const reels: BuzzReel[] = [];

    // Try different JSON structures
    const paths = [
      data?.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]?.__bbox?.result?.data?.xdt_api__v1__clips__user__connection_v2?.edges,
      data?.entry_data?.ProfilePage?.[0]?.graphql?.user?.edge_owner_to_timeline_media?.edges,
      data?.data?.user?.edge_owner_to_timeline_media?.edges,
    ];

    for (const edges of paths) {
      if (Array.isArray(edges)) {
        for (const edge of edges.slice(0, limit)) {
          const node = edge.node;
          const media = node?.media || node;

          if (media) {
            reels.push({
              id: media.pk || media.id || node.id,
              url: `https://www.instagram.com/reel/${media.code || media.shortcode || ''}/`,
              shortcode: media.code || media.shortcode || '',
              title: media.caption?.text?.slice(0, 100) || media.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) || '',
              views: media.play_count || media.video_view_count || 0,
              likes: media.like_count || media.edge_media_preview_like?.count || 0,
              comments: media.comment_count || media.edge_media_to_comment?.count || 0,
              posted_at: new Date((media.taken_at || media.taken_at_timestamp || 0) * 1000),
              author: { username, followers: 0 },
              thumbnail_url: media.image_versions2?.candidates?.[0]?.url || media.thumbnail_src
            });
          }
        }

        if (reels.length > 0) break;
      }
    }

    return reels;
  }

  /**
   * Extract shortcode from URL
   */
  private extractShortcode(url: string): string | null {
    const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
    return match?.[1] || null;
  }

  /**
   * Normalize Instagram URL
   */
  private normalizeUrl(url: string): string {
    const shortcode = this.extractShortcode(url);
    if (shortcode) {
      return `https://www.instagram.com/reel/${shortcode}/`;
    }
    return url;
  }

  /**
   * Test all strategies
   */
  async testStrategies(): Promise<{ [key: string]: boolean }> {
    console.log('[Test] Testing all scraping strategies...');

    const results: { [key: string]: boolean } = {};

    // Test oEmbed
    try {
      const oembed = await fetch('https://api.instagram.com/oembed/?url=https://www.instagram.com/reel/', {
        headers: { 'User-Agent': USER_AGENTS.web }
      });
      results['oEmbed'] = oembed.status !== 404;
    } catch {
      results['oEmbed'] = false;
    }

    // Test WebProfile API
    try {
      const webProfile = await fetch('https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram', {
        headers: { 'User-Agent': USER_AGENTS.web, 'X-IG-App-ID': this.getAppId() }
      });
      results['WebProfileAPI'] = webProfile.status !== 403;
    } catch {
      results['WebProfileAPI'] = false;
    }

    // Test HTML access
    try {
      const html = await fetch('https://www.instagram.com/instagram/', {
        headers: { 'User-Agent': USER_AGENTS.mobileWeb }
      });
      results['HTMLAccess'] = html.ok;
    } catch {
      results['HTMLAccess'] = false;
    }

    console.log('[Test] Results:', results);
    return results;
  }
}

export const instagramEnhancedScraperService = new InstagramEnhancedScraperService();
