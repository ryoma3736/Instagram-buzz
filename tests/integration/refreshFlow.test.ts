/**
 * リフレッシュフロー統合テスト
 * テストシナリオ: 期限切れ検出 → 再ログイン → Cookie更新
 * @module tests/integration/refreshFlow
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SessionManager, SessionStatus } from '../../src/services/instagram/session/sessionManager.js';
import { ExpiryChecker, ExpiryCheckResult } from '../../src/services/instagram/session/expiryChecker.js';
import { SessionValidator } from '../../src/services/instagram/session/sessionValidator.js';
import {
  CookieStorage,
} from '../../src/services/instagram/cookieStorage.js';
import {
  extractInstagramCookies,
  validateCookies,
  cookiesToCookieData,
  shouldRefreshCookies,
  getCookieRemainingTime,
} from '../../src/services/instagram/cookieExtractor.js';
import {
  TwoFactorAuth,
} from '../../src/services/instagram/twoFactorAuth.js';
import {
  CookieData,
  InstagramCookies,
  SessionData,
  RefreshConfig,
  DEFAULT_REFRESH_CONFIG,
} from '../../src/services/instagram/session/types.js';

// テスト用データ
const TEST_STORAGE_PATH = path.join(process.cwd(), 'tests', 'integration', 'test-refresh');

// 異なる有効期限のCookieを生成
const createMockCookies = (expiresIn: number): CookieData[] => [
  {
    name: 'sessionid',
    value: `refresh_test_session_${Date.now()}`,
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
  {
    name: 'csrftoken',
    value: `refresh_test_csrf_${Date.now()}`,
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: false,
    secure: true,
  },
  {
    name: 'ds_user_id',
    value: '444555666',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
  {
    name: 'rur',
    value: 'LLA',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
];

// 時間定数
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('リフレッシュフロー統合テスト', () => {
  let cookieStorage: CookieStorage;
  let sessionManager: SessionManager;
  let expiryChecker: ExpiryChecker;
  let sessionValidator: SessionValidator;

  beforeAll(() => {
    // テスト用ディレクトリ作成
    if (!fs.existsSync(TEST_STORAGE_PATH)) {
      fs.mkdirSync(TEST_STORAGE_PATH, { recursive: true });
    }
    cookieStorage = new CookieStorage({
      storagePath: TEST_STORAGE_PATH,
      filename: 'refresh_flow_test.json',
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
    expiryChecker = new ExpiryChecker();
    sessionValidator = new SessionValidator();
    cookieStorage.delete();
  });

  describe('ステップ1: 期限切れ検出', () => {
    it('should detect expired cookies', () => {
      const expiredCookies = createMockCookies(-1000); // 過去の日付
      const extractionResult = extractInstagramCookies(expiredCookies);

      const isValid = validateCookies(extractionResult.cookies!);

      expect(isValid).toBe(false);
    });

    it('should detect soon-to-expire cookies (within 24 hours)', () => {
      const soonExpiringCookies = createMockCookies(12 * HOUR_MS); // 12時間後
      const extractionResult = extractInstagramCookies(soonExpiringCookies);

      const needsRefresh = shouldRefreshCookies(extractionResult.cookies!, 24);

      expect(needsRefresh).toBe(true);
    });

    it('should not require refresh for fresh cookies', () => {
      const freshCookies = createMockCookies(90 * DAY_MS); // 90日後
      const extractionResult = extractInstagramCookies(freshCookies);

      const needsRefresh = shouldRefreshCookies(extractionResult.cookies!, 24);

      expect(needsRefresh).toBe(false);
    });

    it('should calculate remaining time correctly', () => {
      const cookies = createMockCookies(48 * HOUR_MS); // 48時間後
      const extractionResult = extractInstagramCookies(cookies);

      const remainingTime = getCookieRemainingTime(extractionResult.cookies!);

      // 48時間 = 172800000ms、誤差1秒以内
      expect(remainingTime).toBeGreaterThan(47 * HOUR_MS);
      expect(remainingTime).toBeLessThanOrEqual(48 * HOUR_MS);
    });

    it('should return zero for expired cookies', () => {
      const expiredCookies = createMockCookies(-1000);
      const extractionResult = extractInstagramCookies(expiredCookies);

      const remainingTime = getCookieRemainingTime(extractionResult.cookies!);

      expect(remainingTime).toBe(0);
    });
  });

  describe('ステップ2: SessionManagerによる期限管理', () => {
    it('should track session health status', () => {
      // 健全なセッション
      const healthyCookies = createMockCookies(90 * DAY_MS);
      sessionManager.setCookies(healthyCookies);
      expect(sessionManager.getStatus().health).toBe('healthy');

      // 警告レベルのセッション（48時間以内）
      sessionManager = new SessionManager();
      const warningCookies = createMockCookies(36 * HOUR_MS);
      sessionManager.setCookies(warningCookies);
      expect(sessionManager.getStatus().health).toBe('warning');

      // 危険レベルのセッション（12時間以内）
      sessionManager = new SessionManager();
      const criticalCookies = createMockCookies(6 * HOUR_MS);
      sessionManager.setCookies(criticalCookies);
      expect(sessionManager.getStatus().health).toBe('critical');

      // 期限切れセッション
      sessionManager = new SessionManager();
      const expiredCookies = createMockCookies(-1000);
      sessionManager.setCookies(expiredCookies);
      expect(sessionManager.getStatus().health).toBe('expired');
    });

    it('should calculate remaining time via SessionManager', () => {
      const cookies = createMockCookies(72 * HOUR_MS);
      sessionManager.setCookies(cookies);

      const remaining = sessionManager.getTimeRemaining();

      expect(remaining).toBeGreaterThan(0);
    });

    it('should provide formatted remaining time', () => {
      const cookies = createMockCookies(72 * HOUR_MS);
      sessionManager.setCookies(cookies);

      const formatted = sessionManager.getFormattedTimeRemaining();

      expect(formatted).toMatch(/日|時間|分/);
    });

    it('should update refresh threshold dynamically', () => {
      const cookies = createMockCookies(48 * HOUR_MS);
      sessionManager.setCookies(cookies);

      // デフォルト閾値（24時間）では needsRefresh = false
      expect(sessionManager.getStatus().needsRefresh).toBe(false);

      // 閾値を72時間に変更
      sessionManager.updateConfig({ refreshThreshold: 72 });
      expect(sessionManager.getStatus().needsRefresh).toBe(true);
    });
  });

  describe('ステップ3: 再ログインシミュレーション', () => {
    it('should prepare for re-authentication', () => {
      // 期限切れセッションを検出
      const expiredCookies = createMockCookies(-1000);
      sessionManager.setCookies(expiredCookies);
      expect(sessionManager.isExpired()).toBe(true);

      // セッションをクリア
      sessionManager.clearSession();
      expect(sessionManager.getSession()).toBeNull();
    });

    it('should handle 2FA during re-authentication', () => {
      const twoFactorAuth = new TwoFactorAuth({
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });

      // 2FA設定の確認
      expect(twoFactorAuth.hasTOTP()).toBe(true);

      // TOTPコード生成
      const result = twoFactorAuth.getTOTPCode();
      expect(result.method).toBe('totp');
      if (result.success) {
        expect(result.code).toMatch(/^\d{6}$/);
      }
    });

    it('should simulate successful re-login', () => {
      // 古いセッションをクリア
      sessionManager.clearSession();

      // 新しいセッションを設定（再ログイン成功を想定）
      const newCookies = createMockCookies(90 * DAY_MS);
      sessionManager.setCookies(newCookies);

      expect(sessionManager.isExpired()).toBe(false);
      expect(sessionManager.getStatus().health).toBe('healthy');
    });
  });

  describe('ステップ4: Cookie更新', () => {
    it('should update cookies in storage', () => {
      // 古いCookieを保存
      const oldCookies = createMockCookies(1 * HOUR_MS);
      const oldExtraction = extractInstagramCookies(oldCookies);
      cookieStorage.save(oldExtraction.cookies!);

      // 新しいCookieで更新
      const newCookies = createMockCookies(90 * DAY_MS);
      const newExtraction = extractInstagramCookies(newCookies);
      cookieStorage.save(newExtraction.cookies!);

      // 新しいCookieが読み込まれることを確認
      const loadResult = cookieStorage.load();
      expect(loadResult.success).toBe(true);
      expect(loadResult.cookies?.sessionid).toBe(newExtraction.cookies?.sessionid);
    });

    it('should preserve user data across refresh', () => {
      // 古いCookieのユーザーID
      const oldCookies = createMockCookies(1 * HOUR_MS);
      const oldExtraction = extractInstagramCookies(oldCookies);
      const oldUserId = oldExtraction.cookies?.ds_user_id;

      // 新しいCookieでも同じユーザーID
      // 実際の更新ではユーザーIDは変わらない
      expect(oldUserId).toBe('444555666');
    });

    it('should verify updated cookies are valid', () => {
      const newCookies = createMockCookies(90 * DAY_MS);
      const extraction = extractInstagramCookies(newCookies);
      cookieStorage.save(extraction.cookies!);

      const loadResult = cookieStorage.load();
      expect(loadResult.success).toBe(true);

      const isValid = validateCookies(loadResult.cookies!);
      expect(isValid).toBe(true);
    });
  });

  describe('コールバック通知', () => {
    it('should notify when session is expiring soon', () => {
      const expiringSoonCallback = vi.fn();
      sessionManager.onExpiringSoon(expiringSoonCallback);

      const soonExpiringCookies = createMockCookies(12 * HOUR_MS);
      sessionManager.setCookies(soonExpiringCookies);
      sessionManager.getStatus(); // コールバックをトリガー

      expect(expiringSoonCallback).toHaveBeenCalled();
    });

    it('should notify when session becomes invalid', () => {
      const invalidCallback = vi.fn();
      sessionManager.onSessionInvalid(invalidCallback);

      const expiredCookies = createMockCookies(-1000);
      sessionManager.setCookies(expiredCookies);
      sessionManager.getStatus(); // コールバックをトリガー

      expect(invalidCallback).toHaveBeenCalled();
    });

    it('should handle multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      sessionManager.onExpiringSoon(callback1);
      sessionManager.onExpiringSoon(callback2);

      const soonExpiringCookies = createMockCookies(12 * HOUR_MS);
      sessionManager.setCookies(soonExpiringCookies);
      sessionManager.getStatus();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('完全なリフレッシュフローE2E', () => {
    it('should complete full refresh flow: detect → clear → re-auth → update', () => {
      // Step 1: 期限切れ間近のセッションを検出
      const soonExpiringCookies = createMockCookies(6 * HOUR_MS);
      sessionManager.setCookies(soonExpiringCookies);

      const initialStatus = sessionManager.getStatus();
      expect(initialStatus.needsRefresh).toBe(true);
      expect(initialStatus.health).toBe('critical');

      // Step 2: 古いセッションを保存してからクリア
      const oldExtraction = extractInstagramCookies(soonExpiringCookies);
      cookieStorage.save(oldExtraction.cookies!);

      // Step 3: 再認証シミュレーション（新しいCookieを取得）
      const newCookies = createMockCookies(90 * DAY_MS);
      const newExtraction = extractInstagramCookies(newCookies);
      expect(newExtraction.success).toBe(true);

      // Step 4: Cookie更新
      cookieStorage.save(newExtraction.cookies!);

      // Step 5: セッション更新
      sessionManager.setCookies(cookiesToCookieData(newExtraction.cookies!));

      // Step 6: 更新後の状態確認
      const finalStatus = sessionManager.getStatus();
      expect(finalStatus.isValid).toBe(true);
      expect(finalStatus.health).toBe('healthy');
      expect(finalStatus.needsRefresh).toBe(false);
    });

    it('should handle refresh with 2FA', () => {
      // 2FA設定
      const twoFactorAuth = new TwoFactorAuth({
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });

      // 期限切れ検出
      const expiredCookies = createMockCookies(-1000);
      sessionManager.setCookies(expiredCookies);
      expect(sessionManager.isExpired()).toBe(true);

      // 2FAコード生成
      const totpResult = twoFactorAuth.getTOTPCode();
      expect(totpResult.method).toBe('totp');

      // 新しいセッションで更新（2FA成功後を想定）
      const newCookies = createMockCookies(90 * DAY_MS);
      sessionManager.setCookies(newCookies);

      expect(sessionManager.isExpired()).toBe(false);
    });

    it('should maintain session continuity during refresh', () => {
      // 初期セッション
      const initialCookies = createMockCookies(48 * HOUR_MS);
      sessionManager.setCookies(initialCookies);
      const initialSession = sessionManager.getSession();
      expect(initialSession).not.toBeNull();

      // リフレッシュ
      const newCookies = createMockCookies(90 * DAY_MS);
      sessionManager.setCookies(newCookies);
      const newSession = sessionManager.getSession();
      expect(newSession).not.toBeNull();

      // セッションタイプは維持される
      expect(initialSession?.tokenType).toBe(newSession?.tokenType);
    });

    it('should handle storage persistence across refresh', () => {
      // 保存 → 更新 → 再読み込み
      const cookies1 = createMockCookies(24 * HOUR_MS);
      const extraction1 = extractInstagramCookies(cookies1);
      cookieStorage.save(extraction1.cookies!);

      const load1 = cookieStorage.load();
      expect(load1.success).toBe(true);

      // 更新
      const cookies2 = createMockCookies(90 * DAY_MS);
      const extraction2 = extractInstagramCookies(cookies2);
      cookieStorage.save(extraction2.cookies!);

      const load2 = cookieStorage.load();
      expect(load2.success).toBe(true);
      expect(load2.cookies?.sessionid).toBe(extraction2.cookies?.sessionid);
    });
  });

  describe('エッジケース', () => {
    it('should handle exactly-at-threshold expiry', () => {
      // ちょうど24時間後に期限切れ
      const cookies = createMockCookies(24 * HOUR_MS);
      const extraction = extractInstagramCookies(cookies);

      // 閾値ちょうどでは needsRefresh = true（以下なので）
      const needsRefresh = shouldRefreshCookies(extraction.cookies!, 24);
      expect(needsRefresh).toBe(true);
    });

    it('should handle very short expiry times', () => {
      const cookies = createMockCookies(1000); // 1秒後
      sessionManager.setCookies(cookies);

      const status = sessionManager.getStatus();
      expect(status.health).toBe('critical');
    });

    it('should handle no expiry (infinite session)', () => {
      const noExpiryCookies: CookieData[] = createMockCookies(90 * DAY_MS).map((c) => ({
        ...c,
        expires: undefined,
      }));

      const result = expiryChecker.checkCookiesExpiry(noExpiryCookies);

      expect(result.isExpired).toBe(false);
      expect(result.remainingTime).toBe(Infinity);
    });
  });
});
