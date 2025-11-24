/**
 * Session management module exports
 * @module services/instagram/session
 */

export {
  SessionManager,
  type SessionStatus,
  type ExpiringSoonCallback,
  type SessionInvalidCallback,
} from './sessionManager';

export {
  ExpiryChecker,
  type ExpiryCheckResult,
} from './expiryChecker';

export {
  SessionValidator,
  type ValidationResult,
} from './sessionValidator';

export {
  type InstagramCookies,
  type CookieData,
  type SessionData,
  type RefreshConfig,
  type RefreshResult,
  type RefreshStatus,
  type RefreshEvents,
  type AuthCredentials,
  REQUIRED_COOKIE_NAMES,
  DEFAULT_REFRESH_CONFIG,
} from './types';
