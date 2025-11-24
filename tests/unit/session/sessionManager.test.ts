/**
 * SessionManager Unit Tests
 * @module tests/unit/session/sessionManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionManager,
  SessionStatus,
  ExpiringSoonCallback,
  SessionInvalidCallback,
} from '../../../src/services/instagram/session/sessionManager.js';
import type { SessionData, CookieData, RefreshConfig } from '../../../src/services/instagram/session/types.js';

// Mock ExpiryChecker
vi.mock('../../../src/services/instagram/session/expiryChecker', () => ({
  ExpiryChecker: vi.fn().mockImplementation(() => ({
    checkSessionExpiry: vi.fn().mockReturnValue({
      isExpired: false,
      needsRefresh: false,
      expiresAt: new Date(Date.now() + 86400000 * 7),
      remainingTime: 86400000 * 7,
    }),
    formatRemainingTime: vi.fn().mockReturnValue('7 days'),
    getEarliestExpiry: vi.fn().mockReturnValue(new Date(Date.now() + 86400000 * 7)),
    setRefreshThresholdHours: vi.fn(),
  })),
}));

// Mock SessionValidator
vi.mock('../../../src/services/instagram/session/sessionValidator', () => ({
  SessionValidator: vi.fn().mockImplementation(() => ({
    validateSession: vi.fn().mockResolvedValue({
      isValid: true,
      checkedAt: new Date(),
    }),
  })),
}));

describe('SessionManager', () => {
  let manager: SessionManager;

  // Sample session data
  const sampleSession: SessionData = {
    accessToken: 'test_access_token',
    tokenType: 'cookie',
    expiresAt: Date.now() + 86400000 * 7, // 7 days
    createdAt: Date.now(),
    cookies: [
      { name: 'sessionid', value: 'session123', domain: '.instagram.com', path: '/' },
      { name: 'csrftoken', value: 'csrf123', domain: '.instagram.com', path: '/' },
    ],
  };

  // Sample cookies
  const sampleCookies: CookieData[] = [
    {
      name: 'sessionid',
      value: 'session123',
      domain: '.instagram.com',
      path: '/',
      expires: Date.now() + 86400000 * 7,
    },
    {
      name: 'csrftoken',
      value: 'csrf123',
      domain: '.instagram.com',
      path: '/',
      expires: Date.now() + 86400000 * 7,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new SessionManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    manager.destroy();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const m = new SessionManager();
      expect(m).toBeInstanceOf(SessionManager);
      m.destroy();
    });

    it('should create instance with custom config', () => {
      const config: Partial<RefreshConfig> = {
        refreshThreshold: 48,
        maxRetries: 5,
      };
      const m = new SessionManager(config);
      expect(m).toBeInstanceOf(SessionManager);
      m.destroy();
    });
  });

  describe('setSession', () => {
    it('should set session data', () => {
      manager.setSession(sampleSession);
      const session = manager.getSession();

      expect(session).not.toBeNull();
      expect(session?.accessToken).toBe(sampleSession.accessToken);
    });
  });

  describe('setCookies', () => {
    it('should set session from cookies', () => {
      manager.setCookies(sampleCookies);
      const session = manager.getSession();

      expect(session).not.toBeNull();
      expect(session?.cookies).toBeDefined();
    });
  });

  describe('getSession', () => {
    it('should return null when no session is set', () => {
      const session = manager.getSession();
      expect(session).toBeNull();
    });

    it('should return session when set', () => {
      manager.setSession(sampleSession);
      const session = manager.getSession();

      expect(session).toEqual(sampleSession);
    });
  });

  describe('checkValidity', () => {
    it('should return session status', async () => {
      manager.setSession(sampleSession);
      const status = await manager.checkValidity();

      expect(status).toHaveProperty('isValid');
      expect(status).toHaveProperty('remainingTime');
      expect(status).toHaveProperty('needsRefresh');
    });
  });

  describe('getStatus', () => {
    it('should return expired status when no session', () => {
      const status = manager.getStatus();

      expect(status.isValid).toBe(false);
      expect(status.health).toBe('expired');
      expect(status.remainingTimeFormatted).toBe('No session');
    });

    it('should return healthy status for valid session', () => {
      manager.setSession(sampleSession);
      const status = manager.getStatus();

      expect(status.isValid).toBe(true);
      expect(status.health).toBe('healthy');
    });

    it('should return warning status when expiring soon', async () => {
      const { ExpiryChecker } = await import('../../../src/services/instagram/session/expiryChecker');
      (ExpiryChecker as any).mockImplementation(() => ({
        checkSessionExpiry: vi.fn().mockReturnValue({
          isExpired: false,
          needsRefresh: true,
          expiresAt: new Date(Date.now() + 36 * 3600000),
          remainingTime: 36 * 3600000,
        }),
        formatRemainingTime: vi.fn().mockReturnValue('36 hours'),
        getEarliestExpiry: vi.fn().mockReturnValue(new Date()),
        setRefreshThresholdHours: vi.fn(),
      }));

      const m = new SessionManager();
      m.setSession(sampleSession);
      const status = m.getStatus();

      expect(status.needsRefresh).toBe(true);
      m.destroy();
    });

    it('should return critical status when very low time remaining', async () => {
      const { ExpiryChecker } = await import('../../../src/services/instagram/session/expiryChecker');
      (ExpiryChecker as any).mockImplementation(() => ({
        checkSessionExpiry: vi.fn().mockReturnValue({
          isExpired: false,
          needsRefresh: false,
          expiresAt: new Date(Date.now() + 6 * 3600000),
          remainingTime: 6 * 3600000,
        }),
        formatRemainingTime: vi.fn().mockReturnValue('6 hours'),
        getEarliestExpiry: vi.fn().mockReturnValue(new Date()),
        setRefreshThresholdHours: vi.fn(),
      }));

      const m = new SessionManager();
      m.setSession(sampleSession);
      const status = m.getStatus();

      expect(status.health).toBe('critical');
      m.destroy();
    });
  });

  describe('validateWithApi', () => {
    it('should return invalid when no session', async () => {
      const result = await manager.validateWithApi();

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('セッションが設定されていません');
    });

    it('should validate session with API', async () => {
      manager.setSession(sampleSession);
      const result = await manager.validateWithApi();

      expect(result.isValid).toBe(true);
      expect(result.checkedAt).toBeDefined();
    });
  });

  describe('isExpired', () => {
    it('should return true when no session', () => {
      expect(manager.isExpired()).toBe(true);
    });

    it('should return false for valid session', () => {
      manager.setSession(sampleSession);
      expect(manager.isExpired()).toBe(false);
    });
  });

  describe('getTimeRemaining', () => {
    it('should return 0 when no session', () => {
      expect(manager.getTimeRemaining()).toBe(0);
    });

    it('should return remaining time for valid session', () => {
      manager.setSession(sampleSession);
      const remaining = manager.getTimeRemaining();

      expect(remaining).toBeGreaterThan(0);
    });
  });

  describe('getFormattedTimeRemaining', () => {
    it('should return formatted time string', () => {
      manager.setSession(sampleSession);
      const formatted = manager.getFormattedTimeRemaining();

      expect(typeof formatted).toBe('string');
    });
  });

  describe('onExpiringSoon', () => {
    it('should register callback', () => {
      const callback = vi.fn();
      manager.onExpiringSoon(callback);

      // Callback should be registered without throwing
      expect(() => manager.onExpiringSoon(callback)).not.toThrow();
    });
  });

  describe('onSessionInvalid', () => {
    it('should register callback', () => {
      const callback = vi.fn();
      manager.onSessionInvalid(callback);

      // Callback should be registered without throwing
      expect(() => manager.onSessionInvalid(callback)).not.toThrow();
    });
  });

  describe('startPeriodicCheck', () => {
    it('should start periodic checking', () => {
      manager.setSession(sampleSession);
      manager.startPeriodicCheck(1000);

      // Should not throw
      expect(() => manager.startPeriodicCheck(1000)).not.toThrow();

      manager.stopPeriodicCheck();
    });

    it('should stop existing check before starting new one', () => {
      manager.setSession(sampleSession);
      manager.startPeriodicCheck(1000);
      manager.startPeriodicCheck(2000);

      // Should not throw
      manager.stopPeriodicCheck();
    });
  });

  describe('stopPeriodicCheck', () => {
    it('should stop periodic checking', () => {
      manager.setSession(sampleSession);
      manager.startPeriodicCheck(1000);
      manager.stopPeriodicCheck();

      // Should not throw
      expect(() => manager.stopPeriodicCheck()).not.toThrow();
    });

    it('should handle stop when not started', () => {
      // Should not throw
      expect(() => manager.stopPeriodicCheck()).not.toThrow();
    });
  });

  describe('clearSession', () => {
    it('should clear session data', () => {
      manager.setSession(sampleSession);
      manager.clearSession();

      expect(manager.getSession()).toBeNull();
    });

    it('should stop periodic check', () => {
      manager.setSession(sampleSession);
      manager.startPeriodicCheck(1000);
      manager.clearSession();

      // Should clear session and stop checking
      expect(manager.getSession()).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig: Partial<RefreshConfig> = {
        refreshThreshold: 72,
      };

      manager.updateConfig(newConfig);

      // Should not throw
      expect(() => manager.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe('getSummary', () => {
    it('should return "No session" when no session', () => {
      const summary = manager.getSummary();
      expect(summary).toContain('セッションなし');
    });

    it('should return status summary for valid session', () => {
      manager.setSession(sampleSession);
      const summary = manager.getSummary();

      expect(summary).toContain('有効');
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      manager.setSession(sampleSession);
      manager.startPeriodicCheck(1000);
      manager.onExpiringSoon(vi.fn());
      manager.onSessionInvalid(vi.fn());

      manager.destroy();

      expect(manager.getSession()).toBeNull();
    });
  });

  describe('callback notifications', () => {
    it('should notify expiring soon callbacks', async () => {
      const callback = vi.fn();

      const { ExpiryChecker } = await import('../../../src/services/instagram/session/expiryChecker');
      (ExpiryChecker as any).mockImplementation(() => ({
        checkSessionExpiry: vi.fn().mockReturnValue({
          isExpired: false,
          needsRefresh: true,
          expiresAt: new Date(Date.now() + 12 * 3600000),
          remainingTime: 12 * 3600000,
        }),
        formatRemainingTime: vi.fn().mockReturnValue('12 hours'),
        getEarliestExpiry: vi.fn().mockReturnValue(new Date()),
        setRefreshThresholdHours: vi.fn(),
      }));

      const m = new SessionManager();
      m.onExpiringSoon(callback);
      m.setSession(sampleSession);
      m.getStatus();

      expect(callback).toHaveBeenCalled();
      m.destroy();
    });

    it('should notify session invalid callbacks', async () => {
      const callback = vi.fn();

      const { ExpiryChecker } = await import('../../../src/services/instagram/session/expiryChecker');
      (ExpiryChecker as any).mockImplementation(() => ({
        checkSessionExpiry: vi.fn().mockReturnValue({
          isExpired: true,
          needsRefresh: false,
          expiresAt: new Date(Date.now() - 1000),
          remainingTime: 0,
        }),
        formatRemainingTime: vi.fn().mockReturnValue('Expired'),
        getEarliestExpiry: vi.fn().mockReturnValue(new Date()),
        setRefreshThresholdHours: vi.fn(),
      }));

      const m = new SessionManager();
      m.onSessionInvalid(callback);
      m.setSession(sampleSession);
      m.getStatus();

      expect(callback).toHaveBeenCalledWith('セッションの有効期限が切れました');
      m.destroy();
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      const { ExpiryChecker } = await import('../../../src/services/instagram/session/expiryChecker');
      (ExpiryChecker as any).mockImplementation(() => ({
        checkSessionExpiry: vi.fn().mockReturnValue({
          isExpired: false,
          needsRefresh: true,
          expiresAt: new Date(Date.now() + 12 * 3600000),
          remainingTime: 12 * 3600000,
        }),
        formatRemainingTime: vi.fn().mockReturnValue('12 hours'),
        getEarliestExpiry: vi.fn().mockReturnValue(new Date()),
        setRefreshThresholdHours: vi.fn(),
      }));

      const m = new SessionManager();
      m.onExpiringSoon(errorCallback);
      m.setSession(sampleSession);

      // Should not throw
      expect(() => m.getStatus()).not.toThrow();
      m.destroy();
    });
  });
});
