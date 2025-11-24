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
  HtmlResponseError,
  createApiClient,
  DEFAULT_RATE_LIMIT,
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

describe('HtmlResponseError', () => {
  it('should create error with correct properties', () => {
    const error = new HtmlResponseError('/api/test', '<!DOCTYPE html>...');

    expect(error.message).toContain('HTML response');
    expect(error.statusCode).toBe(200);
    expect(error.endpoint).toBe('/api/test');
    expect(error.isRateLimited).toBe(false);
    expect(error.responsePreview).toBe('<!DOCTYPE html>...');
    expect(error.name).toBe('HtmlResponseError');
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
        text: async () => JSON.stringify({ success: true }),
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

    it('should throw HtmlResponseError when HTML is received', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<!DOCTYPE html><html><head><title>Login</title></head></html>',
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      const client = new ApiClient(mockCookies);

      await expect(client.get('https://api.test.com/endpoint')).rejects.toThrow(
        HtmlResponseError
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<!DOCTYPE html><html><head><title>Login</title></head></html>',
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      try {
        await client.get('https://api.test.com/endpoint');
      } catch (error) {
        if (error instanceof HtmlResponseError) {
          expect(error.responsePreview).toContain('<!DOCTYPE');
          expect(error.endpoint).toBe('https://api.test.com/endpoint');
        }
      }
    });
  });

  describe('post', () => {
    it('should make POST request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ success: true }),
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
        text: async () => JSON.stringify({ success: true }),
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
        text: async () => JSON.stringify({ success: true }),
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
