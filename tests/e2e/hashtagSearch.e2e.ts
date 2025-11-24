/**
 * Hashtag Search E2E Tests
 * Real environment tests for Instagram hashtag search functionality
 * @module tests/e2e/hashtagSearch.e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  HashtagSearchService,
  createHashtagSearchService,
} from '../../src/services/instagram/api/hashtagSearch.js';
import { CookiePersistence } from '../../src/services/instagram/persistence/cookiePersistence.js';
import type { InstagramCookies } from '../../src/services/instagram/session/types.js';

const SKIP_E2E = process.env.SKIP_E2E === 'true' || process.env.CI === 'true';

describe.skipIf(SKIP_E2E)('E2E: Hashtag Search', () => {
  let service: HashtagSearchService;
  let cookies: InstagramCookies;

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

    service = new HashtagSearchService(cookies);
  });

  afterAll(() => {
    // Cleanup
  });

  describe('Issue #31 Success Criteria - Hashtag Search', () => {
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
      expect(result.hashtag).toBe('tokyo');
    }, 30000);

    it('should fetch 5+ posts for #fashion hashtag', async () => {
      const result = await service.search('fashion', 10);

      console.log(`Found ${result.posts.length} posts for #fashion`);
      expect(result.posts.length).toBeGreaterThanOrEqual(5);
      expect(result.hashtag).toBe('fashion');
    }, 30000);
  });

  describe('Hashtag Search Features', () => {
    it('should handle hashtag with # prefix', async () => {
      const result = await service.search('#cat', 5);

      expect(result.hashtag).toBe('cat');
      expect(Array.isArray(result.posts)).toBe(true);
    }, 30000);

    it('should include post metadata', async () => {
      const result = await service.search('travel', 5);

      if (result.posts.length > 0) {
        const post = result.posts[0];

        expect(post.id).toBeDefined();
        expect(typeof post.likeCount).toBe('number');
        expect(typeof post.commentCount).toBe('number');
        expect(typeof post.timestamp).toBe('number');

        console.log(
          `Post ID: ${post.id}, Likes: ${post.likeCount}, Comments: ${post.commentCount}`
        );
      }
    }, 30000);

    it('should get top posts for a hashtag', async () => {
      const posts = await service.searchTopPosts('food');

      console.log(`Found ${posts.length} top posts for #food`);
      expect(posts.length).toBeGreaterThan(0);
      expect(posts.length).toBeLessThanOrEqual(9);
    }, 30000);

    it('should get recent posts for a hashtag', async () => {
      const posts = await service.searchRecentPosts('nature', 10);

      console.log(`Found ${posts.length} recent posts for #nature`);
      expect(Array.isArray(posts)).toBe(true);

      // Verify posts are sorted by timestamp (most recent first)
      if (posts.length >= 2) {
        expect(posts[0].timestamp).toBeGreaterThanOrEqual(posts[1].timestamp);
      }
    }, 30000);

    it('should return pagination info', async () => {
      const result = await service.searchWithPagination('music', { limit: 5 });

      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('endCursor');
      console.log(`Has more: ${result.hasMore}, End cursor: ${result.endCursor}`);
    }, 30000);

    it('should get hashtag info', async () => {
      const info = await service.getHashtagInfo('art');

      if (info) {
        expect(info.name).toBe('art');
        expect(typeof info.mediaCount).toBe('number');
        console.log(`#art has ${info.mediaCount} posts`);
      }
    }, 30000);
  });

  describe('Japanese Hashtag Support', () => {
    it('should search Japanese hashtag #neko', async () => {
      const result = await service.search('neko', 5);

      console.log(`Found ${result.posts.length} posts for #neko (Japanese for cat)`);
      expect(Array.isArray(result.posts)).toBe(true);
    }, 30000);
  });
});

// Mock version for CI/CD
describe('E2E: Hashtag Search (Mocked)', () => {
  it('should have correct service structure', () => {
    expect(typeof HashtagSearchService).toBe('function');
    expect(typeof createHashtagSearchService).toBe('function');
  });

  it('should export required methods', async () => {
    const module = await import('../../src/services/instagram/api/hashtagSearch.js');

    expect(module.HashtagSearchService).toBeDefined();
    expect(module.createHashtagSearchService).toBeDefined();
    expect(module.searchHashtag).toBeDefined();
  });
});
