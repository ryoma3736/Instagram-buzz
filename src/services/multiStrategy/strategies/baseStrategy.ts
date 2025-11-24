/**
 * Base Strategy for Instagram Scraping
 * Issue #15: Abstract base class for all scraping strategies
 * @module services/multiStrategy/strategies/baseStrategy
 */

import { BuzzReel } from '../../../types/index.js';
import {
  ScrapingStrategy,
  StrategyResult,
  StrategyConfig,
  BlockDetectionResult,
  RetryConfig,
  RequestHeadersConfig,
} from '../types.js';

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Default User-Agents for rotation
 */
export const USER_AGENTS = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  instagramApp:
    'Instagram 275.0.0.27.98 iOS (17_0; iPhone14,2; en_US; en-US; scale=3.00; 1170x2532; 458229237)',
};

/**
 * Abstract base class for Instagram scraping strategies
 */
export abstract class BaseStrategy {
  protected readonly strategyName: ScrapingStrategy;
  protected readonly config: StrategyConfig;
  protected readonly retryConfig: RetryConfig;

  constructor(
    strategyName: ScrapingStrategy,
    config: StrategyConfig,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {
    this.strategyName = strategyName;
    this.config = config;
    this.retryConfig = retryConfig;
  }

  /**
   * Execute the strategy to search by hashtag
   */
  abstract searchByHashtag(
    hashtag: string,
    limit: number
  ): Promise<StrategyResult>;

  /**
   * Execute the strategy to get user reels
   */
  abstract getUserReels(
    username: string,
    limit: number
  ): Promise<StrategyResult>;

  /**
   * Execute the strategy to get a single reel by URL
   */
  abstract getReelByUrl(url: string): Promise<StrategyResult>;

  /**
   * Execute the strategy to get trending reels
   */
  abstract getTrendingReels(limit: number): Promise<StrategyResult>;

  /**
   * Get the strategy name
   */
  getName(): ScrapingStrategy {
    return this.strategyName;
  }

  /**
   * Check if strategy is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get strategy priority
   */
  getPriority(): number {
    return this.config.priority;
  }

  /**
   * Build default request headers
   */
  protected buildHeaders(
    options: Partial<RequestHeadersConfig> = {}
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': options.userAgent || USER_AGENTS.ios,
      Accept: options.accept || '*/*',
      'Accept-Language': options.acceptLanguage || 'en-US,en;q=0.9,ja;q=0.8',
    };

    if (options.acceptEncoding) {
      headers['Accept-Encoding'] = options.acceptEncoding;
    }

    if (options.referer) {
      headers['Referer'] = options.referer;
    }

    if (options.origin) {
      headers['Origin'] = options.origin;
    }

    if (options.xIgAppId) {
      headers['X-IG-App-ID'] = options.xIgAppId;
    }

    if (options.xRequestedWith) {
      headers['X-Requested-With'] = options.xRequestedWith;
    }

    if (options.cookie) {
      headers['Cookie'] = options.cookie;
    }

    return headers;
  }

  /**
   * Detect if response indicates blocking
   */
  protected detectBlock(
    response: Response | null,
    text: string
  ): BlockDetectionResult {
    // Rate limit detection
    if (response?.status === 429) {
      return {
        blocked: true,
        blockType: 'rate_limit',
        confidence: 1.0,
        recommendedWaitMs: 60000,
        recoveryAction: 'wait',
      };
    }

    // Login required detection
    if (
      response?.status === 401 ||
      response?.status === 403 ||
      text.includes('login') ||
      text.includes('LoginAndSignupPage') ||
      text.includes('not-logged-in')
    ) {
      return {
        blocked: true,
        blockType: 'login_required',
        confidence: 0.9,
        recoveryAction: 'use_auth',
      };
    }

    // CAPTCHA detection
    if (
      text.includes('checkpoint') ||
      text.includes('challenge') ||
      text.includes('captcha')
    ) {
      return {
        blocked: true,
        blockType: 'captcha',
        confidence: 0.85,
        recoveryAction: 'captcha_solve',
      };
    }

    // IP ban detection
    if (
      response?.status === 403 &&
      (text.includes('blocked') || text.includes('temporarily'))
    ) {
      return {
        blocked: true,
        blockType: 'ip_ban',
        confidence: 0.8,
        recommendedWaitMs: 3600000,
        recoveryAction: 'rotate_proxy',
      };
    }

    return {
      blocked: false,
      blockType: 'none',
      confidence: 1.0,
      recoveryAction: 'none',
    };
  }

  /**
   * Execute with retry logic
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.withTimeout(operation(), this.config.timeoutMs);
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryConfig.maxRetries) {
          this.log(
            `[${context}] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`
          );

          // Add jitter if enabled
          const actualDelay = this.retryConfig.jitter
            ? delay + Math.random() * 1000
            : delay;

          await this.sleep(actualDelay);

          // Exponential backoff
          delay = Math.min(
            delay * this.retryConfig.backoffMultiplier,
            this.retryConfig.maxDelayMs
          );
        }
      }
    }

    throw lastError || new Error(`${context} failed after all retries`);
  }

  /**
   * Execute with timeout
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Create a successful strategy result
   */
  protected createSuccessResult(
    reels: BuzzReel[],
    executionTimeMs: number,
    metadata?: StrategyResult['metadata']
  ): StrategyResult {
    return {
      strategy: this.strategyName,
      status: reels.length > 0 ? 'success' : 'partial',
      reels,
      executionTimeMs,
      metadata,
    };
  }

  /**
   * Create a failed strategy result
   */
  protected createFailedResult(
    error: string,
    executionTimeMs: number,
    metadata?: StrategyResult['metadata']
  ): StrategyResult {
    return {
      strategy: this.strategyName,
      status: 'failed',
      reels: [],
      executionTimeMs,
      error,
      metadata,
    };
  }

  /**
   * Create a blocked strategy result
   */
  protected createBlockedResult(
    blockDetection: BlockDetectionResult,
    executionTimeMs: number
  ): StrategyResult {
    return {
      strategy: this.strategyName,
      status:
        blockDetection.blockType === 'rate_limit' ? 'rate_limited' : 'blocked',
      reels: [],
      executionTimeMs,
      error: `Blocked: ${blockDetection.blockType}`,
      metadata: {
        rateLimited: blockDetection.blockType === 'rate_limit',
        loginRequired: blockDetection.blockType === 'login_required',
        captchaRequired: blockDetection.blockType === 'captcha',
      },
    };
  }

  /**
   * Extract shortcode from Instagram URL
   */
  protected extractShortcode(url: string): string | null {
    const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
    return match?.[1] || null;
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Logging utility
   */
  protected log(message: string): void {
    console.log(`[${this.strategyName}] ${message}`);
  }

  /**
   * Safe JSON parse
   */
  protected safeJsonParse<T>(text: string, context: string): T | null {
    try {
      return JSON.parse(text) as T;
    } catch {
      this.log(`Failed to parse JSON (${context}): ${text.slice(0, 100)}...`);
      return null;
    }
  }

  /**
   * Check if response is HTML (indicating redirect to login/error page)
   */
  protected isHtmlResponse(text: string): boolean {
    const trimmed = text.trim();
    return (
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<HTML') ||
      trimmed.includes('<head>') ||
      trimmed.includes('<body>')
    );
  }
}
