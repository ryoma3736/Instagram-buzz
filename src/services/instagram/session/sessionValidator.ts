/**
 * セッション検証サービス
 * @module services/instagram/session/sessionValidator
 */

import { CookieData, SessionData } from './types';

/**
 * セッション検証結果
 */
export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  userId?: string;
  username?: string;
  checkedAt: Date;
}

/**
 * Instagram APIエンドポイント
 */
const INSTAGRAM_API_BASE = 'https://www.instagram.com';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * セッション検証クラス
 * Instagram APIを呼び出してセッションの有効性を確認
 */
export class SessionValidator {
  /**
   * Cookieをヘッダー文字列に変換
   */
  private cookiesToString(cookies: CookieData[]): string {
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * セッションデータの有効性を検証
   */
  async validateSession(session: SessionData): Promise<ValidationResult> {
    const checkedAt = new Date();

    if (!session.cookies || session.cookies.length === 0) {
      return {
        isValid: false,
        reason: 'Cookieが設定されていません',
        checkedAt,
      };
    }

    const sessionId = session.cookies.find((c) => c.name === 'sessionid');
    if (!sessionId) {
      return {
        isValid: false,
        reason: 'sessionid Cookieがありません',
        checkedAt,
      };
    }

    return this.validateCookies(session.cookies);
  }

  /**
   * CookieでInstagram APIを呼び出して有効性を確認
   */
  async validateCookies(cookies: CookieData[]): Promise<ValidationResult> {
    const checkedAt = new Date();

    try {
      const cookieString = this.cookiesToString(cookies);
      const csrfToken = cookies.find((c) => c.name === 'csrftoken')?.value || '';

      const response = await fetch(`${INSTAGRAM_API_BASE}/api/v1/users/web_profile_info/?username=instagram`, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Cookie': cookieString,
          'X-CSRFToken': csrfToken,
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.status === 401 || response.status === 403) {
        return {
          isValid: false,
          reason: '認証エラー: セッションが無効または期限切れです',
          checkedAt,
        };
      }

      if (response.status === 429) {
        return {
          isValid: false,
          reason: 'レート制限: リクエスト数が多すぎます',
          checkedAt,
        };
      }

      if (!response.ok) {
        return {
          isValid: false,
          reason: `APIエラー: ${response.status}`,
          checkedAt,
        };
      }

      // 自分のユーザー情報を取得して確認
      const dsUserId = cookies.find((c) => c.name === 'ds_user_id')?.value;

      return {
        isValid: true,
        userId: dsUserId,
        checkedAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      return {
        isValid: false,
        reason: `検証エラー: ${errorMessage}`,
        checkedAt,
      };
    }
  }

  /**
   * 必要なCookieが揃っているか確認（API呼び出しなし）
   */
  validateCookiePresence(cookies: CookieData[]): ValidationResult {
    const checkedAt = new Date();
    const requiredCookies = ['sessionid', 'csrftoken', 'ds_user_id'];
    const missingCookies = requiredCookies.filter(
      (name) => !cookies.find((c) => c.name === name)
    );

    if (missingCookies.length > 0) {
      return {
        isValid: false,
        reason: `必要なCookieがありません: ${missingCookies.join(', ')}`,
        checkedAt,
      };
    }

    const dsUserId = cookies.find((c) => c.name === 'ds_user_id')?.value;

    return {
      isValid: true,
      userId: dsUserId,
      checkedAt,
    };
  }

  /**
   * セッションの健全性を簡易チェック
   */
  quickCheck(session: SessionData): boolean {
    if (!session.cookies || session.cookies.length === 0) {
      return false;
    }

    const result = this.validateCookiePresence(session.cookies);
    return result.isValid;
  }
}
