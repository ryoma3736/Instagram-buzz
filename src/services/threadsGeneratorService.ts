// F5: Threads投稿生成機能 - Gemini 3
import { ThreadsPost, Script, BuzzAnalysis } from '../types/index.js';
import { generateJSON } from '../utils/gemini.js';

export class ThreadsGeneratorService {
  async generateThreadsPost(script: Script, analysis: BuzzAnalysis, title: string): Promise<ThreadsPost> {
    console.log('📱 Generating Threads post with Gemini 3...');

    const prompt = `「${title}」に関して、バズるThreads投稿を2段階で作成してください。
太字、絵文字不要。

##原本##
${script.full_text}

##バズ分析##
- フック: ${analysis.hook.description}
- ターゲット: ${analysis.target_audience}

以下のJSON形式で返してください：
{
  "post1": { "text": "1投稿目（最大500文字）", "char_count": 文字数 },
  "post2": { "text": "2投稿目リプライ（最大500文字）", "char_count": 文字数 },
  "hashtags": ["tag1", "tag2"]
}`;

    const result = await generateJSON<ThreadsPost>(prompt);
    if (result) {
      return {
        post1: { text: result.post1.text, char_count: result.post1.text.length },
        post2: { text: result.post2.text, char_count: result.post2.text.length },
        hashtags: result.hashtags || []
      };
    }
    return this.getDefault(script, title);
  }

  private getDefault(script: Script, title: string): ThreadsPost {
    const text = script.full_text.slice(0, 400);
    return {
      post1: { text: `${title}\n\n${text}`, char_count: text.length + title.length },
      post2: { text: '続きはプロフィールから', char_count: 12 },
      hashtags: script.keywords?.slice(0, 5) || []
    };
  }
}

export const threadsGeneratorService = new ThreadsGeneratorService();
