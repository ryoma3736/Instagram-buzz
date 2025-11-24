/**
 * Instagram Unified Service
 *
 * Combines all scraping strategies into a single, robust service
 * with automatic fallback and intelligent strategy selection.
 *
 * Priority order:
 * 1. Enhanced Scraper (free, multiple strategies)
 * 2. RapidAPI (paid, more reliable)
 * 3. Original Scraper (legacy fallback)
 *
 * @author CodeGenAgent
 * @issue #15
 */

import { BuzzReel } from '../types/index.js';
import { instagramEnhancedScraperService } from './instagramEnhancedScraperService.js';
import { instagramRapidApiService } from './instagramRapidApiService.js';
import { instagramScraperService } from './instagramScraperService.js';

/**
 * Service health status
 */
interface ServiceHealth {
  enhanced: boolean;
  rapidApi: boolean;
  legacy: boolean;
  lastCheck: Date;
}

/**
 * Unified response with metadata
 */
interface UnifiedResult<T> {
  data: T;
  source: 'enhanced' | 'rapidapi' | 'legacy' | 'cache';
  latency: number;
  cached: boolean;
}

/**
 * Simple in-memory cache
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Instagram Unified Service
 */
export class InstagramUnifiedService {
  private health: ServiceHealth = {
    enhanced: true,
    rapidApi: false,
    legacy: true,
    lastCheck: new Date(),
  };

  private cache: Map<string, CacheEntry<any>> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Check RapidAPI availability on init
    this.health.rapidApi = instagramRapidApiService.isAvailable();
  }

  /**
   * Get from cache if available
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache entry
   */
  private setCache<T>(key: string, data: T, ttl: number = this.cacheTTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get user reels with fallback
   */
  async getUserReels(username: string, limit: number = 12): Promise<UnifiedResult<BuzzReel[]>> {
    const cacheKey = `user:${username}:${limit}`;
    const startTime = Date.now();

    // Check cache first
    const cached = this.getFromCache<BuzzReel[]>(cacheKey);
    if (cached && cached.length > 0) {
      console.log(`[Unified] Cache hit for @${username}`);
      return {
        data: cached,
        source: 'cache',
        latency: Date.now() - startTime,
        cached: true,
      };
    }

    console.log(`[Unified] Fetching reels for @${username}`);

    // Strategy 1: Enhanced Scraper
    if (this.health.enhanced) {
      try {
        const reels = await instagramEnhancedScraperService.getUserReels(username, limit);
        if (reels.length > 0) {
          this.setCache(cacheKey, reels);
          return {
            data: reels,
            source: 'enhanced',
            latency: Date.now() - startTime,
            cached: false,
          };
        }
      } catch (error) {
        console.warn('[Unified] Enhanced scraper failed:', error);
        this.health.enhanced = false;
      }
    }

    // Strategy 2: RapidAPI
    if (this.health.rapidApi) {
      try {
        const reels = await instagramRapidApiService.getUserReels(username, limit);
        if (reels.length > 0) {
          this.setCache(cacheKey, reels);
          return {
            data: reels,
            source: 'rapidapi',
            latency: Date.now() - startTime,
            cached: false,
          };
        }
      } catch (error) {
        console.warn('[Unified] RapidAPI failed:', error);
      }
    }

    // Strategy 3: Legacy Scraper
    if (this.health.legacy) {
      try {
        const reels = await instagramScraperService.getPublicReels(username, limit);
        if (reels.length > 0) {
          this.setCache(cacheKey, reels);
          return {
            data: reels,
            source: 'legacy',
            latency: Date.now() - startTime,
            cached: false,
          };
        }
      } catch (error) {
        console.warn('[Unified] Legacy scraper failed:', error);
      }
    }

    // All strategies failed
    return {
      data: [],
      source: 'enhanced',
      latency: Date.now() - startTime,
      cached: false,
    };
  }

  /**
   * Get single reel by URL
   */
  async getReelByUrl(url: string): Promise<UnifiedResult<BuzzReel | null>> {
    const cacheKey = `reel:${url}`;
    const startTime = Date.now();

    // Check cache
    const cached = this.getFromCache<BuzzReel>(cacheKey);
    if (cached) {
      return {
        data: cached,
        source: 'cache',
        latency: Date.now() - startTime,
        cached: true,
      };
    }

    console.log(`[Unified] Fetching reel: ${url}`);

    // Strategy 1: Enhanced Scraper
    try {
      const reel = await instagramEnhancedScraperService.getReelByUrl(url);
      if (reel) {
        this.setCache(cacheKey, reel);
        return {
          data: reel,
          source: 'enhanced',
          latency: Date.now() - startTime,
          cached: false,
        };
      }
    } catch (error) {
      console.warn('[Unified] Enhanced scraper failed');
    }

    // Strategy 2: RapidAPI
    if (this.health.rapidApi) {
      try {
        const shortcode = this.extractShortcode(url);
        if (shortcode) {
          const reel = await instagramRapidApiService.getReelByShortcode(shortcode);
          if (reel) {
            this.setCache(cacheKey, reel);
            return {
              data: reel,
              source: 'rapidapi',
              latency: Date.now() - startTime,
              cached: false,
            };
          }
        }
      } catch (error) {
        console.warn('[Unified] RapidAPI failed');
      }
    }

    // Strategy 3: Legacy Scraper
    try {
      const reel = await instagramScraperService.getReelByUrl(url);
      if (reel) {
        this.setCache(cacheKey, reel);
        return {
          data: reel,
          source: 'legacy',
          latency: Date.now() - startTime,
          cached: false,
        };
      }
    } catch (error) {
      console.warn('[Unified] Legacy scraper failed');
    }

    return {
      data: null,
      source: 'enhanced',
      latency: Date.now() - startTime,
      cached: false,
    };
  }

  /**
   * Search by hashtag
   */
  async searchByHashtag(hashtag: string, limit: number = 20): Promise<UnifiedResult<BuzzReel[]>> {
    const tag = hashtag.replace(/^#/, '');
    const cacheKey = `hashtag:${tag}:${limit}`;
    const startTime = Date.now();

    // Check cache
    const cached = this.getFromCache<BuzzReel[]>(cacheKey);
    if (cached && cached.length > 0) {
      return {
        data: cached,
        source: 'cache',
        latency: Date.now() - startTime,
        cached: true,
      };
    }

    console.log(`[Unified] Searching #${tag}`);

    // Strategy 1: Enhanced Scraper
    try {
      const reels = await instagramEnhancedScraperService.searchByHashtag(tag, limit);
      if (reels.length > 0) {
        this.setCache(cacheKey, reels);
        return {
          data: reels,
          source: 'enhanced',
          latency: Date.now() - startTime,
          cached: false,
        };
      }
    } catch (error) {
      console.warn('[Unified] Enhanced hashtag search failed');
    }

    // Strategy 2: RapidAPI
    if (this.health.rapidApi) {
      try {
        const reels = await instagramRapidApiService.searchByHashtag(tag, limit);
        if (reels.length > 0) {
          this.setCache(cacheKey, reels);
          return {
            data: reels,
            source: 'rapidapi',
            latency: Date.now() - startTime,
            cached: false,
          };
        }
      } catch (error) {
        console.warn('[Unified] RapidAPI hashtag search failed');
      }
    }

    // Strategy 3: Legacy Scraper
    try {
      const reels = await instagramScraperService.searchByHashtag(tag, limit);
      if (reels.length > 0) {
        this.setCache(cacheKey, reels);
        return {
          data: reels,
          source: 'legacy',
          latency: Date.now() - startTime,
          cached: false,
        };
      }
    } catch (error) {
      console.warn('[Unified] Legacy hashtag search failed');
    }

    return {
      data: [],
      source: 'enhanced',
      latency: Date.now() - startTime,
      cached: false,
    };
  }

  /**
   * Get trending reels
   */
  async getTrendingReels(limit: number = 20): Promise<UnifiedResult<BuzzReel[]>> {
    const cacheKey = `trending:${limit}`;
    const startTime = Date.now();

    // Check cache
    const cached = this.getFromCache<BuzzReel[]>(cacheKey);
    if (cached && cached.length > 0) {
      return {
        data: cached,
        source: 'cache',
        latency: Date.now() - startTime,
        cached: true,
      };
    }

    console.log('[Unified] Fetching trending reels');

    // Strategy 1: Enhanced Scraper
    try {
      const reels = await instagramEnhancedScraperService.getTrendingReels(limit);
      if (reels.length > 0) {
        this.setCache(cacheKey, reels, 2 * 60 * 1000); // 2 min cache for trending
        return {
          data: reels,
          source: 'enhanced',
          latency: Date.now() - startTime,
          cached: false,
        };
      }
    } catch (error) {
      console.warn('[Unified] Enhanced trending failed');
    }

    // Strategy 2: RapidAPI
    if (this.health.rapidApi) {
      try {
        const reels = await instagramRapidApiService.getTrendingReels(limit);
        if (reels.length > 0) {
          this.setCache(cacheKey, reels, 2 * 60 * 1000);
          return {
            data: reels,
            source: 'rapidapi',
            latency: Date.now() - startTime,
            cached: false,
          };
        }
      } catch (error) {
        console.warn('[Unified] RapidAPI trending failed');
      }
    }

    // Strategy 3: Legacy Scraper
    try {
      const reels = await instagramScraperService.getTrendingReels(limit);
      if (reels.length > 0) {
        this.setCache(cacheKey, reels, 2 * 60 * 1000);
        return {
          data: reels,
          source: 'legacy',
          latency: Date.now() - startTime,
          cached: false,
        };
      }
    } catch (error) {
      console.warn('[Unified] Legacy trending failed');
    }

    return {
      data: [],
      source: 'enhanced',
      latency: Date.now() - startTime,
      cached: false,
    };
  }

  /**
   * Health check all services
   */
  async healthCheck(): Promise<ServiceHealth> {
    console.log('[Unified] Running health check...');

    // Test Enhanced Scraper
    try {
      const strategies = await instagramEnhancedScraperService.testStrategies();
      this.health.enhanced = Object.values(strategies).some(v => v);
    } catch {
      this.health.enhanced = false;
    }

    // Check RapidAPI
    this.health.rapidApi = instagramRapidApiService.isAvailable();

    // Legacy is always available as last resort
    this.health.legacy = true;

    this.health.lastCheck = new Date();

    console.log('[Unified] Health status:', this.health);
    return { ...this.health };
  }

  /**
   * Get service statistics
   */
  getStats(): {
    health: ServiceHealth;
    cache: { size: number; keys: string[] };
    rapidApiUsage: { provider: string; used: number; limit: number }[];
  } {
    return {
      health: { ...this.health },
      cache: {
        size: this.cache.size,
        keys: [...this.cache.keys()],
      },
      rapidApiUsage: instagramRapidApiService.getUsageStats(),
    };
  }

  /**
   * Extract shortcode from URL
   */
  private extractShortcode(url: string): string | null {
    const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
    return match?.[1] || null;
  }
}

export const instagramUnifiedService = new InstagramUnifiedService();
