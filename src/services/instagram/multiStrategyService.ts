/**
 * Multi-Strategy Instagram Service
 *
 * Automatically switches between different scraping strategies:
 * 1. Authenticated API (if cookies configured)
 * 2. Public oEmbed API (no auth required)
 * 3. Playwright browser scraping (no auth required)
 *
 * Provides fallback mechanisms for reliability.
 *
 * @module services/instagram/multiStrategyService
 */

import { BuzzReel } from '../../types/index.js';
import { cookieAuthService } from './cookieAuthService.js';
import { authenticatedScraperService } from './authenticatedScraperService.js';
import { embedScraper, playwrightScraper } from './publicScraper/index.js';

/**
 * Strategy types available for scraping
 */
export type ScrapingStrategy = 'authenticated' | 'embed' | 'playwright' | 'fetch';

/**
 * Result of a scraping attempt
 */
interface StrategyResult<T> {
  success: boolean;
  strategy: ScrapingStrategy;
  data?: T;
  error?: string;
}

/**
 * Configuration for multi-strategy service
 */
export interface MultiStrategyConfig {
  /** Preferred strategy order */
  strategyOrder?: ScrapingStrategy[];
  /** Enable Playwright fallback (requires playwright installation) */
  enablePlaywright?: boolean;
  /** Timeout for each strategy attempt (ms) */
  strategyTimeout?: number;
  /** Log strategy switches */
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<MultiStrategyConfig> = {
  strategyOrder: ['authenticated', 'embed', 'playwright', 'fetch'],
  enablePlaywright: true,
  strategyTimeout: 30000,
  verbose: true,
};

/**
 * MultiStrategyService - Orchestrates multiple scraping strategies
 */
export class MultiStrategyService {
  private config: Required<MultiStrategyConfig>;
  private strategyStats: Map<ScrapingStrategy, { success: number; fail: number }> = new Map();
  private playwrightAvailable: boolean | null = null;

  constructor(config: MultiStrategyConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize stats
    for (const strategy of ['authenticated', 'embed', 'playwright', 'fetch'] as ScrapingStrategy[]) {
      this.strategyStats.set(strategy, { success: 0, fail: 0 });
    }
  }

  /**
   * Log message if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[MultiStrategy] ${message}`);
    }
  }

  /**
   * Check if authenticated scraping is available
   */
  private isAuthenticatedAvailable(): boolean {
    return cookieAuthService.isConfigured();
  }

  /**
   * Check if Playwright is available
   */
  private async isPlaywrightAvailable(): Promise<boolean> {
    if (this.playwrightAvailable !== null) {
      return this.playwrightAvailable;
    }

    if (!this.config.enablePlaywright) {
      this.playwrightAvailable = false;
      return false;
    }

    this.playwrightAvailable = await playwrightScraper.isAvailable();
    return this.playwrightAvailable;
  }

  /**
   * Get available strategies in order
   */
  private async getAvailableStrategies(): Promise<ScrapingStrategy[]> {
    const available: ScrapingStrategy[] = [];

    for (const strategy of this.config.strategyOrder) {
      switch (strategy) {
        case 'authenticated':
          if (this.isAuthenticatedAvailable()) {
            available.push(strategy);
          }
          break;
        case 'embed':
          // Always available
          available.push(strategy);
          break;
        case 'playwright':
          if (await this.isPlaywrightAvailable()) {
            available.push(strategy);
          }
          break;
        case 'fetch':
          // Always available
          available.push(strategy);
          break;
      }
    }

    return available;
  }

  /**
   * Execute with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutHandle!);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle!);
      throw error;
    }
  }

  /**
   * Get public reels from a user using multiple strategies
   */
  async getPublicReels(username: string, limit: number = 12): Promise<BuzzReel[]> {
    this.log(`Getting reels from @${username} (limit: ${limit})`);

    const strategies = await this.getAvailableStrategies();
    this.log(`Available strategies: ${strategies.join(', ')}`);

    for (const strategy of strategies) {
      this.log(`Trying strategy: ${strategy}`);

      try {
        let result: BuzzReel[] = [];

        switch (strategy) {
          case 'authenticated':
            result = await this.withTimeout(
              authenticatedScraperService.getUserReels(username, limit),
              this.config.strategyTimeout,
              'Authenticated strategy timeout'
            );
            break;

          case 'embed':
            result = await this.withTimeout(
              embedScraper.getPublicReelsFromUser(username, limit),
              this.config.strategyTimeout,
              'Embed strategy timeout'
            );
            break;

          case 'playwright':
            result = await this.withTimeout(
              playwrightScraper.getPublicReels(username, limit),
              this.config.strategyTimeout,
              'Playwright strategy timeout'
            );
            break;

          case 'fetch':
            // Use basic fetch as last resort (implemented in instagramScraperService)
            result = await this.withTimeout(
              this.fetchBasicReels(username, limit),
              this.config.strategyTimeout,
              'Fetch strategy timeout'
            );
            break;
        }

        if (result.length > 0) {
          this.log(`Strategy ${strategy} succeeded with ${result.length} reels`);
          this.updateStats(strategy, true);
          return result;
        }

        this.log(`Strategy ${strategy} returned no results`);
        this.updateStats(strategy, false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.log(`Strategy ${strategy} failed: ${errorMessage}`);
        this.updateStats(strategy, false);
      }
    }

    this.log('All strategies exhausted, returning empty array');
    return [];
  }

  /**
   * Get reel by URL using multiple strategies
   */
  async getReelByUrl(url: string): Promise<BuzzReel | null> {
    this.log(`Getting reel: ${url}`);

    const strategies = await this.getAvailableStrategies();

    for (const strategy of strategies) {
      this.log(`Trying strategy: ${strategy}`);

      try {
        let result: BuzzReel | null = null;

        switch (strategy) {
          case 'authenticated':
            result = await this.withTimeout(
              authenticatedScraperService.getReelByUrl(url),
              this.config.strategyTimeout,
              'Authenticated strategy timeout'
            );
            break;

          case 'embed':
            result = await this.withTimeout(
              embedScraper.getReelByUrl(url),
              this.config.strategyTimeout,
              'Embed strategy timeout'
            );
            break;

          case 'playwright':
            result = await this.withTimeout(
              playwrightScraper.getReelByUrl(url),
              this.config.strategyTimeout,
              'Playwright strategy timeout'
            );
            break;

          case 'fetch':
            result = await this.withTimeout(
              this.fetchBasicReel(url),
              this.config.strategyTimeout,
              'Fetch strategy timeout'
            );
            break;
        }

        if (result) {
          this.log(`Strategy ${strategy} succeeded`);
          this.updateStats(strategy, true);
          return result;
        }

        this.log(`Strategy ${strategy} returned null`);
        this.updateStats(strategy, false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.log(`Strategy ${strategy} failed: ${errorMessage}`);
        this.updateStats(strategy, false);
      }
    }

    this.log('All strategies exhausted, returning null');
    return null;
  }

  /**
   * Search by hashtag using multiple strategies
   */
  async searchByHashtag(hashtag: string, limit: number = 20): Promise<BuzzReel[]> {
    this.log(`Searching #${hashtag} (limit: ${limit})`);

    const strategies = await this.getAvailableStrategies();

    for (const strategy of strategies) {
      this.log(`Trying strategy: ${strategy}`);

      try {
        let result: BuzzReel[] = [];

        switch (strategy) {
          case 'authenticated':
            result = await this.withTimeout(
              authenticatedScraperService.searchByHashtag(hashtag, limit),
              this.config.strategyTimeout,
              'Authenticated strategy timeout'
            );
            break;

          case 'playwright':
            result = await this.withTimeout(
              playwrightScraper.searchByHashtag(hashtag, limit),
              this.config.strategyTimeout,
              'Playwright strategy timeout'
            );
            break;

          case 'embed':
          case 'fetch':
            // These strategies don't support hashtag search well
            // Skip to next strategy
            continue;
        }

        if (result.length > 0) {
          this.log(`Strategy ${strategy} succeeded with ${result.length} results`);
          this.updateStats(strategy, true);
          return result;
        }

        this.log(`Strategy ${strategy} returned no results`);
        this.updateStats(strategy, false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.log(`Strategy ${strategy} failed: ${errorMessage}`);
        this.updateStats(strategy, false);
      }
    }

    this.log('All strategies exhausted, returning empty array');
    return [];
  }

  /**
   * Get trending reels using multiple strategies
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    this.log(`Getting trending reels (limit: ${limit})`);

    const strategies = await this.getAvailableStrategies();

    for (const strategy of strategies) {
      this.log(`Trying strategy: ${strategy}`);

      try {
        let result: BuzzReel[] = [];

        switch (strategy) {
          case 'authenticated':
            result = await this.withTimeout(
              authenticatedScraperService.getTrendingReels(limit),
              this.config.strategyTimeout,
              'Authenticated strategy timeout'
            );
            break;

          case 'playwright':
            result = await this.withTimeout(
              playwrightScraper.getTrendingReels(limit),
              this.config.strategyTimeout,
              'Playwright strategy timeout'
            );
            break;

          case 'embed':
          case 'fetch':
            // These strategies don't support trending well
            continue;
        }

        if (result.length > 0) {
          this.log(`Strategy ${strategy} succeeded with ${result.length} results`);
          this.updateStats(strategy, true);
          return result;
        }

        this.log(`Strategy ${strategy} returned no results`);
        this.updateStats(strategy, false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.log(`Strategy ${strategy} failed: ${errorMessage}`);
        this.updateStats(strategy, false);
      }
    }

    this.log('All strategies exhausted, returning empty array');
    return [];
  }

  /**
   * Basic fetch-based reel retrieval (fallback)
   */
  private async fetchBasicReels(username: string, limit: number): Promise<BuzzReel[]> {
    const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

    try {
      const url = `https://www.instagram.com/${username}/reels/`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
        },
      });

      if (!response.ok) return [];

      const html = await response.text();

      // Extract shortcodes
      const matches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
      const shortcodes = [...new Set([...matches].map(m => m[1]))].slice(0, limit);

      // Fetch details via embed
      const urls = shortcodes.map(code => `https://www.instagram.com/reel/${code}/`);
      return embedScraper.getReelsBatch(urls);
    } catch {
      return [];
    }
  }

  /**
   * Basic fetch-based single reel retrieval (fallback)
   */
  private async fetchBasicReel(url: string): Promise<BuzzReel | null> {
    return embedScraper.getReelByUrl(url);
  }

  /**
   * Update strategy statistics
   */
  private updateStats(strategy: ScrapingStrategy, success: boolean): void {
    const stats = this.strategyStats.get(strategy);
    if (stats) {
      if (success) {
        stats.success++;
      } else {
        stats.fail++;
      }
    }
  }

  /**
   * Get strategy statistics
   */
  getStats(): Record<ScrapingStrategy, { success: number; fail: number; rate: number }> {
    const result: Record<string, { success: number; fail: number; rate: number }> = {};

    for (const [strategy, stats] of this.strategyStats) {
      const total = stats.success + stats.fail;
      result[strategy] = {
        ...stats,
        rate: total > 0 ? stats.success / total : 0,
      };
    }

    return result as Record<ScrapingStrategy, { success: number; fail: number; rate: number }>;
  }

  /**
   * Get best performing strategy
   */
  getBestStrategy(): ScrapingStrategy | null {
    let best: ScrapingStrategy | null = null;
    let bestRate = -1;

    for (const [strategy, stats] of this.strategyStats) {
      const total = stats.success + stats.fail;
      if (total >= 3) {
        // Need at least 3 attempts
        const rate = stats.success / total;
        if (rate > bestRate) {
          bestRate = rate;
          best = strategy;
        }
      }
    }

    return best;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    for (const strategy of this.strategyStats.keys()) {
      this.strategyStats.set(strategy, { success: 0, fail: 0 });
    }
  }

  /**
   * Cleanup resources (close Playwright browser if open)
   */
  async cleanup(): Promise<void> {
    await playwrightScraper.close();
  }
}

// Export singleton instance
export const multiStrategyService = new MultiStrategyService();
