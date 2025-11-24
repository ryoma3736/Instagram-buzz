/**
 * Session refresh configuration and types
 * @module services/instagram/session/types
 */

/**
 * Instagram session cookies structure
 * Contains essential cookies for authenticated Instagram requests
 */
export interface InstagramCookies {
  /** Session identifier - primary authentication cookie */
  sessionid: string;
  /** CSRF protection token */
  csrftoken: string;
  /** User ID for the logged-in account */
  ds_user_id: string;
  /** Region/routing information */
  rur: string;
  /** Timestamp when cookies were extracted */
  extractedAt: number;
  /** Timestamp when cookies expire */
  expiresAt: number;
}

/**
 * Required cookie names for Instagram authentication
 */
export const REQUIRED_COOKIE_NAMES = [
  'sessionid',
  'csrftoken',
  'ds_user_id',
  'rur',
] as const;

export type RequiredCookieName = (typeof REQUIRED_COOKIE_NAMES)[number];

/**
 * Configuration for session refresh behavior
 */
export interface RefreshConfig {
  /** Hours before expiration to trigger refresh (default: 24) */
  refreshThreshold: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries: number;
  /** Delay between retries in milliseconds (default: 5000) */
  retryDelay: number;
  /** Minimum interval between refreshes in hours (default: 168 = 1 week) */
  minRefreshInterval: number;
}

/**
 * Stored session data with metadata
 */
export interface SessionData {
  /** Access token or session cookie */
  accessToken: string;
  /** Token type (e.g., 'Bearer') */
  tokenType: string;
  /** Token expiration timestamp in milliseconds */
  expiresAt: number;
  /** Token creation timestamp in milliseconds */
  createdAt: number;
  /** Last refresh timestamp in milliseconds */
  lastRefreshedAt?: number;
  /** Stored cookies for session */
  cookies?: CookieData[];
}

/**
 * Cookie data structure
 */
export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Authentication credentials for re-login
 */
export interface AuthCredentials {
  username: string;
  password: string;
}

/**
 * Result of a refresh operation
 */
export interface RefreshResult {
  success: boolean;
  sessionData?: SessionData;
  error?: string;
  retriesUsed: number;
}

/**
 * Session refresh status
 */
export type RefreshStatus =
  | 'idle'
  | 'checking'
  | 'refreshing'
  | 'success'
  | 'failed'
  | 'scheduled';

/**
 * Event types for refresh callbacks
 */
export interface RefreshEvents {
  onRefreshStart?: () => void;
  onRefreshSuccess?: (session: SessionData) => void;
  onRefreshFailed?: (error: Error) => void;
  onRefreshScheduled?: (nextRefreshAt: Date) => void;
}

/**
 * Default refresh configuration values
 */
export const DEFAULT_REFRESH_CONFIG: RefreshConfig = {
  refreshThreshold: 24, // 24 hours before expiration
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds
  minRefreshInterval: 168, // 1 week (168 hours)
};
