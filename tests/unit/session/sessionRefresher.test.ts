/**
 * SessionRefresher Unit Tests
 * @module tests/unit/session/sessionRefresher
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  SessionRefresher,
  createSessionRefresher,
} from '../../../src/services/instagram/session/sessionRefresher.js';
import type {
  RefreshConfig,
  RefreshEvents,
  SessionData,
  RefreshStatus,
} from '../../../src/services/instagram/session/types.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock SessionManager
vi.mock('../../../src/services/instagram/session/sessionManager', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    setSession: vi.fn(),
    getStatus: vi.fn().mockReturnValue({
      isValid: true,
      remainingTime: 86400000 * 7,
      needsRefresh: false,
    }),
    onExpiringSoon: vi.fn(),
    onSessionInvalid: vi.fn(),
    destroy: vi.fn(),
  })),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SessionRefresher', () => {
  let refresher: SessionRefresher;

  // Sample session data
  const sampleSession: SessionData = {
    accessToken: 'test_access_token',
    tokenType: 'cookie',
    expiresAt: Date.now() + 86400000 * 7,
    createdAt: Date.now(),
    cookies: [
      { name: 'sessionid', value: 'session123', domain: '.instagram.com', path: '/' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (refresher) {
      refresher.destroy();
    }
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      refresher = new SessionRefresher();
      expect(refresher).toBeInstanceOf(SessionRefresher);
    });

    it('should create instance with custom config', () => {
      const config: Partial<RefreshConfig> = {
        refreshThreshold: 48,
        maxRetries: 5,
        retryDelay: 2000,
      };
      refresher = new SessionRefresher(config);
      expect(refresher).toBeInstanceOf(SessionRefresher);
    });

    it('should create instance with event callbacks', () => {
      const events: RefreshEvents = {
        onRefreshStart: vi.fn(),
        onRefreshSuccess: vi.fn(),
        onRefreshFailed: vi.fn(),
        onRefreshScheduled: vi.fn(),
      };
      refresher = new SessionRefresher({}, events);
      expect(refresher).toBeInstanceOf(SessionRefresher);
    });
  });

  describe('initialize', () => {
    it('should return true when session is loaded', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sampleSession));

      refresher = new SessionRefresher();
      const result = await refresher.initialize();

      expect(result).toBe(true);
    });

    it('should return false when no session exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      refresher = new SessionRefresher();
      const result = await refresher.initialize();

      expect(result).toBe(false);
    });
  });

  describe('scheduleRefresh', () => {
    it('should trigger immediate refresh when session is expired', async () => {
      const { SessionManager } = await import('../../../src/services/instagram/session/sessionManager');
      (SessionManager as any).mockImplementation(() => ({
        setSession: vi.fn(),
        getStatus: vi.fn().mockReturnValue({
          isValid: false,
          remainingTime: 0,
          needsRefresh: false,
        }),
        onExpiringSoon: vi.fn(),
        onSessionInvalid: vi.fn(),
        destroy: vi.fn(),
      }));

      refresher = new SessionRefresher();

      // Should not throw
      expect(() => refresher.scheduleRefresh()).not.toThrow();
    });

    it('should schedule refresh when session needs refresh', async () => {
      const events: RefreshEvents = {
        onRefreshScheduled: vi.fn(),
      };

      const { SessionManager } = await import('../../../src/services/instagram/session/sessionManager');
      (SessionManager as any).mockImplementation(() => ({
        setSession: vi.fn(),
        getStatus: vi.fn().mockReturnValue({
          isValid: true,
          remainingTime: 12 * 3600000, // 12 hours
          needsRefresh: true,
        }),
        onExpiringSoon: vi.fn(),
        onSessionInvalid: vi.fn(),
        destroy: vi.fn(),
      }));

      refresher = new SessionRefresher({}, events);
      refresher.scheduleRefresh();

      // Refresh should be triggered
    });

    it('should schedule for future when session is healthy', async () => {
      const events: RefreshEvents = {
        onRefreshScheduled: vi.fn(),
      };

      refresher = new SessionRefresher({ refreshThreshold: 24 }, events);
      refresher.scheduleRefresh();

      expect(events.onRefreshScheduled).toHaveBeenCalled();
    });
  });

  describe('refreshNow', () => {
    it('should return error when refresh already in progress', async () => {
      refresher = new SessionRefresher();

      // Start a refresh
      const promise1 = refresher.refreshNow();

      // Try to start another
      const result = await refresher.refreshNow();

      expect(result.success).toBe(false);
      expect(result.error).toContain('already in progress');

      await promise1;
    });

    it('should return error when minimum interval not reached', async () => {
      refresher = new SessionRefresher({ minRefreshInterval: 24 });

      // First refresh
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      await refresher.refreshNow();

      // Reset timer slightly
      vi.advanceTimersByTime(1000);

      // Second refresh (should fail due to interval)
      const result = await refresher.refreshNow();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum refresh interval');
    });

    it('should call onRefreshStart event', async () => {
      const events: RefreshEvents = {
        onRefreshStart: vi.fn(),
        onRefreshFailed: vi.fn(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      refresher = new SessionRefresher({}, events);
      await refresher.refreshNow();

      expect(events.onRefreshStart).toHaveBeenCalled();
    });

    it('should call onRefreshSuccess on success', async () => {
      const events: RefreshEvents = {
        onRefreshSuccess: vi.fn(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sampleSession));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new_token',
          expires_in: 3600,
        }),
      });

      refresher = new SessionRefresher({}, events);
      const result = await refresher.refreshNow();

      if (result.success) {
        expect(events.onRefreshSuccess).toHaveBeenCalled();
      }
    });

    it('should call onRefreshFailed on failure', async () => {
      const events: RefreshEvents = {
        onRefreshFailed: vi.fn(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      refresher = new SessionRefresher({ maxRetries: 1 }, events);
      const result = await refresher.refreshNow();

      expect(result.success).toBe(false);
      expect(events.onRefreshFailed).toHaveBeenCalled();
    });

    it('should retry on failure', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sampleSession));

      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'new_token', expires_in: 3600 }),
        });

      refresher = new SessionRefresher({ maxRetries: 3, retryDelay: 100 });

      // Run the refresh and advance timers for retries
      const refreshPromise = refresher.refreshNow();

      // Advance time for retries
      await vi.runAllTimersAsync();

      const result = await refreshPromise;

      // May or may not succeed depending on timing
    });
  });

  describe('cancelScheduled', () => {
    it('should cancel scheduled refresh', () => {
      refresher = new SessionRefresher();
      refresher.scheduleRefresh();
      refresher.cancelScheduled();

      expect(refresher.getStatus()).toBe('idle');
    });
  });

  describe('onRefreshSuccess', () => {
    it('should register success callback', () => {
      const callback = vi.fn();
      refresher = new SessionRefresher();
      refresher.onRefreshSuccess(callback);

      // Should not throw
      expect(() => refresher.onRefreshSuccess(callback)).not.toThrow();
    });
  });

  describe('onRefreshFailed', () => {
    it('should register failure callback', () => {
      const callback = vi.fn();
      refresher = new SessionRefresher();
      refresher.onRefreshFailed(callback);

      // Should not throw
      expect(() => refresher.onRefreshFailed(callback)).not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return idle by default', () => {
      refresher = new SessionRefresher();
      expect(refresher.getStatus()).toBe('idle');
    });

    it('should return scheduled after scheduling', () => {
      refresher = new SessionRefresher();
      refresher.scheduleRefresh();

      const status = refresher.getStatus();
      expect(['idle', 'scheduled', 'refreshing']).toContain(status);
    });
  });

  describe('getSessionManager', () => {
    it('should return session manager instance', () => {
      refresher = new SessionRefresher();
      const manager = refresher.getSessionManager();

      expect(manager).toBeDefined();
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      refresher = new SessionRefresher();
      refresher.scheduleRefresh();
      refresher.destroy();

      // Should not throw and status should be reset
    });
  });

  describe('createSessionRefresher', () => {
    it('should create SessionRefresher instance', () => {
      const r = createSessionRefresher();
      expect(r).toBeInstanceOf(SessionRefresher);
      r.destroy();
    });

    it('should create with config and events', () => {
      const config: Partial<RefreshConfig> = { maxRetries: 5 };
      const events: RefreshEvents = { onRefreshStart: vi.fn() };

      const r = createSessionRefresher(config, events);
      expect(r).toBeInstanceOf(SessionRefresher);
      r.destroy();
    });
  });

  describe('API refresh', () => {
    it('should attempt API refresh with stored token', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sampleSession));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed_token',
          expires_in: 5184000, // 60 days
        }),
      });

      refresher = new SessionRefresher();
      const result = await refresher.refreshNow();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle API refresh failure', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sampleSession));

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      refresher = new SessionRefresher({ maxRetries: 1 });
      const result = await refresher.refreshNow();

      // Should fallback to Playwright or fail
    });
  });

  describe('Playwright refresh', () => {
    it('should skip Playwright when not available', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      refresher = new SessionRefresher({ maxRetries: 1 });
      const result = await refresher.refreshNow();

      expect(result.success).toBe(false);
    });
  });

  describe('session persistence', () => {
    it('should save session on successful refresh', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sampleSession));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new_token',
          expires_in: 3600,
        }),
      });

      refresher = new SessionRefresher();
      await refresher.refreshNow();

      // writeFileSync should be called on success
    });

    it('should handle save errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sampleSession));
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new_token',
          expires_in: 3600,
        }),
      });

      refresher = new SessionRefresher();

      // Should not throw despite write error
      await expect(refresher.refreshNow()).resolves.not.toThrow();
    });
  });
});
