// Instagram-buzz Type Definitions

export interface BuzzReel {
  id: string;
  url: string;
  shortcode: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  posted_at: Date;
  author: {
    username: string;
    followers: number;
  };
  thumbnail_url?: string;
}

export interface SearchParams {
  keyword: string;
  period?: number; // days, default 180
  min_views?: number; // default 30000
  limit?: number; // default 10
}

export interface DownloadResult {
  success: boolean;
  file_path: string;
  file_size: number;
  duration: number;
  format: string;
  error?: string;
}

export interface ScriptSegment {
  start_time: number;
  end_time: number;
  text: string;
  speaker?: string;
}

export interface Script {
  full_text: string;
  segments: ScriptSegment[];
  summary: string;
  keywords: string[];
}

export interface BuzzAnalysis {
  hook: {
    type: string;
    effectiveness: number;
    description: string;
  };
  structure: {
    opening: string;
    body: string;
    closing: string;
  };
  emotional_triggers: string[];
  viral_factors: {
    factor: string;
    score: number;
    explanation: string;
  }[];
  target_audience: string;
  recommendations: string[];
}

export interface ThreadsPost {
  post1: {
    text: string;
    char_count: number;
  };
  post2: {
    text: string;
    char_count: number;
  };
  hashtags: string[];
}

export interface ReelScript {
  title: string;
  hook: string;
  main_content: {
    point: string;
    detail: string;
  }[];
  cta: string;
  duration_estimate: number;
  visual_notes: string[];
}

export interface Caption {
  main_text: string;
  hashtags: string[];
  cta: string;
  char_count: number;
  seo_score: number;
}

export interface CommentSuggestion {
  suggestions: {
    text: string;
    tone: string;
    emotional_impact: number;
  }[];
}
