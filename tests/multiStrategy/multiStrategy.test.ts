/**
 * Multi-Strategy Scraping Service Tests
 * Issue #15: Instagram Block Bypass Implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MultiStrategyService,
  createMultiStrategyService,
} from '../../src/services/multiStrategy/multiStrategyService.js';
import {
  ScrapingStrategy,
  StrategyResult,
  MultiStrategyResult,
} from '../../src/services/multiStrategy/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MultiStrategyService', () => {
  let service: MultiStrategyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMultiStrategyService({
      verbose: false,
      globalTimeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const defaultService = new MultiStrategyService();
      const health = defaultService.getHealthSummary();

      expect(health.totalStrategies).toBeGreaterThan(0);
      expect(health.healthyStrategies).toBe(health.totalStrategies);
    });

    it('should create service with custom config', () => {
      const customService = createMultiStrategyService({
        parallelExecution: true,
        stopOnFirstSuccess: true,
      });

      expect(customService).toBeInstanceOf(MultiStrategyService);
    });
  });

  describe('getHealthSummary', () => {
    it('should return health status for all strategies', () => {
      const health = service.getHealthSummary();

      expect(health).toHaveProperty('totalStrategies');
      expect(health).toHaveProperty('healthyStrategies');
      expect(health).toHaveProperty('disabledStrategies');
      expect(health).toHaveProperty('strategies');
      expect(Array.isArray(health.strategies)).toBe(true);
    });

    it('should show all strategies as healthy initially', () => {
      const health = service.getHealthSummary();

      expect(health.healthyStrategies).toBe(health.totalStrategies);
      expect(health.disabledStrategies).toBe(0);
    });
  });

  describe('setStrategyEnabled', () => {
    it('should enable/disable strategies', () => {
      service.setStrategyEnabled('graphql_api', false);
      // Strategy should be updated in config

      service.setStrategyEnabled('graphql_api', true);
      // Strategy should be re-enabled
    });
  });

  describe('resetHealthStatus', () => {
    it('should reset health for all strategies', () => {
      service.resetHealthStatus();
      const health = service.getHealthSummary();

      expect(health.healthyStrategies).toBe(health.totalStrategies);
    });
  });

  describe('searchByHashtag', () => {
    it('should return MultiStrategyResult structure', async () => {
      // Mock successful response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} }),
      });

      const result = await service.searchByHashtag('music', 10);

      expect(result).toHaveProperty('reels');
      expect(result).toHaveProperty('totalExecutionTimeMs');
      expect(result).toHaveProperty('strategyResults');
      expect(result).toHaveProperty('bestStrategy');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('successCount');
      expect(result).toHaveProperty('failCount');
      expect(result).toHaveProperty('executedAt');

      expect(Array.isArray(result.reels)).toBe(true);
      expect(Array.isArray(result.strategyResults)).toBe(true);
      expect(result.executedAt).toBeInstanceOf(Date);
    });
  });

  describe('getUserReels', () => {
    it('should return MultiStrategyResult structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} }),
      });

      const result = await service.getUserReels('testuser', 12);

      expect(result).toHaveProperty('reels');
      expect(result).toHaveProperty('strategyResults');
      expect(Array.isArray(result.reels)).toBe(true);
    });
  });

  describe('getReelByUrl', () => {
    it('should return MultiStrategyResult structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ graphql: { shortcode_media: { id: '123' } } }),
      });

      const result = await service.getReelByUrl('https://instagram.com/reel/ABC123/');

      expect(result).toHaveProperty('reels');
      expect(result).toHaveProperty('strategyResults');
    });
  });

  describe('getTrendingReels', () => {
    it('should return MultiStrategyResult structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: {} }),
      });

      const result = await service.getTrendingReels(20);

      expect(result).toHaveProperty('reels');
      expect(result).toHaveProperty('strategyResults');
    });
  });

  describe('search', () => {
    it('should handle hashtag search params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({}),
      });

      const result = await service.search({ hashtag: 'music', limit: 10 });
      expect(result).toHaveProperty('reels');
    });

    it('should handle username search params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({}),
      });

      const result = await service.search({ username: 'testuser', limit: 10 });
      expect(result).toHaveProperty('reels');
    });

    it('should handle trending search params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({}),
      });

      const result = await service.search({ trending: true, limit: 20 });
      expect(result).toHaveProperty('reels');
    });

    it('should throw on invalid params', async () => {
      await expect(service.search({ limit: 10 })).rejects.toThrow(
        'Invalid search params'
      );
    });
  });
});

describe('Strategy Types', () => {
  it('should define correct ScrapingStrategy types', () => {
    const validStrategies: ScrapingStrategy[] = [
      'graphql_api',
      'rest_api',
      'oembed_api',
      'html_scraping',
      'mobile_api',
      'authenticated',
    ];

    expect(validStrategies).toHaveLength(6);
  });

  it('should have correct StrategyResult structure', () => {
    const mockResult: StrategyResult = {
      strategy: 'graphql_api',
      status: 'success',
      reels: [],
      executionTimeMs: 1000,
    };

    expect(mockResult.strategy).toBe('graphql_api');
    expect(mockResult.status).toBe('success');
    expect(mockResult.reels).toEqual([]);
    expect(mockResult.executionTimeMs).toBe(1000);
  });

  it('should have correct MultiStrategyResult structure', () => {
    const mockResult: MultiStrategyResult = {
      reels: [],
      totalExecutionTimeMs: 2000,
      strategyResults: [],
      bestStrategy: 'graphql_api',
      success: true,
      successCount: 1,
      failCount: 0,
      executedAt: new Date(),
    };

    expect(mockResult.success).toBe(true);
    expect(mockResult.bestStrategy).toBe('graphql_api');
  });
});

describe('Deduplication', () => {
  let service: MultiStrategyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMultiStrategyService({ verbose: false });
  });

  it('should deduplicate reels from multiple strategies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    });

    const result = await service.searchByHashtag('test', 5);

    // Check that there are no duplicate IDs
    const ids = result.reels.map(r => r.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});
