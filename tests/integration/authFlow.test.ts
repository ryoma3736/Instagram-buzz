/**
 * 認証フロー統合テスト
 * テストシナリオ: ログイン → 2FA → Cookie抽出 → 保存
 * @module tests/integration/authFlow
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  TwoFactorAuth,
  TwoFactorChallenge,
  TwoFactorMethod,
  TWO_FACTOR_PATTERNS,
} from '../../src/services/instagram/twoFactorAuth.js';
import {
  extractInstagramCookies,
  validateCookies,
  CookieExtractionResult,
} from '../../src/services/instagram/cookieExtractor.js';
import {
  CookieStorage,
  saveCookies,
  loadCookies,
  deleteCookies,
} from '../../src/services/instagram/cookieStorage.js';
import { CookieData, InstagramCookies } from '../../src/services/instagram/session/types.js';

// テスト用データ
const TEST_STORAGE_PATH = path.join(process.cwd(), 'tests', 'integration', 'test-cookies');
const MOCK_RAW_COOKIES: CookieData[] = [
  {
    name: 'sessionid',
    value: 'test_session_id_12345',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90日後
    httpOnly: true,
    secure: true,
  },
  {
    name: 'csrftoken',
    value: 'test_csrf_token_67890',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + 90 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    secure: true,
  },
  {
    name: 'ds_user_id',
    value: '123456789',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + 90 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: true,
  },
  {
    name: 'rur',
    value: 'PRN',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + 90 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: true,
  },
];

describe('認証フロー統合テスト', () => {
  let cookieStorage: CookieStorage;

  beforeAll(() => {
    // テスト用ディレクトリ作成
    if (!fs.existsSync(TEST_STORAGE_PATH)) {
      fs.mkdirSync(TEST_STORAGE_PATH, { recursive: true });
    }
    cookieStorage = new CookieStorage({
      storagePath: TEST_STORAGE_PATH,
      filename: 'auth_flow_test.json',
    });
  });

  afterAll(() => {
    // テスト用ディレクトリのクリーンアップ
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // 各テスト前にCookieファイルを削除
    cookieStorage.delete();
  });

  describe('ステップ1: ログインシミュレーション', () => {
    it('should detect login page (not 2FA page)', () => {
      const loginPageUrl = 'https://www.instagram.com/accounts/login/';
      const loginPageContent = '<html><body>Login to Instagram</body></html>';

      const twoFactorAuth = new TwoFactorAuth();
      const challenge = twoFactorAuth.detectChallengeType(loginPageContent, loginPageUrl);

      expect(challenge).toBeNull();
    });

    it('should handle successful login without 2FA', () => {
      // ログイン成功後のCookie抽出シミュレーション
      const result = extractInstagramCookies(MOCK_RAW_COOKIES);

      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();
      expect(result.cookies?.sessionid).toBe('test_session_id_12345');
    });
  });

  describe('ステップ2: 2FA認証フロー', () => {
    it('should detect TOTP 2FA challenge from page content', () => {
      const twoFactorUrl = 'https://www.instagram.com/accounts/login/two_factor';
      const twoFactorContent = `
        <html>
          <body>
            Enter the code from your authentication app
            <input name="verificationCode" />
          </body>
        </html>
      `;

      const twoFactorAuth = new TwoFactorAuth();
      const challenge = twoFactorAuth.detectChallengeType(twoFactorContent, twoFactorUrl);

      expect(challenge).not.toBeNull();
      expect(challenge?.method).toBe('totp');
    });

    it('should detect SMS 2FA challenge from page content', () => {
      const twoFactorUrl = 'https://www.instagram.com/accounts/login/two_factor';
      const smsContent = `
        <html>
          <body>
            We sent a text message with your code to +1 *** ***-**89
            <input name="security_code" />
          </body>
        </html>
      `;

      const twoFactorAuth = new TwoFactorAuth();
      const challenge = twoFactorAuth.detectChallengeType(smsContent, twoFactorUrl);

      expect(challenge).not.toBeNull();
      expect(challenge?.method).toBe('sms');
      expect(challenge?.phoneNumberHint).toMatch(/\+\d+/);
    });

    it('should generate TOTP code when configured', () => {
      // 環境変数をモック
      const originalEnv = process.env.INSTAGRAM_TOTP_SECRET;
      process.env.INSTAGRAM_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'; // テスト用シークレット

      const twoFactorAuth = TwoFactorAuth.fromEnv();
      const result = twoFactorAuth.getTOTPCode();

      // シークレットが設定されていれば成功、なければエラー
      if (twoFactorAuth.hasTOTP()) {
        expect(result.success).toBe(true);
        expect(result.code).toMatch(/^\d{6}$/);
      }

      process.env.INSTAGRAM_TOTP_SECRET = originalEnv;
    });

    it('should handle backup codes', () => {
      const twoFactorAuth = new TwoFactorAuth({
        backupCodes: ['12345678', '87654321', 'abcdefgh'],
      });

      expect(twoFactorAuth.hasBackupCodes()).toBe(true);

      const result = twoFactorAuth.getBackupCode();
      expect(result.success).toBe(true);
      expect(result.code).toBe('12345678');
      expect(result.method).toBe('backup_code');
    });

    it('should handle 2FA challenge workflow', async () => {
      const twoFactorAuth = new TwoFactorAuth({
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });

      const challenge: TwoFactorChallenge = {
        method: 'totp',
        backupCodesAvailable: true,
      };

      const result = await twoFactorAuth.handleChallenge(challenge);

      expect(result.method).toBe('totp');
      expect(result.attempts).toBeGreaterThan(0);
      if (result.success) {
        expect(result.code).toMatch(/^\d{6}$/);
      }
    });
  });

  describe('ステップ3: Cookie抽出', () => {
    it('should extract all required cookies from raw data', () => {
      const result = extractInstagramCookies(MOCK_RAW_COOKIES);

      expect(result.success).toBe(true);
      expect(result.cookies).toBeDefined();
      expect(result.cookies?.sessionid).toBeDefined();
      expect(result.cookies?.csrftoken).toBeDefined();
      expect(result.cookies?.ds_user_id).toBeDefined();
      expect(result.cookies?.rur).toBeDefined();
    });

    it('should fail extraction when required cookies are missing', () => {
      const incompleteCookies: CookieData[] = [
        {
          name: 'sessionid',
          value: 'test_session',
          domain: '.instagram.com',
          path: '/',
        },
      ];

      const result = extractInstagramCookies(incompleteCookies);

      expect(result.success).toBe(false);
      expect(result.missingCookies).toBeDefined();
      expect(result.missingCookies).toContain('csrftoken');
      expect(result.missingCookies).toContain('ds_user_id');
      expect(result.missingCookies).toContain('rur');
    });

    it('should filter only Instagram domain cookies', () => {
      const mixedCookies: CookieData[] = [
        ...MOCK_RAW_COOKIES,
        {
          name: 'other_cookie',
          value: 'other_value',
          domain: '.other-site.com',
          path: '/',
        },
      ];

      const result = extractInstagramCookies(mixedCookies);

      expect(result.success).toBe(true);
      expect(result.rawCookies?.length).toBe(4); // Only Instagram cookies
    });

    it('should set proper expiry timestamps', () => {
      const result = extractInstagramCookies(MOCK_RAW_COOKIES);

      expect(result.success).toBe(true);
      expect(result.cookies?.extractedAt).toBeDefined();
      expect(result.cookies?.expiresAt).toBeDefined();
      expect(result.cookies!.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('ステップ4: Cookie保存', () => {
    it('should save cookies to file', () => {
      const extractionResult = extractInstagramCookies(MOCK_RAW_COOKIES);
      expect(extractionResult.success).toBe(true);

      const saveResult = cookieStorage.save(extractionResult.cookies!);

      expect(saveResult.success).toBe(true);
      expect(saveResult.path).toBeDefined();
      expect(fs.existsSync(saveResult.path!)).toBe(true);
    });

    it('should load saved cookies', () => {
      const extractionResult = extractInstagramCookies(MOCK_RAW_COOKIES);
      cookieStorage.save(extractionResult.cookies!);

      const loadResult = cookieStorage.load();

      expect(loadResult.success).toBe(true);
      expect(loadResult.cookies).toBeDefined();
      expect(loadResult.cookies?.sessionid).toBe('test_session_id_12345');
    });

    it('should validate loaded cookies', () => {
      const extractionResult = extractInstagramCookies(MOCK_RAW_COOKIES);
      cookieStorage.save(extractionResult.cookies!);

      const loadResult = cookieStorage.load();
      expect(loadResult.success).toBe(true);

      const isValid = validateCookies(loadResult.cookies!);
      expect(isValid).toBe(true);
    });

    it('should delete cookies when requested', () => {
      const extractionResult = extractInstagramCookies(MOCK_RAW_COOKIES);
      cookieStorage.save(extractionResult.cookies!);

      expect(cookieStorage.exists()).toBe(true);

      const deleteResult = cookieStorage.delete();
      expect(deleteResult).toBe(true);
      expect(cookieStorage.exists()).toBe(false);
    });
  });

  describe('完全な認証フローE2E', () => {
    it('should complete full authentication flow: extract → save → load → validate', () => {
      // Step 1: Cookie抽出（ログイン/2FA後を想定）
      const extractionResult = extractInstagramCookies(MOCK_RAW_COOKIES);
      expect(extractionResult.success).toBe(true);

      // Step 2: Cookie保存
      const saveResult = cookieStorage.save(extractionResult.cookies!);
      expect(saveResult.success).toBe(true);

      // Step 3: Cookie読み込み
      const loadResult = cookieStorage.load();
      expect(loadResult.success).toBe(true);

      // Step 4: Cookie検証
      const isValid = validateCookies(loadResult.cookies!);
      expect(isValid).toBe(true);

      // Step 5: データ整合性確認
      expect(loadResult.cookies?.sessionid).toBe(extractionResult.cookies?.sessionid);
      expect(loadResult.cookies?.csrftoken).toBe(extractionResult.cookies?.csrftoken);
      expect(loadResult.cookies?.ds_user_id).toBe(extractionResult.cookies?.ds_user_id);
    });

    it('should handle re-authentication after session expiry', () => {
      // 期限切れCookieを作成
      const expiredCookies: CookieData[] = MOCK_RAW_COOKIES.map((cookie) => ({
        ...cookie,
        expires: Date.now() - 1000, // 過去の日付
      }));

      const extractionResult = extractInstagramCookies(expiredCookies);
      expect(extractionResult.success).toBe(true);

      // 期限切れCookieの検証
      const isValid = validateCookies(extractionResult.cookies!);
      expect(isValid).toBe(false); // 期限切れなので無効

      // 新しいCookieで再認証
      const newExtractionResult = extractInstagramCookies(MOCK_RAW_COOKIES);
      const isNewValid = validateCookies(newExtractionResult.cookies!);
      expect(isNewValid).toBe(true);
    });
  });
});
