/**
 * LoginHandler Unit Tests
 * @module tests/unit/auth/loginHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Page, Locator, BrowserContext } from 'playwright';
import { LoginHandler } from '../../../src/services/instagram/auth/loginHandler.js';
import {
  InstagramCredentials,
  LoginConfig,
  DEFAULT_LOGIN_CONFIG,
  LOGIN_SELECTORS,
  LoginEventCallbacks,
} from '../../../src/services/instagram/auth/types.js';

// Mock Locator creation
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

// Mock BrowserContext creation
const createMockContext = (cookies: any[] = []): BrowserContext =>
  ({
    cookies: vi.fn().mockResolvedValue(cookies),
  }) as unknown as BrowserContext;

// Mock Page creation
const createMockPage = (overrides: Partial<Page> = {}): Page => {
  const mockLocator = createMockLocator();
  const mockContext = createMockContext([
    { name: 'sessionid', value: 'test-session-id', domain: '.instagram.com' },
    { name: 'csrftoken', value: 'test-csrf-token', domain: '.instagram.com' },
    { name: 'ds_user_id', value: '12345678', domain: '.instagram.com' },
    { name: 'mid', value: 'test-mid', domain: '.instagram.com' },
  ]);

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

describe('LoginHandler', () => {
  let mockPage: Page;
  let handler: LoginHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = createMockPage();
    handler = new LoginHandler(mockPage);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const h = new LoginHandler(mockPage);
      expect(h).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const customConfig: Partial<LoginConfig> = {
        typingDelay: 200,
        maxRetries: 5,
      };
      const h = new LoginHandler(mockPage, customConfig);
      expect(h).toBeDefined();
    });

    it('should accept callbacks', () => {
      const callbacks: LoginEventCallbacks = {
        onNavigationStart: vi.fn(),
        onLoginSuccess: vi.fn(),
      };
      const h = new LoginHandler(mockPage, {}, callbacks);
      expect(h).toBeDefined();
    });
  });

  describe('navigateToLogin', () => {
    it('should navigate to Instagram login page', async () => {
      const callbacks = { onNavigationStart: vi.fn() };
      handler = new LoginHandler(mockPage, {}, callbacks);

      await handler.navigateToLogin();

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.instagram.com/accounts/login/',
        expect.objectContaining({
          waitUntil: 'networkidle',
        })
      );
      expect(callbacks.onNavigationStart).toHaveBeenCalled();
    });

    it('should use custom timeout from config', async () => {
      handler = new LoginHandler(mockPage, { pageTimeout: 60000 });

      await handler.navigateToLogin();

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });
  });

  describe('handleCookieDialog', () => {
    it('should click cookie accept button if visible', async () => {
      const mockClick = vi.fn().mockResolvedValue(undefined);
      const mockLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(true),
        first: vi.fn().mockReturnValue({ click: mockClick }),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
      });
      const callbacks = { onCookieDialogHandled: vi.fn() };
      handler = new LoginHandler(mockPage, {}, callbacks);

      await handler.handleCookieDialog();

      expect(mockClick).toHaveBeenCalled();
      expect(callbacks.onCookieDialogHandled).toHaveBeenCalled();
    });

    it('should not throw if cookie dialog is not visible', async () => {
      const mockLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(false),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
      });
      handler = new LoginHandler(mockPage);

      await expect(handler.handleCookieDialog()).resolves.not.toThrow();
    });

    it('should handle timeout gracefully', async () => {
      const mockLocator = createMockLocator({
        isVisible: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
      });
      handler = new LoginHandler(mockPage);

      await expect(handler.handleCookieDialog()).resolves.not.toThrow();
    });
  });

  describe('enterCredentials', () => {
    it('should enter username and password', async () => {
      const mockType = vi.fn().mockResolvedValue(undefined);
      const mockLocator = createMockLocator({
        type: mockType,
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
      });
      const callbacks = { onCredentialsEntered: vi.fn() };
      handler = new LoginHandler(mockPage, { typingDelay: 0 }, callbacks);

      const credentials: InstagramCredentials = {
        username: 'testuser',
        password: 'testpass',
      };

      await handler.enterCredentials(credentials);

      expect(mockLocator.click).toHaveBeenCalled();
      expect(callbacks.onCredentialsEntered).toHaveBeenCalled();
    });

    it('should type characters with delay for human-like behavior', async () => {
      const mockType = vi.fn().mockResolvedValue(undefined);
      const mockLocator = createMockLocator({
        type: mockType,
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
      });
      handler = new LoginHandler(mockPage, { typingDelay: 50 });

      const credentials: InstagramCredentials = {
        username: 'test',
        password: 'pass',
      };

      await handler.enterCredentials(credentials);

      // Should call type for each character
      expect(mockType).toHaveBeenCalled();
    });
  });

  describe('submitLogin', () => {
    it('should click login button', async () => {
      const mockClick = vi.fn().mockResolvedValue(undefined);
      const mockLocator = createMockLocator({
        click: mockClick,
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
      });
      const callbacks = { onLoginSubmitted: vi.fn() };
      handler = new LoginHandler(mockPage, {}, callbacks);

      await handler.submitLogin();

      expect(mockClick).toHaveBeenCalled();
      expect(callbacks.onLoginSubmitted).toHaveBeenCalled();
    });

    it('should wait for button to be enabled', async () => {
      const mockLocator = createMockLocator();
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
      });
      handler = new LoginHandler(mockPage);

      await handler.submitLogin();

      expect(mockPage.waitForFunction).toHaveBeenCalled();
    });
  });

  describe('verifyLogin', () => {
    it('should return success with cookies on successful login', async () => {
      const mockContext = createMockContext([
        { name: 'sessionid', value: 'session123', domain: '.instagram.com' },
        { name: 'csrftoken', value: 'csrf123', domain: '.instagram.com' },
        { name: 'ds_user_id', value: 'user123', domain: '.instagram.com' },
      ]);
      mockPage = createMockPage({
        context: vi.fn().mockReturnValue(mockContext),
      });
      const callbacks = { onLoginSuccess: vi.fn() };
      handler = new LoginHandler(mockPage, {}, callbacks);

      const result = await handler.verifyLogin();

      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();
      expect(result.cookies?.sessionid).toBe('session123');
      expect(result.cookies?.csrftoken).toBe('csrf123');
      expect(result.cookies?.ds_user_id).toBe('user123');
      expect(callbacks.onLoginSuccess).toHaveBeenCalled();
    });

    it('should return error when cookies are not obtained', async () => {
      const mockContext = createMockContext([]);
      mockPage = createMockPage({
        context: vi.fn().mockReturnValue(mockContext),
      });
      handler = new LoginHandler(mockPage);

      const result = await handler.verifyLogin();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cookie');
    });

    it('should return timeout error on timeout', async () => {
      mockPage = createMockPage({
        waitForSelector: vi.fn().mockRejectedValue(new Error('timeout exceeded')),
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout exceeded')),
      });
      handler = new LoginHandler(mockPage);

      const result = await handler.verifyLogin();

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('timeout');
    });

    it('should detect 2FA requirement', async () => {
      const mockLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(true),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
        waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      handler = new LoginHandler(mockPage);

      const result = await handler.verifyLogin();

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('verification_required');
    });

    it('should call onLoginFailed callback on error', async () => {
      const mockErrorLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi.fn().mockResolvedValue('Invalid password'),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockErrorLocator),
        waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      const callbacks = { onLoginFailed: vi.fn() };
      handler = new LoginHandler(mockPage, {}, callbacks);

      await handler.verifyLogin();

      expect(callbacks.onLoginFailed).toHaveBeenCalled();
    });
  });

  describe('error classification', () => {
    it('should classify password errors correctly', async () => {
      const mockErrorLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi.fn().mockResolvedValue('Incorrect password'),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockErrorLocator),
        waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      handler = new LoginHandler(mockPage);

      const result = await handler.verifyLogin();

      expect(result.errorType).toBe('invalid_credentials');
    });

    it('should classify account locked errors correctly', async () => {
      const mockErrorLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi.fn().mockResolvedValue('Your account has been locked'),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockErrorLocator),
        waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      handler = new LoginHandler(mockPage);

      const result = await handler.verifyLogin();

      expect(result.errorType).toBe('account_locked');
    });

    it('should classify rate limit errors correctly', async () => {
      const mockErrorLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi.fn().mockResolvedValue('Please wait a few minutes'),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockErrorLocator),
        waitForSelector: vi.fn().mockRejectedValue(new Error('timeout')),
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      handler = new LoginHandler(mockPage);

      const result = await handler.verifyLogin();

      expect(result.errorType).toBe('rate_limited');
    });
  });

  describe('LOGIN_SELECTORS', () => {
    it('should have correct selector definitions', () => {
      expect(LOGIN_SELECTORS.usernameInput).toBe('input[name="username"]');
      expect(LOGIN_SELECTORS.passwordInput).toBe('input[name="password"]');
      expect(LOGIN_SELECTORS.loginButton).toBe('button[type="submit"]');
    });
  });

  describe('DEFAULT_LOGIN_CONFIG', () => {
    it('should have reasonable default values', () => {
      expect(DEFAULT_LOGIN_CONFIG.pageTimeout).toBeGreaterThan(0);
      expect(DEFAULT_LOGIN_CONFIG.typingDelay).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_LOGIN_CONFIG.actionDelay).toBeGreaterThanOrEqual(0);
    });
  });
});
