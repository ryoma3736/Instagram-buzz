/**
 * Multi-Strategy Instagram Scraping Module
 * Issue #15: Instagram Block Bypass Implementation
 *
 * This module provides a resilient Instagram scraping system using multiple
 * strategies that automatically fall back when one is blocked.
 *
 * Strategies:
 * - GraphQL API: Uses Instagram's internal GraphQL endpoints
 * - oEmbed API: Uses official oEmbed API (limited but reliable)
 * - HTML Scraping: Direct HTML scraping with pattern extraction
 *
 * Usage:
 * ```typescript
 * import { multiStrategyService } from './services/multiStrategy/index.js';
 *
 * // Search by hashtag
 * const result = await multiStrategyService.searchByHashtag('music', 20);
 *
 * // Get user reels
 * const userReels = await multiStrategyService.getUserReels('username', 12);
 *
 * // Get trending reels
 * const trending = await multiStrategyService.getTrendingReels(20);
 *
 * // Get single reel
 * const reel = await multiStrategyService.getReelByUrl('https://instagram.com/reel/xxx/');
 * ```
 *
 * @module services/multiStrategy
 */

// Export types
export * from './types.js';

// Export strategies
export * from './strategies/index.js';

// Export main service
export {
  MultiStrategyService,
  multiStrategyService,
  createMultiStrategyService,
} from './multiStrategyService.js';
