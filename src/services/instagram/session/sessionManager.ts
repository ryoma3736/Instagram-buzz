/**
 * セッション管理サービス
 * @module services/instagram/session/sessionManager
 */

import { SessionData, CookieData, RefreshConfig, DEFAULT_REFRESH_CONFIG } from './types';
import { ExpiryChecker } from './expiryChecker';
import { SessionValidator, ValidationResult } from './sessionValidator';

/**
 * セッションステータス
 */
export interface SessionStatus {
  isValid: boolean;
  expiresAt: Date | null;
  remainingTime: number; // milliseconds
  needsRefresh: boolean;
  lastChecked: Date;
  userId?: string;
  username?: string;
  remainingTimeFormatted: string;
  health: 'healthy' | 'warning' | 'critical' | 'expired';
}

/**
 * 期限切れ警告コールバック型
 */
export type ExpiringSoonCallback = (status: SessionStatus) => void;

/**
 * セッション無効コールバック型
 */
export type SessionInvalidCallback = (reason: string) => void;

/**
 * セッション管理クラス
 * Cookie有効期限の監視、検証、コールバック通知を提供
 */
export class SessionManager {
  private session: SessionData | null = null;
  private expiryChecker: ExpiryChecker;
  private sessionValidator: SessionValidator;
  private config: RefreshConfig;
  private expiringSoonCallbacks: ExpiringSoonCallback[] = [];
  private sessionInvalidCallbacks: SessionInvalidCallback[] = [];
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<RefreshConfig> = {}) {
    this.config = { ...DEFAULT_REFRESH_CONFIG, ...config };
    this.expiryChecker = new ExpiryChecker(this.config.refreshThreshold * 60 * 60 * 1000);
    this.sessionValidator = new SessionValidator();
  }

  /**
   * セッションを設定
   */
  setSession(session: SessionData): void {
    this.session = session;
  }

  /**
   * Cookieからセッションを設定
   */
  setCookies(cookies: CookieData[]): void {
    const earliestExpiry = this.expiryChecker.getEarliestExpiry(cookies);

    this.session = {
      accessToken: cookies.find(c => c.name === 'sessionid')?.value || '',
      tokenType: 'cookie',
      expiresAt: earliestExpiry?.getTime() || 0,
      createdAt: Date.now(),
      cookies,
    };
  }

  /**
   * 現在のセッションを取得
   */
  getSession(): SessionData | null {
    return this.session;
  }

  /**
   * セッションの有効性をチェック
   */
  async checkValidity(): Promise<SessionStatus> {
    return this.getStatus();
  }

  /**
   * セッションステータスを取得（同期版）
   */
  getStatus(): SessionStatus {
    if (!this.session) {
      return {
        isValid: false,
        expiresAt: null,
        remainingTime: 0,
        needsRefresh: false,
        lastChecked: new Date(),
        remainingTimeFormatted: 'No session',
        health: 'expired',
      };
    }

    const expiryResult = this.expiryChecker.checkSessionExpiry(this.session);
    const remainingTimeFormatted = this.expiryChecker.formatRemainingTime(expiryResult.remainingTime);
    const remainingHours = expiryResult.remainingTime / (1000 * 60 * 60);

    let health: SessionStatus['health'];
    if (expiryResult.isExpired) {
      health = 'expired';
    } else if (remainingHours <= 12) {
      health = 'critical';
    } else if (remainingHours <= 48) {
      health = 'warning';
    } else {
      health = 'healthy';
    }

    if (expiryResult.isExpired) {
      const status: SessionStatus = {
        isValid: false,
        expiresAt: expiryResult.expiresAt,
        remainingTime: 0,
        needsRefresh: false,
        lastChecked: new Date(),
        remainingTimeFormatted,
        health,
      };
      this.notifyInvalid('セッションの有効期限が切れました');
      return status;
    }

    if (expiryResult.needsRefresh) {
      const status: SessionStatus = {
        isValid: true,
        expiresAt: expiryResult.expiresAt,
        remainingTime: expiryResult.remainingTime,
        needsRefresh: true,
        lastChecked: new Date(),
        remainingTimeFormatted,
        health,
      };
      this.notifyExpiringSoon(status);
      return status;
    }

    return {
      isValid: true,
      expiresAt: expiryResult.expiresAt,
      remainingTime: expiryResult.remainingTime,
      needsRefresh: false,
      lastChecked: new Date(),
      remainingTimeFormatted,
      health,
    };
  }

  /**
   * API呼び出しでセッションを検証
   */
  async validateWithApi(): Promise<ValidationResult> {
    if (!this.session) {
      return {
        isValid: false,
        reason: 'セッションが設定されていません',
        checkedAt: new Date(),
      };
    }

    return this.sessionValidator.validateSession(this.session);
  }

  /**
   * セッションが期限切れかどうか
   */
  isExpired(): boolean {
    if (!this.session) return true;

    const result = this.expiryChecker.checkSessionExpiry(this.session);
    return result.isExpired;
  }

  /**
   * 残り時間を取得（ミリ秒）
   */
  getTimeRemaining(): number {
    if (!this.session) return 0;

    const result = this.expiryChecker.checkSessionExpiry(this.session);
    return result.remainingTime;
  }

  /**
   * 残り時間を人間が読みやすい形式で取得
   */
  getFormattedTimeRemaining(): string {
    const remaining = this.getTimeRemaining();
    return this.expiryChecker.formatRemainingTime(remaining);
  }

  /**
   * 期限切れ間近コールバックを登録
   */
  onExpiringSoon(callback: ExpiringSoonCallback): void {
    this.expiringSoonCallbacks.push(callback);
  }

  /**
   * セッション無効コールバックを登録
   */
  onSessionInvalid(callback: SessionInvalidCallback): void {
    this.sessionInvalidCallbacks.push(callback);
  }

  /**
   * 期限切れ間近コールバックを通知
   */
  private notifyExpiringSoon(status: SessionStatus): void {
    for (const callback of this.expiringSoonCallbacks) {
      try {
        callback(status);
      } catch (error) {
        console.error('ExpiringSoon callback error:', error);
      }
    }
  }

  /**
   * セッション無効コールバックを通知
   */
  private notifyInvalid(reason: string): void {
    for (const callback of this.sessionInvalidCallbacks) {
      try {
        callback(reason);
      } catch (error) {
        console.error('SessionInvalid callback error:', error);
      }
    }
  }

  /**
   * 定期的なセッションチェックを開始
   */
  startPeriodicCheck(intervalMs: number = 60 * 60 * 1000): void {
    if (this.checkInterval) {
      this.stopPeriodicCheck();
    }

    this.checkInterval = setInterval(async () => {
      await this.checkValidity();
    }, intervalMs);
  }

  /**
   * 定期的なセッションチェックを停止
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * セッションをクリア
   */
  clearSession(): void {
    this.session = null;
    this.stopPeriodicCheck();
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<RefreshConfig>): void {
    this.config = { ...this.config, ...config };
    this.expiryChecker.setRefreshThresholdHours(this.config.refreshThreshold);
  }

  /**
   * セッション情報のサマリーを取得
   */
  getSummary(): string {
    if (!this.session) {
      return 'セッションなし';
    }

    const status = this.expiryChecker.checkSessionExpiry(this.session);
    const remaining = this.expiryChecker.formatRemainingTime(status.remainingTime);

    if (status.isExpired) {
      return '❌ セッション期限切れ';
    }

    if (status.needsRefresh) {
      return `⚠️ 要リフレッシュ (残り: ${remaining})`;
    }

    return `✅ 有効 (残り: ${remaining})`;
  }

  /**
   * セッションマネージャーを破棄
   */
  destroy(): void {
    this.stopPeriodicCheck();
    this.clearSession();
    this.expiringSoonCallbacks = [];
    this.sessionInvalidCallbacks = [];
  }
}
