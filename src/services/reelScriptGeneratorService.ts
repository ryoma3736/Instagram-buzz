// F6: リール台本生成機能 - Gemini 3
import { ReelScript, Script } from "../types/index.js";
import { generateJSON } from "../utils/gemini.js";

export class ReelScriptGeneratorService {
  async generateReelScript(script: Script): Promise<ReelScript> {
    const r = await generateJSON<ReelScript>("reel script JSON");
    return r || { title: "Title", hook: "Hook", main_content: [{ point: "P", detail: "D" }], cta: "CTA", duration_estimate: 30, visual_notes: [] };
  }
}
export const reelScriptGeneratorService = new ReelScriptGeneratorService();
