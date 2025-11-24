/**
 * User Reels E2E Tests
 * Real environment tests for Instagram user reels functionality
 * @module tests/e2e/userReels.e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  UserReelsService,
  createUserReelsService,
} from '../../src/services/instagram/api/userReels.js';
import { CookiePersistence } from '../../src/services/instagram/persistence/cookiePersistence.js';
import type { InstagramCookies } from '../../src/services/instagram/session/types.js';

const SKIP_E2E = process.env.SKIP_E2E === 'true' || process.env.CI === 'true';

// Public accounts known to have reels (official/verified accounts)
const TEST_ACCOUNTS = {
  // These are public accounts that typically have reels
  publicAccounts: ['instagram', 'natgeo', 'nike'],
};

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

  describe('Issue #31 Success Criteria - User Reels', () => {
    it('should fetch 3+ reels from a public account', async () => {
      let totalReels = 0;
      let successfulAccount = '';

      for (const account of TEST_ACCOUNTS.publicAccounts) {
        try {
          const result = await service.getReels(account, { limit: 5 });

          if (result.reels.length >= 3) {
            totalReels = result.reels.length;
            successfulAccount = account;
            console.log(`Found ${result.reels.length} reels from @${account}`);
            break;
          }
        } catch (error) {
          console.warn(`Failed to fetch reels from @${account}:`, (error as Error).message);
        }
      }

      expect(totalReels).toBeGreaterThanOrEqual(3);
      console.log(`Success: Found ${totalReels} reels from @${successfulAccount}`);
    }, 60000);
  });

  describe('User Reels Features', () => {
    it('should resolve username to user ID', async () => {
      const userId = await service.resolveUserId('instagram');

      expect(userId).toBeDefined();
      expect(typeof userId).toBe('string');
      expect(userId.length).toBeGreaterThan(0);

      console.log(`Resolved @instagram to user ID: ${userId}`);
    }, 30000);

    it('should include reel metadata', async () => {
      const result = await service.getReels('instagram', { limit: 3 });

      if (result.reels.length > 0) {
        const reel = result.reels[0];

        expect(reel.id).toBeDefined();
        expect(reel.shortcode).toBeDefined();
        expect(reel.url).toContain('instagram.com');
        expect(typeof reel.viewCount).toBe('number');
        expect(typeof reel.likeCount).toBe('number');

        console.log(`Reel: ${reel.shortcode}`);
        console.log(`  Views: ${reel.viewCount}, Likes: ${reel.likeCount}`);
        console.log(`  Duration: ${reel.duration}s`);
      }
    }, 30000);

    it('should include user profile info', async () => {
      const result = await service.getReels('instagram', { limit: 1 });

      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('instagram');
      expect(result.user.id).toBeDefined();

      console.log(`User profile: @${result.user.username}`);
      console.log(`  Followers: ${result.user.followerCount}`);
      console.log(`  Verified: ${result.user.isVerified}`);
    }, 30000);

    it('should support pagination', async () => {
      const firstPage = await service.getReels('natgeo', { limit: 3 });

      if (firstPage.hasMore && firstPage.endCursor) {
        console.log(`First page: ${firstPage.reels.length} reels`);
        console.log(`Has more: ${firstPage.hasMore}`);

        const secondPage = await service.getReels('natgeo', {
          limit: 3,
          cursor: firstPage.endCursor,
        });

        console.log(`Second page: ${secondPage.reels.length} reels`);

        // Verify different reels in second page
        if (firstPage.reels.length > 0 && secondPage.reels.length > 0) {
          expect(firstPage.reels[0].id).not.toBe(secondPage.reels[0].id);
        }
      }
    }, 60000);

    it('should handle private account gracefully', async () => {
      // Try to access a known private account (this may vary)
      // The service should throw an appropriate error
      try {
        // Use a random username that's likely private or doesn't exist
        await service.getReels('private_test_account_xyz', { limit: 1 });
      } catch (error) {
        expect(error).toBeDefined();
        console.log(`Private account error handled: ${(error as Error).message}`);
      }
    }, 30000);
  });

  describe('Reel Content Verification', () => {
    it('should include video URL when available', async () => {
      const result = await service.getReels('instagram', { limit: 5 });

      const reelWithVideo = result.reels.find((r) => r.videoUrl);
      if (reelWithVideo) {
        expect(reelWithVideo.videoUrl).toContain('http');
        console.log(`Video URL found: ${reelWithVideo.videoUrl.substring(0, 50)}...`);
      }
    }, 30000);

    it('should include thumbnail URL', async () => {
      const result = await service.getReels('instagram', { limit: 5 });

      const reelWithThumbnail = result.reels.find((r) => r.thumbnailUrl);
      if (reelWithThumbnail) {
        expect(reelWithThumbnail.thumbnailUrl).toContain('http');
        console.log(`Thumbnail URL found: ${reelWithThumbnail.thumbnailUrl.substring(0, 50)}...`);
      }
    }, 30000);

    it('should include caption when available', async () => {
      const result = await service.getReels('natgeo', { limit: 5 });

      const reelWithCaption = result.reels.find((r) => r.caption && r.caption.length > 0);
      if (reelWithCaption) {
        console.log(`Caption: ${reelWithCaption.caption.substring(0, 100)}...`);
        expect(reelWithCaption.caption.length).toBeGreaterThan(0);
      }
    }, 30000);
  });
});

// Mock version for CI/CD
describe('E2E: User Reels (Mocked)', () => {
  it('should have correct service structure', () => {
    expect(typeof UserReelsService).toBe('function');
    expect(typeof createUserReelsService).toBe('function');
  });

  it('should export required methods', async () => {
    const module = await import('../../src/services/instagram/api/userReels.js');

    expect(module.UserReelsService).toBeDefined();
    expect(module.createUserReelsService).toBeDefined();
  });
});
