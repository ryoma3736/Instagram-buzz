/**
 * Session Refresher for Instagram Cookie Sessions
 * Handles automatic session refresh before expiry using Playwright re-login
 * @module services/instagram/session/sessionRefresher
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  SessionData,
  CookieData,
  RefreshConfig,
  RefreshResult,
  RefreshEvents,
  RefreshStatus,
  AuthCredentials,
} from './types.js';
import { DEFAULT_REFRESH_CONFIG } from './types.js';
import { SessionManager, type SessionStatus } from './sessionManager.js';
import { DEFAULT_API_CONFIG } from '../api/types.js';

/**
 * Session file paths
 */
const SESSION_DIR = './.instagram_session';
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
const CREDENTIALS_FILE = path.join(SESSION_DIR, 'credentials.json');

/**
 * Session Refresher Class
 * Provides automatic session refresh functionality
 */
export class SessionRefresher {
  private config: RefreshConfig;
  private sessionManager: SessionManager;
  private events: RefreshEvents;
  private status: RefreshStatus = 'idle';
  private currentRetryCount = 0;
  private isRefreshing = false;
  private lastRefreshAttempt: number = 0;

  constructor(config: Partial<RefreshConfig> = {}, events: RefreshEvents = {}) {
    this.config = { ...DEFAULT_REFRESH_CONFIG, ...config };
    this.events = events;
    this.sessionManager = new SessionManager({
      refreshThreshold: this.config.refreshThreshold,
    });

    // Set up session manager callbacks
    this.sessionManager.onExpiringSoon((status: SessionStatus) => {
      this.handleExpiringSoon(status);
    });

    this.sessionManager.onSessionInvalid(() => {
      this.handleExpired();
    });
  }

  /**
   * Initialize the refresher with stored session data
   */
  async initialize(): Promise<boolean> {
    const sessionData = this.loadStoredSession();
    if (sessionData) {
      this.sessionManager.setSession(sessionData);
      this.log('Session loaded successfully');
      return true;
    }
    this.log('No stored session found');
    return false;
  }

  /**
   * Schedule automatic refresh based on session expiry
   */
  scheduleRefresh(): void {
    const status = this.sessionManager.getStatus();

    if (!status.isValid) {
      this.log('Session expired, triggering immediate refresh');
      void this.refreshNow();
      return;
    }

    if (status.needsRefresh) {
      this.log('Session needs refresh, scheduling now');
      void this.refreshNow();
      return;
    }

    // Calculate when to refresh (refreshThreshold hours before expiry)
    const refreshTime =
      status.remainingTime - this.config.refreshThreshold * 60 * 60 * 1000;

    if (refreshTime > 0) {
      const refreshDate = new Date(Date.now() + refreshTime);
      this.status = 'scheduled';
      this.log(`Refresh scheduled for ${refreshDate.toISOString()}`);

      if (this.events.onRefreshScheduled) {
        this.events.onRefreshScheduled(refreshDate);
      }
    }
  }

  /**
   * Perform immediate session refresh
   */
  async refreshNow(): Promise<RefreshResult> {
    const timeSinceLastRefresh = Date.now() - this.lastRefreshAttempt;
    const minIntervalMs = this.config.minRefreshInterval * 60 * 60 * 1000;

    if (
      this.lastRefreshAttempt > 0 &&
      timeSinceLastRefresh < minIntervalMs &&
      this.status !== 'failed'
    ) {
      const waitTime = minIntervalMs - timeSinceLastRefresh;
      this.log(
        `Minimum refresh interval not reached, wait ${Math.ceil(waitTime / (60 * 60 * 1000))} hours`
      );
      return {
        success: false,
        error: 'Minimum refresh interval not reached',
        retriesUsed: 0,
      };
    }

    if (this.isRefreshing) {
      this.log('Refresh already in progress');
      return {
        success: false,
        error: 'Refresh already in progress',
        retriesUsed: 0,
      };
    }

    this.isRefreshing = true;
    this.status = 'refreshing';
    this.lastRefreshAttempt = Date.now();

    if (this.events.onRefreshStart) {
      this.events.onRefreshStart();
    }

    let result: RefreshResult;

    try {
      result = await this.performRefresh();
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        retriesUsed: this.currentRetryCount,
      };
    }

    this.isRefreshing = false;

    if (result.success) {
      this.status = 'success';
      this.currentRetryCount = 0;
      this.log('Refresh successful');

      if (this.events.onRefreshSuccess && result.sessionData) {
        this.events.onRefreshSuccess(result.sessionData);
      }
    } else {
      this.status = 'failed';
      this.log(`Refresh failed: ${result.error}`);

      if (this.events.onRefreshFailed) {
        this.events.onRefreshFailed(new Error(result.error || 'Unknown error'));
      }
    }

    return result;
  }

  /**
   * Cancel any scheduled refresh
   */
  cancelScheduled(): void {
    this.status = 'idle';
    this.log('Scheduled refresh cancelled');
  }

  /**
   * Register callback for successful refresh
   */
  onRefreshSuccess(callback: (session: SessionData) => void): void {
    this.events.onRefreshSuccess = callback;
  }

  /**
   * Register callback for failed refresh
   */
  onRefreshFailed(callback: (error: Error) => void): void {
    this.events.onRefreshFailed = callback;
  }

  /**
   * Get current refresh status
   */
  getStatus(): RefreshStatus {
    return this.status;
  }

  /**
   * Get session manager for direct status checks
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Destroy the refresher
   */
  destroy(): void {
    this.cancelScheduled();
    this.sessionManager.destroy();
  }

  private handleExpiringSoon(status: SessionStatus): void {
    this.log(
      `Session expiring soon (${status.remainingTimeFormatted} remaining)`
    );
    if (this.status !== 'refreshing' && this.status !== 'scheduled') {
      this.scheduleRefresh();
    }
  }

  private handleExpired(): void {
    this.log('Session expired, attempting refresh');
    if (!this.isRefreshing) {
      void this.refreshNow();
    }
  }

  private async performRefresh(): Promise<RefreshResult> {
    this.currentRetryCount = 0;

    while (this.currentRetryCount < this.config.maxRetries) {
      try {
        this.log(
          `Refresh attempt ${this.currentRetryCount + 1}/${this.config.maxRetries}`
        );

        const apiRefreshResult = await this.tryApiRefresh();
        if (apiRefreshResult.success) {
          return apiRefreshResult;
        }

        const playwrightResult = await this.tryPlaywrightRefresh();
        if (playwrightResult.success) {
          return playwrightResult;
        }

        this.currentRetryCount++;

        if (this.currentRetryCount < this.config.maxRetries) {
          this.log(
            `Retry in ${this.config.retryDelay / 1000} seconds...`
          );
          await this.delay(this.config.retryDelay);
        }
      } catch (error) {
        this.currentRetryCount++;
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        this.log(`Attempt ${this.currentRetryCount} failed: ${errorMsg}`);

        if (this.currentRetryCount < this.config.maxRetries) {
          await this.delay(this.config.retryDelay);
        }
      }
    }

    return {
      success: false,
      error: `Max retries (${this.config.maxRetries}) exceeded`,
      retriesUsed: this.currentRetryCount,
    };
  }

  private async tryApiRefresh(): Promise<RefreshResult> {
    const sessionData = this.loadStoredSession();
    if (!sessionData?.accessToken) {
      return {
        success: false,
        error: 'No access token available',
        retriesUsed: this.currentRetryCount,
      };
    }

    try {
      const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${sessionData.accessToken}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `API refresh failed: ${response.status}`,
          retriesUsed: this.currentRetryCount,
        };
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };

      const newSessionData: SessionData = {
        accessToken: data.access_token,
        tokenType: 'Bearer',
        createdAt: Date.now(),
        expiresAt: Date.now() + data.expires_in * 1000,
        lastRefreshedAt: Date.now(),
        cookies: sessionData.cookies,
      };

      this.saveSession(newSessionData);
      this.sessionManager.setSession(newSessionData);

      return {
        success: true,
        sessionData: newSessionData,
        retriesUsed: this.currentRetryCount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API refresh error',
        retriesUsed: this.currentRetryCount,
      };
    }
  }

  private async tryPlaywrightRefresh(): Promise<RefreshResult> {
    const credentials = this.loadCredentials();

    if (!credentials) {
      return {
        success: false,
        error: 'No credentials available for Playwright refresh',
        retriesUsed: this.currentRetryCount,
      };
    }

    try {
      const playwright = await this.importPlaywright();

      if (!playwright) {
        return {
          success: false,
          error: 'Playwright not available',
          retriesUsed: this.currentRetryCount,
        };
      }

      this.log('Launching browser for re-login...');

      const browser = await playwright.chromium.launch({ headless: true });

      try {
        // Use latest iOS User-Agent from configuration (Issue #44)
        const context = await browser.newContext({
          userAgent: DEFAULT_API_CONFIG.userAgent,
        });
        const page = await context.newPage();

        await page.goto('https://www.instagram.com/accounts/login/', {
          waitUntil: 'networkidle',
        });

        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await page.fill('input[name="username"]', credentials.username);
        await page.fill('input[name="password"]', credentials.password);

        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle' });

        const cookies = await context.cookies();
        const sessionCookie = cookies.find((c) => c.name === 'sessionid');

        if (!sessionCookie) {
          throw new Error('Login failed - no session cookie received');
        }

        const cookieData: CookieData[] = cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
        }));

        const expiresAt =
          sessionCookie.expires > 0
            ? sessionCookie.expires * 1000
            : Date.now() + 90 * 24 * 60 * 60 * 1000;

        const newSessionData: SessionData = {
          accessToken: sessionCookie.value,
          tokenType: 'Cookie',
          createdAt: Date.now(),
          expiresAt,
          lastRefreshedAt: Date.now(),
          cookies: cookieData,
        };

        this.saveSession(newSessionData);
        this.sessionManager.setSession(newSessionData);

        this.log('Playwright refresh successful');

        return {
          success: true,
          sessionData: newSessionData,
          retriesUsed: this.currentRetryCount,
        };
      } finally {
        await browser.close();
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Playwright refresh error';
      this.log(`Playwright refresh failed: ${errorMsg}`);

      return {
        success: false,
        error: errorMsg,
        retriesUsed: this.currentRetryCount,
      };
    }
  }

  private async importPlaywright(): Promise<typeof import('playwright') | null> {
    try {
      return await import('playwright');
    } catch {
      this.log('Playwright not installed - skipping browser refresh');
      return null;
    }
  }

  private loadStoredSession(): SessionData | null {
    try {
      if (!fs.existsSync(SESSION_FILE)) {
        return null;
      }
      const data = fs.readFileSync(SESSION_FILE, 'utf-8');
      return JSON.parse(data) as SessionData;
    } catch (error) {
      this.log(
        `Failed to load session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  private saveSession(sessionData: SessionData): void {
    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }
      fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
      this.log('Session saved successfully');
    } catch (error) {
      this.log(
        `Failed to save session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private loadCredentials(): AuthCredentials | null {
    try {
      if (!fs.existsSync(CREDENTIALS_FILE)) {
        return null;
      }
      const data = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
      return JSON.parse(data) as AuthCredentials;
    } catch {
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SessionRefresher] ${message}`);
  }
}

/**
 * Create a new SessionRefresher instance
 */
export function createSessionRefresher(
  config?: Partial<RefreshConfig>,
  events?: RefreshEvents
): SessionRefresher {
  return new SessionRefresher(config, events);
}
