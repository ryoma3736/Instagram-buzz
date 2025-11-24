/**
 * Authentication Flow Integration Tests
 * Tests the complete authentication flow: Login -> 2FA -> Cookie Extraction -> Storage
 * @module tests/integration/authFlow.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LoginHandler } from '../../src/services/instagram/auth/loginHandler.js';
import { TwoFactorAuth } from '../../src/services/instagram/twoFactorAuth.js';
import {
  extractInstagramCookies,
  validateCookies,
} from '../../src/services/instagram/cookieExtractor.js';
import { CookiePersistence } from '../../src/services/instagram/persistence/cookiePersistence.js';
import type { Page, BrowserContext, Locator } from 'playwright';
import type { CookieData } from '../../src/services/instagram/session/types.js';

// Mock setup for integration testing without real browser
const createMockLocator = (overrides: Partial<Locator> = {}): Locator =>
  ({
    waitFor: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(false),
    first: vi.fn().mockReturnThis(),
    textContent: vi.fn().mockResolvedValue(''),
    ...overrides,
  }) as unknown as Locator;

const createMockContext = (cookies: CookieData[] = []): BrowserContext =>
  ({
    cookies: vi.fn().mockResolvedValue(cookies),
  }) as unknown as BrowserContext;

const createMockPage = (
  cookies: CookieData[] = [],
  overrides: Partial<Page> = {}
): Page => {
  const mockLocator = createMockLocator();
  const mockContext = createMockContext(cookies);

  return {
    goto: vi.fn().mockResolvedValue({}),
    locator: vi.fn().mockReturnValue(mockLocator),
    waitForSelector: vi.fn().mockResolvedValue({}),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://www.instagram.com/'),
    context: vi.fn().mockReturnValue(mockContext),
    ...overrides,
  } as unknown as Page;
};

describe('Instagram Authentication Flow Integration', () => {
  const TEST_SECRET = 'JBSWY3DPEHPK3PXP';

  describe('Complete Login Flow (Mocked)', () => {
    it('should complete full login flow and extract cookies', async () => {
      // Mock cookies that would be returned after successful login
      const mockRawCookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'session123',
          domain: '.instagram.com',
          path: '/',
          expires: Date.now() + 90 * 24 * 60 * 60 * 1000,
        },
        {
          name: 'csrftoken',
          value: 'csrf456',
          domain: '.instagram.com',
          path: '/',
        },
        {
          name: 'ds_user_id',
          value: '789',
          domain: '.instagram.com',
          path: '/',
        },
        {
          name: 'rur',
          value: 'FTW',
          domain: '.instagram.com',
          path: '/',
        },
      ];

      const mockPage = createMockPage(mockRawCookies);
      const handler = new LoginHandler(mockPage);

      // Step 1: Navigate to login page
      await handler.navigateToLogin();
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.instagram.com/accounts/login/',
        expect.any(Object)
      );

      // Step 2: Enter credentials
      await handler.enterCredentials({
        username: 'testuser',
        password: 'testpass',
      });

      // Step 3: Submit login
      await handler.submitLogin();

      // Step 4: Verify login and extract cookies
      const result = await handler.verifyLogin();
      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();

      // Step 5: Extract and validate cookies
      const extractResult = extractInstagramCookies(mockRawCookies);
      expect(extractResult.success).toBe(true);
      expect(extractResult.cookies).toBeDefined();

      // Step 6: Validate cookies are valid
      if (extractResult.cookies) {
        const isValid = validateCookies(extractResult.cookies);
        expect(isValid).toBe(true);
      }
    });

    it('should handle 2FA flow when required', async () => {
      const twoFactorAuth = new TwoFactorAuth({ totpSecret: TEST_SECRET });

      // Simulate 2FA page detection
      const pageContent = 'Please enter code from your authentication app';
      const pageUrl = 'https://instagram.com/accounts/login/two_factor';

      const challenge = twoFactorAuth.detectChallengeType(pageContent, pageUrl);

      expect(challenge).not.toBeNull();
      expect(challenge?.method).toBe('totp');

      // Get TOTP code
      const totpResult = twoFactorAuth.getTOTPCode();
      expect(totpResult.success).toBe(true);
      expect(totpResult.code).toMatch(/^\d{6}$/);

      // Verify the code can be validated
      expect(twoFactorAuth.verifyTOTPCode(totpResult.code!)).toBe(true);
    });

    it('should handle backup code flow when TOTP unavailable', () => {
      const twoFactorAuth = new TwoFactorAuth({
        backupCodes: ['BACKUP01', 'BACKUP02', 'BACKUP03'],
      });

      // Check backup codes available
      expect(twoFactorAuth.hasBackupCodes()).toBe(true);

      // Use backup code
      const result = twoFactorAuth.getBackupCode();
      expect(result.success).toBe(true);
      expect(result.code).toBe('BACKUP01');

      // Backup code should be consumed
      const result2 = twoFactorAuth.getBackupCode();
      expect(result2.code).toBe('BACKUP02');
    });
  });

  describe('Cookie Persistence Flow', () => {
    let persistence: CookiePersistence;

    beforeEach(() => {
      persistence = new CookiePersistence({
        storagePath: '/tmp/test-cookies',
      });
    });

    it('should save and load cookies correctly', async () => {
      const cookies = {
        sessionid: 'test-session',
        csrftoken: 'test-csrf',
        ds_user_id: 'test-user-id',
        rur: 'FTW',
      };

      // Save cookies
      await persistence.save(cookies, { username: 'testuser' });

      // Load cookies
      const loaded = await persistence.load('testuser');

      expect(loaded).not.toBeNull();
      expect(loaded?.cookies.sessionid).toBe('test-session');
      expect(loaded?.metadata.username).toBe('testuser');
    });

    it('should detect expired cookies', async () => {
      const cookies = {
        sessionid: 'test-session',
        csrftoken: 'test-csrf',
        ds_user_id: 'test-user-id',
      };

      // Save with past expiry
      await persistence.save(cookies, {
        username: 'expireduser',
        expiresAt: Date.now() - 1000,
      });

      const isExpired = await persistence.isExpired('expireduser');
      expect(isExpired).toBe(true);
    });

    it('should detect cookies needing refresh', async () => {
      const cookies = {
        sessionid: 'test-session',
        csrftoken: 'test-csrf',
        ds_user_id: 'test-user-id',
      };

      // Save with expiry within threshold
      await persistence.save(cookies, {
        username: 'refreshuser',
        expiresAt: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
      });

      const needsRefresh = await persistence.needsRefresh('refreshuser', 24);
      expect(needsRefresh).toBe(true);
    });
  });

  describe('Error Handling Flow', () => {
    it('should handle missing required cookies', () => {
      const incompleteCookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'session123',
          domain: '.instagram.com',
          path: '/',
        },
        // Missing csrftoken, ds_user_id, rur
      ];

      const result = extractInstagramCookies(incompleteCookies);

      expect(result.success).toBe(false);
      expect(result.missingCookies).toBeDefined();
      expect(result.missingCookies!.length).toBeGreaterThan(0);
    });

    it('should handle invalid credentials detection', async () => {
      const mockErrorLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi
          .fn()
          .mockResolvedValue('The password you entered is incorrect'),
      });

      const mockPage = createMockPage([], {
        locator: vi.fn().mockReturnValue(mockErrorLocator),
        waitForSelector: vi
          .fn()
          .mockRejectedValue(new Error('timeout exceeded')),
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout exceeded')),
      });

      const handler = new LoginHandler(mockPage);
      const result = await handler.verifyLogin();

      expect(result.success).toBe(false);
      // Error should indicate credential issue or timeout
      expect(result.errorType).toBeDefined();
    });
  });
});
