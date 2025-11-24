// Instagram Graph API サービス
import { BuzzReel } from '../types/index.js';
import { instagramAuthService } from './instagramAuthService.js';
import { safeJsonParseOrNull, isHtmlContent } from '../utils/safeJsonParse.js';

const GRAPH_API_BASE = 'https://graph.instagram.com';

export class InstagramApiService {
  /**
   * ユーザーのメディア一覧を取得
   */
  async getUserMedia(userId: string = 'me', limit: number = 25): Promise<BuzzReel[]> {
    const token = instagramAuthService.getStoredToken();
    if (!token) {
      console.warn('⚠️ No Instagram token available');
      return [];
    }

    try {
      const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
      const url = `${GRAPH_API_BASE}/${userId}/media?fields=${fields}&limit=${limit}&access_token=${token}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      // Get text first and check for HTML response
      const text = await response.text();
      if (isHtmlContent(text)) {
        console.error('[InstagramApiService] HTML response detected');
        return [];
      }

      const data = safeJsonParseOrNull<any>(text, 'getUserMedia');
      if (!data) return [];
      return this.transformMedia(data.data || []);
    } catch (error) {
      console.error('Instagram API error:', error);
      return [];
    }
  }

  /**
   * ハッシュタグ検索
   */
  async searchHashtag(hashtag: string, userId: string): Promise<BuzzReel[]> {
    const token = instagramAuthService.getStoredToken();
    if (!token) return [];

    try {
      // ハッシュタグIDを取得
      const searchUrl = `${GRAPH_API_BASE}/ig_hashtag_search?q=${encodeURIComponent(hashtag)}&user_id=${userId}&access_token=${token}`;
      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) return [];

      // Get text first and check for HTML response
      const searchText = await searchResponse.text();
      if (isHtmlContent(searchText)) {
        console.error('[InstagramApiService] HTML response in hashtag search');
        return [];
      }

      const searchData = safeJsonParseOrNull<any>(searchText, 'searchHashtag');
      if (!searchData) return [];
      const hashtagId = searchData.data?.[0]?.id;
      if (!hashtagId) return [];

      // ハッシュタグのトップメディアを取得
      const fields = 'id,caption,media_type,permalink,timestamp,like_count,comments_count';
      const mediaUrl = `${GRAPH_API_BASE}/${hashtagId}/top_media?user_id=${userId}&fields=${fields}&access_token=${token}`;

      const mediaResponse = await fetch(mediaUrl);
      if (!mediaResponse.ok) return [];

      // Get text first and check for HTML response
      const mediaText = await mediaResponse.text();
      if (isHtmlContent(mediaText)) {
        console.error('[InstagramApiService] HTML response in hashtag media');
        return [];
      }

      const mediaData = safeJsonParseOrNull<any>(mediaText, 'hashtagMedia');
      if (!mediaData) return [];
      return this.transformMedia(mediaData.data || []);
    } catch (error) {
      console.error('Hashtag search error:', error);
      return [];
    }
  }

  /**
   * 単一メディアの詳細を取得
   */
  async getMediaDetails(mediaId: string): Promise<BuzzReel | null> {
    const token = instagramAuthService.getStoredToken();
    if (!token) return null;

    try {
      const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,owner';
      const url = `${GRAPH_API_BASE}/${mediaId}?fields=${fields}&access_token=${token}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      // Get text first and check for HTML response
      const text = await response.text();
      if (isHtmlContent(text)) {
        console.error('[InstagramApiService] HTML response in media details');
        return null;
      }

      const data = safeJsonParseOrNull<any>(text, 'getMediaDetails');
      if (!data) return null;
      const reels = this.transformMedia([data]);
      return reels[0] || null;
    } catch (error) {
      console.error('Media details error:', error);
      return null;
    }
  }

  /**
   * APIレスポンスをBuzzReel形式に変換
   */
  private transformMedia(items: any[]): BuzzReel[] {
    return items
      .filter(item => item.media_type === 'VIDEO' || item.media_type === 'REELS')
      .map(item => ({
        id: item.id,
        url: item.permalink || '',
        shortcode: this.extractShortcode(item.permalink),
        title: item.caption?.slice(0, 100) || '',
        views: item.like_count * 10 || 0, // 推定値
        likes: item.like_count || 0,
        comments: item.comments_count || 0,
        posted_at: new Date(item.timestamp),
        author: {
          username: item.owner?.username || 'unknown',
          followers: 0
        },
        thumbnail_url: item.thumbnail_url
      }));
  }

  /**
   * URLからshortcodeを抽出
   */
  private extractShortcode(url: string): string {
    const match = url?.match(/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    return match?.[1] || '';
  }

  /**
   * API接続テスト
   */
  async testConnection(): Promise<boolean> {
    const token = instagramAuthService.getStoredToken();
    if (!token) {
      console.log('❌ No token');
      return false;
    }

    try {
      const url = `${GRAPH_API_BASE}/me?fields=id,username&access_token=${token}`;
      const response = await fetch(url);
      if (response.ok) {
        // Get text first and check for HTML response
        const text = await response.text();
        if (isHtmlContent(text)) {
          console.error('[InstagramApiService] HTML response in testConnection');
          return false;
        }

        const data = safeJsonParseOrNull<any>(text, 'testConnection');
        if (!data) return false;
        console.log(`Connected as @${data.username}`);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const instagramApiService = new InstagramApiService();
