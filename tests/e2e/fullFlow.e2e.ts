/**
 * Full Flow E2E Tests
 * End-to-end tests for complete Instagram data retrieval workflows
 * @module tests/e2e/fullFlow.e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HashtagSearchService } from '../../src/services/instagram/api/hashtagSearch.js';
import { UserReelsService } from '../../src/services/instagram/api/userReels.js';
import { TrendingService } from '../../src/services/instagram/api/trending.js';
import { CookiePersistence } from '../../src/services/instagram/persistence/cookiePersistence.js';
import type { InstagramCookies } from '../../src/services/instagram/session/types.js';

const SKIP_E2E = process.env.SKIP_E2E === 'true' || process.env.CI === 'true';

interface E2ETestResults {
  hashtagSearch: {
    cat: number;
    tokyo: number;
    fashion: number;
    total: number;
    passed: boolean;
  };
  userReels: {
    account: string;
    count: number;
    passed: boolean;
  };
  trending: {
    count: number;
    passed: boolean;
  };
  overall: boolean;
}

describe.skipIf(SKIP_E2E)('E2E: Full Instagram Flow', () => {
  let hashtagService: HashtagSearchService;
  let reelsService: UserReelsService;
  let trendingService: TrendingService;
  let cookies: InstagramCookies;
  let results: E2ETestResults;

  beforeAll(async () => {
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

    hashtagService = new HashtagSearchService(cookies);
    reelsService = new UserReelsService(cookies);
    trendingService = new TrendingService(cookies);

    results = {
      hashtagSearch: { cat: 0, tokyo: 0, fashion: 0, total: 0, passed: false },
      userReels: { account: '', count: 0, passed: false },
      trending: { count: 0, passed: false },
      overall: false,
    };
  });

  afterAll(() => {
    // Print summary
    console.log('\n========================================');
    console.log('E2E Test Results Summary');
    console.log('========================================');
    console.log('\nHashtag Search:');
    console.log(`  #cat: ${results.hashtagSearch.cat} posts`);
    console.log(`  #tokyo: ${results.hashtagSearch.tokyo} posts`);
    console.log(`  #fashion: ${results.hashtagSearch.fashion} posts`);
    console.log(`  Total: ${results.hashtagSearch.total} posts`);
    console.log(`  Passed: ${results.hashtagSearch.passed ? 'YES' : 'NO'}`);
    console.log('\nUser Reels:');
    console.log(`  Account: @${results.userReels.account}`);
    console.log(`  Reels: ${results.userReels.count}`);
    console.log(`  Passed: ${results.userReels.passed ? 'YES' : 'NO'}`);
    console.log('\nTrending:');
    console.log(`  Posts: ${results.trending.count}`);
    console.log(`  Passed: ${results.trending.passed ? 'YES' : 'NO'}`);
    console.log('\n========================================');
    console.log(`Overall: ${results.overall ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    console.log('========================================\n');
  });

  describe('Issue #31 Complete Verification', () => {
    it('should pass all hashtag search criteria', async () => {
      // Test #cat
      const catResult = await hashtagService.search('cat', 10);
      results.hashtagSearch.cat = catResult.posts.length;

      // Test #tokyo
      const tokyoResult = await hashtagService.search('tokyo', 10);
      results.hashtagSearch.tokyo = tokyoResult.posts.length;

      // Test #fashion
      const fashionResult = await hashtagService.search('fashion', 10);
      results.hashtagSearch.fashion = fashionResult.posts.length;

      results.hashtagSearch.total =
        results.hashtagSearch.cat + results.hashtagSearch.tokyo + results.hashtagSearch.fashion;

      results.hashtagSearch.passed =
        results.hashtagSearch.cat >= 5 &&
        results.hashtagSearch.tokyo >= 5 &&
        results.hashtagSearch.fashion >= 5;

      expect(results.hashtagSearch.cat).toBeGreaterThanOrEqual(5);
      expect(results.hashtagSearch.tokyo).toBeGreaterThanOrEqual(5);
      expect(results.hashtagSearch.fashion).toBeGreaterThanOrEqual(5);
    }, 90000);

    it('should pass user reels criteria', async () => {
      const testAccounts = ['instagram', 'natgeo', 'nike'];

      for (const account of testAccounts) {
        try {
          const result = await reelsService.getReels(account, { limit: 5 });

          if (result.reels.length >= 3) {
            results.userReels.account = account;
            results.userReels.count = result.reels.length;
            results.userReels.passed = true;
            break;
          }
        } catch (error) {
          console.warn(`Failed to fetch reels from @${account}:`, (error as Error).message);
        }
      }

      expect(results.userReels.passed).toBe(true);
      expect(results.userReels.count).toBeGreaterThanOrEqual(3);
    }, 90000);

    it('should pass trending content criteria', async () => {
      const trendingResult = await trendingService.getTrendingReels({ limit: 15 });

      if (trendingResult.success && trendingResult.data) {
        results.trending.count = trendingResult.data.items.length;
        results.trending.passed = results.trending.count >= 10;
      }

      expect(results.trending.count).toBeGreaterThanOrEqual(10);
    }, 60000);

    it('should verify overall success', () => {
      results.overall =
        results.hashtagSearch.passed && results.userReels.passed && results.trending.passed;

      expect(results.overall).toBe(true);
    });
  });

  describe('Complete Workflow Test', () => {
    it('should execute full content discovery workflow', async () => {
      console.log('\n--- Starting Full Workflow Test ---\n');

      // Step 1: Search hashtags
      console.log('Step 1: Hashtag Search');
      const hashtags = ['photography', 'travel', 'food'];
      const hashtagPosts: Array<{ hashtag: string; count: number }> = [];

      for (const tag of hashtags) {
        const result = await hashtagService.search(tag, 5);
        hashtagPosts.push({ hashtag: tag, count: result.posts.length });
        console.log(`  #${tag}: ${result.posts.length} posts`);
      }

      // Step 2: Get user reels from discovered users
      console.log('\nStep 2: User Reels');
      const reelResult = await reelsService.getReels('instagram', { limit: 3 });
      console.log(`  @instagram: ${reelResult.reels.length} reels`);

      // Step 3: Get trending content
      console.log('\nStep 3: Trending Content');
      const trending = await trendingService.getTrendingReels({ limit: 5 });
      if (trending.success && trending.data) {
        console.log(`  Trending: ${trending.data.items.length} items`);
      }

      console.log('\n--- Workflow Complete ---\n');

      // Verify workflow completed
      expect(hashtagPosts.length).toBe(3);
      expect(reelResult.reels).toBeDefined();
      expect(trending.success).toBe(true);
    }, 120000);
  });

  describe('Error Recovery Test', () => {
    it('should handle API errors gracefully', async () => {
      // Test with invalid hashtag
      const invalidResult = await hashtagService.search('', 5);
      expect(Array.isArray(invalidResult.posts)).toBe(true);

      // Test with non-existent user
      try {
        await reelsService.getReels('this_user_definitely_does_not_exist_xyz123', { limit: 1 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    }, 30000);
  });

  describe('Rate Limiting Awareness', () => {
    it('should handle multiple sequential requests', async () => {
      const hashtags = ['sunset', 'beach', 'mountain'];
      const results: number[] = [];

      for (const tag of hashtags) {
        const result = await hashtagService.search(tag, 3);
        results.push(result.posts.length);

        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      expect(results.length).toBe(3);
      console.log(`Sequential requests completed: ${results.join(', ')} posts`);
    }, 60000);
  });
});

// Mock version for CI/CD
describe('E2E: Full Flow (Mocked)', () => {
  it('should have all services available', async () => {
    const hashtagModule = await import('../../src/services/instagram/api/hashtagSearch.js');
    const reelsModule = await import('../../src/services/instagram/api/userReels.js');
    const trendingModule = await import('../../src/services/instagram/api/trending.js');

    expect(hashtagModule.HashtagSearchService).toBeDefined();
    expect(reelsModule.UserReelsService).toBeDefined();
    expect(trendingModule.TrendingService).toBeDefined();
  });

  it('should have cookie persistence available', async () => {
    const persistenceModule = await import(
      '../../src/services/instagram/persistence/cookiePersistence.js'
    );

    expect(persistenceModule.CookiePersistence).toBeDefined();
  });
});
