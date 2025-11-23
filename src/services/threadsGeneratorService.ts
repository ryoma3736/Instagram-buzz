// F5: Threads投稿生成機能
import { ThreadsPost, Script, BuzzAnalysis } from '../types';
import Anthropic from '@anthropic-ai/sdk';

export class ThreadsGeneratorService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    });
  }

  /**
   * Threads投稿を生成
   */
  async generateThreadsPost(
    script: Script,
    analysis: BuzzAnalysis,
    title: string
  ): Promise<ThreadsPost> {
    console.log('📱 Generating Threads post...');

    const prompt = `添付の２段階の文章構成で、「${title}」に関して、バズ分析を全て取り入れ、視点や角度を変えて、一般的な日本人にわかりやすい表現でリプライ型のバズるThreads新たな投稿を２段階にまとめて作ってください。
太字、絵文字不要です。

##原本##
${script.full_text}

##バズ分析結果##
- フック: ${analysis.hook.description}
- 感情トリガー: ${analysis.emotional_triggers.join(', ')}
- ターゲット: ${analysis.target_audience}

以下のJSON形式で返してください：
{
  "post1": {
    "text": "1投稿目のテキスト（最大500文字）",
    "char_count": 文字数
  },
  "post2": {
    "text": "2投稿目のテキスト（リプライ、最大500文字）",
    "char_count": 文字数
  },
  "hashtags": ["ハッシュタグ1", "ハッシュタグ2"]
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
          const result = JSON.parse(jsonMatch[0]);
          return {
            post1: {
              text: result.post1.text,
              char_count: result.post1.text.length
            },
            post2: {
              text: result.post2.text,
              char_count: result.post2.text.length
            },
            hashtags: result.hashtags || []
          };
        }
      }
    } catch (error) {
      console.error('Generation failed:', error);
    }

    return this.generateFallback(script, title);
  }

  /**
   * シンプル生成（分析なし）
   */
  async generateSimple(text: string, title: string): Promise<ThreadsPost> {
    const prompt = `以下の内容を元に、Threads用の2段階投稿を作成してください。
タイトル: ${title}

内容:
${text}

条件:
- 太字、絵文字不使用
- 1投稿目: フックと主要メッセージ
- 2投稿目: 詳細とCTA
- 各投稿500文字以内

JSON形式で返してください：
{
  "post1": { "text": "...", "char_count": 数字 },
  "post2": { "text": "...", "char_count": 数字 },
  "hashtags": ["tag1", "tag2"]
}`;

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
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (error) {
      console.error('Simple generation failed:', error);
    }

    return this.generateFallback({ full_text: text, segments: [], summary: '', keywords: [] }, title);
  }

  /**
   * フォールバック生成
   */
  private generateFallback(script: Script, title: string): ThreadsPost {
    const text = script.full_text;
    const sentences = text.split(/[。！？]/).filter(s => s.trim());

    const post1Text = `${title}\n\n${sentences.slice(0, 3).join('。')}。`;
    const post2Text = sentences.slice(3, 6).join('。') + '。\n\n詳しくはプロフィールのリンクから';

    return {
      post1: {
        text: post1Text.slice(0, 500),
        char_count: Math.min(post1Text.length, 500)
      },
      post2: {
        text: post2Text.slice(0, 500),
        char_count: Math.min(post2Text.length, 500)
      },
      hashtags: script.keywords?.slice(0, 5) || []
    };
  }

  /**
   * 投稿をフォーマット出力
   */
  formatPost(post: ThreadsPost): string {
    let output = '# Threads投稿\n\n';

    output += '## 1投稿目\n';
    output += '```\n' + post.post1.text + '\n```\n';
    output += `(${post.post1.char_count}文字)\n\n`;

    output += '## 2投稿目（リプライ）\n';
    output += '```\n' + post.post2.text + '\n```\n';
    output += `(${post.post2.char_count}文字)\n\n`;

    output += '## ハッシュタグ\n';
    output += post.hashtags.map(t => `#${t}`).join(' ') + '\n';

    return output;
  }
}

export const threadsGeneratorService = new ThreadsGeneratorService();
