// Instagram スクレイピングサービス（Cookie認証対応版）
import { BuzzReel } from '../types/index.js';
import { authenticatedScraperService } from './instagram/authenticatedScraperService.js';
import { cookieAuthService } from './instagram/cookieAuthService.js';
import {
  isHtmlResponse,
  detectHtmlResponseType,
  InstagramHtmlResponseError,
} from './instagram/api/apiClient.js';
import { safeJsonParseOrNull } from '../utils/safeJsonParse.js';

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

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
        console.log('[Scraper] API response not OK, trying alternative method...');
        return await this.getReelsFromHTML(username, limit);
      }

      // Get response as text first to check for HTML
      const text = await response.text();

      // Check for HTML response
      if (isHtmlResponse(text)) {
        const responseType = detectHtmlResponseType(text);
        console.error(`[Scraper] HTML response detected (${responseType})`);
        const error = new InstagramHtmlResponseError(
          `Instagram returned HTML instead of JSON`,
          responseType,
          `web_profile_info/${username}`,
          text
        );
        console.error(`[Scraper] ${error.getUserMessage()}`);

        // For login required, clear cookies if configured
        if (responseType === 'login_required') {
          console.log('[Scraper] Clearing potentially invalid cookies');
          cookieAuthService.clearCookies();
        }

        return await this.getReelsFromHTML(username, limit);
      }

      // Parse JSON safely
      const data = safeJsonParseOrNull<any>(text, `web_profile_info/${username}`);
      if (!data) {
        console.error('[Scraper] Failed to parse JSON response');
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
      console.log('⚠️ API failed, trying HTML scrape...');
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
      // Check for HTML error response (login page, captcha, etc.)
      if (isHtmlResponse(html) && !html.includes('xdt_api__v1__clips__user__connection_v2')) {
        const responseType = detectHtmlResponseType(html);
        if (responseType !== 'unknown_html') {
          console.error(`[Scraper] HTML error response detected (${responseType})`);
          const error = new InstagramHtmlResponseError(
            'Instagram returned error page',
            responseType,
            `${username}/reels/`,
            html
          );
          console.error(`[Scraper] ${error.getUserMessage()}`);
          return [];
        }
      }

      const scriptMatch = html.match(/<script type="application\/json"[^>]*>(\{.*?"xdt_api__v1__clips__user__connection_v2".*?\})<\/script>/s);

      if (scriptMatch) {
        const jsonData = safeJsonParseOrNull<any>(scriptMatch[1], `embedded JSON/${username}`);
        if (!jsonData) {
          console.error('[Scraper] Failed to parse embedded JSON data');
          return [];
        }
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
      }

      // 代替: SharedData から抽出
      const sharedDataMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});<\/script>/);
      if (sharedDataMatch) {
        const sharedData = safeJsonParseOrNull<any>(sharedDataMatch[1], `sharedData/${username}`);
        if (!sharedData) {
          return [];
        }
        const mediaNodes = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user?.edge_owner_to_timeline_media?.edges || [];

        return mediaNodes
          .filter((e: any) => e.node.is_video)
          .slice(0, limit)
          .map((e: any) => this.transformNode(e.node, username));
      }

      return [];
    } catch (error) {
      console.error('HTML scrape failed:', error);
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
        const oembedText = await oembedRes.text();

        // Check for HTML response before parsing JSON
        if (isHtmlResponse(oembedText)) {
          const responseType = detectHtmlResponseType(oembedText);
          console.error(`[Scraper] oEmbed returned HTML (${responseType}), skipping`);
        } else {
          const oembed = safeJsonParseOrNull<any>(oembedText, 'oEmbed API');
          if (oembed) {
            title = oembed.title || '';
            authorUsername = oembed.author_name || '';
          }
        }
      }

      // 詳細情報を取得
      const infoUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
      const infoRes = await fetch(infoUrl, {
        headers: { 'User-Agent': USER_AGENT }
      });

      if (infoRes.ok) {
        const infoText = await infoRes.text();

        // Check for HTML response
        if (isHtmlResponse(infoText)) {
          const responseType = detectHtmlResponseType(infoText);
          console.error(`[Scraper] HTML response when fetching reel info (${responseType})`);
          const error = new InstagramHtmlResponseError(
            'Instagram returned HTML for reel info',
            responseType,
            `p/${shortcode}`,
            infoText
          );
          console.error(`[Scraper] ${error.getUserMessage()}`);

          // Return fallback data
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
        }

        const data = safeJsonParseOrNull<any>(infoText, `reel/${shortcode}`);
        if (!data) {
          console.error('[Scraper] Failed to parse reel info JSON');
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
        }

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
      console.error('Reel fetch failed:', error);
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
      console.error('Hashtag search failed:', error);
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
      console.error('Trending fetch failed:', error);
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
