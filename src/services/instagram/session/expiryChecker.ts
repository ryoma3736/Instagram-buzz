/**
 * Cookie有効期限チェッカー
 * @module services/instagram/session/expiryChecker
 */

import { CookieData, SessionData } from './types';

/**
 * 有効期限チェック結果
 */
export interface ExpiryCheckResult {
  isExpired: boolean;
  expiresAt: Date | null;
  remainingTime: number; // milliseconds
  needsRefresh: boolean;
}

/**
 * 重要なInstagram Cookie名
 */
const CRITICAL_COOKIES = ['sessionid', 'csrftoken', 'ds_user_id'];

/**
 * デフォルトのリフレッシュ閾値（24時間前）
 */
const DEFAULT_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Cookie有効期限チェッカークラス
 */
export class ExpiryChecker {
  private refreshThreshold: number;

  /**
   * @param refreshThresholdMs リフレッシュが必要と判定する閾値（ミリ秒）
   */
  constructor(refreshThresholdMs: number = DEFAULT_REFRESH_THRESHOLD_MS) {
    this.refreshThreshold = refreshThresholdMs;
  }

  /**
   * セッションデータの有効期限をチェック
   */
  checkSessionExpiry(session: SessionData): ExpiryCheckResult {
    const now = Date.now();
    const expiresAt = session.expiresAt;

    if (!expiresAt) {
      return {
        isExpired: false,
        expiresAt: null,
        remainingTime: Infinity,
        needsRefresh: false,
      };
    }

    const remainingTime = expiresAt - now;
    const isExpired = remainingTime <= 0;
    const needsRefresh = !isExpired && remainingTime <= this.refreshThreshold;

    return {
      isExpired,
      expiresAt: new Date(expiresAt),
      remainingTime: Math.max(0, remainingTime),
      needsRefresh,
    };
  }

  /**
   * Cookie配列から最も早い有効期限を取得
   */
  getEarliestExpiry(cookies: CookieData[]): Date | null {
    const criticalCookies = cookies.filter((c) =>
      CRITICAL_COOKIES.includes(c.name)
    );

    if (criticalCookies.length === 0) {
      return null;
    }

    const expiryTimes = criticalCookies
      .filter((c) => c.expires !== undefined)
      .map((c) => c.expires as number);

    if (expiryTimes.length === 0) {
      return null;
    }

    const earliestExpiry = Math.min(...expiryTimes);
    return new Date(earliestExpiry);
  }

  /**
   * Cookie配列の有効期限をチェック
   */
  checkCookiesExpiry(cookies: CookieData[]): ExpiryCheckResult {
    const earliestExpiry = this.getEarliestExpiry(cookies);

    if (!earliestExpiry) {
      return {
        isExpired: false,
        expiresAt: null,
        remainingTime: Infinity,
        needsRefresh: false,
      };
    }

    const now = Date.now();
    const expiresAtMs = earliestExpiry.getTime();
    const remainingTime = expiresAtMs - now;
    const isExpired = remainingTime <= 0;
    const needsRefresh = !isExpired && remainingTime <= this.refreshThreshold;

    return {
      isExpired,
      expiresAt: earliestExpiry,
      remainingTime: Math.max(0, remainingTime),
      needsRefresh,
    };
  }

  /**
   * 残り時間を人間が読みやすい形式で取得
   */
  formatRemainingTime(remainingMs: number): string {
    if (remainingMs === Infinity) {
      return '期限なし';
    }

    if (remainingMs <= 0) {
      return '期限切れ';
    }

    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor(
      (remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
    );
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) {
      return `${days}日${hours}時間`;
    }
    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
  }

  /**
   * リフレッシュ閾値を設定
   */
  setRefreshThreshold(thresholdMs: number): void {
    this.refreshThreshold = thresholdMs;
  }

  /**
   * リフレッシュ閾値を時間単位で設定
   */
  setRefreshThresholdHours(hours: number): void {
    this.refreshThreshold = hours * 60 * 60 * 1000;
  }
}
