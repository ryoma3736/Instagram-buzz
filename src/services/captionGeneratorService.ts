// F7: キャプション生成機能 - Gemini 3
import { Caption, Script } from "../types/index.js";
import { generateJSON } from "../utils/gemini.js";

export class CaptionGeneratorService {
  async generateCaption(script: Script): Promise<Caption> {
    console.log("Generating caption with Gemini 3...");
    const prompt = "Generate caption JSON: { main_text, hashtags, cta, char_count, seo_score }";
    const r = await generateJSON<Caption>(prompt);
    return r || { main_text: script.summary || "", hashtags: [], cta: "Check\!", char_count: 0, seo_score: 50 };
  }
}
export const captionGeneratorService = new CaptionGeneratorService();
