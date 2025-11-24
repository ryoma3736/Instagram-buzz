/**
 * Instagramログインフォーム処理
 * @module services/instagram/auth/loginHandler
 */

import type { Page } from 'playwright';
import {
  InstagramCredentials,
  LoginConfig,
  LoginResult,
  LoginErrorType,
  InstagramCookies,
  LOGIN_SELECTORS,
  DEFAULT_LOGIN_CONFIG,
  LoginEventCallbacks,
} from './types.js';

/**
 * ログインフォームハンドラー
 */
export class LoginHandler {
  private page: Page;
  private config: LoginConfig;
  private callbacks?: LoginEventCallbacks;

  constructor(
    page: Page,
    config: Partial<LoginConfig> = {},
    callbacks?: LoginEventCallbacks
  ) {
    this.page = page;
    this.config = { ...DEFAULT_LOGIN_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * ログインページへナビゲート
   */
  async navigateToLogin(): Promise<void> {
    this.callbacks?.onNavigationStart?.();
    await this.page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle',
      timeout: this.config.pageTimeout,
    });
    await this.delay(this.config.actionDelay);
  }

  /**
   * Cookie同意ダイアログを処理
   */
  async handleCookieDialog(): Promise<void> {
    try {
      const cookieButton = this.page.locator(LOGIN_SELECTORS.cookieAcceptButton);
      if (await cookieButton.isVisible({ timeout: 3000 })) {
        await cookieButton.first().click();
        this.callbacks?.onCookieDialogHandled?.();
        await this.delay(500);
      }
    } catch {
      // ダイアログが表示されない場合はスキップ
    }
  }

  /**
   * 認証情報を入力
   */
  async enterCredentials(credentials: InstagramCredentials): Promise<void> {
    // ユーザー名入力
    const usernameInput = this.page.locator(LOGIN_SELECTORS.usernameInput);
    await usernameInput.waitFor({ state: 'visible', timeout: this.config.pageTimeout });
    await usernameInput.click();
    await this.humanLikeType(usernameInput, credentials.username);

    await this.delay(300);

    // パスワード入力
    const passwordInput = this.page.locator(LOGIN_SELECTORS.passwordInput);
    await passwordInput.click();
    await this.humanLikeType(passwordInput, credentials.password);

    this.callbacks?.onCredentialsEntered?.();
  }

  /**
   * ログインボタンをクリック
   */
  async submitLogin(): Promise<void> {
    const loginButton = this.page.locator(LOGIN_SELECTORS.loginButton);
    await loginButton.waitFor({ state: 'visible' });

    // ボタンが有効になるまで待機
    await this.page.waitForFunction(`
      (() => {
        const btn = document.querySelector('button[type="submit"]');
        return btn && !btn.disabled;
      })()
    `, { timeout: 5000 });

    await this.delay(500);
    await loginButton.click();
    this.callbacks?.onLoginSubmitted?.();
  }

  /**
   * ログイン結果を検証
   */
  async verifyLogin(): Promise<LoginResult> {
    try {
      // エラーメッセージをチェック
      const errorResult = await this.checkForErrors();
      if (errorResult) {
        return errorResult;
      }

      // 成功を待機（ホームアイコンまたはURLの変化）
      await Promise.race([
        this.page.waitForSelector(LOGIN_SELECTORS.homeIcon, { timeout: 15000 }),
        this.page.waitForURL('https://www.instagram.com/', { timeout: 15000 }),
        this.page.waitForURL(/instagram\.com\/(?!accounts\/login)/, { timeout: 15000 }),
      ]);

      // "後で"や"情報を保存"ダイアログをスキップ
      await this.handlePostLoginDialogs();

      // Cookieを抽出
      const cookies = await this.extractCookies();

      if (cookies) {
        this.callbacks?.onLoginSuccess?.(cookies);
        return { success: true, cookies };
      }

      return {
        success: false,
        error: 'セッションCookieが取得できませんでした',
        errorType: 'unknown',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';

      // タイムアウトの場合
      if (errorMessage.includes('timeout')) {
        const errorResult = await this.checkForErrors();
        if (errorResult) return errorResult;

        return {
          success: false,
          error: 'ログインタイムアウト',
          errorType: 'timeout',
        };
      }

      return {
        success: false,
        error: errorMessage,
        errorType: 'unknown',
      };
    }
  }

  /**
   * エラーメッセージをチェック
   */
  private async checkForErrors(): Promise<LoginResult | null> {
    try {
      const errorElement = this.page.locator(LOGIN_SELECTORS.errorMessage);
      if (await errorElement.isVisible({ timeout: 1000 })) {
        const errorText = await errorElement.textContent() || '認証エラー';
        const errorType = this.classifyError(errorText);

        this.callbacks?.onLoginFailed?.(errorText, errorType);

        return {
          success: false,
          error: errorText,
          errorType,
        };
      }
    } catch {
      // エラー要素が見つからない場合はスキップ
    }

    // 2段階認証チェック
    try {
      const twoFactorInput = this.page.locator(LOGIN_SELECTORS.twoFactorInput);
      if (await twoFactorInput.isVisible({ timeout: 1000 })) {
        return {
          success: false,
          error: '2段階認証が必要です',
          errorType: 'verification_required',
        };
      }
    } catch {
      // 2段階認証要素が見つからない場合はスキップ
    }

    return null;
  }

  /**
   * エラータイプを分類
   */
  private classifyError(errorText: string): LoginErrorType {
    const text = errorText.toLowerCase();

    if (text.includes('password') || text.includes('パスワード') || text.includes('incorrect')) {
      return 'invalid_credentials';
    }
    if (text.includes('locked') || text.includes('ロック')) {
      return 'account_locked';
    }
    if (text.includes('verify') || text.includes('認証') || text.includes('確認')) {
      return 'verification_required';
    }
    if (text.includes('wait') || text.includes('お待ち') || text.includes('try again')) {
      return 'rate_limited';
    }

    return 'unknown';
  }

  /**
   * ログイン後のダイアログを処理
   */
  private async handlePostLoginDialogs(): Promise<void> {
    // "後で"ボタン
    try {
      const notNowButton = this.page.locator(LOGIN_SELECTORS.notNowButton);
      if (await notNowButton.isVisible({ timeout: 3000 })) {
        await notNowButton.first().click();
        await this.delay(500);
      }
    } catch {
      // ダイアログがない場合はスキップ
    }

    // "情報を保存"ボタン
    try {
      const saveInfoButton = this.page.locator(LOGIN_SELECTORS.saveInfoButton);
      if (await saveInfoButton.isVisible({ timeout: 2000 })) {
        await saveInfoButton.click();
        await this.delay(500);
      }
    } catch {
      // ダイアログがない場合はスキップ
    }
  }

  /**
   * Cookieを抽出
   */
  private async extractCookies(): Promise<InstagramCookies | null> {
    const cookies = await this.page.context().cookies();
    const instagramCookies = cookies.filter((c) =>
      c.domain.includes('instagram.com')
    );

    const sessionId = instagramCookies.find((c) => c.name === 'sessionid')?.value;
    const csrfToken = instagramCookies.find((c) => c.name === 'csrftoken')?.value;
    const userId = instagramCookies.find((c) => c.name === 'ds_user_id')?.value;

    if (!sessionId || !csrfToken || !userId) {
      return null;
    }

    return {
      sessionid: sessionId,
      csrftoken: csrfToken,
      ds_user_id: userId,
      mid: instagramCookies.find((c) => c.name === 'mid')?.value,
      ig_did: instagramCookies.find((c) => c.name === 'ig_did')?.value,
      rur: instagramCookies.find((c) => c.name === 'rur')?.value,
      rawCookies: instagramCookies,
    };
  }

  /**
   * 人間らしいタイピング
   */
  private async humanLikeType(
    locator: ReturnType<Page['locator']>,
    text: string
  ): Promise<void> {
    for (const char of text) {
      await locator.type(char, { delay: this.config.typingDelay + Math.random() * 50 });
    }
  }

  /**
   * 遅延
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
