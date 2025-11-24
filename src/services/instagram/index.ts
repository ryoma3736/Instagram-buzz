/**
 * Instagram Services Module
 * @module services/instagram
 */

// 2FA Authentication
export {
  TwoFactorAuth,
  createTwoFactorAuth,
  twoFactorAuth,
  TwoFactorMethod,
  TwoFactorChallenge,
  TwoFactorConfig,
  TwoFactorResult,
  TWO_FACTOR_PATTERNS,
} from './twoFactorAuth.js';

// TOTP Generator
export {
  TOTPGenerator,
  generateTOTP,
  verifyTOTP,
  totpGenerator,
  TOTPConfig,
  TOTPResult,
  SecretValidation,
} from './totpGenerator.js';

// SMS Handler
export {
  SMSHandler,
  createSMSHandler,
  smsHandler,
  SMSHandlerConfig,
  SMSVerificationResult,
  SMSWaitStatus,
} from './smsHandler.js';

// Session Types
export {
  InstagramCookies,
  REQUIRED_COOKIE_NAMES,
  RequiredCookieName,
  RefreshConfig,
  SessionData,
  CookieData,
  AuthCredentials,
  RefreshResult,
  RefreshStatus,
  RefreshEvents,
  DEFAULT_REFRESH_CONFIG,
} from './session/types.js';

// Cookie Extraction
export {
  extractInstagramCookies,
  validateCookies,
  cookiesToCookieData,
  parseCookieString,
  getCookieRemainingTime,
  shouldRefreshCookies,
  CookieExtractionResult,
} from './cookieExtractor.js';

// Cookie Storage
export {
  CookieStorage,
  cookieStorage,
  createEncryptedStorage,
  saveCookies,
  loadCookies,
  deleteCookies,
  CookieStorageOptions,
  StorageResult,
  LoadResult,
} from './cookieStorage.js';

// Cookie Authentication (Issue #19)
export {
  CookieAuthService,
  cookieAuthService,
  CookieEnvConfig,
  CookieAuthResult,
} from './cookieAuthService.js';

// Authenticated Scraper (Issue #19)
export {
  AuthenticatedScraperService,
  authenticatedScraperService,
  AuthenticatedScraperConfig,
} from './authenticatedScraperService.js';
