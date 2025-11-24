/**
 * Hashtag Search E2E Tests
 * Real environment tests for Instagram hashtag search functionality
 * @module tests/e2e/hashtagSearch.e2e
 *
 * Note: These tests require valid Instagram credentials and should be run
 * sparingly to avoid rate limiting. Set SKIP_E2E=true to skip these tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HashtagSearchService } from '../../src/services/instagram/api/hashtagSearch.js';
import { CookiePersistence } from '../../src/services/instagram/persistence/cookiePersistence.js';
import type { InstagramCookies } from '../../src/services/instagram/session/types.js';

// Skip E2E tests if environment variable is set or no cookies available
const SKIP_E2E = process.env.SKIP_E2E === 'true' || process.env.CI === 'true';

describe.skipIf(SKIP_E2E)('E2E: Hashtag Search', () => {
  let service: HashtagSearchService;
  let cookies: InstagramCookies;

  beforeAll(async () => {
    // Load cookies from persistence
    const persistence = new CookiePersistence();
    const stored = await persistence.load();

    if (!stored) {
      console.warn('No stored cookies found. Skipping E2E tests.');
      return;
    }

    cookies = {
      sessionid: stored.cookies.sessionid,
      csrftoken: stored.cookies.csrftoken,
      ds_user_id: stored.cookies.ds_user_id,
      rur: stored.cookies.rur || '',
      extractedAt: stored.metadata.extractedAt,
      expiresAt: stored.metadata.expiresAt,
    };

    service = new HashtagSearchService(cookies);
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('Issue #31 Success Criteria', () => {
    it('should fetch 5+ posts for #cat hashtag', async () => {
      const result = await service.search('cat', 10);

      console.log(`Found ${result.posts.length} posts for #cat`);

      expect(result.posts.length).toBeGreaterThanOrEqual(5);
      expect(result.hashtag).toBe('cat');
    }, 30000);

    it('should fetch 5+ posts for #tokyo hashtag', async () => {
      const result = await service.search('tokyo', 10);

      console.log(`Found ${result.posts.length} posts for #tokyo`);

      expect(result.posts.length).toBeGreaterThanOrEqual(5);
    }, 30000);

    it('should fetch 5+ posts for #fashion hashtag', async () => {
      const result = await service.search('fashion', 10);

      console.log(`Found ${result.posts.length} posts for #fashion`);

      expect(result.posts.length).toBeGreaterThanOrEqual(5);
    }, 30000);

    it('should return valid Instagram URLs', async () => {
      const result = await service.search('trending', 5);

      for (const post of result.posts) {
        expect(post.url).toMatch(/instagram\.com\/(p|reel)\//);
        console.log(`Valid URL: ${post.url}`);
      }
    }, 30000);

    it('should complete within 5 seconds', async () => {
      const startTime = Date.now();

      await service.search('test', 5);

      const duration = Date.now() - startTime;
      console.log(`Search completed in ${duration}ms`);

      expect(duration).toBeLessThan(5000);
    }, 10000);
  });

  describe('Hashtag Search Features', () => {
    it('should get top posts for hashtag', async () => {
      const topPosts = await service.searchTopPosts('photography');

      console.log(`Found ${topPosts.length} top posts`);

      expect(Array.isArray(topPosts)).toBe(true);
      expect(topPosts.length).toBeLessThanOrEqual(9);

      // Top posts should have high engagement
      if (topPosts.length > 0) {
        expect(topPosts[0].likeCount + topPosts[0].commentCount).toBeGreaterThan(0);
      }
    }, 30000);

    it('should get recent posts for hashtag', async () => {
      const recentPosts = await service.searchRecentPosts('travel', 10);

      console.log(`Found ${recentPosts.length} recent posts`);

      expect(Array.isArray(recentPosts)).toBe(true);

      // Recent posts should be sorted by timestamp
      if (recentPosts.length > 1) {
        expect(recentPosts[0].timestamp).toBeGreaterThanOrEqual(recentPosts[1].timestamp);
      }
    }, 30000);

    it('should handle Japanese hashtags', async () => {
      const result = await service.search('猫', 5);

      console.log(`Found ${result.posts.length} posts for #猫`);

      expect(result.posts.length).toBeGreaterThan(0);
    }, 30000);
  });
});

// Mock version for CI/CD - always runs
describe('E2E: Hashtag Search (Mocked)', () => {
  it('should have correct test structure', () => {
    // Verify test file structure
    expect(typeof HashtagSearchService).toBe('function');
  });

  it('should export required functions', async () => {
    const module = await import('../../src/services/instagram/api/hashtagSearch.js');

    expect(module.HashtagSearchService).toBeDefined();
    expect(module.createHashtagSearchService).toBeDefined();
    expect(module.searchHashtag).toBeDefined();
  });
});
