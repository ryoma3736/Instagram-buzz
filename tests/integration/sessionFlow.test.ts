/**
 * セッション管理フロー統合テスト
 * テストシナリオ: Cookie読み込み → 有効性検証 → API呼び出し
 * @module tests/integration/sessionFlow
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SessionManager, SessionStatus } from '../../src/services/instagram/session/sessionManager.js';
import { SessionValidator, ValidationResult } from '../../src/services/instagram/session/sessionValidator.js';
import { ExpiryChecker, ExpiryCheckResult } from '../../src/services/instagram/session/expiryChecker.js';
import {
  CookieStorage,
  loadCookies,
  saveCookies,
} from '../../src/services/instagram/cookieStorage.js';
import {
  extractInstagramCookies,
  validateCookies,
  cookiesToCookieData,
} from '../../src/services/instagram/cookieExtractor.js';
import {
  CookieData,
  InstagramCookies,
  SessionData,
  DEFAULT_REFRESH_CONFIG,
} from '../../src/services/instagram/session/types.js';

// テスト用データ
const TEST_STORAGE_PATH = path.join(process.cwd(), 'tests', 'integration', 'test-session');

const createMockCookies = (expiresIn: number = 90 * 24 * 60 * 60 * 1000): CookieData[] => [
  {
    name: 'sessionid',
    value: 'session_flow_test_id',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
  {
    name: 'csrftoken',
    value: 'csrf_flow_test_token',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: false,
    secure: true,
  },
  {
    name: 'ds_user_id',
    value: '987654321',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
  {
    name: 'rur',
    value: 'FTW',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
];

describe('セッション管理フロー統合テスト', () => {
  let cookieStorage: CookieStorage;
  let sessionManager: SessionManager;
  let sessionValidator: SessionValidator;
  let expiryChecker: ExpiryChecker;

  beforeAll(() => {
    // テスト用ディレクトリ作成
    if (!fs.existsSync(TEST_STORAGE_PATH)) {
      fs.mkdirSync(TEST_STORAGE_PATH, { recursive: true });
    }
    cookieStorage = new CookieStorage({
      storagePath: TEST_STORAGE_PATH,
      filename: 'session_flow_test.json',
    });
  });

  afterAll(() => {
    // テスト用ディレクトリのクリーンアップ
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    sessionManager = new SessionManager();
    sessionValidator = new SessionValidator();
    expiryChecker = new ExpiryChecker();
    cookieStorage.delete();
  });

  describe('ステップ1: Cookie読み込み', () => {
    it('should load cookies from storage', () => {
      const mockCookies = createMockCookies();
      const extractionResult = extractInstagramCookies(mockCookies);
      cookieStorage.save(extractionResult.cookies!);

      const loadResult = cookieStorage.load();

      expect(loadResult.success).toBe(true);
      expect(loadResult.cookies).toBeDefined();
      expect(loadResult.cookies?.sessionid).toBe('session_flow_test_id');
    });

    it('should handle missing cookie file gracefully', () => {
      const loadResult = cookieStorage.load();

      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toContain('not found');
    });

    it('should detect expired cookies on load', () => {
      // 期限切れCookieを作成
      const expiredCookies = createMockCookies(-1000); // 過去の日付
      const extractionResult = extractInstagramCookies(expiredCookies);
      cookieStorage.save(extractionResult.cookies!);

      const loadResult = cookieStorage.load();

      expect(loadResult.success).toBe(false);
      expect(loadResult.expired).toBe(true);
    });

    it('should get storage info without loading full data', () => {
      const mockCookies = createMockCookies();
      const extractionResult = extractInstagramCookies(mockCookies);
      cookieStorage.save(extractionResult.cookies!);

      const info = cookieStorage.getInfo();

      expect(info.exists).toBe(true);
      expect(info.storedAt).toBeDefined();
      expect(info.encrypted).toBe(false);
    });
  });

  describe('ステップ2: 有効性検証', () => {
    it('should validate cookie presence', () => {
      const mockCookies = createMockCookies();

      const result = sessionValidator.validateCookiePresence(mockCookies);

      expect(result.isValid).toBe(true);
      expect(result.userId).toBe('987654321');
    });

    it('should fail validation when required cookies are missing', () => {
      const incompleteCookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'test_session',
          domain: '.instagram.com',
          path: '/',
        },
      ];

      const result = sessionValidator.validateCookiePresence(incompleteCookies);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('csrftoken');
    });

    it('should check session expiry with ExpiryChecker', () => {
      const mockCookies = createMockCookies();

      const result = expiryChecker.checkCookiesExpiry(mockCookies);

      expect(result.isExpired).toBe(false);
      expect(result.remainingTime).toBeGreaterThan(0);
      expect(result.needsRefresh).toBe(false);
    });

    it('should detect cookies needing refresh (within threshold)', () => {
      // 12時間後に期限切れ（閾値24時間以内）
      const soonExpiringCookies = createMockCookies(12 * 60 * 60 * 1000);

      const result = expiryChecker.checkCookiesExpiry(soonExpiringCookies);

      expect(result.isExpired).toBe(false);
      expect(result.needsRefresh).toBe(true);
    });

    it('should format remaining time human-readable', () => {
      const mockCookies = createMockCookies(48 * 60 * 60 * 1000); // 2日

      const result = expiryChecker.checkCookiesExpiry(mockCookies);
      const formatted = expiryChecker.formatRemainingTime(result.remainingTime);

      expect(formatted).toMatch(/日|時間|分/);
    });
  });

  describe('ステップ3: SessionManager統合', () => {
    it('should set and get session from cookies', () => {
      const mockCookies = createMockCookies();
      sessionManager.setCookies(mockCookies);

      const session = sessionManager.getSession();

      expect(session).not.toBeNull();
      expect(session?.accessToken).toBe('session_flow_test_id');
      expect(session?.tokenType).toBe('cookie');
    });

    it('should get session status', () => {
      const mockCookies = createMockCookies();
      sessionManager.setCookies(mockCookies);

      const status = sessionManager.getStatus();

      expect(status.isValid).toBe(true);
      expect(status.health).toBe('healthy');
      expect(status.needsRefresh).toBe(false);
    });

    it('should detect session needing refresh', () => {
      const soonExpiringCookies = createMockCookies(12 * 60 * 60 * 1000);
      sessionManager.setCookies(soonExpiringCookies);

      const status = sessionManager.getStatus();

      expect(status.isValid).toBe(true);
      expect(status.needsRefresh).toBe(true);
      expect(status.health).toBe('critical');
    });

    it('should detect expired session', () => {
      const expiredCookies = createMockCookies(-1000);
      sessionManager.setCookies(expiredCookies);

      const status = sessionManager.getStatus();

      expect(status.isValid).toBe(false);
      expect(status.health).toBe('expired');
    });

    it('should return formatted time remaining', () => {
      const mockCookies = createMockCookies();
      sessionManager.setCookies(mockCookies);

      const formatted = sessionManager.getFormattedTimeRemaining();

      expect(formatted).toMatch(/日|時間|分/);
    });

    it('should provide session summary', () => {
      const mockCookies = createMockCookies();
      sessionManager.setCookies(mockCookies);

      const summary = sessionManager.getSummary();

      expect(summary).toContain('有効');
    });
  });

  describe('ステップ4: コールバック通知', () => {
    it('should notify on expiring soon', () => {
      const callback = vi.fn();
      sessionManager.onExpiringSoon(callback);

      const soonExpiringCookies = createMockCookies(12 * 60 * 60 * 1000);
      sessionManager.setCookies(soonExpiringCookies);
      sessionManager.getStatus(); // トリガー

      expect(callback).toHaveBeenCalled();
    });

    it('should notify on session invalid', () => {
      const callback = vi.fn();
      sessionManager.onSessionInvalid(callback);

      const expiredCookies = createMockCookies(-1000);
      sessionManager.setCookies(expiredCookies);
      sessionManager.getStatus(); // トリガー

      expect(callback).toHaveBeenCalledWith(expect.stringContaining('期限切れ'));
    });
  });

  describe('完全なセッション管理フローE2E', () => {
    it('should complete full session flow: load → validate → status → manage', async () => {
      // Step 1: Cookieを保存
      const mockCookies = createMockCookies();
      const extractionResult = extractInstagramCookies(mockCookies);
      cookieStorage.save(extractionResult.cookies!);

      // Step 2: Cookieを読み込み
      const loadResult = cookieStorage.load();
      expect(loadResult.success).toBe(true);

      // Step 3: Cookieを検証
      const isValid = validateCookies(loadResult.cookies!);
      expect(isValid).toBe(true);

      // Step 4: CookieDataに変換
      const cookieData = cookiesToCookieData(loadResult.cookies!);
      expect(cookieData.length).toBe(4);

      // Step 5: SessionManagerに設定
      sessionManager.setCookies(cookieData);

      // Step 6: ステータス確認
      const status = sessionManager.getStatus();
      expect(status.isValid).toBe(true);
      expect(status.health).toBe('healthy');

      // Step 7: API検証（Cookie存在チェックのみ）
      const validationResult = sessionValidator.validateCookiePresence(cookieData);
      expect(validationResult.isValid).toBe(true);
    });

    it('should handle session lifecycle: create → use → expire → refresh', () => {
      // Create: 新しいセッションを作成
      const mockCookies = createMockCookies();
      sessionManager.setCookies(mockCookies);
      expect(sessionManager.getStatus().health).toBe('healthy');

      // Use: セッションを使用
      const session = sessionManager.getSession();
      expect(session).not.toBeNull();

      // Expire: 期限切れシミュレーション
      const expiredCookies = createMockCookies(-1000);
      sessionManager.setCookies(expiredCookies);
      expect(sessionManager.isExpired()).toBe(true);

      // Refresh: 新しいセッションで更新
      const newCookies = createMockCookies();
      sessionManager.setCookies(newCookies);
      expect(sessionManager.isExpired()).toBe(false);
      expect(sessionManager.getStatus().health).toBe('healthy');
    });

    it('should maintain session state across operations', () => {
      // 初期状態
      expect(sessionManager.getSession()).toBeNull();

      // セッション設定
      const mockCookies = createMockCookies();
      sessionManager.setCookies(mockCookies);
      const session1 = sessionManager.getSession();

      // 複数回の状態確認
      const status1 = sessionManager.getStatus();
      const status2 = sessionManager.getStatus();

      expect(status1.isValid).toBe(status2.isValid);

      // セッションクリア
      sessionManager.clearSession();
      expect(sessionManager.getSession()).toBeNull();
    });
  });
});
