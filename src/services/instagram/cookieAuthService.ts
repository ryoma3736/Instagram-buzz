/**
 * Instagram Cookie Authentication Service
 * Provides cookie-based authentication for Instagram API access
 * @module services/instagram/cookieAuthService
 */

import type { InstagramCookies } from './session/types.js';

/**
 * Environment variables for cookie authentication
 */
export interface CookieEnvConfig {
  sessionId?: string;
  csrfToken?: string;
  dsUserId?: string;
  rur?: string;
}

/**
 * Cookie authentication result
 */
export interface CookieAuthResult {
  success: boolean;
  cookies?: InstagramCookies;
  error?: string;
}

/**
 * Cookie Authentication Service
 * Manages Instagram authentication via session cookies from environment variables
 */
export class CookieAuthService {
  private cookies: InstagramCookies | null = null;
  private initialized: boolean = false;

  /**
   * Initialize cookies from environment variables
   */
  initialize(): CookieAuthResult {
    const sessionId = process.env.INSTAGRAM_SESSION_ID;
    const csrfToken = process.env.INSTAGRAM_CSRF_TOKEN;
    const dsUserId = process.env.INSTAGRAM_DS_USER_ID;
    const rur = process.env.INSTAGRAM_RUR || 'FTW';

    // Validate required cookies
    if (!sessionId) {
      return {
        success: false,
        error: 'INSTAGRAM_SESSION_ID is not set in environment variables',
      };
    }

    if (!csrfToken) {
      return {
        success: false,
        error: 'INSTAGRAM_CSRF_TOKEN is not set in environment variables',
      };
    }

    // ds_user_id can be extracted from sessionid if not provided
    const userId = dsUserId || this.extractUserIdFromSession(sessionId);
    if (!userId) {
      return {
        success: false,
        error: 'INSTAGRAM_DS_USER_ID is not set and could not be extracted from sessionid',
      };
    }

    // Create cookie object
    const now = Date.now();
    const expiresIn = 90 * 24 * 60 * 60 * 1000; // 90 days

    this.cookies = {
      sessionid: sessionId,
      csrftoken: csrfToken,
      ds_user_id: userId,
      rur: rur,
      extractedAt: now,
      expiresAt: now + expiresIn,
    };

    this.initialized = true;

    console.log('[CookieAuth] Successfully initialized with session cookies');
    console.log(`[CookieAuth] User ID: ${userId}`);

    return {
      success: true,
      cookies: this.cookies,
    };
  }

  /**
   * Get current cookies
   */
  getCookies(): InstagramCookies | null {
    if (!this.initialized) {
      const result = this.initialize();
      if (!result.success) {
        console.warn(`[CookieAuth] ${result.error}`);
        return null;
      }
    }
    return this.cookies;
  }

  /**
   * Check if cookies are configured
   */
  isConfigured(): boolean {
    return !!(
      process.env.INSTAGRAM_SESSION_ID &&
      process.env.INSTAGRAM_CSRF_TOKEN
    );
  }

  /**
   * Check if current session is valid (not expired)
   */
  isSessionValid(): boolean {
    if (!this.cookies) return false;
    return Date.now() < this.cookies.expiresAt;
  }

  /**
   * Get remaining session time in hours
   */
  getSessionRemainingHours(): number {
    if (!this.cookies) return 0;
    const remaining = this.cookies.expiresAt - Date.now();
    return Math.max(0, remaining / (60 * 60 * 1000));
  }

  /**
   * Set cookies manually (for testing or programmatic use)
   */
  setCookies(cookies: InstagramCookies): void {
    this.cookies = cookies;
    this.initialized = true;
  }

  /**
   * Clear stored cookies
   */
  clearCookies(): void {
    this.cookies = null;
    this.initialized = false;
  }

  /**
   * Extract user ID from session ID if possible
   * Session ID format typically includes user ID
   */
  private extractUserIdFromSession(sessionId: string): string | null {
    // Session ID format: {user_id}%3A{timestamp}%3A{hash}
    const match = sessionId.match(/^(\d+)%3A/);
    if (match) {
      return match[1];
    }

    // Alternative format without URL encoding
    const altMatch = sessionId.match(/^(\d+):/);
    if (altMatch) {
      return altMatch[1];
    }

    return null;
  }

  /**
   * Build cookie header string for HTTP requests
   */
  buildCookieHeader(): string {
    if (!this.cookies) return '';

    return [
      `sessionid=${this.cookies.sessionid}`,
      `csrftoken=${this.cookies.csrftoken}`,
      `ds_user_id=${this.cookies.ds_user_id}`,
      `rur=${this.cookies.rur}`,
    ].join('; ');
  }

  /**
   * Get configuration instructions
   */
  static getSetupInstructions(): string {
    return `
Instagram Cookie Authentication Setup:

1. Log in to Instagram in your browser
2. Open Developer Tools (F12)
3. Go to Application tab -> Cookies -> instagram.com
4. Copy the following cookie values:
   - sessionid
   - csrftoken
   - ds_user_id (optional, can be extracted from sessionid)

5. Add to your .env file:
   INSTAGRAM_SESSION_ID=your_sessionid_value
   INSTAGRAM_CSRF_TOKEN=your_csrftoken_value
   INSTAGRAM_DS_USER_ID=your_ds_user_id_value (optional)
   INSTAGRAM_RUR=FTW (optional, default: FTW)

Note: Cookies typically expire after 90 days.
`;
  }
}

// Singleton instance
export const cookieAuthService = new CookieAuthService();
