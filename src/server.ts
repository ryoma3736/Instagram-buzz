/**
 * Instagram-buzz Web Server
 *
 * Express API server for Instagram buzz content generation
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { reelSearchService } from './services/reelSearchService.js';
import { videoDownloadService } from './services/videoDownloadService.js';
import { transcriptionService } from './services/transcriptionService.js';
import { buzzAnalysisService } from './services/buzzAnalysisService.js';
import { threadsGeneratorService } from './services/threadsGeneratorService.js';
import { reelScriptGeneratorService } from './services/reelScriptGeneratorService.js';
import { captionGeneratorService } from './services/captionGeneratorService.js';
import { commentGeneratorService } from './services/commentGeneratorService.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static('public'));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Instagram-buzz API'
  });
});

// Service status
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Instagram-buzz API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      'GET /health': 'Health check',
      'GET /api/services': 'List all available services',
      'POST /api/search': 'Search buzz reels (F1)',
      'POST /api/download': 'Download video (F2)',
      'POST /api/transcribe': 'Transcribe video (F3)',
      'POST /api/analyze': 'Analyze buzz (F4)',
      'POST /api/threads': 'Generate Threads post (F5)',
      'POST /api/script': 'Generate reel script (F6)',
      'POST /api/caption': 'Generate caption (F7)',
      'POST /api/comment': 'Generate comment (F8)'
    }
  });
});

// List all services
app.get('/api/services', (req: Request, res: Response) => {
  res.json({
    services: [
      { id: 'F1', name: 'ReelSearchService', description: 'バズリール検索' },
      { id: 'F2', name: 'VideoDownloadService', description: '動画ダウンロード' },
      { id: 'F3', name: 'TranscriptionService', description: '台本変換' },
      { id: 'F4', name: 'BuzzAnalysisService', description: 'バズ分析' },
      { id: 'F5', name: 'ThreadsGeneratorService', description: 'Threads投稿生成' },
      { id: 'F6', name: 'ReelScriptGeneratorService', description: 'リール台本生成' },
      { id: 'F7', name: 'CaptionGeneratorService', description: 'キャプション生成' },
      { id: 'F8', name: 'CommentGeneratorService', description: 'コメント生成' }
    ]
  });
});

// F1: Search buzz reels
app.post('/api/search', async (req: Request, res: Response) => {
  try {
    const { keyword, period = 180, min_views = 30000, limit = 10 } = req.body;

    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required' });
    }

    const reels = await reelSearchService.searchBuzzReels({
      keyword,
      period,
      min_views,
      limit
    });

    res.json({
      success: true,
      count: reels.length,
      data: reels
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// F2: Download video
app.post('/api/download', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    const filePath = await videoDownloadService.downloadVideo(url);

    res.json({
      success: true,
      data: { filePath }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// F3: Transcribe video
app.post('/api/transcribe', async (req: Request, res: Response) => {
  try {
    const { videoPath } = req.body;

    if (!videoPath) {
      return res.status(400).json({ error: 'videoPath is required' });
    }

    const transcript = await transcriptionService.transcribeVideo(videoPath);

    res.json({
      success: true,
      data: { transcript }
    });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// F4: Analyze buzz
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const { reels } = req.body;

    if (!reels || !Array.isArray(reels)) {
      return res.status(400).json({ error: 'reels array is required' });
    }

    const analysis = await buzzAnalysisService.analyzeBuzzPatterns(reels);

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// F5: Generate Threads post
app.post('/api/threads', async (req: Request, res: Response) => {
  try {
    const { theme, analysis } = req.body;

    if (!theme) {
      return res.status(400).json({ error: 'theme is required' });
    }

    const threadsPost = await threadsGeneratorService.generateThreadsPost(theme, analysis);

    res.json({
      success: true,
      data: threadsPost
    });
  } catch (error) {
    console.error('Threads generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// F6: Generate reel script
app.post('/api/script', async (req: Request, res: Response) => {
  try {
    const { theme, buzzAnalysis } = req.body;

    if (!theme) {
      return res.status(400).json({ error: 'theme is required' });
    }

    const script = await reelScriptGeneratorService.generateReelScript(theme, buzzAnalysis);

    res.json({
      success: true,
      data: script
    });
  } catch (error) {
    console.error('Script generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// F7: Generate caption
app.post('/api/caption', async (req: Request, res: Response) => {
  try {
    const { theme, targetAudience } = req.body;

    if (!theme) {
      return res.status(400).json({ error: 'theme is required' });
    }

    const caption = await captionGeneratorService.generateCaption(theme, targetAudience);

    res.json({
      success: true,
      data: { caption }
    });
  } catch (error) {
    console.error('Caption generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// F8: Generate comment
app.post('/api/comment', async (req: Request, res: Response) => {
  try {
    const { postContent, tone = 'friendly' } = req.body;

    if (!postContent) {
      return res.status(400).json({ error: 'postContent is required' });
    }

    const comment = await commentGeneratorService.generateComment(postContent, tone);

    res.json({
      success: true,
      data: { comment }
    });
  } catch (error) {
    console.error('Comment generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🌸 Instagram-buzz API Server`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 API docs: http://localhost:${PORT}/\n`);
  console.log(`Available Services:`);
  console.log(`  F1: POST /api/search - バズリール検索`);
  console.log(`  F2: POST /api/download - 動画ダウンロード`);
  console.log(`  F3: POST /api/transcribe - 台本変換`);
  console.log(`  F4: POST /api/analyze - バズ分析`);
  console.log(`  F5: POST /api/threads - Threads投稿生成`);
  console.log(`  F6: POST /api/script - リール台本生成`);
  console.log(`  F7: POST /api/caption - キャプション生成`);
  console.log(`  F8: POST /api/comment - コメント生成\n`);
});
