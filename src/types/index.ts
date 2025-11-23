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

// 2FA (Two-Factor Authentication) Types

/**
 * 2FA method types supported by Instagram
 */
export type TwoFactorMethod = 'totp' | 'sms' | 'backup_code';

/**
 * 2FA challenge status
 */
export type TwoFactorStatus = 'pending' | 'success' | 'failed' | 'timeout' | 'cancelled';

/**
 * 2FA challenge information from Instagram
 */
export interface TwoFactorChallenge {
  /** Unique identifier for the 2FA challenge */
  challengeId: string;
  /** Available 2FA methods */
  methods: TwoFactorMethod[];
  /** Phone number hint for SMS (e.g., "***-***-1234") */
  phoneNumberHint?: string;
  /** Whether TOTP (authenticator app) is available */
  totpAvailable: boolean;
  /** Challenge expiration timestamp */
  expiresAt: Date;
  /** User identifier for the challenge */
  userId?: string;
}

/**
 * 2FA verification result
 */
export interface TwoFactorResult {
  /** Whether verification was successful */
  success: boolean;
  /** Status of the verification */
  status: TwoFactorStatus;
  /** Error message if failed */
  error?: string;
  /** Session cookies after successful verification */
  sessionCookies?: string;
  /** Retry count remaining */
  retriesRemaining?: number;
}

/**
 * TOTP generator configuration
 */
export interface TOTPConfig {
  /** TOTP secret key (base32 encoded) */
  secret: string;
  /** Time step in seconds (default: 30) */
  step?: number;
  /** Number of digits in the code (default: 6) */
  digits?: number;
  /** Hash algorithm (default: SHA1) */
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
}

/**
 * Generated TOTP code with metadata
 */
export interface TOTPCode {
  /** The 6-digit verification code */
  code: string;
  /** Seconds remaining before code expires */
  remainingSeconds: number;
  /** Timestamp when code was generated */
  generatedAt: Date;
  /** Timestamp when code expires */
  expiresAt: Date;
}

/**
 * SMS handler configuration
 */
export interface SMSHandlerConfig {
  /** Timeout in milliseconds for waiting for SMS code input (default: 120000) */
  timeout?: number;
  /** Whether to prompt user interactively for code */
  interactive?: boolean;
  /** Callback function to receive the code (for non-interactive mode) */
  codeCallback?: () => Promise<string>;
}

/**
 * SMS verification state
 */
export interface SMSVerificationState {
  /** Whether SMS has been sent */
  smsSent: boolean;
  /** Phone number hint */
  phoneHint?: string;
  /** Time SMS was sent */
  sentAt?: Date;
  /** Whether user input is being waited for */
  waitingForInput: boolean;
}

/**
 * 2FA service configuration
 */
export interface TwoFactorConfig {
  /** TOTP secret from environment */
  totpSecret?: string;
  /** Preferred 2FA method */
  preferredMethod?: TwoFactorMethod;
  /** SMS handler configuration */
  smsConfig?: SMSHandlerConfig;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Timeout for entire 2FA flow in milliseconds */
  flowTimeout?: number;
}

/**
 * 2FA flow state for tracking authentication progress
 */
export interface TwoFactorFlowState {
  /** Current challenge being processed */
  challenge?: TwoFactorChallenge;
  /** Selected verification method */
  selectedMethod?: TwoFactorMethod;
  /** Number of attempts made */
  attempts: number;
  /** Flow start timestamp */
  startedAt: Date;
  /** Current status */
  status: TwoFactorStatus;
  /** Last error encountered */
  lastError?: string;
}
