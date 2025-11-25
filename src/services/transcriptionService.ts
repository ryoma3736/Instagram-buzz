// F3: 動画→台本変換機能 - Gemini 3
import { Script, ScriptSegment } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';
import { generateJSON } from '../utils/gemini.js';

export interface FFmpegNotFoundError {
  error: string;
  instructions: {
    macOS: string;
    'Ubuntu/Debian': string;
    Windows: string;
  };
}

export class TranscriptionService {
  private tempDir = './temp';
  private ffmpegAvailable: boolean | null = null;

  constructor() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private checkFFmpegInstalled(): boolean {
    if (this.ffmpegAvailable !== null) {
      return this.ffmpegAvailable;
    }
    try {
      const command = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
      execSync(command, { stdio: 'ignore' });
      this.ffmpegAvailable = true;
      return true;
    } catch {
      this.ffmpegAvailable = false;
      return false;
    }
  }

  getFFmpegNotFoundError(): FFmpegNotFoundError {
    return {
      error: 'ffmpeg is not installed. Please install it first:',
      instructions: {
        macOS: 'brew install ffmpeg',
        'Ubuntu/Debian': 'sudo apt-get install ffmpeg',
        Windows: 'Download from https://ffmpeg.org/download.html'
      }
    };
  }

  async transcribeVideo(videoPath: string): Promise<Script> {
    console.log(`📝 Transcribing video: ${videoPath}`);

    if (!this.checkFFmpegInstalled()) {
      const errorInfo = this.getFFmpegNotFoundError();
      throw new Error(`${errorInfo.error} macOS: ${errorInfo.instructions.macOS}`);
    }

    const audioPath = await this.extractAudio(videoPath);
    const segments = await this.transcribeAudio(audioPath);
    const fullText = segments.map(s => s.text).join('\n');
    const structured = await this.structureScript(fullText);

    try { fs.unlinkSync(audioPath); } catch {}

    return { full_text: fullText, segments, ...structured };
  }

  private extractAudio(videoPath: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `audio_${Date.now()}.wav`);
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ['-i', videoPath, '-vn', '-ar', '16000', '-ac', '1', '-y', outputPath]);

      ffmpeg.on('close', code => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg failed with exit code ${code}`));
        }
      });

      ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          const errorInfo = this.getFFmpegNotFoundError();
          reject(new Error(`${errorInfo.error} macOS: ${errorInfo.instructions.macOS}`));
        } else {
          reject(err);
        }
      });
    });
  }

  private async transcribeAudio(audioPath: string): Promise<ScriptSegment[]> {
    // Whisper CLI fallback
    return new Promise(resolve => {
      const whisper = spawn('whisper', [audioPath, '--model', 'base', '--language', 'ja', '--output_format', 'json', '--output_dir', this.tempDir]);
      whisper.on('close', () => {
        const jsonPath = audioPath.replace('.wav', '.json');
        if (fs.existsSync(jsonPath)) {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          resolve(data.segments?.map((s: any) => ({ start_time: s.start, end_time: s.end, text: s.text })) || []);
        } else {
          resolve([{ start_time: 0, end_time: 0, text: '[音声認識に失敗]' }]);
        }
      });
      whisper.on('error', () => resolve([{ start_time: 0, end_time: 0, text: '[whisper未インストール]' }]));
    });
  }

  private async structureScript(text: string): Promise<{ summary: string; keywords: string[] }> {
    const prompt = `台本を分析してください。

${text}

JSON形式で返してください：
{ "summary": "100文字要約", "keywords": ["キーワード1", "キーワード2"] }`;

    const result = await generateJSON<{ summary: string; keywords: string[] }>(prompt);
    return result || { summary: text.slice(0, 100), keywords: [] };
  }

  async createScriptFromText(text: string): Promise<Script> {
    const structured = await this.structureScript(text);
    return { full_text: text, segments: [{ start_time: 0, end_time: 0, text }], ...structured };
  }
}

export const transcriptionService = new TranscriptionService();
