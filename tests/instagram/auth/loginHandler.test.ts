/**
 * ログインハンドラーのテスト
 * @module tests/instagram/auth/loginHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Page, Locator, BrowserContext } from 'playwright';
import { LoginHandler } from '../../../src/services/instagram/auth/loginHandler.js';
import {
  InstagramCredentials,
  LoginConfig,
  DEFAULT_LOGIN_CONFIG,
  LOGIN_SELECTORS,
} from '../../../src/services/instagram/auth/types.js';

// モックLocatorの作成
const createMockLocator = (overrides: Partial<Locator> = {}): Locator => ({
  waitFor: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  type: vi.fn().mockResolvedValue(undefined),
  isVisible: vi.fn().mockResolvedValue(false),
  first: vi.fn().mockReturnThis(),
  textContent: vi.fn().mockResolvedValue(''),
  ...overrides,
} as unknown as Locator);

// モックContextの作成
const createMockContext = (cookies: any[] = []): BrowserContext => ({
  cookies: vi.fn().mockResolvedValue(cookies),
} as unknown as BrowserContext);

// モックPageの作成
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
    it('デフォルト設定で初期化される', () => {
      const h = new LoginHandler(mockPage);
      expect(h).toBeDefined();
    });

    it('カスタム設定で初期化できる', () => {
      const customConfig: Partial<LoginConfig> = {
        typingDelay: 200,
        maxRetries: 5,
      };
      const h = new LoginHandler(mockPage, customConfig);
      expect(h).toBeDefined();
    });

    it('コールバックを受け取れる', () => {
      const callbacks = {
        onNavigationStart: vi.fn(),
      };
      const h = new LoginHandler(mockPage, {}, callbacks);
      expect(h).toBeDefined();
    });
  });

  describe('navigateToLogin', () => {
    it('Instagramログインページにナビゲートする', async () => {
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
  });

  describe('handleCookieDialog', () => {
    it('Cookie同意ダイアログがある場合はクリックする', async () => {
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

    it('Cookie同意ダイアログがない場合は何もしない', async () => {
      const mockLocator = createMockLocator({
        isVisible: vi.fn().mockResolvedValue(false),
      });
      mockPage = createMockPage({
        locator: vi.fn().mockReturnValue(mockLocator),
      });
      handler = new LoginHandler(mockPage);

      await expect(handler.handleCookieDialog()).resolves.not.toThrow();
    });
  });

  describe('enterCredentials', () => {
    it('ユーザー名とパスワードを入力する', async () => {
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
  });

  describe('submitLogin', () => {
    it('ログインボタンをクリックする', async () => {
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
  });

  describe('verifyLogin', () => {
    it('ログイン成功時にCookieを返す', async () => {
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

    it('Cookieが取得できない場合はエラーを返す', async () => {
      const mockContext = createMockContext([]);
      mockPage = createMockPage({
        context: vi.fn().mockReturnValue(mockContext),
      });
      handler = new LoginHandler(mockPage);

      const result = await handler.verifyLogin();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cookie');
    });

    it('タイムアウト時にエラーを返す', async () => {
      mockPage = createMockPage({
        waitForSelector: vi.fn().mockRejectedValue(new Error('timeout exceeded')),
        waitForURL: vi.fn().mockRejectedValue(new Error('timeout exceeded')),
      });
      handler = new LoginHandler(mockPage);

      const result = await handler.verifyLogin();

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('timeout');
    });
  });

  describe('LOGIN_SELECTORS', () => {
    it('正しいセレクターが定義されている', () => {
      expect(LOGIN_SELECTORS.usernameInput).toBe('input[name="username"]');
      expect(LOGIN_SELECTORS.passwordInput).toBe('input[name="password"]');
      expect(LOGIN_SELECTORS.loginButton).toBe('button[type="submit"]');
    });
  });
});
