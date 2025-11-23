/**
 * Playwright認証関連の型定義
 * @module services/instagram/auth/types
 */

import type { Cookie, Page, BrowserContext } from 'playwright';

/**
 * Instagram認証情報
 */
export interface InstagramCredentials {
  username: string;
  password: string;
}

/**
 * ログイン結果
 */
export interface LoginResult {
  success: boolean;
  cookies?: InstagramCookies;
  error?: string;
  errorType?: LoginErrorType;
}

/**
 * ログインエラータイプ
 */
export type LoginErrorType =
  | 'invalid_credentials'
  | 'account_locked'
  | 'verification_required'
  | 'rate_limited'
  | 'network_error'
  | 'timeout'
  | 'unknown';

/**
 * Instagram Cookie
 */
export interface InstagramCookies {
  sessionid: string;
  csrftoken: string;
  ds_user_id: string;
  mid?: string;
  ig_did?: string;
  rur?: string;
  rawCookies: Cookie[];
}

/**
 * Playwrightブラウザ設定
 */
export interface BrowserConfig {
  headless: boolean;
  slowMo?: number;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  locale?: string;
  timezone?: string;
}

/**
 * ログイン設定
 */
export interface LoginConfig {
  /** タイピング遅延（ミリ秒） */
  typingDelay: number;
  /** アクション間の遅延（ミリ秒） */
  actionDelay: number;
  /** ページロードタイムアウト（ミリ秒） */
  pageTimeout: number;
  /** 最大リトライ回数 */
  maxRetries: number;
  /** リトライ間隔（ミリ秒） */
  retryDelay: number;
  /** Cookie保存パス */
  cookieSavePath?: string;
}

/**
 * デフォルトブラウザ設定
 */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  headless: true,
  slowMo: 50,
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: {
    width: 1280,
    height: 720,
  },
  locale: 'ja-JP',
  timezone: 'Asia/Tokyo',
};

/**
 * デフォルトログイン設定
 */
export const DEFAULT_LOGIN_CONFIG: LoginConfig = {
  typingDelay: 100,
  actionDelay: 1000,
  pageTimeout: 30000,
  maxRetries: 3,
  retryDelay: 5000,
  cookieSavePath: './.instagram_cookies.json',
};

/**
 * Instagramログインページセレクター
 */
export const LOGIN_SELECTORS = {
  usernameInput: 'input[name="username"]',
  passwordInput: 'input[name="password"]',
  loginButton: 'button[type="submit"]',
  cookieAcceptButton: 'button:has-text("Allow all cookies"), button:has-text("すべてのcookieを許可"), [data-cookiebanner="accept_button"]',
  twoFactorInput: 'input[name="verificationCode"]',
  errorMessage: '#slfErrorAlert, [data-testid="login-error-message"]',
  notNowButton: 'button:has-text("Not Now"), button:has-text("後で"),[role="button"]:has-text("後で")',
  saveInfoButton: 'button:has-text("Save Info"), button:has-text("情報を保存")',
  homeIcon: 'svg[aria-label="Home"], svg[aria-label="ホーム"]',
} as const;

/**
 * ログインイベントコールバック
 */
export interface LoginEventCallbacks {
  onNavigationStart?: () => void;
  onCookieDialogHandled?: () => void;
  onCredentialsEntered?: () => void;
  onLoginSubmitted?: () => void;
  onLoginSuccess?: (cookies: InstagramCookies) => void;
  onLoginFailed?: (error: string, errorType: LoginErrorType) => void;
  onRetry?: (attempt: number, maxAttempts: number) => void;
}
