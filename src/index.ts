/**
 * Instagram-buzz - バズコンテンツ制作システム
 *
 * AI駆動のInstagramコンテンツ自動生成
 * Powered by Miyabi Framework
 */

import 'dotenv/config';

// Service Exports
export { ReelSearchService, reelSearchService } from './services/reelSearchService.js';
export { VideoDownloadService, videoDownloadService } from './services/videoDownloadService.js';
export { TranscriptionService, transcriptionService } from './services/transcriptionService.js';
export { BuzzAnalysisService, buzzAnalysisService } from './services/buzzAnalysisService.js';
export { ThreadsGeneratorService, threadsGeneratorService } from './services/threadsGeneratorService.js';
export { ReelScriptGeneratorService, reelScriptGeneratorService } from './services/reelScriptGeneratorService.js';
export { CaptionGeneratorService, captionGeneratorService } from './services/captionGeneratorService.js';
export { CommentGeneratorService, commentGeneratorService } from './services/commentGeneratorService.js';

// Type Exports
export * from './types/index.js';

// Import for main
import { reelSearchService } from './services/reelSearchService.js';

export async function main(): Promise<void> {
  console.log('🌸 Instagram-buzz System Starting...\n');

  const keyword = process.argv[2] || '心理学';

  console.log(`Step 1: Searching buzz reels for "${keyword}"...`);
  const reels = await reelSearchService.searchBuzzReels({
    keyword,
    period: 180,
    min_views: 30000,
    limit: 5
  });

  console.log(`✅ Found ${reels.length} buzz reels\n`);

  if (reels.length > 0) {
    console.log('Top Results:');
    reels.slice(0, 3).forEach((reel, i) => {
      console.log(`  ${i + 1}. ${reel.title.slice(0, 40)}...`);
      console.log(`     Views: ${reel.views.toLocaleString()}, Likes: ${reel.likes.toLocaleString()}`);
    });
  }

  console.log('\n🎉 System ready!');
  console.log('\nAvailable Services:');
  console.log('  F1: reelSearchService - バズリール検索');
  console.log('  F2: videoDownloadService - 動画ダウンロード');
  console.log('  F3: transcriptionService - 台本変換');
  console.log('  F4: buzzAnalysisService - バズ分析');
  console.log('  F5: threadsGeneratorService - Threads投稿生成');
  console.log('  F6: reelScriptGeneratorService - リール台本生成');
  console.log('  F7: captionGeneratorService - キャプション生成');
  console.log('  F8: commentGeneratorService - コメント生成');
}

// Run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
