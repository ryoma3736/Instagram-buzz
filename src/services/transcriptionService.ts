// F3: 動画→台本変換機能
import { Script, ScriptSegment } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

const WHISPER_MODEL = 'whisper-1';

export class TranscriptionService {
  private anthropic: Anthropic;
  private openaiApiKey: string;
  private tempDir: string;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    });
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.tempDir = './temp';
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 動画を台本に変換
   */
  async transcribeVideo(videoPath: string, language: string = 'ja'): Promise<Script> {
    console.log(`📝 Transcribing video: ${videoPath}`);

    // Step 1: 音声抽出
    const audioPath = await this.extractAudio(videoPath);

    // Step 2: 音声認識
    let segments: ScriptSegment[];
    try {
      segments = await this.transcribeWithWhisper(audioPath, language);
    } catch (error) {
      console.warn('Whisper failed, trying local transcription');
      segments = await this.transcribeLocal(audioPath);
    }

    // Step 3: 台本構造化
    const fullText = segments.map(s => s.text).join('\n');
    const structuredScript = await this.structureScript(fullText);

    // Cleanup
    this.cleanup(audioPath);

    return {
      full_text: fullText,
      segments,
      summary: structuredScript.summary,
      keywords: structuredScript.keywords
    };
  }

  /**
   * 動画から音声を抽出
   */
  private async extractAudio(videoPath: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `audio_${Date.now()}.wav`);

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y',
        outputPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg failed with code ${code}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Whisper APIで音声認識
   */
  private async transcribeWithWhisper(audioPath: string, language: string): Promise<ScriptSegment[]> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not set');
    }

    const audioData = fs.readFileSync(audioPath);
    const blob = new Blob([audioData], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, 'audio.wav');
    formData.append('model', WHISPER_MODEL);
    formData.append('language', language);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.status}`);
    }

    const data = await response.json();

    return (data.segments || []).map((seg: any) => ({
      start_time: seg.start,
      end_time: seg.end,
      text: seg.text.trim()
    }));
  }

  /**
   * ローカル音声認識（フォールバック）
   */
  private async transcribeLocal(audioPath: string): Promise<ScriptSegment[]> {
    // whisper.cpp または他のローカルモデルを使用
    return new Promise((resolve) => {
      const whisper = spawn('whisper', [
        audioPath,
        '--model', 'base',
        '--language', 'ja',
        '--output_format', 'json',
        '--output_dir', this.tempDir
      ]);

      whisper.on('close', () => {
        const jsonPath = audioPath.replace('.wav', '.json');
        if (fs.existsSync(jsonPath)) {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          resolve(data.segments?.map((seg: any) => ({
            start_time: seg.start,
            end_time: seg.end,
            text: seg.text.trim()
          })) || []);
        } else {
          // 最終フォールバック: 空の結果
          resolve([{
            start_time: 0,
            end_time: 0,
            text: '[音声認識に失敗しました。手動で台本を入力してください]'
          }]);
        }
      });

      whisper.on('error', () => {
        resolve([{
          start_time: 0,
          end_time: 0,
          text: '[音声認識ツールがインストールされていません]'
        }]);
      });
    });
  }

  /**
   * Claude APIで台本を構造化
   */
  private async structureScript(text: string): Promise<{ summary: string; keywords: string[] }> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `以下の動画台本を分析し、JSONで返してください：

台本:
${text}

出力形式:
{
  "summary": "100文字以内の要約",
  "keywords": ["キーワード1", "キーワード2", ...]
}

JSONのみを返してください。`
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const parsed = JSON.parse(content.text);
        return {
          summary: parsed.summary || '',
          keywords: parsed.keywords || []
        };
      }
    } catch (error) {
      console.error('Claude API error:', error);
    }

    // フォールバック
    return {
      summary: text.slice(0, 100) + '...',
      keywords: this.extractKeywordsSimple(text)
    };
  }

  /**
   * 簡易キーワード抽出
   */
  private extractKeywordsSimple(text: string): string[] {
    const words = text
      .replace(/[。、！？\n]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    const freq: Record<string, number> = {};
    words.forEach(w => {
      freq[w] = (freq[w] || 0) + 1;
    });

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * テンポラリファイルの削除
   */
  private cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * テキストから直接台本を生成（動画なしの場合）
   */
  async createScriptFromText(text: string): Promise<Script> {
    const structured = await this.structureScript(text);

    return {
      full_text: text,
      segments: [{
        start_time: 0,
        end_time: 0,
        text
      }],
      summary: structured.summary,
      keywords: structured.keywords
    };
  }

  /**
   * 台本をフォーマット出力
   */
  formatScript(script: Script): string {
    let output = '# 動画台本\n\n';
    output += `## 要約\n${script.summary}\n\n`;
    output += `## キーワード\n${script.keywords.join(', ')}\n\n`;
    output += `## 全文\n${script.full_text}\n\n`;

    if (script.segments.length > 1) {
      output += '## タイムスタンプ付き\n';
      script.segments.forEach(seg => {
        const start = this.formatTime(seg.start_time);
        const end = this.formatTime(seg.end_time);
        output += `[${start} - ${end}] ${seg.text}\n`;
      });
    }

    return output;
  }

  /**
   * 時間フォーマット
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

export const transcriptionService = new TranscriptionService();
