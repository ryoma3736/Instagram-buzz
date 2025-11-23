// F7: キャプション生成機能
import { Caption, Script } from '../types';
import Anthropic from '@anthropic-ai/sdk';

export class CaptionGeneratorService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    });
  }

  /**
   * リールキャプションを生成
   */
  async generateCaption(
    script: Script,
    profile?: string,
    template?: string
  ): Promise<Caption> {
    console.log('✏️ Generating caption...');

    const prompt = `添付のSNSプロフィールとテンプレートを参考に、下記元ネタの内容から、視点や角度を変えてワンページリールキャプションを生成してください。

##原本##
${script.full_text}

${profile ? `##SNSプロフィール##\n${profile}\n` : ''}

${template ? `##テンプレート##\n${template}\n` : `##キャプション構成##
1. フック（1行目で興味を引く）
2. 本文（価値を伝える、3-5行）
3. CTA（アクション促進）
4. ハッシュタグ（関連性の高いもの5-10個）
`}

以下のJSON形式で返してください：
{
  "main_text": "キャプション本文（改行含む）",
  "hashtags": ["tag1", "tag2", ...],
  "cta": "行動喚起文",
  "char_count": 文字数,
  "seo_score": 1-100のスコア
}

JSONのみを返してください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          return {
            main_text: result.main_text,
            hashtags: result.hashtags || [],
            cta: result.cta || '',
            char_count: result.main_text.length,
            seo_score: result.seo_score || 70
          };
        }
      }
    } catch (error) {
      console.error('Caption generation failed:', error);
    }

    return this.generateFallback(script);
  }

  /**
   * ハッシュタグ最適化
   */
  async optimizeHashtags(keywords: string[], niche: string): Promise<string[]> {
    const prompt = `以下のキーワードとニッチに基づいて、Instagram リールに最適なハッシュタグを生成してください。

キーワード: ${keywords.join(', ')}
ニッチ: ${niche}

条件:
- 大（100万+投稿）: 2-3個
- 中（10万-100万投稿）: 3-4個
- 小（1万-10万投稿）: 3-4個
- 合計10個以内

JSON配列で返してください: ["tag1", "tag2", ...]`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const match = content.text.match(/\[[\s\S]*\]/);
        if (match) {
          return JSON.parse(match[0]);
        }
      }
    } catch (error) {
      console.error('Hashtag optimization failed:', error);
    }

    return keywords.slice(0, 10);
  }

  /**
   * フォールバック生成
   */
  private generateFallback(script: Script): Caption {
    const keywords = script.keywords || [];
    const summary = script.summary || script.full_text.slice(0, 100);

    const mainText = `${summary}\n\n詳しくはプロフィールのリンクから👆`;

    return {
      main_text: mainText,
      hashtags: keywords.slice(0, 10),
      cta: 'プロフィールをチェック！',
      char_count: mainText.length,
      seo_score: 60
    };
  }

  /**
   * キャプションをフォーマット出力
   */
  formatCaption(caption: Caption): string {
    let output = caption.main_text + '\n\n';
    output += caption.cta + '\n\n';
    output += caption.hashtags.map(t => `#${t}`).join(' ');

    return output;
  }

  /**
   * コピー用テキスト生成
   */
  toCopyText(caption: Caption): string {
    return this.formatCaption(caption);
  }

  /**
   * SEOスコア計算
   */
  calculateSeoScore(caption: Caption): number {
    let score = 50;

    // 文字数チェック
    if (caption.char_count >= 100 && caption.char_count <= 300) score += 10;
    if (caption.char_count > 300 && caption.char_count <= 500) score += 5;

    // ハッシュタグ数
    if (caption.hashtags.length >= 5 && caption.hashtags.length <= 10) score += 15;
    if (caption.hashtags.length > 10 && caption.hashtags.length <= 15) score += 10;

    // CTAの存在
    if (caption.cta && caption.cta.length > 0) score += 10;

    // キーワード密度
    const keywordCount = caption.hashtags.filter(
      tag => caption.main_text.toLowerCase().includes(tag.toLowerCase())
    ).length;
    score += Math.min(keywordCount * 3, 15);

    return Math.min(score, 100);
  }
}

export const captionGeneratorService = new CaptionGeneratorService();
