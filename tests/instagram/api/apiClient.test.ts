/**
 * ApiClient Tests
 * @module tests/instagram/api/apiClient.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiClient,
  buildHeaders,
  buildCookieString,
  InstagramApiError,
  InstagramHtmlResponseError,
  createApiClient,
  DEFAULT_RATE_LIMIT,
  isHtmlResponse,
  detectHtmlResponseType,
  validateJsonResponse,
} from '../../../src/services/instagram/api/apiClient.js';
import type { InstagramCookies } from '../../../src/services/instagram/session/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test cookies
const mockCookies: InstagramCookies = {
  sessionid: 'test_session_id',
  csrftoken: 'test_csrf_token',
  ds_user_id: '12345678',
  rur: 'test_rur',
  extractedAt: Date.now(),
  expiresAt: Date.now() + 86400000,
};

describe('buildCookieString', () => {
  it('should build cookie string from InstagramCookies', () => {
    const result = buildCookieString(mockCookies);

    expect(result).toContain('sessionid=test_session_id');
    expect(result).toContain('csrftoken=test_csrf_token');
    expect(result).toContain('ds_user_id=12345678');
    expect(result).toContain('rur=test_rur');
    expect(result.split('; ').length).toBe(4);
  });
});

describe('buildHeaders', () => {
  it('should build headers with required fields', () => {
    const headers = buildHeaders(mockCookies);

    expect(headers['User-Agent']).toBeDefined();
    expect(headers['X-IG-App-ID']).toBeDefined();
    expect(headers['X-CSRFToken']).toBe('test_csrf_token');
    expect(headers['Cookie']).toContain('sessionid=test_session_id');
    expect(headers['Origin']).toBe('https://www.instagram.com');
    expect(headers['Referer']).toBe('https://www.instagram.com/');
  });

  it('should merge additional headers', () => {
    const headers = buildHeaders(mockCookies, {
      'X-Custom-Header': 'custom_value',
    });

    expect(headers['X-Custom-Header']).toBe('custom_value');
  });
});

describe('InstagramApiError', () => {
  it('should create error with correct properties', () => {
    const error = new InstagramApiError('Test error', 429, '/api/test', true);

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(429);
    expect(error.endpoint).toBe('/api/test');
    expect(error.isRateLimited).toBe(true);
    expect(error.name).toBe('InstagramApiError');
  });
});

describe('ApiClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with cookies', () => {
      const client = new ApiClient(mockCookies);
      expect(client).toBeInstanceOf(ApiClient);
    });

    it('should create client with custom rate limit config', () => {
      const client = new ApiClient(mockCookies, {
        maxRequests: 50,
        windowMs: 30000,
        requestDelay: 1000,
      });
      expect(client).toBeInstanceOf(ApiClient);
    });
  });

  describe('get', () => {
    it('should make GET request with headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
        text: async () => '{"success": true}',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const client = new ApiClient(mockCookies);
      const result = await client.get<{ success: boolean }>('https://api.test.com/endpoint');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/endpoint', {
        method: 'GET',
        headers: expect.objectContaining({
          'Cookie': expect.stringContaining('sessionid=test_session_id'),
          'X-CSRFToken': 'test_csrf_token',
        }),
      });
    });

    it('should throw InstagramApiError on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const client = new ApiClient(mockCookies);

      await expect(client.get('https://api.test.com/endpoint')).rejects.toThrow(
        InstagramApiError
      );

      try {
        await client.get('https://api.test.com/endpoint');
      } catch (error) {
        if (error instanceof InstagramApiError) {
          expect(error.isRateLimited).toBe(true);
          expect(error.statusCode).toBe(429);
        }
      }
    });

    it('should throw InstagramApiError on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const client = new ApiClient(mockCookies);

      await expect(client.get('https://api.test.com/endpoint')).rejects.toThrow(
        InstagramApiError
      );
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
        text: async () => '{"success": true}',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const client = new ApiClient(mockCookies);
      const result = await client.post<{ success: boolean }>(
        'https://api.test.com/endpoint',
        { key: 'value' },
        { contentType: 'json' }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/endpoint', {
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: '{"key":"value"}',
      });
    });

    it('should make POST request with form data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
        text: async () => '{"success": true}',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const client = new ApiClient(mockCookies);
      await client.post(
        'https://api.test.com/endpoint',
        new URLSearchParams({ key: 'value' }),
        { contentType: 'form' }
      );

      expect(mockFetch).toHaveBeenCalledWith('https://api.test.com/endpoint', {
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: 'key=value',
      });
    });
  });

  describe('fetch', () => {
    it('should make raw fetch request with cookies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html>test</html>',
      });

      const client = new ApiClient(mockCookies);
      await client.fetch('https://www.instagram.com/explore/');

      expect(mockFetch).toHaveBeenCalledWith('https://www.instagram.com/explore/', {
        headers: expect.objectContaining({
          'Cookie': expect.stringContaining('sessionid='),
        }),
      });
    });
  });

  describe('updateCookies', () => {
    it('should update cookies', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
        text: async () => '{"success": true}',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const client = new ApiClient(mockCookies);
      const newCookies: InstagramCookies = {
        ...mockCookies,
        sessionid: 'new_session_id',
      };

      client.updateCookies(newCookies);

      await client.get('https://api.test.com/endpoint');

      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
        method: 'GET',
        headers: expect.objectContaining({
          'Cookie': expect.stringContaining('sessionid=new_session_id'),
        }),
      });
    });
  });

  describe('getCookies', () => {
    it('should return current cookies', () => {
      const client = new ApiClient(mockCookies);
      const cookies = client.getCookies();

      expect(cookies.sessionid).toBe('test_session_id');
    });
  });
});

describe('createApiClient', () => {
  it('should create a new ApiClient instance', () => {
    const client = createApiClient(mockCookies);
    expect(client).toBeInstanceOf(ApiClient);
  });

  it('should create client with custom rate limit config', () => {
    const client = createApiClient(mockCookies, {
      maxRequests: 100,
      windowMs: 60000,
      requestDelay: 500,
    });
    expect(client).toBeInstanceOf(ApiClient);
  });
});

describe('DEFAULT_RATE_LIMIT', () => {
  it('should have default values', () => {
    expect(DEFAULT_RATE_LIMIT.maxRequests).toBe(100);
    expect(DEFAULT_RATE_LIMIT.windowMs).toBe(60000);
    expect(DEFAULT_RATE_LIMIT.requestDelay).toBe(500);
  });
});

// Issue #43: HTML Response Detection Tests
describe('isHtmlResponse', () => {
  it('should detect <!DOCTYPE html>', () => {
    expect(isHtmlResponse('<!DOCTYPE html><html><body>test</body></html>')).toBe(true);
  });

  it('should detect <!doctype html> (lowercase)', () => {
    expect(isHtmlResponse('<!doctype html><html><body>test</body></html>')).toBe(true);
  });

  it('should detect <html> tag', () => {
    expect(isHtmlResponse('<html><head></head><body>test</body></html>')).toBe(true);
  });

  it('should detect <HTML> tag (uppercase)', () => {
    expect(isHtmlResponse('<HTML><HEAD></HEAD><BODY>test</BODY></HTML>')).toBe(true);
  });

  it('should detect <?xml declaration', () => {
    expect(isHtmlResponse('<?xml version="1.0" encoding="UTF-8"?><html></html>')).toBe(true);
  });

  it('should detect HTML with leading whitespace', () => {
    expect(isHtmlResponse('   \n\t<!DOCTYPE html><html></html>')).toBe(true);
  });

  it('should detect HTML with BOM', () => {
    expect(isHtmlResponse('\uFEFF<!DOCTYPE html><html></html>')).toBe(true);
  });

  it('should NOT detect JSON response', () => {
    expect(isHtmlResponse('{"status": "ok", "data": []}')).toBe(false);
  });

  it('should NOT detect JSON array response', () => {
    expect(isHtmlResponse('[{"id": 1}, {"id": 2}]')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isHtmlResponse('')).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isHtmlResponse(null as unknown as string)).toBe(false);
    expect(isHtmlResponse(undefined as unknown as string)).toBe(false);
  });
});

describe('detectHtmlResponseType', () => {
  it('should detect login required', () => {
    const html = '<html><body>Please login with your password to continue</body></html>';
    expect(detectHtmlResponseType(html)).toBe('login_required');
  });

  it('should detect login required with "sign in"', () => {
    const html = '<html><body>Login - Sign in to continue</body></html>';
    expect(detectHtmlResponseType(html)).toBe('login_required');
  });

  it('should detect CAPTCHA', () => {
    const html = '<html><body>Please complete the captcha to verify</body></html>';
    expect(detectHtmlResponseType(html)).toBe('captcha');
  });

  it('should detect reCAPTCHA', () => {
    const html = '<html><body>Please complete the recaptcha challenge</body></html>';
    expect(detectHtmlResponseType(html)).toBe('captcha');
  });

  it('should detect "not a robot" verification', () => {
    const html = '<html><body>Verify that you are not a robot</body></html>';
    expect(detectHtmlResponseType(html)).toBe('captcha');
  });

  it('should detect challenge/verification', () => {
    const html = '<html><body>Challenge required - confirm your identity</body></html>';
    expect(detectHtmlResponseType(html)).toBe('challenge');
  });

  it('should detect suspicious activity', () => {
    const html = '<html><body>We detected suspicious activity on your account</body></html>';
    expect(detectHtmlResponseType(html)).toBe('challenge');
  });

  it('should detect rate limiting', () => {
    const html = '<html><body>Too many requests. Please try again later.</body></html>';
    expect(detectHtmlResponseType(html)).toBe('rate_limited');
  });

  it('should detect "slow down" message', () => {
    const html = '<html><body>Please slow down. You are making too many requests.</body></html>';
    expect(detectHtmlResponseType(html)).toBe('rate_limited');
  });

  it('should detect blocked account', () => {
    const html = '<html><body>Your account has been blocked</body></html>';
    expect(detectHtmlResponseType(html)).toBe('blocked');
  });

  it('should detect disabled account', () => {
    const html = '<html><body>This account has been disabled</body></html>';
    expect(detectHtmlResponseType(html)).toBe('blocked');
  });

  it('should return unknown_html for generic HTML', () => {
    const html = '<html><body>Some generic content</body></html>';
    expect(detectHtmlResponseType(html)).toBe('unknown_html');
  });
});

describe('InstagramHtmlResponseError', () => {
  it('should create error with correct properties', () => {
    const error = new InstagramHtmlResponseError(
      'Test error',
      'login_required',
      '/api/test',
      '<html><body>Login required</body></html>'
    );

    expect(error.message).toBe('Test error');
    expect(error.responseType).toBe('login_required');
    expect(error.endpoint).toBe('/api/test');
    expect(error.htmlSnippet).toContain('Login required');
    expect(error.name).toBe('InstagramHtmlResponseError');
  });

  it('should truncate long HTML snippets to 500 chars', () => {
    const longHtml = '<html>' + 'x'.repeat(600) + '</html>';
    const error = new InstagramHtmlResponseError(
      'Test error',
      'unknown_html',
      '/api/test',
      longHtml
    );

    expect(error.htmlSnippet.length).toBe(500);
  });

  it('should return correct user message for login_required', () => {
    const error = new InstagramHtmlResponseError('Test', 'login_required', '/test');
    expect(error.getUserMessage()).toContain('requires login');
  });

  it('should return correct user message for captcha', () => {
    const error = new InstagramHtmlResponseError('Test', 'captcha', '/test');
    expect(error.getUserMessage()).toContain('CAPTCHA');
  });

  it('should return correct user message for challenge', () => {
    const error = new InstagramHtmlResponseError('Test', 'challenge', '/test');
    expect(error.getUserMessage()).toContain('verification');
  });

  it('should return correct user message for rate_limited', () => {
    const error = new InstagramHtmlResponseError('Test', 'rate_limited', '/test');
    expect(error.getUserMessage()).toContain('Too many requests');
  });

  it('should return correct user message for blocked', () => {
    const error = new InstagramHtmlResponseError('Test', 'blocked', '/test');
    expect(error.getUserMessage()).toContain('blocked');
  });

  it('should return correct user message for unknown_html', () => {
    const error = new InstagramHtmlResponseError('Test', 'unknown_html', '/test');
    expect(error.getUserMessage()).toContain('unexpected response');
  });
});

describe('validateJsonResponse', () => {
  it('should not throw for valid JSON', () => {
    expect(() => validateJsonResponse('{"status": "ok"}', '/test')).not.toThrow();
  });

  it('should throw InstagramHtmlResponseError for HTML response', () => {
    const html = '<!DOCTYPE html><html><body>Login required with password</body></html>';

    expect(() => validateJsonResponse(html, '/api/test')).toThrow(InstagramHtmlResponseError);

    try {
      validateJsonResponse(html, '/api/test');
    } catch (error) {
      if (error instanceof InstagramHtmlResponseError) {
        expect(error.responseType).toBe('login_required');
        expect(error.endpoint).toBe('/api/test');
      }
    }
  });

  it('should throw with captcha type for CAPTCHA page', () => {
    const html = '<!DOCTYPE html><html><body>Please complete the captcha</body></html>';

    try {
      validateJsonResponse(html, '/api/test');
    } catch (error) {
      if (error instanceof InstagramHtmlResponseError) {
        expect(error.responseType).toBe('captcha');
      }
    }
  });
});

describe('ApiClient HTML response handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should throw InstagramHtmlResponseError when server returns HTML with 200 status', async () => {
    const htmlResponse = '<!DOCTYPE html><html><body>Please login with password</body></html>';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => htmlResponse,
    });

    const client = new ApiClient(mockCookies);

    await expect(client.get('https://api.test.com/endpoint')).rejects.toThrow(
      InstagramHtmlResponseError
    );
  });

  it('should detect HTML response even with json content-type', async () => {
    const htmlResponse = '<!DOCTYPE html><html><body>CAPTCHA verification required</body></html>';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => htmlResponse,
    });

    const client = new ApiClient(mockCookies);

    try {
      await client.get('https://api.test.com/endpoint');
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(InstagramHtmlResponseError);
      if (error instanceof InstagramHtmlResponseError) {
        expect(error.responseType).toBe('captcha');
      }
    }
  });

  it('should successfully parse valid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"status": "ok", "data": {"id": 123}}',
    });

    const client = new ApiClient(mockCookies);
    const result = await client.get<{ status: string; data: { id: number } }>(
      'https://api.test.com/endpoint'
    );

    expect(result.status).toBe('ok');
    expect(result.data.id).toBe(123);
  });
});
