/**
 * Instagram Authenticated API Client
 * Provides reusable HTTP client for authenticated Instagram requests
 * @module services/instagram/api/apiClient
 */

import type { InstagramCookies } from '../session/types.js';
import { DEFAULT_API_CONFIG } from './types.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Delay between requests in milliseconds */
  requestDelay: number;
}

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  requestDelay: 500, // 500ms between requests
};

/**
 * API Error with additional context
 */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
    public readonly isRateLimited: boolean = false
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }
}

/**
 * HTML Response Error - thrown when HTML is received instead of JSON
 */
export class HtmlResponseError extends InstagramApiError {
  constructor(
    endpoint: string,
    public readonly responsePreview: string
  ) {
    super(
      'Received HTML response instead of JSON - Instagram may be blocking the request or requiring login',
      200,
      endpoint,
      false
    );
    this.name = 'HtmlResponseError';
  }
}

/**
 * Check if response text is HTML instead of JSON
 */
function isHtmlResponse(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML') ||
    trimmed.startsWith('<?xml')
  );
}

/**
 * Build cookie string from InstagramCookies
 */
export function buildCookieString(cookies: InstagramCookies): string {
  const cookieParts = [
    `sessionid=${cookies.sessionid}`,
    `csrftoken=${cookies.csrftoken}`,
    `ds_user_id=${cookies.ds_user_id}`,
    `rur=${cookies.rur}`,
  ];
  return cookieParts.join('; ');
}

/**
 * Build request headers for authenticated Instagram API requests
 */
export function buildHeaders(
  cookies: InstagramCookies,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  return {
    'User-Agent': DEFAULT_API_CONFIG.userAgent,
    'X-IG-App-ID': DEFAULT_API_CONFIG.appId,
    'X-CSRFToken': cookies.csrftoken,
    'X-IG-WWW-Claim': '0',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
    'Cookie': buildCookieString(cookies),
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/',
    ...additionalHeaders,
  };
}

/**
 * Rate limiter for API requests
 */
class RateLimiter {
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private lastRequestTime: number = 0;

  constructor(private config: RateLimitConfig) {}

  /**
   * Wait if necessary before making a request
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Reset window if expired
    if (now - this.windowStart >= this.config.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Check if we're at the limit
    if (this.requestCount >= this.config.maxRequests) {
      const waitTime = this.config.windowMs - (now - this.windowStart);
      if (waitTime > 0) {
        await this.sleep(waitTime);
        this.requestCount = 0;
        this.windowStart = Date.now();
      }
    }

    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.requestDelay) {
      await this.sleep(this.config.requestDelay - timeSinceLastRequest);
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Instagram Authenticated API Client
 */
export class ApiClient {
  private cookies: InstagramCookies;
  private rateLimiter: RateLimiter;

  constructor(
    cookies: InstagramCookies,
    rateLimitConfig: RateLimitConfig = DEFAULT_RATE_LIMIT
  ) {
    this.cookies = cookies;
    this.rateLimiter = new RateLimiter(rateLimitConfig);
  }

  /**
   * Make an authenticated GET request
   */
  async get<T>(
    url: string,
    options: {
      headers?: Record<string, string>;
      skipRateLimit?: boolean;
    } = {}
  ): Promise<T> {
    if (!options.skipRateLimit) {
      await this.rateLimiter.waitForSlot();
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(this.cookies, options.headers),
    });

    return this.handleResponse<T>(response, url);
  }

  /**
   * Make an authenticated POST request
   */
  async post<T>(
    url: string,
    body?: string | URLSearchParams | Record<string, unknown>,
    options: {
      headers?: Record<string, string>;
      contentType?: 'json' | 'form';
      skipRateLimit?: boolean;
    } = {}
  ): Promise<T> {
    if (!options.skipRateLimit) {
      await this.rateLimiter.waitForSlot();
    }

    const headers = buildHeaders(this.cookies, options.headers);

    let bodyString: string | undefined;
    if (body) {
      if (typeof body === 'string') {
        bodyString = body;
      } else if (body instanceof URLSearchParams) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        bodyString = body.toString();
      } else if (options.contentType === 'json' || typeof body === 'object') {
        headers['Content-Type'] = 'application/json';
        bodyString = JSON.stringify(body);
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyString,
    });

    return this.handleResponse<T>(response, url);
  }

  /**
   * Handle API response
   */
  private async handleResponse<T>(
    response: Response,
    url: string
  ): Promise<T> {
    // Check for rate limiting
    if (response.status === 429) {
      throw new InstagramApiError(
        'Rate limited by Instagram',
        429,
        url,
        true
      );
    }

    // Check for authentication errors
    if (response.status === 401 || response.status === 403) {
      throw new InstagramApiError(
        'Authentication failed - cookies may have expired',
        response.status,
        url,
        false
      );
    }

    if (!response.ok) {
      throw new InstagramApiError(
        `HTTP error: ${response.status} ${response.statusText}`,
        response.status,
        url,
        false
      );
    }

    // Read response text first to check for HTML
    const text = await response.text();

    // Check for HTML response (login page, error page, etc.)
    if (isHtmlResponse(text)) {
      throw new HtmlResponseError(url, text.slice(0, 100));
    }

    // Check for empty response
    if (!text.trim()) {
      throw new InstagramApiError(
        'Empty response received',
        response.status,
        url,
        false
      );
    }

    // Parse JSON
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text) as T;
      } catch (parseError) {
        throw new InstagramApiError(
          `JSON parse error: ${(parseError as Error).message}. Preview: "${text.slice(0, 50)}..."`,
          response.status,
          url,
          false
        );
      }
    }

    // For non-JSON responses, return text as unknown type
    return text as unknown as T;
  }

  /**
   * Make a raw fetch request with cookies
   */
  async fetch(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    await this.rateLimiter.waitForSlot();

    return fetch(url, {
      ...init,
      headers: {
        ...buildHeaders(this.cookies),
        ...(init?.headers as Record<string, string>),
      },
    });
  }

  /**
   * Update cookies
   */
  updateCookies(cookies: InstagramCookies): void {
    this.cookies = cookies;
  }

  /**
   * Get current cookies
   */
  getCookies(): InstagramCookies {
    return this.cookies;
  }
}

/**
 * Create a new ApiClient instance
 */
export function createApiClient(
  cookies: InstagramCookies,
  rateLimitConfig?: RateLimitConfig
): ApiClient {
  return new ApiClient(cookies, rateLimitConfig);
}
