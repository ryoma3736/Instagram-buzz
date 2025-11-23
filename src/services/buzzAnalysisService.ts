// F4: バズ理由分析機能 - Gemini 3
import { BuzzAnalysis, Script } from '../types/index.js';
import { generateJSON } from '../utils/gemini.js';

export class BuzzAnalysisService {
  /**
   * 台本からバズ理由を分析
   */
  async analyzeBuzzFactors(script: Script, metrics?: { views: number; likes: number; comments: number }): Promise<BuzzAnalysis> {
    console.log('🔬 Analyzing buzz factors with Gemini 3...');

    const prompt = `以下のバズったコンテンツを詳細に分析してください。

##原本##
${script.full_text}

${metrics ? `
##指標##
- 再生数: ${metrics.views}
- いいね: ${metrics.likes}
- コメント: ${metrics.comments}
` : ''}

以下のJSON形式で分析結果を返してください：
{
  "hook": {
    "type": "フックの種類（疑問形/衝撃/共感/数字/etc）",
    "effectiveness": 1-10のスコア,
    "description": "フックの説明"
  },
  "structure": {
    "opening": "冒頭の構成分析",
    "body": "本文の構成分析",
    "closing": "締めの構成分析"
  },
  "emotional_triggers": ["感情トリガー1", "感情トリガー2"],
  "viral_factors": [
    {
      "factor": "バイラル要因",
      "score": 1-10,
      "explanation": "説明"
    }
  ],
  "target_audience": "ターゲット層の分析",
  "recommendations": ["改善点1", "改善点2"]
}`;

    const result = await generateJSON<BuzzAnalysis>(prompt);
    return result || this.getDefaultAnalysis();
  }

  /**
   * クイック分析（簡易版）
   */
  async quickAnalyze(text: string): Promise<string[]> {
    const factors: string[] = [];

    // フック分析
    if (text.match(/^(なぜ|どうして|知ってた|実は|衝撃)/)) {
      factors.push('強力なフック（疑問/衝撃系）');
    }
    if (text.match(/\d+[つ個%円]/)) {
      factors.push('具体的な数字を使用');
    }
    if (text.match(/(あなた|みんな|私たち)/)) {
      factors.push('読者への直接的な呼びかけ');
    }
    if (text.match(/(簡単|すぐ|たった|だけで)/)) {
      factors.push('手軽さ・即効性の訴求');
    }
    if (text.match(/(驚き|ヤバい|マジで|本当に)/)) {
      factors.push('感情的な表現');
    }
    if (text.length < 500) {
      factors.push('短くて読みやすい');
    }

    return factors;
  }

  /**
   * デフォルト分析結果
   */
  private getDefaultAnalysis(): BuzzAnalysis {
    return {
      hook: {
        type: 'unknown',
        effectiveness: 5,
        description: '分析に失敗しました'
      },
      structure: {
        opening: '不明',
        body: '不明',
        closing: '不明'
      },
      emotional_triggers: [],
      viral_factors: [],
      target_audience: '一般',
      recommendations: ['手動で分析を行ってください']
    };
  }

  /**
   * 分析結果をMarkdown形式で出力
   */
  formatAnalysis(analysis: BuzzAnalysis): string {
    let output = '# バズ分析レポート\n\n';

    output += '## フック分析\n';
    output += `- タイプ: ${analysis.hook.type}\n`;
    output += `- 効果度: ${analysis.hook.effectiveness}/10\n`;
    output += `- 説明: ${analysis.hook.description}\n\n`;

    output += '## 構成分析\n';
    output += `- 冒頭: ${analysis.structure.opening}\n`;
    output += `- 本文: ${analysis.structure.body}\n`;
    output += `- 締め: ${analysis.structure.closing}\n\n`;

    output += '## 感情トリガー\n';
    analysis.emotional_triggers.forEach(t => {
      output += `- ${t}\n`;
    });
    output += '\n';

    output += '## バイラル要因\n';
    analysis.viral_factors.forEach(f => {
      output += `### ${f.factor} (${f.score}/10)\n`;
      output += `${f.explanation}\n\n`;
    });

    output += `## ターゲット層\n${analysis.target_audience}\n\n`;

    output += '## 改善提案\n';
    analysis.recommendations.forEach((r, i) => {
      output += `${i + 1}. ${r}\n`;
    });

    return output;
  }
}

export const buzzAnalysisService = new BuzzAnalysisService();
