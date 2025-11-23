/**
 * Playwright認証メインモジュール
 * @module services/instagram/auth/playwrightAuth
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import {
  InstagramCredentials,
  LoginResult,
  InstagramCookies,
  BrowserConfig,
  LoginConfig,
  DEFAULT_BROWSER_CONFIG,
  DEFAULT_LOGIN_CONFIG,
  LoginEventCallbacks,
} from './types.js';
import { LoginHandler } from './loginHandler.js';

/**
 * Playwright認証サービス
 */
export class PlaywrightAuthService {
  private browserConfig: BrowserConfig;
  private loginConfig: LoginConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(
    browserConfig: Partial<BrowserConfig> = {},
    loginConfig: Partial<LoginConfig> = {}
  ) {
    this.browserConfig = { ...DEFAULT_BROWSER_CONFIG, ...browserConfig };
    this.loginConfig = { ...DEFAULT_LOGIN_CONFIG, ...loginConfig };
  }

  /**
   * Instagramにログイン
   */
  async login(
    credentials: InstagramCredentials,
    callbacks?: LoginEventCallbacks
  ): Promise<LoginResult> {
    let attempt = 0;

    while (attempt < this.loginConfig.maxRetries) {
      attempt++;

      if (attempt > 1) {
        callbacks?.onRetry?.(attempt, this.loginConfig.maxRetries);
        await this.delay(this.loginConfig.retryDelay);
      }

      try {
        const result = await this.attemptLogin(credentials, callbacks);

        if (result.success) {
          // Cookieを保存
          if (result.cookies && this.loginConfig.cookieSavePath) {
            this.saveCookies(result.cookies);
          }
          return result;
        }

        // リトライ不可能なエラー
        if (
          result.errorType === 'invalid_credentials' ||
          result.errorType === 'account_locked' ||
          result.errorType === 'verification_required'
        ) {
          return result;
        }
      } catch (error) {
        console.error(`Login attempt ${attempt} failed:`, error);

        if (attempt >= this.loginConfig.maxRetries) {
          return {
            success: false,
            error: error instanceof Error ? error.message : '不明なエラー',
            errorType: 'unknown',
          };
        }
      } finally {
        await this.cleanup();
      }
    }

    return {
      success: false,
      error: '最大リトライ回数に達しました',
      errorType: 'unknown',
    };
  }

  /**
   * ログイン試行
   */
  private async attemptLogin(
    credentials: InstagramCredentials,
    callbacks?: LoginEventCallbacks
  ): Promise<LoginResult> {
    await this.initBrowser();

    const page = await this.context!.newPage();

    const handler = new LoginHandler(page, this.loginConfig, callbacks);

    // ログインページへ移動
    await handler.navigateToLogin();

    // Cookie同意ダイアログを処理
    await handler.handleCookieDialog();

    // 認証情報を入力
    await handler.enterCredentials(credentials);

    // ログイン送信
    await handler.submitLogin();

    // 結果を検証
    return await handler.verifyLogin();
  }

  /**
   * 保存済みCookieでセッション復元
   */
  async restoreSession(): Promise<InstagramCookies | null> {
    const cookies = this.loadCookies();
    if (!cookies) return null;

    // セッションの有効性を確認
    const isValid = await this.validateSession(cookies);
    if (!isValid) {
      this.deleteCookies();
      return null;
    }

    return cookies;
  }

  /**
   * セッションの有効性を確認
   */
  async validateSession(cookies: InstagramCookies): Promise<boolean> {
    try {
      await this.initBrowser();
      const page = await this.context!.newPage();

      // Cookieを設定
      await this.context!.addCookies(cookies.rawCookies);

      // プロフィールページにアクセス
      const response = await page.goto('https://www.instagram.com/accounts/edit/', {
        waitUntil: 'networkidle',
        timeout: 15000,
      });

      // ログインページにリダイレクトされていないか確認
      const url = page.url();
      const isValid = !url.includes('accounts/login');

      await this.cleanup();
      return isValid;
    } catch {
      await this.cleanup();
      return false;
    }
  }

  /**
   * 環境変数から認証情報を取得
   */
  static getCredentialsFromEnv(): InstagramCredentials | null {
    const username = process.env.INSTAGRAM_USERNAME;
    const password = process.env.INSTAGRAM_PASSWORD;

    if (!username || !password) {
      return null;
    }

    return { username, password };
  }

  /**
   * Cookieを保存
   */
  private saveCookies(cookies: InstagramCookies): void {
    if (!this.loginConfig.cookieSavePath) return;

    const data = {
      ...cookies,
      savedAt: Date.now(),
    };

    fs.writeFileSync(
      this.loginConfig.cookieSavePath,
      JSON.stringify(data, null, 2)
    );
    console.log('✅ Instagram cookies saved');
  }

  /**
   * Cookieを読み込み
   */
  private loadCookies(): InstagramCookies | null {
    if (!this.loginConfig.cookieSavePath) return null;

    try {
      if (!fs.existsSync(this.loginConfig.cookieSavePath)) return null;

      const data = JSON.parse(
        fs.readFileSync(this.loginConfig.cookieSavePath, 'utf-8')
      );

      // 90日以上前のCookieは無効
      if (Date.now() - data.savedAt > 90 * 24 * 60 * 60 * 1000) {
        this.deleteCookies();
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  /**
   * Cookieを削除
   */
  private deleteCookies(): void {
    if (this.loginConfig.cookieSavePath && fs.existsSync(this.loginConfig.cookieSavePath)) {
      fs.unlinkSync(this.loginConfig.cookieSavePath);
    }
  }

  /**
   * ブラウザ初期化
   */
  private async initBrowser(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: this.browserConfig.headless,
      slowMo: this.browserConfig.slowMo,
    });

    this.context = await this.browser.newContext({
      userAgent: this.browserConfig.userAgent,
      viewport: this.browserConfig.viewport,
      locale: this.browserConfig.locale,
      timezoneId: this.browserConfig.timezone,
    });
  }

  /**
   * クリーンアップ
   */
  private async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 遅延
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// シングルトンエクスポート
export const playwrightAuthService = new PlaywrightAuthService();
