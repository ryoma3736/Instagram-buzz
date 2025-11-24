// F2: 動画ダウンロード機能
import { DownloadResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { safeJsonParse } from '../utils/safeJsonParse.js';

const DOWNLOAD_DIR = './downloads';
const SNAPINSTA_API = 'https://snapinsta.to';

export class VideoDownloadService {
  private downloadDir: string;

  constructor(downloadDir?: string) {
    this.downloadDir = downloadDir || DOWNLOAD_DIR;
    this.ensureDownloadDir();
  }

  /**
   * ダウンロードディレクトリを確保
   */
  private ensureDownloadDir(): void {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * Instagram リール動画をダウンロード
   */
  async downloadReel(url: string, outputPath?: string): Promise<DownloadResult> {
    console.log(`📥 Downloading reel: ${url}`);

    const filename = outputPath || this.generateFilename(url);
    const fullPath = path.join(this.downloadDir, filename);

    try {
      // Method 1: yt-dlp (推奨)
      const result = await this.downloadWithYtDlp(url, fullPath);
      if (result.success) return result;

      // Method 2: Snapinsta API
      const result2 = await this.downloadWithSnapinsta(url, fullPath);
      if (result2.success) return result2;

      // Method 3: Direct fetch
      return await this.downloadDirect(url, fullPath);
    } catch (error) {
      return {
        success: false,
        file_path: '',
        file_size: 0,
        duration: 0,
        format: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * yt-dlp を使用してダウンロード
   */
  private async downloadWithYtDlp(url: string, outputPath: string): Promise<DownloadResult> {
    return new Promise((resolve) => {
      const args = [
        url,
        '-o', outputPath,
        '--format', 'best[ext=mp4]/best',
        '--no-warnings',
        '-q'
      ];

      const process = spawn('yt-dlp', args);
      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', async (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          const duration = await this.getVideoDuration(outputPath);

          resolve({
            success: true,
            file_path: outputPath,
            file_size: stats.size,
            duration,
            format: 'mp4'
          });
        } else {
          resolve({
            success: false,
            file_path: '',
            file_size: 0,
            duration: 0,
            format: '',
            error: stderr || 'yt-dlp failed'
          });
        }
      });

      process.on('error', () => {
        resolve({
          success: false,
          file_path: '',
          file_size: 0,
          duration: 0,
          format: '',
          error: 'yt-dlp not installed'
        });
      });
    });
  }

  /**
   * Snapinsta API を使用してダウンロード
   */
  private async downloadWithSnapinsta(url: string, outputPath: string): Promise<DownloadResult> {
    try {
      // Snapinsta API call
      const response = await fetch(`${SNAPINSTA_API}/api/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `url=${encodeURIComponent(url)}`
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const text = await response.text();

      // Safe JSON parse with HTML detection
      const data = safeJsonParse<any>(text, 'Snapinsta API');

      const videoUrl = data.url || data.video_url;

      if (!videoUrl) {
        throw new Error('No video URL in response');
      }

      // Download video file
      const videoResponse = await fetch(videoUrl);
      const buffer = await videoResponse.arrayBuffer();

      fs.writeFileSync(outputPath, Buffer.from(buffer));

      const stats = fs.statSync(outputPath);
      const duration = await this.getVideoDuration(outputPath);

      return {
        success: true,
        file_path: outputPath,
        file_size: stats.size,
        duration,
        format: 'mp4'
      };
    } catch (error) {
      return {
        success: false,
        file_path: '',
        file_size: 0,
        duration: 0,
        format: '',
        error: error instanceof Error ? error.message : 'Snapinsta failed'
      };
    }
  }

  /**
   * 直接ダウンロード（フォールバック）
   */
  private async downloadDirect(url: string, outputPath: string): Promise<DownloadResult> {
    try {
      // Instagram oEmbed API で動画URLを取得
      const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
      const response = await fetch(oembedUrl);

      if (!response.ok) {
        throw new Error('Failed to get oEmbed data');
      }

      const oembedText = await response.text();

      // Safe JSON parse with HTML detection (oEmbed API)
      const _data = safeJsonParse<any>(oembedText, 'oEmbed API');

      // この方法では直接動画URLは取得できないため、
      // ページをパースする必要がある
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const html = await pageResponse.text();
      const videoUrlMatch = html.match(/"video_url":"([^"]+)"/);

      if (!videoUrlMatch) {
        throw new Error('Video URL not found in page');
      }

      const videoUrl = videoUrlMatch[1].replace(/\\u0026/g, '&');
      const videoResponse = await fetch(videoUrl);
      const buffer = await videoResponse.arrayBuffer();

      fs.writeFileSync(outputPath, Buffer.from(buffer));

      const stats = fs.statSync(outputPath);

      return {
        success: true,
        file_path: outputPath,
        file_size: stats.size,
        duration: 0, // Duration not available in this method
        format: 'mp4'
      };
    } catch (error) {
      return {
        success: false,
        file_path: '',
        file_size: 0,
        duration: 0,
        format: '',
        error: error instanceof Error ? error.message : 'Direct download failed'
      };
    }
  }

  /**
   * 動画の長さを取得
   */
  private async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', () => {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      });

      ffprobe.on('error', () => {
        resolve(0);
      });
    });
  }

  /**
   * ファイル名を生成
   */
  private generateFilename(url: string): string {
    const shortcode = this.extractShortcode(url) || 'video';
    const timestamp = Date.now();
    return `${shortcode}_${timestamp}.mp4`;
  }

  /**
   * URLからshortcodeを抽出
   */
  private extractShortcode(url: string): string | null {
    const match = url.match(/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * ダウンロード済みファイル一覧
   */
  listDownloads(): string[] {
    if (!fs.existsSync(this.downloadDir)) return [];
    return fs.readdirSync(this.downloadDir)
      .filter(f => f.endsWith('.mp4'))
      .map(f => path.join(this.downloadDir, f));
  }

  /**
   * ファイル削除
   */
  deleteFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const videoDownloadService = new VideoDownloadService();
