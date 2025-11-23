// Database Service テスト
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseService } from '../src/services/databaseService.js';
import { BuzzReel } from '../src/types/index.js';
import * as fs from 'fs';

const TEST_DB_PATH = './data/test-instagram-buzz.db';

describe('DatabaseService', () => {
  let db: DatabaseService;

  beforeAll(() => {
    // テスト用DB作成
    db = new DatabaseService(TEST_DB_PATH);
  });

  afterAll(() => {
    db.close();
    // テストDB削除
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Reels', () => {
    const testReel: BuzzReel = {
      id: 'test_reel_1',
      url: 'https://instagram.com/reel/ABC123/',
      shortcode: 'ABC123',
      title: 'テストリール',
      views: 50000,
      likes: 2500,
      comments: 100,
      posted_at: new Date('2024-01-15'),
      author: {
        username: 'testuser',
        followers: 10000
      },
      thumbnail_url: 'https://example.com/thumb.jpg'
    };

    it('should save a reel', () => {
      expect(() => db.saveReel(testReel)).not.toThrow();
    });

    it('should retrieve a reel by id', () => {
      const reel = db.getReel('test_reel_1');
      expect(reel).not.toBeNull();
      expect(reel?.title).toBe('テストリール');
      expect(reel?.views).toBe(50000);
    });

    it('should save multiple reels', () => {
      const reels: BuzzReel[] = [
        { ...testReel, id: 'test_reel_2', shortcode: 'DEF456', views: 80000 },
        { ...testReel, id: 'test_reel_3', shortcode: 'GHI789', views: 120000 }
      ];
      expect(() => db.saveReels(reels)).not.toThrow();
    });

    it('should get all reels sorted by views', () => {
      const reels = db.getAllReels(10);
      expect(reels.length).toBeGreaterThanOrEqual(3);
      expect(reels[0].views).toBeGreaterThanOrEqual(reels[1].views);
    });
  });

  describe('Scripts', () => {
    it('should save and retrieve script', () => {
      const scriptId = db.saveScript(
        'test_reel_1',
        '元のテキスト',
        '変換されたスクリプト',
        'フック文',
        'メインポイント',
        'CTA'
      );
      expect(scriptId).toBeGreaterThan(0);

      const scripts = db.getScriptsByReel('test_reel_1');
      expect(scripts.length).toBeGreaterThan(0);
      expect(scripts[0].converted_script).toBe('変換されたスクリプト');
    });
  });

  describe('Analysis', () => {
    it('should save and retrieve analysis', () => {
      const analysisId = db.saveAnalysis(
        'test_reel_1',
        85.5,
        'question',
        '構造説明',
        '感情トリガー',
        '推奨事項'
      );
      expect(analysisId).toBeGreaterThan(0);

      const analysis = db.getAnalysisByReel('test_reel_1');
      expect(analysis).not.toBeNull();
      expect(analysis.buzz_score).toBe(85.5);
    });
  });

  describe('Generated Content', () => {
    it('should save and retrieve content by type', () => {
      const contentId = db.saveGeneratedContent(
        'threads',
        'Threads投稿内容',
        'test_reel_1',
        { hashtags: ['test', 'buzz'] }
      );
      expect(contentId).toBeGreaterThan(0);

      const contents = db.getContentByType('threads');
      expect(contents.length).toBeGreaterThan(0);
    });
  });

  describe('Stats', () => {
    it('should return database statistics', () => {
      const stats = db.getStats();
      expect(stats.reels).toBeGreaterThanOrEqual(3);
      expect(stats.scripts).toBeGreaterThanOrEqual(1);
      expect(stats.analysis).toBeGreaterThanOrEqual(1);
      expect(stats.content).toBeGreaterThanOrEqual(1);
    });
  });
});
