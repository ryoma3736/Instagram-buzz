// F3: 動画→台本変換機能 - Gemini 3
import { Script, ScriptSegment } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { generateJSON } from '../utils/gemini.js';
import { parseLocalJsonOrNull } from '../utils/safeJsonParse.js';

export class TranscriptionService {
  private tempDir = './temp';

  constructor() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async transcribeVideo(videoPath: string): Promise<Script> {
    console.log(`📝 Transcribing video: ${videoPath}`);

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
      ffmpeg.on('close', code => code === 0 ? resolve(outputPath) : reject(new Error('FFmpeg failed')));
      ffmpeg.on('error', reject);
    });
  }

  private async transcribeAudio(audioPath: string): Promise<ScriptSegment[]> {
    // Whisper CLI fallback
    return new Promise(resolve => {
      const whisper = spawn('whisper', [audioPath, '--model', 'base', '--language', 'ja', '--output_format', 'json', '--output_dir', this.tempDir]);
      whisper.on('close', () => {
        const jsonPath = audioPath.replace('.wav', '.json');
        if (fs.existsSync(jsonPath)) {
          const data = parseLocalJsonOrNull<any>(fs.readFileSync(jsonPath, 'utf-8'), jsonPath);
          if (data) {
            resolve(data.segments?.map((s: any) => ({ start_time: s.start, end_time: s.end, text: s.text })) || []);
          } else {
            resolve([{ start_time: 0, end_time: 0, text: '[JSON解析に失敗]' }]);
          }
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
