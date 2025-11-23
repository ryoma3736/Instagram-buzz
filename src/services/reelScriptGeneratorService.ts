// F6: リール台本生成機能
import { ReelScript, Script } from '../types';
import Anthropic from '@anthropic-ai/sdk';

export class ReelScriptGeneratorService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    });
  }

  /**
   * ワンページリール台本を生成
   */
  async generateReelScript(script: Script, angle?: string): Promise<ReelScript> {
    console.log('🎬 Generating reel script...');

    const prompt = `添付のテンプレートをもとに、下記元ネタの内容から、視点や角度を変えてワンページリール台本を生成してください。

##原本##
${script.full_text}

${angle ? `##指定された切り口##\n${angle}\n` : ''}

##ワンページリール台本テンプレート##
1. タイトル（10文字以内、インパクト重視）
2. フック（最初の3秒で注目を集める一言）
3. メインコンテンツ（3-5ポイント、各ポイントは1-2文）
4. CTA（行動喚起）
5. 想定尺（秒数）
6. ビジュアルノート（撮影・編集のヒント）

以下のJSON形式で返してください：
{
  "title": "タイトル",
  "hook": "フックの一言",
  "main_content": [
    { "point": "ポイント1", "detail": "詳細" },
    { "point": "ポイント2", "detail": "詳細" }
  ],
  "cta": "行動喚起",
  "duration_estimate": 秒数,
  "visual_notes": ["ノート1", "ノート2"]
}

JSONのみを返してください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as ReelScript;
        }
      }
    } catch (error) {
      console.error('Script generation failed:', error);
    }

    return this.generateFallback(script);
  }

  /**
   * 複数バリエーション生成
   */
  async generateVariations(script: Script, count: number = 3): Promise<ReelScript[]> {
    const angles = [
      '初心者向けに分かりやすく',
      '専門家の視点で深掘り',
      'エンタメ性を重視して',
      '実践的なHow-to形式で',
      'ストーリー仕立てで'
    ];

    const results: ReelScript[] = [];

    for (let i = 0; i < Math.min(count, angles.length); i++) {
      const result = await this.generateReelScript(script, angles[i]);
      results.push(result);
    }

    return results;
  }

  /**
   * フォールバック生成
   */
  private generateFallback(script: Script): ReelScript {
    const keywords = script.keywords || [];
    const summary = script.summary || script.full_text.slice(0, 100);

    return {
      title: keywords[0] || 'タイトル',
      hook: `${keywords[0] || 'これ'}知ってた？`,
      main_content: [
        { point: 'ポイント1', detail: summary.slice(0, 50) },
        { point: 'ポイント2', detail: summary.slice(50, 100) },
        { point: 'ポイント3', detail: 'まとめ' }
      ],
      cta: 'フォローして続きをチェック！',
      duration_estimate: 30,
      visual_notes: [
        '顔出しで親近感アップ',
        'テロップで要点を強調',
        'BGMはトレンド音源を使用'
      ]
    };
  }

  /**
   * 台本をテキスト形式で出力
   */
  formatScript(script: ReelScript): string {
    let output = '# リール台本\n\n';

    output += `## タイトル\n${script.title}\n\n`;
    output += `## フック（最初の3秒）\n「${script.hook}」\n\n`;

    output += '## メインコンテンツ\n';
    script.main_content.forEach((item, i) => {
      output += `### ${i + 1}. ${item.point}\n`;
      output += `${item.detail}\n\n`;
    });

    output += `## CTA\n${script.cta}\n\n`;
    output += `## 想定尺\n${script.duration_estimate}秒\n\n`;

    output += '## ビジュアルノート\n';
    script.visual_notes.forEach(note => {
      output += `- ${note}\n`;
    });

    return output;
  }

  /**
   * 撮影用シンプルスクリプト
   */
  toShootingScript(script: ReelScript): string {
    let output = '【撮影用台本】\n\n';

    output += `[0:00] ${script.hook}\n\n`;

    let time = 3;
    script.main_content.forEach((item, i) => {
      output += `[0:${time.toString().padStart(2, '0')}] ${item.point}\n`;
      output += `       ${item.detail}\n\n`;
      time += 5;
    });

    output += `[0:${time.toString().padStart(2, '0')}] ${script.cta}\n`;

    return output;
  }
}

export const reelScriptGeneratorService = new ReelScriptGeneratorService();
