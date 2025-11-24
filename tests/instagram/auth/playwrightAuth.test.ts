/**
 * Playwright認証サービスのテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PlaywrightAuthService,
  InstagramCredentials,
  LoginResult,
  DEFAULT_BROWSER_CONFIG,
  DEFAULT_LOGIN_CONFIG,
} from '../../../src/services/instagram/auth/index.js';

// Playwrightをモック
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue({}),
          locator: vi.fn().mockReturnValue({
            waitFor: vi.fn().mockResolvedValue(undefined),
            click: vi.fn().mockResolvedValue(undefined),
            type: vi.fn().mockResolvedValue(undefined),
            isVisible: vi.fn().mockResolvedValue(false),
            first: vi.fn().mockReturnThis(),
            textContent: vi.fn().mockResolvedValue(''),
          }),
          waitForSelector: vi.fn().mockResolvedValue({}),
          waitForURL: vi.fn().mockResolvedValue(undefined),
          waitForFunction: vi.fn().mockResolvedValue(undefined),
          url: vi.fn().mockReturnValue('https://www.instagram.com/'),
          context: vi.fn().mockReturnValue({
            cookies: vi.fn().mockResolvedValue([
              { name: 'sessionid', value: 'test-session', domain: '.instagram.com' },
              { name: 'csrftoken', value: 'test-csrf', domain: '.instagram.com' },
              { name: 'ds_user_id', value: '123456', domain: '.instagram.com' },
            ]),
          }),
        }),
        addCookies: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('PlaywrightAuthService', () => {
  let service: PlaywrightAuthService;

  beforeEach(() => {
    service = new PlaywrightAuthService(
      { headless: true },
      { cookieSavePath: undefined }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('デフォルト設定で初期化される', () => {
      const defaultService = new PlaywrightAuthService();
      expect(defaultService).toBeDefined();
    });

    it('カスタム設定で初期化できる', () => {
      const customService = new PlaywrightAuthService(
        { headless: false, slowMo: 100 },
        { maxRetries: 5 }
      );
      expect(customService).toBeDefined();
    });
  });

  describe('getCredentialsFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('環境変数から認証情報を取得できる', () => {
      process.env.INSTAGRAM_USERNAME = 'testuser';
      process.env.INSTAGRAM_PASSWORD = 'testpass';

      const credentials = PlaywrightAuthService.getCredentialsFromEnv();

      expect(credentials).toEqual({
        username: 'testuser',
        password: 'testpass',
      });
    });

    it('環境変数が設定されていない場合はnullを返す', () => {
      delete process.env.INSTAGRAM_USERNAME;
      delete process.env.INSTAGRAM_PASSWORD;

      const credentials = PlaywrightAuthService.getCredentialsFromEnv();

      expect(credentials).toBeNull();
    });

    it('ユーザー名のみの場合はnullを返す', () => {
      process.env.INSTAGRAM_USERNAME = 'testuser';
      delete process.env.INSTAGRAM_PASSWORD;

      const credentials = PlaywrightAuthService.getCredentialsFromEnv();

      expect(credentials).toBeNull();
    });
  });

  describe('login', () => {
    it('ログイン成功時にCookieを返す', async () => {
      const credentials: InstagramCredentials = {
        username: 'testuser',
        password: 'testpass',
      };

      const result = await service.login(credentials);

      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();
      expect(result.cookies?.sessionid).toBe('test-session');
      expect(result.cookies?.csrftoken).toBe('test-csrf');
      expect(result.cookies?.ds_user_id).toBe('123456');
    });

    it('コールバックが正しく呼び出される', async () => {
      const credentials: InstagramCredentials = {
        username: 'testuser',
        password: 'testpass',
      };

      const callbacks = {
        onNavigationStart: vi.fn(),
        onCredentialsEntered: vi.fn(),
        onLoginSubmitted: vi.fn(),
        onLoginSuccess: vi.fn(),
      };

      await service.login(credentials, callbacks);

      expect(callbacks.onNavigationStart).toHaveBeenCalled();
      expect(callbacks.onCredentialsEntered).toHaveBeenCalled();
      expect(callbacks.onLoginSubmitted).toHaveBeenCalled();
      expect(callbacks.onLoginSuccess).toHaveBeenCalled();
    });
  });

  describe('デフォルト設定', () => {
    it('DEFAULT_BROWSER_CONFIGが正しい値を持つ', () => {
      expect(DEFAULT_BROWSER_CONFIG.headless).toBe(true);
      expect(DEFAULT_BROWSER_CONFIG.viewport).toEqual({
        width: 1280,
        height: 720,
      });
      expect(DEFAULT_BROWSER_CONFIG.locale).toBe('ja-JP');
    });

    it('DEFAULT_LOGIN_CONFIGが正しい値を持つ', () => {
      expect(DEFAULT_LOGIN_CONFIG.typingDelay).toBe(100);
      expect(DEFAULT_LOGIN_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_LOGIN_CONFIG.pageTimeout).toBe(30000);
    });
  });
});
