// SQLite データベースサービス
import Database from 'better-sqlite3';
import * as path from 'path';
import { BuzzReel } from '../types/index.js';

const DB_PATH = process.env.DB_PATH || './data/instagram-buzz.db';

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    // データディレクトリ作成
    const dir = path.dirname(dbPath);
    if (!require('fs').existsSync(dir)) {
      require('fs').mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
  }

  /**
   * テーブル初期化
   */
  private initTables(): void {
    // リールテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reels (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        shortcode TEXT UNIQUE,
        title TEXT,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        posted_at DATETIME,
        author_username TEXT,
        author_followers INTEGER DEFAULT 0,
        thumbnail_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 台本テーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reel_id TEXT REFERENCES reels(id),
        original_text TEXT,
        converted_script TEXT,
        hook TEXT,
        main_points TEXT,
        cta TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 分析結果テーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reel_id TEXT REFERENCES reels(id),
        buzz_score REAL,
        hook_type TEXT,
        content_structure TEXT,
        emotional_triggers TEXT,
        recommendations TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 生成コンテンツテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS generated_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        source_reel_id TEXT REFERENCES reels(id),
        content TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized');
  }

  // ==================== REELS ====================

  /**
   * リール保存
   */
  saveReel(reel: BuzzReel): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO reels
      (id, url, shortcode, title, views, likes, comments, posted_at, author_username, author_followers, thumbnail_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      reel.id,
      reel.url,
      reel.shortcode,
      reel.title,
      reel.views,
      reel.likes,
      reel.comments,
      reel.posted_at instanceof Date ? reel.posted_at.toISOString() : reel.posted_at,
      reel.author.username,
      reel.author.followers,
      reel.thumbnail_url || null
    );
  }

  /**
   * 複数リール一括保存
   */
  saveReels(reels: BuzzReel[]): void {
    const transaction = this.db.transaction((reels: BuzzReel[]) => {
      for (const reel of reels) {
        this.saveReel(reel);
      }
    });
    transaction(reels);
    console.log(`💾 Saved ${reels.length} reels to database`);
  }

  /**
   * リール取得
   */
  getReel(id: string): BuzzReel | null {
    const stmt = this.db.prepare('SELECT * FROM reels WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToReel(row) : null;
  }

  /**
   * 全リール取得
   */
  getAllReels(limit: number = 100): BuzzReel[] {
    const stmt = this.db.prepare('SELECT * FROM reels ORDER BY views DESC LIMIT ?');
    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.rowToReel(row));
  }

  /**
   * 行データをBuzzReelに変換
   */
  private rowToReel(row: any): BuzzReel {
    return {
      id: row.id,
      url: row.url,
      shortcode: row.shortcode,
      title: row.title,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      posted_at: new Date(row.posted_at),
      author: {
        username: row.author_username,
        followers: row.author_followers
      },
      thumbnail_url: row.thumbnail_url
    };
  }

  // ==================== SCRIPTS ====================

  /**
   * 台本保存
   */
  saveScript(reelId: string, original: string, converted: string, hook?: string, mainPoints?: string, cta?: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO scripts (reel_id, original_text, converted_script, hook, main_points, cta)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(reelId, original, converted, hook || null, mainPoints || null, cta || null);
    return result.lastInsertRowid as number;
  }

  /**
   * リールの台本取得
   */
  getScriptsByReel(reelId: string): any[] {
    const stmt = this.db.prepare('SELECT * FROM scripts WHERE reel_id = ? ORDER BY created_at DESC');
    return stmt.all(reelId) as any[];
  }

  // ==================== ANALYSIS ====================

  /**
   * 分析結果保存
   */
  saveAnalysis(reelId: string, buzzScore: number, hookType: string, structure: string, triggers: string, recommendations: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO analysis (reel_id, buzz_score, hook_type, content_structure, emotional_triggers, recommendations)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(reelId, buzzScore, hookType, structure, triggers, recommendations);
    return result.lastInsertRowid as number;
  }

  /**
   * リールの分析取得
   */
  getAnalysisByReel(reelId: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM analysis WHERE reel_id = ? ORDER BY created_at DESC LIMIT 1');
    return stmt.get(reelId) || null;
  }

  // ==================== GENERATED CONTENT ====================

  /**
   * 生成コンテンツ保存
   */
  saveGeneratedContent(type: string, content: string, sourceReelId?: string, metadata?: object): number {
    const stmt = this.db.prepare(`
      INSERT INTO generated_content (type, source_reel_id, content, metadata)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(type, sourceReelId || null, content, metadata ? JSON.stringify(metadata) : null);
    return result.lastInsertRowid as number;
  }

  /**
   * タイプ別コンテンツ取得
   */
  getContentByType(type: string, limit: number = 50): any[] {
    const stmt = this.db.prepare('SELECT * FROM generated_content WHERE type = ? ORDER BY created_at DESC LIMIT ?');
    return stmt.all(type, limit) as any[];
  }

  // ==================== UTILITY ====================

  /**
   * 統計情報取得
   */
  getStats(): { reels: number; scripts: number; analysis: number; content: number } {
    const reels = (this.db.prepare('SELECT COUNT(*) as count FROM reels').get() as any).count;
    const scripts = (this.db.prepare('SELECT COUNT(*) as count FROM scripts').get() as any).count;
    const analysis = (this.db.prepare('SELECT COUNT(*) as count FROM analysis').get() as any).count;
    const content = (this.db.prepare('SELECT COUNT(*) as count FROM generated_content').get() as any).count;
    return { reels, scripts, analysis, content };
  }

  /**
   * データベースクローズ
   */
  close(): void {
    this.db.close();
    console.log('🔒 Database closed');
  }
}

export const databaseService = new DatabaseService();
