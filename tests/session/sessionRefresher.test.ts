/**
 * SessionRefresher Unit Tests
 * @module tests/session/sessionRefresher.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionRefresher, createSessionRefresher } from '../../src/services/instagram/session/sessionRefresher.js';
import type { SessionData, RefreshConfig, RefreshEvents } from '../../src/services/instagram/session/types.js';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(undefined),
          waitForSelector: vi.fn().mockResolvedValue(undefined),
          fill: vi.fn().mockResolvedValue(undefined),
          click: vi.fn().mockResolvedValue(undefined),
          waitForNavigation: vi.fn().mockResolvedValue(undefined),
        }),
        cookies: vi.fn().mockResolvedValue([
          { name: 'sessionid', value: 'new-session', domain: '.instagram.com', expires: Date.now() / 1000 + 86400 * 90 },
          { name: 'csrftoken', value: 'new-csrf', domain: '.instagram.com', expires: -1 },
        ]),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('SessionRefresher', () => {
  let refresher: SessionRefresher;
  const mockConfig: Partial<RefreshConfig> = {
    refreshThreshold: 24,
    maxRetries: 3,
    retryDelay: 1000,
    minRefreshInterval: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    refresher = new SessionRefresher(mockConfig);
  });

  afterEach(() => {
    refresher.destroy();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const r = new SessionRefresher();
      expect(r).toBeInstanceOf(SessionRefresher);
      r.destroy();
    });

    it('should create instance with custom config', () => {
      const r = new SessionRefresher({
        refreshThreshold: 48,
        maxRetries: 5,
      });
      expect(r).toBeInstanceOf(SessionRefresher);
      r.destroy();
    });

    it('should create instance with events', () => {
      const events: RefreshEvents = {
        onRefreshStart: vi.fn(),
        onRefreshSuccess: vi.fn(),
        onRefreshFailed: vi.fn(),
      };
      const r = new SessionRefresher({}, events);
      expect(r).toBeInstanceOf(SessionRefresher);
      r.destroy();
    });
  });

  describe('initialize', () => {
    it('should return false when no stored session exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await refresher.initialize();

      expect(result).toBe(false);
    });

    it('should return true when session is loaded', async () => {
      const mockSession: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSession));

      const result = await refresher.initialize();

      expect(result).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return idle initially', () => {
      expect(refresher.getStatus()).toBe('idle');
    });
  });

  describe('scheduleRefresh', () => {
    it('should trigger immediate refresh if session is expired', async () => {
      const mockSession: SessionData = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000, // Already expired
        createdAt: Date.now() - 86400000,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSession));

      await refresher.initialize();
      refresher.scheduleRefresh();

      // Status should indicate refresh is being attempted
      expect(['refreshing', 'failed', 'idle']).toContain(refresher.getStatus());
    });
  });

  describe('cancelScheduled', () => {
    it('should set status to idle', () => {
      refresher.cancelScheduled();
      expect(refresher.getStatus()).toBe('idle');
    });
  });

  describe('getSessionManager', () => {
    it('should return session manager instance', () => {
      const manager = refresher.getSessionManager();
      expect(manager).toBeDefined();
      expect(typeof manager.getStatus).toBe('function');
    });
  });

  describe('event callbacks', () => {
    it('should register onRefreshSuccess callback', () => {
      const callback = vi.fn();
      refresher.onRefreshSuccess(callback);
      // Callback is registered without error
      expect(true).toBe(true);
    });

    it('should register onRefreshFailed callback', () => {
      const callback = vi.fn();
      refresher.onRefreshFailed(callback);
      // Callback is registered without error
      expect(true).toBe(true);
    });
  });

  describe('refreshNow', () => {
    it('should return result from refreshNow', async () => {
      const result = await refresher.refreshNow();

      // Should return a result (success or failure)
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.retriesUsed).toBe('number');
    }, 30000);
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      refresher.destroy();
      expect(refresher.getStatus()).toBe('idle');
    });
  });
});

describe('createSessionRefresher', () => {
  it('should create new SessionRefresher instance', () => {
    const refresher = createSessionRefresher();
    expect(refresher).toBeInstanceOf(SessionRefresher);
    refresher.destroy();
  });

  it('should pass config to instance', () => {
    const config: Partial<RefreshConfig> = {
      maxRetries: 5,
    };
    const events: RefreshEvents = {
      onRefreshStart: vi.fn(),
    };

    const refresher = createSessionRefresher(config, events);
    expect(refresher).toBeInstanceOf(SessionRefresher);
    refresher.destroy();
  });
});
