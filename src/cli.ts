#!/usr/bin/env node
// Instagram-buzz CLI
import 'dotenv/config';
import * as readline from 'readline';
import { reelSearchService } from './services/reelSearchService.js';
import { transcriptionService } from './services/transcriptionService.js';
import { buzzAnalysisService } from './services/buzzAnalysisService.js';
import { threadsGeneratorService } from './services/threadsGeneratorService.js';
import { captionGeneratorService } from './services/captionGeneratorService.js';
import { commentGeneratorService } from './services/commentGeneratorService.js';
import { databaseService } from './services/databaseService.js';
import { instagramScraperService } from './services/instagramScraperService.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

async function showMenu(): Promise<void> {
  console.log(`
╔════════════════════════════════════════════╗
║    🌸 Instagram-buzz CLI                   ║
╠════════════════════════════════════════════╣
║  1. バズリール検索 (キーワード)            ║
║  2. ユーザーのリール取得                   ║
║  3. リールURL解析                          ║
║  4. バズ分析実行                           ║
║  5. Threads投稿生成                        ║
║  6. キャプション生成                       ║
║  7. コメント返信生成                       ║
║  8. DB統計表示                             ║
║  9. 保存済みリール一覧                     ║
║  0. 終了                                   ║
╚════════════════════════════════════════════╝
`);
}

async function searchByKeyword(): Promise<void> {
  const keyword = await ask('🔍 キーワード: ');
  console.log(`\n検索中: "${keyword}"...`);

  const reels = await reelSearchService.searchBuzzReels({
    keyword,
    period: 180,
    min_views: 0,
    limit: 10
  });

  if (reels.length === 0) {
    console.log('❌ リールが見つかりませんでした（モックデータで代用）');
    // モックデータを保存
    const mockReels = await reelSearchService.searchBuzzReels({
      keyword, period: 180, min_views: 0, limit: 5
    });
    if (mockReels.length > 0) {
      databaseService.saveReels(mockReels);
      console.log(`💾 ${mockReels.length}件のモックデータを保存しました`);
      mockReels.forEach((r, i) => {
        console.log(`  ${i+1}. ${r.title.slice(0, 40)}`);
        console.log(`     Views: ${r.views.toLocaleString()} | Likes: ${r.likes.toLocaleString()}`);
      });
    }
  } else {
    databaseService.saveReels(reels);
    console.log(`\n✅ ${reels.length}件のリールを取得・保存しました:`);
    reels.forEach((r, i) => {
      console.log(`  ${i+1}. ${r.title.slice(0, 40)}`);
      console.log(`     URL: ${r.url}`);
      console.log(`     Views: ${r.views.toLocaleString()} | Likes: ${r.likes.toLocaleString()}`);
    });
  }
}

async function getUserReels(): Promise<void> {
  const username = await ask('👤 ユーザー名 (@なし): ');
  console.log(`\n取得中: @${username}...`);

  const reels = await instagramScraperService.getPublicReels(username, 5);

  if (reels.length === 0) {
    console.log('❌ リールが見つかりませんでした');
  } else {
    databaseService.saveReels(reels);
    console.log(`\n✅ ${reels.length}件のリールを取得しました`);
    reels.forEach((r, i) => {
      console.log(`  ${i+1}. ${r.title.slice(0, 40) || '(タイトルなし)'}`);
      console.log(`     Views: ${r.views.toLocaleString()}`);
    });
  }
}

async function analyzeReelUrl(): Promise<void> {
  const url = await ask('🔗 リールURL: ');
  console.log('\n解析中...');

  const reel = await instagramScraperService.getReelByUrl(url);

  if (!reel) {
    console.log('❌ リール情報を取得できませんでした');
  } else {
    databaseService.saveReel(reel);
    console.log('\n✅ リール情報:');
    console.log(`  タイトル: ${reel.title || '(なし)'}`);
    console.log(`  作者: @${reel.author.username}`);
    console.log(`  再生数: ${reel.views.toLocaleString()}`);
    console.log(`  いいね: ${reel.likes.toLocaleString()}`);
    console.log(`  コメント: ${reel.comments.toLocaleString()}`);
    console.log(`  投稿日: ${reel.posted_at}`);
  }
}

async function runBuzzAnalysis(): Promise<void> {
  const text = await ask('📝 分析するテキスト（リールの内容）:\n');
  console.log('\n分析中...');

  const analysis = await buzzAnalysisService.analyze(text);
  console.log('\n📊 バズ分析結果:');
  console.log(JSON.stringify(analysis, null, 2));
}

async function generateThreadsPost(): Promise<void> {
  const topic = await ask('📝 トピック: ');
  console.log('\n生成中...');

  const post = await threadsGeneratorService.generate(topic);
  console.log('\n📱 Threads投稿案:');
  console.log(post);
}

async function generateCaption(): Promise<void> {
  const topic = await ask('📝 リールの内容: ');
  console.log('\n生成中...');

  const caption = await captionGeneratorService.generate(topic);
  console.log('\n✍️ キャプション案:');
  console.log(caption);
}

async function generateComment(): Promise<void> {
  const comment = await ask('💬 返信するコメント: ');
  console.log('\n生成中...');

  const reply = await commentGeneratorService.generate(comment);
  console.log('\n💬 返信案:');
  console.log(reply);
}

async function showDbStats(): Promise<void> {
  const stats = databaseService.getStats();
  console.log('\n📊 データベース統計:');
  console.log(`  リール数: ${stats.reels}`);
  console.log(`  台本数: ${stats.scripts}`);
  console.log(`  分析数: ${stats.analysis}`);
  console.log(`  生成コンテンツ: ${stats.content}`);
}

async function showSavedReels(): Promise<void> {
  const reels = databaseService.getAllReels(20);
  console.log(`\n📚 保存済みリール (${reels.length}件):`);

  if (reels.length === 0) {
    console.log('  まだリールが保存されていません');
  } else {
    reels.forEach((r, i) => {
      console.log(`  ${i+1}. ${r.title.slice(0, 35)}...`);
      console.log(`     Views: ${r.views.toLocaleString()} | @${r.author.username}`);
    });
  }
}

async function main(): Promise<void> {
  console.log('\n🌸 Instagram-buzz へようこそ！\n');

  let running = true;

  while (running) {
    await showMenu();
    const choice = await ask('選択 (0-9): ');
    console.log('');

    switch (choice.trim()) {
      case '1': await searchByKeyword(); break;
      case '2': await getUserReels(); break;
      case '3': await analyzeReelUrl(); break;
      case '4': await runBuzzAnalysis(); break;
      case '5': await generateThreadsPost(); break;
      case '6': await generateCaption(); break;
      case '7': await generateComment(); break;
      case '8': await showDbStats(); break;
      case '9': await showSavedReels(); break;
      case '0':
        running = false;
        console.log('👋 さようなら！');
        break;
      default:
        console.log('❌ 無効な選択です');
    }

    if (running) {
      await ask('\n[Enter] でメニューに戻る...');
    }
  }

  databaseService.close();
  rl.close();
}

main().catch(console.error);
