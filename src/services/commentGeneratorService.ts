// F8: コメント返信生成機能
import { CommentSuggestion } from '../types';
import Anthropic from '@anthropic-ai/sdk';

export class CommentGeneratorService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    });
  }

  /**
   * コメントへの返信を生成
   */
  async generateReply(
    postContent: string,
    comment: string
  ): Promise<CommentSuggestion> {
    console.log('💬 Generating reply suggestions...');

    const prompt = `添付のポストに対して、下記のコメントがありました。印象の良い返信アイディアをおねがいします。

##投稿内容##
${postContent}

##もらったコメント##
${comment}

以下のJSON形式で3つの返信案を返してください：
{
  "suggestions": [
    {
      "text": "返信文",
      "tone": "トーン（フレンドリー/丁寧/ユーモア等）",
      "emotional_impact": 1-10のスコア
    }
  ]
}

JSONのみを返してください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as CommentSuggestion;
        }
      }
    } catch (error) {
      console.error('Reply generation failed:', error);
    }

    return this.getDefaultReplies();
  }

  /**
   * 投稿へのコメントを生成
   */
  async generateComment(postContent: string): Promise<CommentSuggestion> {
    console.log('💭 Generating comment suggestions...');

    const prompt = `添付のコンテンツに対して、印象の良くかつ感情が揺さぶられるコメントアイディアをおねがいします。

##投稿内容##
${postContent}

以下のJSON形式で3つのコメント案を返してください：
{
  "suggestions": [
    {
      "text": "コメント文",
      "tone": "トーン（共感/質問/称賛等）",
      "emotional_impact": 1-10のスコア
    }
  ]
}

条件:
- 自然で人間らしい表現
- 投稿者との関係構築を意識
- スパムっぽくない

JSONのみを返してください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as CommentSuggestion;
        }
      }
    } catch (error) {
      console.error('Comment generation failed:', error);
    }

    return this.getDefaultComments();
  }

  /**
   * バッチ返信生成（複数コメントへの返信）
   */
  async generateBatchReplies(
    postContent: string,
    comments: string[]
  ): Promise<Map<string, CommentSuggestion>> {
    const results = new Map<string, CommentSuggestion>();

    // 並列処理
    const promises = comments.map(async (comment) => {
      const reply = await this.generateReply(postContent, comment);
      return { comment, reply };
    });

    const responses = await Promise.all(promises);

    responses.forEach(({ comment, reply }) => {
      results.set(comment, reply);
    });

    return results;
  }

  /**
   * デフォルト返信
   */
  private getDefaultReplies(): CommentSuggestion {
    return {
      suggestions: [
        {
          text: 'コメントありがとうございます！嬉しいです😊',
          tone: 'フレンドリー',
          emotional_impact: 7
        },
        {
          text: 'ありがとうございます！参考になれば幸いです。',
          tone: '丁寧',
          emotional_impact: 6
        },
        {
          text: 'そう言っていただけて励みになります！',
          tone: '感謝',
          emotional_impact: 8
        }
      ]
    };
  }

  /**
   * デフォルトコメント
   */
  private getDefaultComments(): CommentSuggestion {
    return {
      suggestions: [
        {
          text: 'これすごく参考になりました！保存しました📌',
          tone: '共感',
          emotional_impact: 7
        },
        {
          text: 'もっと詳しく知りたいです！続編お願いします🙏',
          tone: '質問',
          emotional_impact: 8
        },
        {
          text: '分かりやすくまとめてくださってありがとうございます！',
          tone: '称賛',
          emotional_impact: 7
        }
      ]
    };
  }

  /**
   * 提案をフォーマット出力
   */
  formatSuggestions(suggestion: CommentSuggestion): string {
    let output = '# コメント提案\n\n';

    suggestion.suggestions.forEach((s, i) => {
      output += `## 案${i + 1}\n`;
      output += `**トーン:** ${s.tone}\n`;
      output += `**インパクト:** ${s.emotional_impact}/10\n`;
      output += `\n\`\`\`\n${s.text}\n\`\`\`\n\n`;
    });

    return output;
  }
}

export const commentGeneratorService = new CommentGeneratorService();
