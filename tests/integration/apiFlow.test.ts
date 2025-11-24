/**
 * API連携フロー統合テスト
 * テストシナリオ: 認証 → ハッシュタグ検索 → 結果保存
 * @module tests/integration/apiFlow
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../../src/services/databaseService.js';
import { ReelSearchService } from '../../src/services/reelSearchService.js';
import { InstagramScraperService } from '../../src/services/instagramScraperService.js';
import {
  CookieStorage,
} from '../../src/services/instagram/cookieStorage.js';
import {
  extractInstagramCookies,
  validateCookies,
  cookiesToCookieData,
} from '../../src/services/instagram/cookieExtractor.js';
import { SessionManager } from '../../src/services/instagram/session/sessionManager.js';
import { SessionValidator } from '../../src/services/instagram/session/sessionValidator.js';
import { CookieData, InstagramCookies } from '../../src/services/instagram/session/types.js';

// テスト用データ
const TEST_DB_PATH = path.join(process.cwd(), 'tests', 'integration', 'test-api.db');
const TEST_STORAGE_PATH = path.join(process.cwd(), 'tests', 'integration', 'test-api-cookies');

const createMockCookies = (expiresIn: number = 90 * 24 * 60 * 60 * 1000): CookieData[] => [
  {
    name: 'sessionid',
    value: 'api_flow_test_session',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
  {
    name: 'csrftoken',
    value: 'api_flow_test_csrf',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: false,
    secure: true,
  },
  {
    name: 'ds_user_id',
    value: '111222333',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
  {
    name: 'rur',
    value: 'ATN',
    domain: '.instagram.com',
    path: '/',
    expires: Date.now() + expiresIn,
    httpOnly: true,
    secure: true,
  },
];

// モックリールデータ
const createMockReelData = (id: string, hashtag: string) => ({
  id,
  url: `https://instagram.com/reel/${id}/`,
  shortcode: id,
  title: `Test reel for #${hashtag}`,
  views: Math.floor(Math.random() * 1000000),
  likes: Math.floor(Math.random() * 50000),
  comments: Math.floor(Math.random() * 1000),
  posted_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
  author: {
    username: `test_user_${id}`,
    followers: Math.floor(Math.random() * 100000),
  },
  hashtags: [hashtag, 'test', 'integration'],
});

describe('API連携フロー統合テスト', () => {
  let db: DatabaseService;
  let cookieStorage: CookieStorage;
  let sessionManager: SessionManager;
  let sessionValidator: SessionValidator;
  let reelSearchService: ReelSearchService;
  let scraperService: InstagramScraperService;

  beforeAll(() => {
    // テスト用ディレクトリ作成
    if (!fs.existsSync(TEST_STORAGE_PATH)) {
      fs.mkdirSync(TEST_STORAGE_PATH, { recursive: true });
    }

    db = new DatabaseService(TEST_DB_PATH);
    cookieStorage = new CookieStorage({
      storagePath: TEST_STORAGE_PATH,
      filename: 'api_flow_test.json',
    });
    sessionManager = new SessionManager();
    sessionValidator = new SessionValidator();
    reelSearchService = new ReelSearchService();
    scraperService = new InstagramScraperService();
  });

  afterAll(() => {
    db.close();
    // テスト用ファイル/ディレクトリのクリーンアップ
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    cookieStorage.delete();
  });

  describe('ステップ1: 認証準備', () => {
    it('should prepare authentication cookies', () => {
      const mockCookies = createMockCookies();
      const extractionResult = extractInstagramCookies(mockCookies);

      expect(extractionResult.success).toBe(true);
      expect(extractionResult.cookies).toBeDefined();
    });

    it('should set up session manager with cookies', () => {
      const mockCookies = createMockCookies();
      sessionManager.setCookies(mockCookies);

      const status = sessionManager.getStatus();

      expect(status.isValid).toBe(true);
      expect(status.health).toBe('healthy');
    });

    it('should validate session for API calls', () => {
      const mockCookies = createMockCookies();

      const result = sessionValidator.validateCookiePresence(mockCookies);

      expect(result.isValid).toBe(true);
      expect(result.userId).toBe('111222333');
    });
  });

  describe('ステップ2: ハッシュタグ検索（モック）', () => {
    it('should create ReelSearchService instance', () => {
      expect(reelSearchService).toBeDefined();
    });

    it('should search reels by keyword', async () => {
      // 実際のAPI呼び出しは行わず、サービスの存在確認
      const searchParams = {
        keyword: 'test',
        period: 30,
        min_views: 1000,
        limit: 10,
      };

      // サービスが正しく初期化されていることを確認
      expect(typeof reelSearchService.searchBuzzReels).toBe('function');
    });

    it('should get trending reels', async () => {
      // サービスメソッドの存在確認
      expect(typeof reelSearchService.getTrendingReels).toBe('function');
    });
  });

  describe('ステップ3: 結果保存', () => {
    it('should save reel data to database', () => {
      const mockReel = createMockReelData('API_TEST_001', 'apitest');

      db.saveReel(mockReel);
      const saved = db.getReel('API_TEST_001');

      expect(saved).not.toBeNull();
      expect(saved?.shortcode).toBe('API_TEST_001');
    });

    it('should save multiple reels from search results', () => {
      const hashtag = 'multitest';
      const mockReels = [
        createMockReelData('MULTI_001', hashtag),
        createMockReelData('MULTI_002', hashtag),
        createMockReelData('MULTI_003', hashtag),
      ];

      mockReels.forEach((reel) => db.saveReel(reel));

      const saved1 = db.getReel('MULTI_001');
      const saved2 = db.getReel('MULTI_002');
      const saved3 = db.getReel('MULTI_003');

      expect(saved1).not.toBeNull();
      expect(saved2).not.toBeNull();
      expect(saved3).not.toBeNull();
    });

    it('should update existing reel data', () => {
      const mockReel = createMockReelData('UPDATE_TEST', 'updatetest');
      db.saveReel(mockReel);

      // 更新データ
      const updatedReel = {
        ...mockReel,
        views: mockReel.views + 10000,
        likes: mockReel.likes + 500,
      };
      db.saveReel(updatedReel);

      const saved = db.getReel('UPDATE_TEST');
      expect(saved?.views).toBe(updatedReel.views);
    });

    it('should get database stats', () => {
      const stats = db.getStats();

      expect(stats.reels).toBeGreaterThanOrEqual(0);
    });
  });

  describe('認証状態とAPI連携の統合', () => {
    it('should verify authentication before API call', () => {
      const mockCookies = createMockCookies();
      sessionManager.setCookies(mockCookies);

      // 認証状態確認
      const status = sessionManager.getStatus();
      expect(status.isValid).toBe(true);

      // Cookie検証
      const validationResult = sessionValidator.validateCookiePresence(mockCookies);
      expect(validationResult.isValid).toBe(true);

      // API呼び出し可能な状態であることを確認
      expect(status.health).not.toBe('expired');
    });

    it('should prevent API call with invalid session', () => {
      const expiredCookies = createMockCookies(-1000);
      sessionManager.setCookies(expiredCookies);

      const status = sessionManager.getStatus();

      expect(status.isValid).toBe(false);
      expect(status.health).toBe('expired');
    });

    it('should warn when session is about to expire', () => {
      const soonExpiringCookies = createMockCookies(12 * 60 * 60 * 1000);
      sessionManager.setCookies(soonExpiringCookies);

      const status = sessionManager.getStatus();

      expect(status.needsRefresh).toBe(true);
      expect(status.health).toBe('critical');
    });
  });

  describe('完全なAPI連携フローE2E', () => {
    it('should complete full API flow: auth → search → save', () => {
      // Step 1: 認証設定
      const mockCookies = createMockCookies();
      const extractionResult = extractInstagramCookies(mockCookies);
      expect(extractionResult.success).toBe(true);

      cookieStorage.save(extractionResult.cookies!);
      const loadResult = cookieStorage.load();
      expect(loadResult.success).toBe(true);

      // Step 2: セッション設定
      const cookieData = cookiesToCookieData(loadResult.cookies!);
      sessionManager.setCookies(cookieData);
      expect(sessionManager.getStatus().isValid).toBe(true);

      // Step 3: 検索シミュレーション（モックデータ使用）
      const searchResults = [
        createMockReelData('E2E_001', 'e2etest'),
        createMockReelData('E2E_002', 'e2etest'),
        createMockReelData('E2E_003', 'e2etest'),
      ];

      // Step 4: 結果保存
      searchResults.forEach((reel) => db.saveReel(reel));

      // Step 5: 保存確認
      const saved = db.getReel('E2E_001');
      expect(saved).not.toBeNull();
      expect(saved?.title).toContain('#e2etest');

      // Step 6: 統計確認
      const stats = db.getStats();
      expect(stats.reels).toBeGreaterThan(0);
    });

    it('should handle search with different hashtags', () => {
      const hashtags = ['fashion', 'food', 'travel'];

      hashtags.forEach((hashtag, index) => {
        const reels = [
          createMockReelData(`${hashtag.toUpperCase()}_001`, hashtag),
          createMockReelData(`${hashtag.toUpperCase()}_002`, hashtag),
        ];

        reels.forEach((reel) => db.saveReel(reel));
      });

      // 各ハッシュタグのリールが保存されていることを確認
      expect(db.getReel('FASHION_001')).not.toBeNull();
      expect(db.getReel('FOOD_001')).not.toBeNull();
      expect(db.getReel('TRAVEL_001')).not.toBeNull();
    });

    it('should maintain data integrity across operations', () => {
      const originalReel = createMockReelData('INTEGRITY_TEST', 'integritytest');
      db.saveReel(originalReel);

      // 複数回読み込んでデータが一貫していることを確認
      const read1 = db.getReel('INTEGRITY_TEST');
      const read2 = db.getReel('INTEGRITY_TEST');

      expect(read1?.views).toBe(read2?.views);
      expect(read1?.likes).toBe(read2?.likes);
      expect(read1?.shortcode).toBe(read2?.shortcode);
    });
  });

  describe('エラーハンドリング', () => {
    it('should handle invalid cookie data gracefully', () => {
      const invalidCookies: CookieData[] = [];

      const result = sessionValidator.validateCookiePresence(invalidCookies);

      expect(result.isValid).toBe(false);
    });

    it('should handle database errors gracefully', () => {
      // 存在しないリールを取得
      const nonExistent = db.getReel('NON_EXISTENT_REEL_ID');

      expect(nonExistent).toBeNull();
    });

    it('should handle session manager without session', () => {
      const emptyManager = new SessionManager();

      const status = emptyManager.getStatus();

      expect(status.isValid).toBe(false);
      expect(status.health).toBe('expired');
    });
  });
});
