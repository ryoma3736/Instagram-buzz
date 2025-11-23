// F8: コメント生成機能 - Gemini 3
import { CommentSuggestion } from "../types/index.js";
import { generateJSON } from "../utils/gemini.js";

export class CommentGeneratorService {
  async generateReply(post: string, comment: string): Promise<CommentSuggestion> {
    const r = await generateJSON<CommentSuggestion>("reply JSON");
    return r || { suggestions: [{ text: "Thanks\!", tone: "friendly", emotional_impact: 7 }] };
  }
  async generateComment(post: string): Promise<CommentSuggestion> {
    const r = await generateJSON<CommentSuggestion>("comment JSON");
    return r || { suggestions: [{ text: "Nice\!", tone: "friendly", emotional_impact: 7 }] };
  }
}
export const commentGeneratorService = new CommentGeneratorService();
