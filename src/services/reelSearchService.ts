// F1: バズリール検索機能
import { BuzzReel, SearchParams } from '../types';

const INSTAGRAM_GRAPH_API = 'https://graph.instagram.com';

export class ReelSearchService {
  private accessToken: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken || process.env.INSTAGRAM_ACCESS_TOKEN || '';
  }

  /**
   * バズリールを検索
   */
  async searchBuzzReels(params: SearchParams): Promise<BuzzReel[]> {
    const {
      keyword,
      period = 180,
      min_views = 30000,
      limit = 10
    } = params;

    console.log(`🔍 Searching for buzz reels: "${keyword}"`);
    console.log(`   Period: ${period} days, Min views: ${min_views}`);

    try {
      // Instagram Graph API または スクレイピング代替
      const reels = await this.fetchReelsFromAPI(keyword, limit * 3);

      // フィルタリング
      const filtered = this.filterReels(reels, {
        period,
        min_views
      });

      // エンゲージメント率でソート
      const sorted = this.sortByEngagement(filtered);

      return sorted.slice(0, limit);
    } catch (error) {
      console.error('Search failed:', error);
      // フォールバック: モックデータ
      return this.getMockData(keyword, limit);
    }
  }

  /**
   * Instagram APIからリール取得
   */
  private async fetchReelsFromAPI(hashtag: string, limit: number): Promise<BuzzReel[]> {
    // Instagram Basic Display API / Graph API
    const endpoint = `${INSTAGRAM_GRAPH_API}/ig_hashtag_search?q=${encodeURIComponent(hashtag)}`;

    if (!this.accessToken) {
      console.warn('⚠️ No Instagram access token, using mock data');
      return [];
    }

    const response = await fetch(`${endpoint}&access_token=${this.accessToken}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return this.transformAPIResponse(data);
  }

  /**
   * APIレスポンスを変換
   */
  private transformAPIResponse(data: any): BuzzReel[] {
    if (!data.data) return [];

    return data.data.map((item: any) => ({
      id: item.id,
      url: `https://www.instagram.com/reel/${item.shortcode}/`,
      shortcode: item.shortcode,
      title: item.caption || '',
      views: item.video_view_count || 0,
      likes: item.like_count || 0,
      comments: item.comments_count || 0,
      posted_at: new Date(item.timestamp),
      author: {
        username: item.owner?.username || 'unknown',
        followers: item.owner?.edge_followed_by?.count || 0
      },
      thumbnail_url: item.thumbnail_url
    }));
  }

  /**
   * 期間・再生数でフィルタリング
   */
  private filterReels(reels: BuzzReel[], filters: { period: number; min_views: number }): BuzzReel[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.period);

    return reels.filter(reel => {
      const isRecent = new Date(reel.posted_at) >= cutoffDate;
      const hasEnoughViews = reel.views >= filters.min_views;
      return isRecent && hasEnoughViews;
    });
  }

  /**
   * エンゲージメント率でソート
   */
  private sortByEngagement(reels: BuzzReel[]): BuzzReel[] {
    return reels.sort((a, b) => {
      const engagementA = (a.likes + a.comments) / Math.max(a.views, 1);
      const engagementB = (b.likes + b.comments) / Math.max(b.views, 1);
      return engagementB - engagementA;
    });
  }

  /**
   * モックデータ（開発用）
   */
  private getMockData(keyword: string, limit: number): BuzzReel[] {
    const mockReels: BuzzReel[] = [];

    for (let i = 0; i < limit; i++) {
      mockReels.push({
        id: `mock_${i}_${Date.now()}`,
        url: `https://www.instagram.com/reel/mock${i}/`,
        shortcode: `mock${i}`,
        title: `${keyword}に関するバズリール #${i + 1}`,
        views: 30000 + Math.floor(Math.random() * 100000),
        likes: 1000 + Math.floor(Math.random() * 5000),
        comments: 50 + Math.floor(Math.random() * 500),
        posted_at: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000),
        author: {
          username: `creator_${i}`,
          followers: 10000 + Math.floor(Math.random() * 50000)
        }
      });
    }

    return this.sortByEngagement(mockReels);
  }

  /**
   * URLからリール情報を取得
   */
  async getReelInfo(url: string): Promise<BuzzReel | null> {
    const shortcode = this.extractShortcode(url);
    if (!shortcode) return null;

    try {
      const response = await fetch(
        `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );

      if (!response.ok) return null;

      const data = await response.json();
      const item = data.graphql?.shortcode_media;

      if (!item) return null;

      return {
        id: item.id,
        url,
        shortcode,
        title: item.edge_media_to_caption?.edges[0]?.node?.text || '',
        views: item.video_view_count || 0,
        likes: item.edge_media_preview_like?.count || 0,
        comments: item.edge_media_to_comment?.count || 0,
        posted_at: new Date(item.taken_at_timestamp * 1000),
        author: {
          username: item.owner?.username || '',
          followers: item.owner?.edge_followed_by?.count || 0
        },
        thumbnail_url: item.thumbnail_src
      };
    } catch (error) {
      console.error('Failed to get reel info:', error);
      return null;
    }
  }

  /**
   * URLからshortcodeを抽出
   */
  private extractShortcode(url: string): string | null {
    const patterns = [
      /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
      /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
      /instagr\.am\/p\/([A-Za-z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }
}

export const reelSearchService = new ReelSearchService();
