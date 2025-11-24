/**
 * Multi-Strategy Instagram Scraping Types
 * Issue #15: Instagram Block Bypass Implementation
 * @module services/multiStrategy/types
 */

import { BuzzReel } from '../../types/index.js';

/**
 * Strategy execution status
 */
export type StrategyStatus =
  | 'success'
  | 'partial'
  | 'blocked'
  | 'rate_limited'
  | 'failed'
  | 'timeout';

/**
 * Available scraping strategies
 */
export type ScrapingStrategy =
  | 'graphql_api'
  | 'rest_api'
  | 'oembed_api'
  | 'html_scraping'
  | 'mobile_api'
  | 'authenticated';

/**
 * Strategy execution result
 */
export interface StrategyResult {
  /** Which strategy was used */
  strategy: ScrapingStrategy;
  /** Execution status */
  status: StrategyStatus;
  /** Retrieved reels */
  reels: BuzzReel[];
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: {
    /** Whether rate limit was detected */
    rateLimited?: boolean;
    /** Whether login wall was detected */
    loginRequired?: boolean;
    /** Whether CAPTCHA was detected */
    captchaRequired?: boolean;
    /** Number of retries attempted */
    retryCount?: number;
    /** Response status code */
    statusCode?: number;
  };
}

/**
 * Multi-strategy execution result
 */
export interface MultiStrategyResult {
  /** Combined unique reels from all strategies */
  reels: BuzzReel[];
  /** Total execution time in milliseconds */
  totalExecutionTimeMs: number;
  /** Results from each strategy */
  strategyResults: StrategyResult[];
  /** Best performing strategy */
  bestStrategy: ScrapingStrategy | null;
  /** Overall success status */
  success: boolean;
  /** Number of strategies that succeeded */
  successCount: number;
  /** Number of strategies that failed */
  failCount: number;
  /** Timestamp of execution */
  executedAt: Date;
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  /** Whether this strategy is enabled */
  enabled: boolean;
  /** Priority (lower = higher priority, tried first) */
  priority: number;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Whether to continue to next strategy on failure */
  continueOnFailure: boolean;
}

/**
 * Multi-strategy service configuration
 */
export interface MultiStrategyConfig {
  /** Individual strategy configurations */
  strategies: Record<ScrapingStrategy, StrategyConfig>;
  /** Whether to execute strategies in parallel */
  parallelExecution: boolean;
  /** Stop after first successful strategy */
  stopOnFirstSuccess: boolean;
  /** Global timeout for all strategies */
  globalTimeoutMs: number;
  /** Minimum reels required to consider success */
  minReelsForSuccess: number;
  /** Enable detailed logging */
  verbose: boolean;
}

/**
 * Block detection result
 */
export interface BlockDetectionResult {
  /** Whether any block was detected */
  blocked: boolean;
  /** Type of block detected */
  blockType: 'rate_limit' | 'login_required' | 'captcha' | 'ip_ban' | 'none';
  /** Confidence score (0-1) */
  confidence: number;
  /** Recommended wait time before retry (ms) */
  recommendedWaitMs?: number;
  /** Suggested recovery action */
  recoveryAction?: 'wait' | 'rotate_proxy' | 'use_auth' | 'captcha_solve' | 'none';
}

/**
 * Request headers configuration
 */
export interface RequestHeadersConfig {
  userAgent: string;
  accept: string;
  acceptLanguage: string;
  acceptEncoding?: string;
  referer?: string;
  origin?: string;
  xIgAppId?: string;
  xRequestedWith?: string;
  cookie?: string;
}

/**
 * Retry configuration for individual requests
 */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay before first retry */
  initialDelayMs: number;
  /** Maximum delay between retries */
  maxDelayMs: number;
  /** Delay multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Add random jitter to delay */
  jitter: boolean;
}

/**
 * Search parameters for multi-strategy scraping
 */
export interface MultiStrategySearchParams {
  /** Hashtag to search (without #) */
  hashtag?: string;
  /** Username to get reels from */
  username?: string;
  /** Direct reel URL */
  reelUrl?: string;
  /** Maximum number of results */
  limit: number;
  /** Whether to get trending content */
  trending?: boolean;
  /** Specific strategies to use (if empty, use all enabled) */
  strategies?: ScrapingStrategy[];
}

/**
 * Cache entry for scraped data
 */
export interface CacheEntry {
  /** Cached reels */
  reels: BuzzReel[];
  /** When the cache entry was created */
  createdAt: Date;
  /** When the cache entry expires */
  expiresAt: Date;
  /** Which strategy produced this data */
  strategy: ScrapingStrategy;
  /** Cache key used */
  cacheKey: string;
}

/**
 * Health status of a strategy
 */
export interface StrategyHealthStatus {
  /** Strategy name */
  strategy: ScrapingStrategy;
  /** Whether the strategy is currently healthy */
  healthy: boolean;
  /** Success rate (0-1) over recent requests */
  successRate: number;
  /** Average response time in milliseconds */
  avgResponseTimeMs: number;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Last successful request timestamp */
  lastSuccessAt?: Date;
  /** Last failure timestamp */
  lastFailureAt?: Date;
  /** Whether strategy is temporarily disabled */
  disabled: boolean;
  /** Time when strategy will be re-enabled */
  enabledAt?: Date;
}
