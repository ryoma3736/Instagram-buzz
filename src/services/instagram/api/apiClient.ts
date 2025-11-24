/**
 * Instagram Authenticated API Client
 * Provides reusable HTTP client for authenticated Instagram requests
 * Enhanced for Issue #44: Authentication header and cookie management improvements
 * @module services/instagram/api/apiClient
 */

import type { InstagramCookies, ExtendedCookies } from '../session/types.js';
import { DEFAULT_API_CONFIG, USER_AGENT_CONFIGS } from './types.js';

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
 * Error type for HTML response detection
 */
export type HtmlResponseType =
  | 'login_required'
  | 'captcha'
  | 'challenge'
  | 'rate_limited'
  | 'blocked'
  | 'unknown_html';

/**
 * Error thrown when Instagram returns HTML instead of JSON
 * This typically indicates:
 * - Login is required
 * - CAPTCHA verification needed
 * - Account challenge/verification
 * - Rate limiting
 * - IP/account blocked
 */
export class InstagramHtmlResponseError extends Error {
  public readonly responseType: HtmlResponseType;
  public readonly endpoint: string;
  public readonly htmlSnippet: string;

  constructor(
    message: string,
    responseType: HtmlResponseType,
    endpoint: string,
    htmlSnippet: string = ''
  ) {
    super(message);
    this.name = 'InstagramHtmlResponseError';
    this.responseType = responseType;
    this.endpoint = endpoint;
    this.htmlSnippet = htmlSnippet.slice(0, 500); // Keep only first 500 chars for debugging
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.responseType) {
      case 'login_required':
        return 'Instagram requires login. Please update your authentication cookies.';
      case 'captcha':
        return 'Instagram is requesting CAPTCHA verification. Please try again later or update your cookies.';
      case 'challenge':
        return 'Instagram requires account verification. Please log in to Instagram and complete the challenge.';
      case 'rate_limited':
        return 'Too many requests to Instagram. Please wait a few minutes before trying again.';
      case 'blocked':
        return 'Access to Instagram has been blocked. Please try again later or use a different network.';
      case 'unknown_html':
      default:
        return 'Instagram returned an unexpected response. The service may be temporarily unavailable.';
    }
  }
}

/**
 * Detect if response text is HTML instead of JSON
 */
export function isHtmlResponse(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();

  // Check for common HTML indicators
  return (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML') ||
    trimmed.startsWith('<?xml') ||
    // Sometimes HTML starts with whitespace/BOM then doctype
    /^[\s\uFEFF]*<!DOCTYPE/i.test(trimmed) ||
    /^[\s\uFEFF]*<html/i.test(trimmed)
  );
}

/**
 * Detect the type of HTML response from Instagram
 */
export function detectHtmlResponseType(html: string): HtmlResponseType {
  const lowerHtml = html.toLowerCase();

  // Login required indicators
  if (
    lowerHtml.includes('login') &&
    (lowerHtml.includes('password') || lowerHtml.includes('sign in') || lowerHtml.includes('log in'))
  ) {
    return 'login_required';
  }

  // CAPTCHA indicators
  if (
    lowerHtml.includes('captcha') ||
    lowerHtml.includes('recaptcha') ||
    lowerHtml.includes('verify you') ||
    lowerHtml.includes('not a robot')
  ) {
    return 'captcha';
  }

  // Challenge/verification indicators
  if (
    lowerHtml.includes('challenge') ||
    lowerHtml.includes('verify your') ||
    lowerHtml.includes('confirm your') ||
    lowerHtml.includes('suspicious')
  ) {
    return 'challenge';
  }

  // Rate limiting indicators
  if (
    lowerHtml.includes('rate limit') ||
    lowerHtml.includes('too many') ||
    lowerHtml.includes('try again later') ||
    lowerHtml.includes('slow down')
  ) {
    return 'rate_limited';
  }

  // Blocked indicators
  if (
    lowerHtml.includes('blocked') ||
    lowerHtml.includes('banned') ||
    lowerHtml.includes('disabled') ||
    lowerHtml.includes('unavailable')
  ) {
    return 'blocked';
  }

  return 'unknown_html';
}

/**
 * Check response text and throw appropriate error if it's HTML
 */
export function validateJsonResponse(text: string, endpoint: string): void {
  if (isHtmlResponse(text)) {
    const responseType = detectHtmlResponseType(text);
    const error = new InstagramHtmlResponseError(
      `Instagram returned HTML instead of JSON (${responseType})`,
      responseType,
      endpoint,
      text
    );
    console.error(`[ApiClient] HTML response detected: ${responseType}`);
    console.error(`[ApiClient] User message: ${error.getUserMessage()}`);
    throw error;
  }
}

/**
 * Build cookie string from InstagramCookies
 * Enhanced for Issue #44: Support for extended cookies
 * @param cookies - Instagram cookies (can be InstagramCookies or ExtendedCookies)
 * @returns Formatted cookie string for HTTP Cookie header
 */
export function buildCookieString(cookies: InstagramCookies | ExtendedCookies): string {
  // Required cookies
  const cookieParts = [
    `sessionid=${cookies.sessionid}`,
    `csrftoken=${cookies.csrftoken}`,
    `ds_user_id=${cookies.ds_user_id}`,
    `rur=${cookies.rur}`,
  ];

  // Add optional extended cookies if present (Issue #44)
  const extendedCookies = cookies as ExtendedCookies;
  if (extendedCookies.mid) {
    cookieParts.push(`mid=${extendedCookies.mid}`);
  }
  if (extendedCookies.ig_did) {
    cookieParts.push(`ig_did=${extendedCookies.ig_did}`);
  }
  if (extendedCookies.ig_nrcb) {
    cookieParts.push(`ig_nrcb=${extendedCookies.ig_nrcb}`);
  }
  if (extendedCookies.datr) {
    cookieParts.push(`datr=${extendedCookies.datr}`);
  }
  if (extendedCookies.shbid) {
    cookieParts.push(`shbid=${extendedCookies.shbid}`);
  }
  if (extendedCookies.shbts) {
    cookieParts.push(`shbts=${extendedCookies.shbts}`);
  }

  return cookieParts.join('; ');
}

/**
 * Header configuration options for different request types
 */
export interface HeaderOptions {
  /** Use mobile app User-Agent instead of web browser */
  useMobileUserAgent?: boolean;
  /** Use Android app User-Agent (default is iOS Safari) */
  useAndroidUserAgent?: boolean;
  /** Target URL for the Sec-Fetch-Site header */
  targetUrl?: string;
  /** Additional custom headers to include */
  additionalHeaders?: Record<string, string>;
}

/**
 * Build request headers for authenticated Instagram API requests
 * Enhanced for Issue #44: Added X-Instagram-AJAX, X-ASBD-ID, and other required headers
 * @param cookies - Instagram authentication cookies
 * @param options - Header configuration options or additional headers (for backwards compatibility)
 * @returns Complete headers object for Instagram API requests
 */
export function buildHeaders(
  cookies: InstagramCookies | ExtendedCookies,
  options: HeaderOptions | Record<string, string> = {}
): Record<string, string> {
  // Support both new HeaderOptions and legacy Record<string, string> format
  const headerOptions: HeaderOptions = 'useMobileUserAgent' in options || 'additionalHeaders' in options
    ? options as HeaderOptions
    : { additionalHeaders: options as Record<string, string> };

  // Select appropriate User-Agent based on options
  let userAgent: string = DEFAULT_API_CONFIG.userAgent;
  if (headerOptions.useAndroidUserAgent) {
    userAgent = USER_AGENT_CONFIGS.androidApp;
  } else if (headerOptions.useMobileUserAgent) {
    userAgent = USER_AGENT_CONFIGS.iOSApp;
  }

  // Build the headers object with all required Instagram headers (Issue #44)
  const headers: Record<string, string> = {
    // Standard browser headers
    'User-Agent': userAgent,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',

    // Instagram-specific headers (Issue #44 requirements)
    'X-IG-App-ID': DEFAULT_API_CONFIG.appId,
    'X-Instagram-AJAX': DEFAULT_API_CONFIG.ajaxVersion,
    'X-ASBD-ID': DEFAULT_API_CONFIG.asbdId,
    'X-CSRFToken': cookies.csrftoken,
    'X-IG-WWW-Claim': '0',
    'X-Requested-With': 'XMLHttpRequest',

    // Cookie header with extended cookie support
    'Cookie': buildCookieString(cookies),

    // Origin and referrer for CORS
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/',

    // Security fetch metadata headers
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',

    // Cache control
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  // Add additional custom headers
  if (headerOptions.additionalHeaders) {
    Object.assign(headers, headerOptions.additionalHeaders);
  }

  return headers;
}

/**
 * Build headers specifically for GraphQL API requests
 * GraphQL endpoints may require slightly different header configuration
 */
export function buildGraphQLHeaders(
  cookies: InstagramCookies | ExtendedCookies,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  return buildHeaders(cookies, {
    additionalHeaders: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
      ...additionalHeaders,
    },
  });
}

/**
 * Build headers for mobile API endpoints (i.instagram.com)
 * Uses mobile app User-Agent for better compatibility
 */
export function buildMobileApiHeaders(
  cookies: InstagramCookies | ExtendedCookies,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  return buildHeaders(cookies, {
    useMobileUserAgent: true,
    additionalHeaders: {
      'X-IG-Capabilities': DEFAULT_API_CONFIG.igCapabilities,
      'X-IG-Connection-Type': 'WIFI',
      ...additionalHeaders,
    },
  });
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

    const contentType = response.headers.get('content-type');

    // Always get text first to check for HTML response
    const text = await response.text();

    // Check for HTML response (Instagram sometimes returns HTML even with 200 status)
    validateJsonResponse(text, url);

    // Parse as JSON if expected
    if (contentType?.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text) as T;
      } catch (parseError) {
        // If JSON parsing fails, check again if it might be HTML
        if (isHtmlResponse(text)) {
          validateJsonResponse(text, url);
        }
        throw new InstagramApiError(
          `Failed to parse JSON response: ${(parseError as Error).message}`,
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
