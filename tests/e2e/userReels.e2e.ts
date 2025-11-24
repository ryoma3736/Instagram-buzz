/**
 * User Reels E2E Tests
 * Real environment tests for Instagram user reels functionality
 * @module tests/e2e/userReels.e2e
 *
 * Note: These tests require valid Instagram credentials and should be run
 * sparingly to avoid rate limiting.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UserReelsService, createUserReelsService } from '../../src/services/instagram/api/userReels.js';
import { CookiePersistence } from '../../src/services/instagram/persistence/cookiePersistence.js';
import type { InstagramCookies } from '../../src/services/instagram/session/types.js';

const SKIP_E2E = process.env.SKIP_E2E === 'true' || process.env.CI === 'true';

describe.skipIf(SKIP_E2E)('E2E: User Reels', () => {
  let service: UserReelsService;
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

    service = new UserReelsService(cookies);
  });

  afterAll(() => {
    // Cleanup
  });

  describe('Issue #31 Success Criteria - Reels', () => {
    it('should fetch 3+ reels from public account', async () => {
      // Use Instagram's official account as a reliable public account
      const result = await service.getReels('instagram', { limit: 5 });

      console.log(`Found ${result.reels.length} reels from @instagram`);

      expect(result.reels.length).toBeGreaterThanOrEqual(3);
      expect(result.user.username).toBe('instagram');
    }, 30000);

    it('should return valid reel URLs', async () => {
      const result = await service.getReels('instagram', { limit: 3 });

      for (const reel of result.reels) {
        expect(reel.url).toMatch(/instagram\.com\/reel\//);
        console.log(`Reel URL: ${reel.url}`);
      }
    }, 30000);

    it('should include engagement metrics', async () => {
      const result = await service.getReels('instagram', { limit: 3 });

      if (result.reels.length > 0) {
        const reel = result.reels[0];

        // Should have view count or like count
        expect(reel.viewCount + reel.likeCount).toBeGreaterThan(0);

        console.log(`Reel engagement - Views: ${reel.viewCount}, Likes: ${reel.likeCount}`);
      }
    }, 30000);
  });

  describe('User Reels Features', () => {
    it('should include user profile information', async () => {
      const result = await service.getReels('instagram', { limit: 1 });

      expect(result.user).toBeDefined();
      expect(result.user.id).toBeDefined();
      expect(result.user.username).toBe('instagram');
      expect(result.user.isVerified).toBe(true);

      console.log(`User: @${result.user.username}, Verified: ${result.user.isVerified}`);
    }, 30000);

    it('should support pagination', async () => {
      const firstPage = await service.getReels('instagram', { limit: 3 });

      if (firstPage.hasMore && firstPage.endCursor) {
        const secondPage = await service.getReels('instagram', {
          limit: 3,
          cursor: firstPage.endCursor,
        });

        console.log(`First page: ${firstPage.reels.length} reels, Second page: ${secondPage.reels.length} reels`);

        // Second page should have different reels
        if (secondPage.reels.length > 0 && firstPage.reels.length > 0) {
          expect(secondPage.reels[0].id).not.toBe(firstPage.reels[0].id);
        }
      }
    }, 60000);

    it('should resolve username to user ID', async () => {
      const userId = await service.resolveUserId('instagram');

      expect(userId).toBeDefined();
      expect(typeof userId).toBe('string');
      expect(userId.length).toBeGreaterThan(0);

      console.log(`Resolved @instagram to user ID: ${userId}`);
    }, 30000);
  });
});

// Mock version for CI/CD
describe('E2E: User Reels (Mocked)', () => {
  it('should have correct service structure', () => {
    expect(typeof UserReelsService).toBe('function');
    expect(typeof createUserReelsService).toBe('function');
  });

  it('should export required functions', async () => {
    const module = await import('../../src/services/instagram/api/userReels.js');

    expect(module.UserReelsService).toBeDefined();
    expect(module.createUserReelsService).toBeDefined();
  });
});
