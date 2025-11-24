// Instagram スクレイピングサービス（Cookie認証対応版）
import { BuzzReel } from '../types/index.js';
import { authenticatedScraperService } from './instagram/authenticatedScraperService.js';
import { cookieAuthService } from './instagram/cookieAuthService.js';

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

/**
 * Custom error class for HTML response detection
 */
export class HtmlResponseError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly responsePreview: string
  ) {
    super(message);
    this.name = 'HtmlResponseError';
  }
}

/**
 * Validate that the response text is valid JSON and not HTML
 * @param text - Response text to validate
 * @param url - URL for error context
 * @returns Parsed JSON data
 * @throws HtmlResponseError if response is HTML
 */
function validateAndParseJson<T>(text: string, url: string): T {
  // Check for HTML response indicators
  const trimmedText = text.trim();

  if (trimmedText.startsWith('<!DOCTYPE') ||
      trimmedText.startsWith('<html') ||
      trimmedText.startsWith('<HTML') ||
      trimmedText.startsWith('<?xml')) {
    throw new HtmlResponseError(
      'Received HTML response instead of JSON - Instagram may be blocking the request or requiring login',
      url,
      trimmedText.slice(0, 100)
    );
  }

  // Check for empty response
  if (!trimmedText) {
    throw new Error('Empty response received');
  }

  // Try to parse JSON
  try {
    return JSON.parse(trimmedText) as T;
  } catch (parseError) {
    // Provide more context about the parsing failure
    const preview = trimmedText.slice(0, 100);
    throw new Error(
      `JSON parse error: ${(parseError as Error).message}. Response preview: "${preview}..."`
    );
  }
}

export class InstagramScraperService {
  /**
   * Check if authenticated mode is available
   */
  isAuthenticated(): boolean {
    return cookieAuthService.isConfigured();
  }

  /**
   * 公開プロフィールからリールを取得
   * Cookie認証が設定されている場合は認証付きAPIを使用
   */
  async getPublicReels(username: string, limit: number = 12): Promise<BuzzReel[]> {
    console.log(`[Scraper] Fetching reels from @${username}...`);

    // Try authenticated API first if available
    if (this.isAuthenticated()) {
      console.log('[Scraper] Using authenticated API');
      const authReels = await authenticatedScraperService.getUserReels(username, limit);
      if (authReels.length > 0) {
        console.log(`[Scraper] Got ${authReels.length} reels via authenticated API`);
        return authReels;
      }
      console.log('[Scraper] Authenticated API returned no results, falling back...');
    }

    try {
      // Instagram Web API (非公式)
      const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': '*/*',
        }
      });

      if (!response.ok) {
        console.log('[Scraper] API returned non-OK status, trying HTML scrape...');
        return await this.getReelsFromHTML(username, limit);
      }

      const responseText = await response.text();
      let data: any;
      try {
        data = validateAndParseJson<any>(responseText, url);
      } catch (parseError) {
        if (parseError instanceof HtmlResponseError) {
          console.log('[Scraper] HTML response detected, trying alternative method...');
        } else {
          console.log('[Scraper] JSON parse error:', (parseError as Error).message);
        }
        return await this.getReelsFromHTML(username, limit);
      }
      const user = data.data?.user;

      if (!user) return await this.getReelsFromHTML(username, limit);

      const edges = user.edge_owner_to_timeline_media?.edges || [];

      return edges
        .filter((e: any) => e.node.is_video)
        .slice(0, limit)
        .map((e: any) => this.transformNode(e.node, username));

    } catch (error) {
      console.log('[Scraper] API failed, trying HTML scrape...');
      return await this.getReelsFromHTML(username, limit);
    }
  }

  /**
   * HTMLページからリール情報を抽出
   */
  private async getReelsFromHTML(username: string, limit: number): Promise<BuzzReel[]> {
    try {
      const url = `https://www.instagram.com/${username}/reels/`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja,en;q=0.9',
        }
      });

      const html = await response.text();

      // JSON データを抽出
      const scriptMatch = html.match(/<script type="application\/json"[^>]*>(\{.*?"xdt_api__v1__clips__user__connection_v2".*?\})<\/script>/s);

      if (scriptMatch) {
        try {
          const jsonData = JSON.parse(scriptMatch[1]);
          const clips = jsonData?.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]?.__bbox?.result?.data?.xdt_api__v1__clips__user__connection_v2?.edges;

          if (clips) {
            return clips.slice(0, limit).map((edge: any) => ({
              id: edge.node.media?.pk || edge.node.id,
              url: `https://www.instagram.com/reel/${edge.node.media?.code || ''}/`,
              shortcode: edge.node.media?.code || '',
              title: edge.node.media?.caption?.text?.slice(0, 100) || '',
              views: edge.node.media?.play_count || 0,
              likes: edge.node.media?.like_count || 0,
              comments: edge.node.media?.comment_count || 0,
              posted_at: new Date((edge.node.media?.taken_at || 0) * 1000),
              author: { username, followers: 0 },
              thumbnail_url: edge.node.media?.image_versions2?.candidates?.[0]?.url
            }));
          }
        } catch (jsonError) {
          console.log('[Scraper] Failed to parse embedded JSON data:', (jsonError as Error).message);
          // Continue to try alternative method
        }
      }

      // 代替: SharedData から抽出
      const sharedDataMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});<\/script>/);
      if (sharedDataMatch) {
        try {
          const sharedData = JSON.parse(sharedDataMatch[1]);
          const mediaNodes = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user?.edge_owner_to_timeline_media?.edges || [];

          return mediaNodes
            .filter((e: any) => e.node.is_video)
            .slice(0, limit)
            .map((e: any) => this.transformNode(e.node, username));
        } catch (sharedDataError) {
          console.log('[Scraper] Failed to parse SharedData:', (sharedDataError as Error).message);
        }
      }

      return [];
    } catch (error) {
      console.error('[Scraper] HTML scrape failed:', error);
      return [];
    }
  }

  /**
   * リールURLから直接情報を取得
   * Cookie認証が設定されている場合は認証付きAPIを使用
   */
  async getReelByUrl(url: string): Promise<BuzzReel | null> {
    console.log(`[Scraper] Fetching reel: ${url}`);

    // Try authenticated API first if available
    if (this.isAuthenticated()) {
      console.log('[Scraper] Using authenticated API for reel fetch');
      const reel = await authenticatedScraperService.getReelByUrl(url);
      if (reel) {
        console.log('[Scraper] Got reel via authenticated API');
        return reel;
      }
      console.log('[Scraper] Authenticated API returned no result, falling back...');
    }

    const shortcode = this.extractShortcode(url);
    if (!shortcode) return null;

    try {
      // oEmbed API（公式・制限なし）
      const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
      const oembedRes = await fetch(oembedUrl);

      let title = '';
      let authorUsername = '';

      if (oembedRes.ok) {
        try {
          const oembedText = await oembedRes.text();
          const oembed = validateAndParseJson<{ title?: string; author_name?: string }>(oembedText, oembedUrl);
          title = oembed.title || '';
          authorUsername = oembed.author_name || '';
        } catch (oembedError) {
          console.log('[Scraper] oEmbed parse failed, continuing with fallback:', (oembedError as Error).message);
          // Continue without oEmbed data
        }
      }

      // 詳細情報を取得
      const infoUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
      const infoRes = await fetch(infoUrl, {
        headers: { 'User-Agent': USER_AGENT }
      });

      if (infoRes.ok) {
        try {
          const infoText = await infoRes.text();
          const data = validateAndParseJson<{
            graphql?: { shortcode_media?: any };
            items?: any[];
          }>(infoText, infoUrl);
          const item = data.graphql?.shortcode_media || data.items?.[0];

          if (item) {
            return {
              id: item.id || shortcode,
              url,
              shortcode,
              title: item.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) || title,
              views: item.video_view_count || item.play_count || 0,
              likes: item.edge_media_preview_like?.count || item.like_count || 0,
              comments: item.edge_media_to_comment?.count || item.comment_count || 0,
              posted_at: new Date((item.taken_at_timestamp || item.taken_at || 0) * 1000),
              author: {
                username: item.owner?.username || authorUsername,
                followers: item.owner?.edge_followed_by?.count || 0
              },
              thumbnail_url: item.thumbnail_src || item.image_versions2?.candidates?.[0]?.url
            };
          }
        } catch (parseError) {
          if (parseError instanceof HtmlResponseError) {
            console.log(`[Scraper] HTML response detected from ${infoUrl}`);
            console.log('[Scraper] Instagram may be blocking requests. Consider using cookie authentication.');
          } else {
            console.log('[Scraper] Failed to parse reel info:', (parseError as Error).message);
          }
          // Fall through to fallback response
        }
      }

      // フォールバック
      return {
        id: shortcode,
        url,
        shortcode,
        title,
        views: 0,
        likes: 0,
        comments: 0,
        posted_at: new Date(),
        author: { username: authorUsername, followers: 0 }
      };

    } catch (error) {
      if (error instanceof HtmlResponseError) {
        console.error('[Scraper] Reel fetch failed - HTML response received:');
        console.error(`  URL: ${error.url}`);
        console.error(`  Preview: ${error.responsePreview}`);
        console.error('  This typically means Instagram is blocking the request or requiring authentication.');
        console.error('  Solution: Set up cookie authentication. See INSTAGRAM_SESSION_ID in .env');
      } else {
        console.error('[Scraper] Reel fetch failed:', (error as Error).message);
      }
      return null;
    }
  }

  /**
   * ハッシュタグでリールを検索
   * Cookie認証が設定されている場合は認証付きAPIを使用
   */
  async searchByHashtag(hashtag: string, limit: number = 20): Promise<BuzzReel[]> {
    console.log(`[Scraper] Searching #${hashtag}...`);

    // Try authenticated API first if available
    if (this.isAuthenticated()) {
      console.log('[Scraper] Using authenticated API for hashtag search');
      const authReels = await authenticatedScraperService.searchByHashtag(hashtag, limit);
      if (authReels.length > 0) {
        console.log(`[Scraper] Got ${authReels.length} reels via authenticated API`);
        return authReels;
      }
      console.log('[Scraper] Authenticated API returned no results, falling back...');
    }

    try {
      const tag = hashtag.replace(/^#/, '');
      const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
        }
      });

      const html = await response.text();

      // JSONデータを抽出
      const matches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
      const shortcodes = [...matches].map(m => m[1]).slice(0, limit);

      const reels: BuzzReel[] = [];

      // 並列で詳細取得
      const promises = shortcodes.slice(0, 5).map(code =>
        this.getReelByUrl(`https://www.instagram.com/reel/${code}/`)
      );

      const results = await Promise.all(promises);
      results.forEach(r => { if (r) reels.push(r); });

      return reels;
    } catch (error) {
      console.error('[Scraper] Hashtag search failed:', error);
      return [];
    }
  }

  /**
   * トレンドリールを取得
   * Cookie認証が設定されている場合は認証付きAPIを使用
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    console.log('[Scraper] Fetching trending reels...');

    // Try authenticated API first if available
    if (this.isAuthenticated()) {
      console.log('[Scraper] Using authenticated API for trending reels');
      const authReels = await authenticatedScraperService.getTrendingReels(limit);
      if (authReels.length > 0) {
        console.log(`[Scraper] Got ${authReels.length} trending reels via authenticated API`);
        return authReels;
      }
      console.log('[Scraper] Authenticated API returned no results, falling back...');
    }

    try {
      const url = 'https://www.instagram.com/reels/';

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
        }
      });

      const html = await response.text();
      const matches = html.matchAll(/"code":"([A-Za-z0-9_-]+)"/g);
      const codes = [...new Set([...matches].map(m => m[1]))].slice(0, limit);

      const reels: BuzzReel[] = [];

      for (const code of codes.slice(0, 10)) {
        const reel = await this.getReelByUrl(`https://www.instagram.com/reel/${code}/`);
        if (reel && reel.views > 0) reels.push(reel);
      }

      return reels.sort((a, b) => b.views - a.views);
    } catch (error) {
      console.error('[Scraper] Trending fetch failed:', error);
      return [];
    }
  }

  /**
   * ノードをBuzzReel形式に変換
   */
  private transformNode(node: any, username: string): BuzzReel {
    return {
      id: node.id,
      url: `https://www.instagram.com/reel/${node.shortcode}/`,
      shortcode: node.shortcode,
      title: node.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) || '',
      views: node.video_view_count || 0,
      likes: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
      comments: node.edge_media_to_comment?.count || 0,
      posted_at: new Date(node.taken_at_timestamp * 1000),
      author: {
        username: node.owner?.username || username,
        followers: node.owner?.edge_followed_by?.count || 0
      },
      thumbnail_url: node.thumbnail_src || node.display_url
    };
  }

  /**
   * URLからshortcodeを抽出
   */
  private extractShortcode(url: string): string | null {
    const match = url.match(/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    return match?.[1] || null;
  }
}

export const instagramScraperService = new InstagramScraperService();
