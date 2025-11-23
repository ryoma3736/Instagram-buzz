// デモスクリプト
import 'dotenv/config';
import { reelSearchService } from './services/reelSearchService.js';
import { databaseService } from './services/databaseService.js';
import { buzzAnalysisService } from './services/buzzAnalysisService.js';
import { captionGeneratorService } from './services/captionGeneratorService.js';

async function demo() {
  console.log('🌸 Instagram-buzz デモ\n');

  // 1. バズリール検索
  console.log('=== 1. バズリール検索 ===');
  const keyword = process.argv[2] || '料理';
  console.log(`キーワード: "${keyword}"`);

  const reels = await reelSearchService.searchBuzzReels({
    keyword,
    period: 180,
    min_views: 0,
    limit: 5
  });

  console.log(`\n✅ ${reels.length}件のリール取得:`);
  reels.forEach((r, i) => {
    console.log(`  ${i+1}. ${r.title.slice(0, 35)}`);
    console.log(`     再生: ${r.views.toLocaleString()} | いいね: ${r.likes.toLocaleString()}`);
  });

  // 2. DBに保存
  console.log('\n=== 2. DB保存 ===');
  databaseService.saveReels(reels);
  const stats = databaseService.getStats();
  console.log('📊 DB統計:', stats);

  // 3. バズ分析
  console.log('\n=== 3. バズ分析 ===');
  if (reels.length > 0) {
    const factors = await buzzAnalysisService.quickAnalyze(reels[0].title);
    console.log('バズ要因:');
    factors.forEach((f, i) => console.log(`  ${i+1}. ${f}`));
  }

  // 4. キャプション生成
  console.log('\n=== 4. キャプション生成 ===');
  const script = { hook: keyword, main_points: [keyword], cta: 'いいね＆保存' };
  const caption = await captionGeneratorService.generateCaption(script as any);
  console.log('キャプション案:');
  console.log(caption.main_text);
  console.log('ハッシュタグ:', caption.hashtags.join(' '));

  console.log('\n🎉 デモ完了！');
  databaseService.close();
}

demo().catch(console.error);
