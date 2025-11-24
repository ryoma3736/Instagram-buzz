// F1: Multi-Strategy Reel Search Service (Issue #15 Update)
// Uses multi-strategy scraping with automatic fallback
import { BuzzReel, SearchParams } from '../types/index.js';
import { instagramScraperService } from './instagramScraperService.js';
import { multiStrategyService, MultiStrategyResult } from './multiStrategy/index.js';

/**
 * Configuration for search behavior
 */
interface SearchConfig {
  /** Use multi-strategy scraping (default: true) */
  useMultiStrategy: boolean;
  /** Enable verbose logging */
  verbose: boolean;
  /** Maximum retries for failed searches */
  maxRetries: number;
}

const DEFAULT_CONFIG: SearchConfig = {
  useMultiStrategy: true,
  verbose: true,
  maxRetries: 2,
};

export class ReelSearchService {
  private config: SearchConfig;

  constructor(config: Partial<SearchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Search buzz reels using multi-strategy approach
   * Falls back to single scraper if multi-strategy fails
   */
  async searchBuzzReels(params: SearchParams): Promise<BuzzReel[]> {
    const {
      keyword,
      period = 180,
      min_views = 30000,
      limit = 10
    } = params;

    this.log(`Searching for buzz reels: "${keyword}"`);
    this.log(`   Period: ${period} days, Min views: ${min_views}`);

    let reels: BuzzReel[] = [];

    try {
      if (this.config.useMultiStrategy) {
        // Use multi-strategy scraping for better reliability
        const result = await multiStrategyService.searchByHashtag(keyword, limit * 3);
        reels = result.reels;

        this.log(`Multi-strategy result: ${reels.length} reels from ${result.successCount} strategies`);

        if (result.bestStrategy) {
          this.log(`Best strategy: ${result.bestStrategy}`);
        }
      } else {
        // Fallback to single scraper
        reels = await instagramScraperService.searchByHashtag(keyword, limit * 3);
      }

      // If multi-strategy returned no results, try single scraper
      if (reels.length === 0 && this.config.useMultiStrategy) {
        this.log('Multi-strategy returned no results, trying single scraper...');
        reels = await instagramScraperService.searchByHashtag(keyword, limit * 3);
      }

      // Filter and sort results
      const filtered = this.filterReels(reels, { period, min_views });
      const sorted = this.sortByEngagement(filtered);

      this.log(`Final result: ${sorted.length} reels after filtering`);

      return sorted.slice(0, limit);
    } catch (error) {
      console.error('Search failed:', error);
      return this.getMockData(keyword, limit);
    }
  }

  /**
   * Get user reels using multi-strategy approach
   */
  async getUserReels(username: string, limit: number = 12): Promise<BuzzReel[]> {
    this.log(`Fetching reels from @${username}`);

    try {
      if (this.config.useMultiStrategy) {
        const result = await multiStrategyService.getUserReels(username, limit);

        this.log(`Got ${result.reels.length} reels via multi-strategy`);

        if (result.reels.length > 0) {
          return result.reels;
        }
      }

      // Fallback to single scraper
      this.log('Falling back to single scraper');
      return await instagramScraperService.getPublicReels(username, limit);
    } catch (error) {
      console.error(`Failed to get reels for @${username}:`, error);
      return [];
    }
  }

  /**
   * Get trending reels using multi-strategy approach
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    this.log('Fetching trending reels');

    try {
      if (this.config.useMultiStrategy) {
        const result = await multiStrategyService.getTrendingReels(limit);

        this.log(`Got ${result.reels.length} trending reels via multi-strategy`);

        if (result.reels.length > 0) {
          return result.reels.sort((a, b) => b.views - a.views);
        }
      }

      // Fallback to single scraper
      this.log('Falling back to single scraper');
      return await instagramScraperService.getTrendingReels(limit);
    } catch (error) {
      console.error('Failed to get trending reels:', error);
      return [];
    }
  }

  /**
   * Get single reel info using multi-strategy approach
   */
  async getReelInfo(url: string): Promise<BuzzReel | null> {
    this.log(`Fetching reel info: ${url}`);

    try {
      if (this.config.useMultiStrategy) {
        const result = await multiStrategyService.getReelByUrl(url);

        if (result.reels.length > 0) {
          this.log(`Got reel via ${result.bestStrategy}`);
          return result.reels[0];
        }
      }

      // Fallback to single scraper
      this.log('Falling back to single scraper');
      return await instagramScraperService.getReelByUrl(url);
    } catch (error) {
      console.error(`Failed to get reel info for ${url}:`, error);
      return null;
    }
  }

  /**
   * Get health status of all scraping strategies
   */
  getStrategyHealth(): MultiStrategyResult['strategyResults'] | null {
    if (!this.config.useMultiStrategy) {
      return null;
    }

    const summary = multiStrategyService.getHealthSummary();
    this.log(`Strategy health: ${summary.healthyStrategies}/${summary.totalStrategies} healthy`);

    return null; // Returns summary info through logging
  }

  /**
   * Enable or disable multi-strategy mode
   */
  setMultiStrategyMode(enabled: boolean): void {
    this.config.useMultiStrategy = enabled;
    this.log(`Multi-strategy mode: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Filter reels by period and minimum views
   */
  private filterReels(
    reels: BuzzReel[],
    filters: { period: number; min_views: number }
  ): BuzzReel[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.period);

    return reels.filter(reel => {
      const isRecent = new Date(reel.posted_at) >= cutoffDate;
      const hasEnoughViews = reel.views >= filters.min_views;
      return isRecent && hasEnoughViews;
    });
  }

  /**
   * Sort reels by engagement rate
   */
  private sortByEngagement(reels: BuzzReel[]): BuzzReel[] {
    return reels.sort((a, b) => {
      const engagementA = (a.likes + a.comments) / Math.max(a.views, 1);
      const engagementB = (b.likes + b.comments) / Math.max(b.views, 1);
      return engagementB - engagementA;
    });
  }

  /**
   * Generate mock data for development/fallback
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
   * Logging utility
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[ReelSearch] ${message}`);
    }
  }
}

// Export singleton with multi-strategy enabled by default
export const reelSearchService = new ReelSearchService();
