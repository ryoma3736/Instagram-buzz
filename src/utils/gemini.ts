// Gemini 3 Client Utility
import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL = 'gemini-3-pro-preview';

// Initialize Gemini client with API key
export const gemini = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });

/**
 * Generate text content using Gemini 3
 */
export async function generateContent(prompt: string): Promise<string> {
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  return response.text || '';
}

/**
 * Generate JSON response using Gemini 3
 */
export async function generateJSON<T>(prompt: string): Promise<T | null> {
  try {
    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt + '\n\nJSONのみを返してください。マークダウンのコードブロックは不要です。',
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    return null;
  } catch (error) {
    console.error('Gemini JSON generation failed:', error);
    return null;
  }
}

export { GEMINI_MODEL };
