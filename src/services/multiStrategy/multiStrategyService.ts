/**
 * Multi-Strategy Instagram Scraping Service
 * Issue #15: Main service coordinating multiple scraping strategies
 * @module services/multiStrategy/multiStrategyService
 */

import { BuzzReel } from '../../types/index.js';
import {
  ScrapingStrategy,
  StrategyResult,
  MultiStrategyResult,
  MultiStrategyConfig,
  MultiStrategySearchParams,
  StrategyHealthStatus,
  StrategyConfig,
} from './types.js';
import { BaseStrategy } from './strategies/baseStrategy.js';
import { GraphQLStrategy } from './strategies/graphqlStrategy.js';
import { OEmbedStrategy } from './strategies/oembedStrategy.js';
import { HtmlScrapingStrategy } from './strategies/htmlScrapingStrategy.js';

/**
 * Default configuration for multi-strategy service
 */
const DEFAULT_CONFIG: MultiStrategyConfig = {
  strategies: {
    graphql_api: {
      enabled: true,
      priority: 1,
      timeoutMs: 15000,
      maxRetries: 2,
      retryDelayMs: 1000,
      continueOnFailure: true,
    },
    rest_api: {
      enabled: false, // Requires authentication
      priority: 2,
      timeoutMs: 15000,
      maxRetries: 2,
      retryDelayMs: 1000,
      continueOnFailure: true,
    },
    oembed_api: {
      enabled: true,
      priority: 3,
      timeoutMs: 10000,
      maxRetries: 3,
      retryDelayMs: 500,
      continueOnFailure: true,
    },
    html_scraping: {
      enabled: true,
      priority: 4,
      timeoutMs: 20000,
      maxRetries: 2,
      retryDelayMs: 2000,
      continueOnFailure: true,
    },
    mobile_api: {
      enabled: false, // Requires specific setup
      priority: 5,
      timeoutMs: 15000,
      maxRetries: 2,
      retryDelayMs: 1000,
      continueOnFailure: true,
    },
    authenticated: {
      enabled: false, // Requires cookies
      priority: 0, // Highest priority when enabled
      timeoutMs: 15000,
      maxRetries: 2,
      retryDelayMs: 1000,
      continueOnFailure: true,
    },
  },
  parallelExecution: false,
  stopOnFirstSuccess: false, // Get best results from all strategies
  globalTimeoutMs: 60000,
  minReelsForSuccess: 1,
  verbose: true,
};

/**
 * Multi-Strategy Instagram Scraping Service
 * Coordinates multiple scraping strategies for reliable data retrieval
 */
export class MultiStrategyService {
  private readonly config: MultiStrategyConfig;
  private readonly strategies: Map<ScrapingStrategy, BaseStrategy>;
  private readonly healthStatus: Map<ScrapingStrategy, StrategyHealthStatus>;

  constructor(config: Partial<MultiStrategyConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    this.strategies = new Map();
    this.healthStatus = new Map();

    this.initializeStrategies();
  }

  /**
   * Merge configuration with defaults
   */
  private mergeConfig(
    defaults: MultiStrategyConfig,
    overrides: Partial<MultiStrategyConfig>
  ): MultiStrategyConfig {
    return {
      ...defaults,
      ...overrides,
      strategies: {
        ...defaults.strategies,
        ...overrides.strategies,
      },
    };
  }

  /**
   * Initialize all enabled strategies
   */
  private initializeStrategies(): void {
    const strategyConfigs = this.config.strategies;

    // Initialize GraphQL strategy
    if (strategyConfigs.graphql_api.enabled) {
      this.strategies.set(
        'graphql_api',
        new GraphQLStrategy(strategyConfigs.graphql_api)
      );
      this.initializeHealth('graphql_api');
    }

    // Initialize oEmbed strategy
    if (strategyConfigs.oembed_api.enabled) {
      this.strategies.set(
        'oembed_api',
        new OEmbedStrategy(strategyConfigs.oembed_api)
      );
      this.initializeHealth('oembed_api');
    }

    // Initialize HTML scraping strategy
    if (strategyConfigs.html_scraping.enabled) {
      this.strategies.set(
        'html_scraping',
        new HtmlScrapingStrategy(strategyConfigs.html_scraping)
      );
      this.initializeHealth('html_scraping');
    }

    this.log(`Initialized ${this.strategies.size} strategies`);
  }

  /**
   * Initialize health status for a strategy
   */
  private initializeHealth(strategy: ScrapingStrategy): void {
    this.healthStatus.set(strategy, {
      strategy,
      healthy: true,
      successRate: 1.0,
      avgResponseTimeMs: 0,
      consecutiveFailures: 0,
      disabled: false,
    });
  }

  /**
   * Search reels by hashtag using all enabled strategies
   */
  async searchByHashtag(
    hashtag: string,
    limit: number = 20
  ): Promise<MultiStrategyResult> {
    return this.executeMultiStrategy(
      (strategy) => strategy.searchByHashtag(hashtag, limit),
      `hashtag:${hashtag}`
    );
  }

  /**
   * Get user reels using all enabled strategies
   */
  async getUserReels(
    username: string,
    limit: number = 12
  ): Promise<MultiStrategyResult> {
    return this.executeMultiStrategy(
      (strategy) => strategy.getUserReels(username, limit),
      `user:${username}`
    );
  }

  /**
   * Get single reel by URL using all enabled strategies
   */
  async getReelByUrl(url: string): Promise<MultiStrategyResult> {
    return this.executeMultiStrategy(
      (strategy) => strategy.getReelByUrl(url),
      `url:${url}`
    );
  }

  /**
   * Get trending reels using all enabled strategies
   */
  async getTrendingReels(limit: number = 20): Promise<MultiStrategyResult> {
    return this.executeMultiStrategy(
      (strategy) => strategy.getTrendingReels(limit),
      'trending'
    );
  }

  /**
   * Execute search with specific parameters
   */
  async search(params: MultiStrategySearchParams): Promise<MultiStrategyResult> {
    if (params.hashtag) {
      return this.searchByHashtag(params.hashtag, params.limit);
    }

    if (params.username) {
      return this.getUserReels(params.username, params.limit);
    }

    if (params.reelUrl) {
      return this.getReelByUrl(params.reelUrl);
    }

    if (params.trending) {
      return this.getTrendingReels(params.limit);
    }

    throw new Error(
      'Invalid search params: must specify hashtag, username, reelUrl, or trending'
    );
  }

  /**
   * Execute operation using multiple strategies
   */
  private async executeMultiStrategy(
    operation: (strategy: BaseStrategy) => Promise<StrategyResult>,
    context: string
  ): Promise<MultiStrategyResult> {
    const startTime = Date.now();
    const strategyResults: StrategyResult[] = [];
    const allReels: BuzzReel[] = [];
    const seenIds = new Set<string>();

    // Get sorted strategies by priority
    const sortedStrategies = this.getSortedStrategies();

    this.log(`Executing ${context} with ${sortedStrategies.length} strategies`);

    if (this.config.parallelExecution) {
      // Execute all strategies in parallel
      const promises = sortedStrategies.map((strategy) =>
        this.executeStrategy(strategy, operation, context)
      );

      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          strategyResults.push(result.value);
          this.addUniqueReels(result.value.reels, allReels, seenIds);

          if (
            this.config.stopOnFirstSuccess &&
            result.value.status === 'success' &&
            result.value.reels.length >= this.config.minReelsForSuccess
          ) {
            break;
          }
        }
      }
    } else {
      // Execute strategies sequentially
      for (const strategy of sortedStrategies) {
        try {
          const result = await this.executeStrategy(strategy, operation, context);
          strategyResults.push(result);
          this.addUniqueReels(result.reels, allReels, seenIds);

          // Update health status
          this.updateHealthStatus(strategy.getName(), result);

          // Check if we should stop
          if (
            this.config.stopOnFirstSuccess &&
            result.status === 'success' &&
            allReels.length >= this.config.minReelsForSuccess
          ) {
            this.log(`Got ${allReels.length} reels from ${strategy.getName()}, stopping`);
            break;
          }
        } catch (error) {
          this.log(
            `Strategy ${strategy.getName()} failed: ${(error as Error).message}`
          );

          const strategyConfig = this.config.strategies[strategy.getName()];
          if (!strategyConfig.continueOnFailure) {
            break;
          }
        }
      }
    }

    // Calculate success metrics
    const successCount = strategyResults.filter(
      (r) => r.status === 'success' || r.status === 'partial'
    ).length;

    const failCount = strategyResults.length - successCount;

    // Find best performing strategy
    const bestStrategy = this.findBestStrategy(strategyResults);

    const totalExecutionTimeMs = Date.now() - startTime;

    this.log(
      `Completed ${context}: ${allReels.length} unique reels from ${successCount}/${strategyResults.length} strategies in ${totalExecutionTimeMs}ms`
    );

    return {
      reels: allReels,
      totalExecutionTimeMs,
      strategyResults,
      bestStrategy,
      success: allReels.length >= this.config.minReelsForSuccess,
      successCount,
      failCount,
      executedAt: new Date(),
    };
  }

  /**
   * Execute single strategy with error handling
   */
  private async executeStrategy(
    strategy: BaseStrategy,
    operation: (strategy: BaseStrategy) => Promise<StrategyResult>,
    context: string
  ): Promise<StrategyResult> {
    const strategyName = strategy.getName();
    const health = this.healthStatus.get(strategyName);

    // Skip disabled strategies
    if (health?.disabled) {
      this.log(`Skipping disabled strategy: ${strategyName}`);
      return {
        strategy: strategyName,
        status: 'failed',
        reels: [],
        executionTimeMs: 0,
        error: 'Strategy temporarily disabled',
      };
    }

    this.log(`Executing ${strategyName} for ${context}`);
    const startTime = Date.now();

    try {
      const result = await this.withGlobalTimeout(
        operation(strategy),
        this.config.globalTimeoutMs
      );

      this.log(
        `${strategyName} completed: ${result.status} with ${result.reels.length} reels in ${result.executionTimeMs}ms`
      );

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      this.log(`${strategyName} error: ${(error as Error).message}`);

      return {
        strategy: strategyName,
        status: 'failed',
        reels: [],
        executionTimeMs,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get strategies sorted by priority
   */
  private getSortedStrategies(): BaseStrategy[] {
    const entries = Array.from(this.strategies.entries());

    return entries
      .filter(([name]) => {
        const health = this.healthStatus.get(name);
        return !health?.disabled;
      })
      .sort(([nameA], [nameB]) => {
        const priorityA = this.config.strategies[nameA].priority;
        const priorityB = this.config.strategies[nameB].priority;
        return priorityA - priorityB;
      })
      .map(([, strategy]) => strategy);
  }

  /**
   * Add unique reels to collection
   */
  private addUniqueReels(
    newReels: BuzzReel[],
    allReels: BuzzReel[],
    seenIds: Set<string>
  ): void {
    for (const reel of newReels) {
      const id = reel.id || reel.shortcode;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allReels.push(reel);
      }
    }
  }

  /**
   * Find the best performing strategy from results
   */
  private findBestStrategy(
    results: StrategyResult[]
  ): ScrapingStrategy | null {
    let best: StrategyResult | null = null;
    let bestScore = -1;

    for (const result of results) {
      if (result.status === 'success' || result.status === 'partial') {
        // Score based on reel count and response time
        const score =
          result.reels.length * 100 -
          result.executionTimeMs / 100;

        if (score > bestScore) {
          bestScore = score;
          best = result;
        }
      }
    }

    return best?.strategy || null;
  }

  /**
   * Update health status based on result
   */
  private updateHealthStatus(
    strategy: ScrapingStrategy,
    result: StrategyResult
  ): void {
    const health = this.healthStatus.get(strategy);
    if (!health) return;

    const isSuccess =
      result.status === 'success' || result.status === 'partial';

    if (isSuccess) {
      health.consecutiveFailures = 0;
      health.lastSuccessAt = new Date();
      health.healthy = true;

      // Update rolling success rate
      health.successRate = Math.min(
        1.0,
        health.successRate * 0.9 + 0.1
      );

      // Update average response time
      health.avgResponseTimeMs =
        health.avgResponseTimeMs * 0.8 + result.executionTimeMs * 0.2;
    } else {
      health.consecutiveFailures++;
      health.lastFailureAt = new Date();

      // Update rolling success rate
      health.successRate = Math.max(
        0,
        health.successRate * 0.9
      );

      // Disable strategy if too many consecutive failures
      if (health.consecutiveFailures >= 5) {
        health.disabled = true;
        health.healthy = false;
        health.enabledAt = new Date(Date.now() + 60000); // Re-enable in 1 minute

        this.log(
          `Temporarily disabled ${strategy} due to ${health.consecutiveFailures} consecutive failures`
        );

        // Schedule re-enable
        setTimeout(() => {
          health.disabled = false;
          health.consecutiveFailures = 0;
          this.log(`Re-enabled ${strategy}`);
        }, 60000);
      }
    }

    this.healthStatus.set(strategy, health);
  }

  /**
   * Execute with global timeout
   */
  private async withGlobalTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Global timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Get current health status of all strategies
   */
  getHealthStatus(): Map<ScrapingStrategy, StrategyHealthStatus> {
    return new Map(this.healthStatus);
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    totalStrategies: number;
    healthyStrategies: number;
    disabledStrategies: number;
    strategies: Array<{
      name: ScrapingStrategy;
      healthy: boolean;
      successRate: number;
    }>;
  } {
    const strategies = Array.from(this.healthStatus.entries()).map(
      ([name, health]) => ({
        name,
        healthy: health.healthy,
        successRate: health.successRate,
      })
    );

    return {
      totalStrategies: strategies.length,
      healthyStrategies: strategies.filter((s) => s.healthy).length,
      disabledStrategies: strategies.filter(
        (s) => this.healthStatus.get(s.name)?.disabled
      ).length,
      strategies,
    };
  }

  /**
   * Enable or disable a specific strategy
   */
  setStrategyEnabled(strategy: ScrapingStrategy, enabled: boolean): void {
    const strategyConfig = this.config.strategies[strategy];
    if (strategyConfig) {
      strategyConfig.enabled = enabled;
      this.log(`Strategy ${strategy} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Reset health status for all strategies
   */
  resetHealthStatus(): void {
    for (const [name] of this.healthStatus) {
      this.initializeHealth(name);
    }
    this.log('Reset health status for all strategies');
  }

  /**
   * Logging utility
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[MultiStrategy] ${message}`);
    }
  }
}

// Export singleton instance with default configuration
export const multiStrategyService = new MultiStrategyService();

// Export factory function for custom configuration
export function createMultiStrategyService(
  config?: Partial<MultiStrategyConfig>
): MultiStrategyService {
  return new MultiStrategyService(config);
}
