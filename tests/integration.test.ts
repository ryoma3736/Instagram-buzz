// 統合テスト - 全機能確認
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseService } from '../src/services/databaseService.js';
import { ReelSearchService } from '../src/services/reelSearchService.js';
import { InstagramScraperService } from '../src/services/instagramScraperService.js';
import { BuzzAnalysisService } from '../src/services/buzzAnalysisService.js';
import { TranscriptionService } from '../src/services/transcriptionService.js';
import { ThreadsGeneratorService } from '../src/services/threadsGeneratorService.js';
import { CaptionGeneratorService } from '../src/services/captionGeneratorService.js';
import { CommentGeneratorService } from '../src/services/commentGeneratorService.js';
import * as fs from 'fs';

const TEST_DB = './data/integration-test.db';

describe('🔥 Instagram-buzz 統合テスト', () => {
  let db: DatabaseService;
  let searchService: ReelSearchService;
  let scraperService: InstagramScraperService;

  beforeAll(() => {
    db = new DatabaseService(TEST_DB);
    searchService = new ReelSearchService();
    scraperService = new InstagramScraperService();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  describe('F1: バズリール検索', () => {
    it('should search reels by keyword', async () => {
      const reels = await searchService.searchBuzzReels({
        keyword: 'test',
        period: 180,
        min_views: 0,
        limit: 5
      });
      expect(Array.isArray(reels)).toBe(true);
    });

    it('should get trending reels', async () => {
      const reels = await searchService.getTrendingReels(3);
      expect(Array.isArray(reels)).toBe(true);
    });
  });

  describe('F3: 台本変換', () => {
    it('should create TranscriptionService instance', () => {
      const service = new TranscriptionService();
      expect(service).toBeDefined();
    });
  });

  describe('F4: バズ分析', () => {
    it('should create BuzzAnalysisService instance', () => {
      const service = new BuzzAnalysisService();
      expect(service).toBeDefined();
    });
  });

  describe('F5: Threads投稿生成', () => {
    it('should create ThreadsGeneratorService instance', () => {
      const service = new ThreadsGeneratorService();
      expect(service).toBeDefined();
    });
  });

  describe('F7: キャプション生成', () => {
    it('should create CaptionGeneratorService instance', () => {
      const service = new CaptionGeneratorService();
      expect(service).toBeDefined();
    });
  });

  describe('F8: コメント返信生成', () => {
    it('should create CommentGeneratorService instance', () => {
      const service = new CommentGeneratorService();
      expect(service).toBeDefined();
    });
  });

  describe('DB統合', () => {
    it('should save and retrieve mock reel data', () => {
      const mockReel = {
        id: 'integration_test_1',
        url: 'https://instagram.com/reel/INT123/',
        shortcode: 'INT123',
        title: '統合テスト用リール',
        views: 100000,
        likes: 5000,
        comments: 200,
        posted_at: new Date(),
        author: { username: 'integration_test', followers: 50000 }
      };

      db.saveReel(mockReel);
      const saved = db.getReel('integration_test_1');

      expect(saved).not.toBeNull();
      expect(saved?.title).toBe('統合テスト用リール');
      expect(saved?.views).toBe(100000);
    });

    it('should get database stats', () => {
      const stats = db.getStats();
      expect(stats.reels).toBeGreaterThanOrEqual(1);
      console.log('📊 DB Stats:', stats);
    });
  });

  describe('全サービス起動確認', () => {
    it('should export all services', async () => {
      const services = await import('../src/services/index.js');

      expect(services.ReelSearchService).toBeDefined();
      expect(services.VideoDownloadService).toBeDefined();
      expect(services.TranscriptionService).toBeDefined();
      expect(services.BuzzAnalysisService).toBeDefined();
      expect(services.ThreadsGeneratorService).toBeDefined();
      expect(services.CaptionGeneratorService).toBeDefined();
      expect(services.CommentGeneratorService).toBeDefined();
      expect(services.InstagramScraperService).toBeDefined();
      expect(services.DatabaseService).toBeDefined();

      console.log('✅ 全9サービス正常エクスポート');
    });
  });
});
