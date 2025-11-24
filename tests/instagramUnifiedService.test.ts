/**
 * Instagram Unified Service Tests
 *
 * @author CodeGenAgent
 * @issue #15
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstagramUnifiedService } from '../src/services/instagramUnifiedService.js';

// Mock the dependent services
vi.mock('../src/services/instagramEnhancedScraperService.js', () => ({
  instagramEnhancedScraperService: {
    getUserReels: vi.fn(),
    getReelByUrl: vi.fn(),
    searchByHashtag: vi.fn(),
    getTrendingReels: vi.fn(),
    testStrategies: vi.fn(),
  },
}));

vi.mock('../src/services/instagramRapidApiService.js', () => ({
  instagramRapidApiService: {
    isAvailable: vi.fn(() => false),
    getUserReels: vi.fn(),
    getReelByShortcode: vi.fn(),
    searchByHashtag: vi.fn(),
    getTrendingReels: vi.fn(),
    getUsageStats: vi.fn(() => []),
  },
}));

vi.mock('../src/services/instagramScraperService.js', () => ({
  instagramScraperService: {
    getPublicReels: vi.fn(),
    getReelByUrl: vi.fn(),
    searchByHashtag: vi.fn(),
    getTrendingReels: vi.fn(),
  },
}));

import { instagramEnhancedScraperService } from '../src/services/instagramEnhancedScraperService.js';
import { instagramRapidApiService } from '../src/services/instagramRapidApiService.js';
import { instagramScraperService } from '../src/services/instagramScraperService.js';

describe('InstagramUnifiedService', () => {
  let service: InstagramUnifiedService;

  const mockReel = {
    id: '12345',
    url: 'https://www.instagram.com/reel/ABC123/',
    shortcode: 'ABC123',
    title: 'Test Reel',
    views: 10000,
    likes: 500,
    comments: 50,
    posted_at: new Date(),
    author: { username: 'testuser', followers: 1000 },
    thumbnail_url: 'https://example.com/thumb.jpg',
  };

  beforeEach(() => {
    service = new InstagramUnifiedService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getUserReels', () => {
    it('should use enhanced scraper as primary source', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockResolvedValue([mockReel]);

      const result = await service.getUserReels('testuser', 10);

      expect(result.data).toHaveLength(1);
      expect(result.source).toBe('enhanced');
      expect(result.cached).toBe(false);
      expect(instagramEnhancedScraperService.getUserReels).toHaveBeenCalledWith('testuser', 10);
    });

    it('should fallback to RapidAPI when enhanced fails', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockResolvedValue([]);
      vi.mocked(instagramRapidApiService.isAvailable).mockReturnValue(true);
      vi.mocked(instagramRapidApiService.getUserReels).mockResolvedValue([mockReel]);

      // Need to recreate service after mocking isAvailable
      service = new InstagramUnifiedService();
      const result = await service.getUserReels('testuser', 10);

      expect(result.data).toHaveLength(1);
      expect(result.source).toBe('rapidapi');
    });

    it('should fallback to legacy scraper when all else fails', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockResolvedValue([]);
      vi.mocked(instagramRapidApiService.isAvailable).mockReturnValue(false);
      vi.mocked(instagramScraperService.getPublicReels).mockResolvedValue([mockReel]);

      const result = await service.getUserReels('testuser', 10);

      expect(result.data).toHaveLength(1);
      expect(result.source).toBe('legacy');
    });

    it('should return empty array when all strategies fail', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockResolvedValue([]);
      vi.mocked(instagramRapidApiService.isAvailable).mockReturnValue(false);
      vi.mocked(instagramScraperService.getPublicReels).mockResolvedValue([]);

      const result = await service.getUserReels('testuser', 10);

      expect(result.data).toEqual([]);
    });

    it('should use cache on second request', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockResolvedValue([mockReel]);

      // First request - populates cache
      const result1 = await service.getUserReels('testuser', 10);
      expect(result1.cached).toBe(false);

      // Second request - should use cache
      const result2 = await service.getUserReels('testuser', 10);
      expect(result2.cached).toBe(true);
      expect(result2.source).toBe('cache');

      // Enhanced scraper should only be called once
      expect(instagramEnhancedScraperService.getUserReels).toHaveBeenCalledTimes(1);
    });

    it('should include latency in result', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return [mockReel];
      });

      const result = await service.getUserReels('testuser', 10);

      expect(result.latency).toBeGreaterThanOrEqual(50);
    });
  });

  describe('getReelByUrl', () => {
    it('should fetch reel by URL', async () => {
      vi.mocked(instagramEnhancedScraperService.getReelByUrl).mockResolvedValue(mockReel);

      const result = await service.getReelByUrl('https://www.instagram.com/reel/ABC123/');

      expect(result.data).toEqual(mockReel);
      expect(result.source).toBe('enhanced');
    });

    it('should fallback to RapidAPI for reel fetch', async () => {
      vi.mocked(instagramEnhancedScraperService.getReelByUrl).mockResolvedValue(null);
      vi.mocked(instagramRapidApiService.isAvailable).mockReturnValue(true);
      vi.mocked(instagramRapidApiService.getReelByShortcode).mockResolvedValue(mockReel);

      service = new InstagramUnifiedService();
      const result = await service.getReelByUrl('https://www.instagram.com/reel/ABC123/');

      expect(result.data).toEqual(mockReel);
      expect(result.source).toBe('rapidapi');
    });

    it('should cache reel results', async () => {
      vi.mocked(instagramEnhancedScraperService.getReelByUrl).mockResolvedValue(mockReel);

      await service.getReelByUrl('https://www.instagram.com/reel/ABC123/');
      const result = await service.getReelByUrl('https://www.instagram.com/reel/ABC123/');

      expect(result.cached).toBe(true);
      expect(instagramEnhancedScraperService.getReelByUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchByHashtag', () => {
    it('should search by hashtag', async () => {
      vi.mocked(instagramEnhancedScraperService.searchByHashtag).mockResolvedValue([mockReel]);

      const result = await service.searchByHashtag('#trending', 20);

      expect(result.data).toHaveLength(1);
      expect(result.source).toBe('enhanced');
    });

    it('should handle hashtag without # prefix', async () => {
      vi.mocked(instagramEnhancedScraperService.searchByHashtag).mockResolvedValue([mockReel]);

      const result = await service.searchByHashtag('trending', 20);

      expect(result.data).toHaveLength(1);
    });
  });

  describe('getTrendingReels', () => {
    it('should fetch trending reels', async () => {
      vi.mocked(instagramEnhancedScraperService.getTrendingReels).mockResolvedValue([mockReel]);

      const result = await service.getTrendingReels(20);

      expect(result.data).toHaveLength(1);
      expect(result.source).toBe('enhanced');
    });
  });

  describe('healthCheck', () => {
    it('should check health of all services', async () => {
      vi.mocked(instagramEnhancedScraperService.testStrategies).mockResolvedValue({
        oEmbed: true,
        WebProfileAPI: false,
        HTMLAccess: true,
      });
      vi.mocked(instagramRapidApiService.isAvailable).mockReturnValue(true);

      const health = await service.healthCheck();

      expect(health).toHaveProperty('enhanced');
      expect(health).toHaveProperty('rapidApi');
      expect(health).toHaveProperty('legacy');
      expect(health).toHaveProperty('lastCheck');
    });

    it('should mark enhanced as healthy if any strategy works', async () => {
      vi.mocked(instagramEnhancedScraperService.testStrategies).mockResolvedValue({
        oEmbed: false,
        WebProfileAPI: false,
        HTMLAccess: true,
      });

      const health = await service.healthCheck();

      expect(health.enhanced).toBe(true);
    });

    it('should mark enhanced as unhealthy if all strategies fail', async () => {
      vi.mocked(instagramEnhancedScraperService.testStrategies).mockResolvedValue({
        oEmbed: false,
        WebProfileAPI: false,
        HTMLAccess: false,
      });

      const health = await service.healthCheck();

      expect(health.enhanced).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      vi.mocked(instagramRapidApiService.getUsageStats).mockReturnValue([
        { provider: 'scraper-api2', used: 10, limit: 100 },
      ]);

      const stats = service.getStats();

      expect(stats).toHaveProperty('health');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('rapidApiUsage');
      expect(stats.cache.size).toBe(0);
    });

    it('should show cache entries after requests', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockResolvedValue([mockReel]);

      await service.getUserReels('testuser', 10);
      const stats = service.getStats();

      expect(stats.cache.size).toBe(1);
      expect(stats.cache.keys).toContain('user:testuser:10');
    });
  });

  describe('clearCache', () => {
    it('should clear all cached data', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockResolvedValue([mockReel]);

      await service.getUserReels('testuser', 10);
      expect(service.getStats().cache.size).toBe(1);

      service.clearCache();
      expect(service.getStats().cache.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle enhanced scraper throwing error', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockRejectedValue(new Error('Network error'));
      vi.mocked(instagramScraperService.getPublicReels).mockResolvedValue([mockReel]);

      const result = await service.getUserReels('testuser', 10);

      expect(result.data).toHaveLength(1);
      expect(result.source).toBe('legacy');
    });

    it('should handle all services throwing errors', async () => {
      vi.mocked(instagramEnhancedScraperService.getUserReels).mockRejectedValue(new Error('Error 1'));
      vi.mocked(instagramScraperService.getPublicReels).mockRejectedValue(new Error('Error 2'));

      const result = await service.getUserReels('testuser', 10);

      expect(result.data).toEqual([]);
    });
  });
});
