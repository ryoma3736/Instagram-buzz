// F1: バズリール検索機能（API Key不要版）
import { BuzzReel, SearchParams } from '../types/index.js';
import { instagramScraperService } from './instagramScraperService.js';

export class ReelSearchService {
  /**
   * バズリールを検索（API Key不要・スクレイピング版）
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
      // スクレイピングでリール取得（API Key不要）
      const reels = await instagramScraperService.searchByHashtag(keyword, limit * 3);

      // フィルタリング
      const filtered = this.filterReels(reels, { period, min_views });

      // エンゲージメント率でソート
      const sorted = this.sortByEngagement(filtered);

      return sorted.slice(0, limit);
    } catch (error) {
      console.error('Search failed:', error);
      return this.getMockData(keyword, limit);
    }
  }

  /**
   * ユーザーのリールを取得
   */
  async getUserReels(username: string, limit: number = 12): Promise<BuzzReel[]> {
    return instagramScraperService.getPublicReels(username, limit);
  }

  /**
   * トレンドリールを取得
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    return instagramScraperService.getTrendingReels(limit);
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
   * URLからリール情報を取得（スクレイパー使用）
   */
  async getReelInfo(url: string): Promise<BuzzReel | null> {
    return instagramScraperService.getReelByUrl(url);
  }
}

export const reelSearchService = new ReelSearchService();
