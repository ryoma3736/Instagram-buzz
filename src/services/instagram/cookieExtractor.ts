/**
 * Instagram Cookie Extractor
 * @module services/instagram/cookieExtractor
 *
 * Extracts required cookies from browser session after successful login
 */

import {
  InstagramCookies,
  CookieData,
  REQUIRED_COOKIE_NAMES,
  RequiredCookieName,
} from './session/types.js';

/**
 * Result of cookie extraction
 */
export interface CookieExtractionResult {
  success: boolean;
  cookies?: InstagramCookies;
  rawCookies?: CookieData[];
  missingCookies?: string[];
  error?: string;
}

/**
 * Default session expiry time (90 days in milliseconds)
 */
const DEFAULT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Instagram domain for cookie filtering
 */
const INSTAGRAM_DOMAIN = '.instagram.com';

/**
 * Extracts Instagram authentication cookies from raw cookie data
 * @param rawCookies - Array of cookies from browser session
 * @returns Extraction result with structured Instagram cookies
 */
export function extractInstagramCookies(
  rawCookies: CookieData[]
): CookieExtractionResult {
  // Filter cookies for Instagram domain
  const instagramCookies = rawCookies.filter(
    (cookie) =>
      cookie.domain === INSTAGRAM_DOMAIN ||
      cookie.domain === 'instagram.com' ||
      cookie.domain.endsWith('.instagram.com')
  );

  // Build a map of cookie names to values
  const cookieMap = new Map<string, CookieData>();
  for (const cookie of instagramCookies) {
    cookieMap.set(cookie.name, cookie);
  }

  // Check for missing required cookies
  const missingCookies: string[] = [];
  for (const name of REQUIRED_COOKIE_NAMES) {
    if (!cookieMap.has(name)) {
      missingCookies.push(name);
    }
  }

  if (missingCookies.length > 0) {
    return {
      success: false,
      rawCookies: instagramCookies,
      missingCookies,
      error: `Missing required cookies: ${missingCookies.join(', ')}`,
    };
  }

  // Calculate expiry time from cookies or use default
  const sessionCookie = cookieMap.get('sessionid');
  const expiresAt = sessionCookie?.expires
    ? sessionCookie.expires
    : Date.now() + DEFAULT_EXPIRY_MS;

  // Build InstagramCookies object
  const cookies: InstagramCookies = {
    sessionid: cookieMap.get('sessionid')!.value,
    csrftoken: cookieMap.get('csrftoken')!.value,
    ds_user_id: cookieMap.get('ds_user_id')!.value,
    rur: cookieMap.get('rur')!.value,
    extractedAt: Date.now(),
    expiresAt,
  };

  return {
    success: true,
    cookies,
    rawCookies: instagramCookies,
  };
}

/**
 * Validates that cookies are still valid (not expired)
 * @param cookies - Instagram cookies to validate
 * @returns true if cookies are still valid
 */
export function validateCookies(cookies: InstagramCookies): boolean {
  const now = Date.now();

  // Check expiration
  if (cookies.expiresAt <= now) {
    return false;
  }

  // Verify all required fields are present and non-empty
  for (const name of REQUIRED_COOKIE_NAMES) {
    const value = cookies[name as RequiredCookieName];
    if (!value || value.trim() === '') {
      return false;
    }
  }

  return true;
}

/**
 * Converts InstagramCookies to CookieData array for browser injection
 * @param cookies - Instagram cookies to convert
 * @returns Array of CookieData objects
 */
export function cookiesToCookieData(cookies: InstagramCookies): CookieData[] {
  const baseCookieProps = {
    domain: INSTAGRAM_DOMAIN,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
  };

  return [
    {
      ...baseCookieProps,
      name: 'sessionid',
      value: cookies.sessionid,
      expires: cookies.expiresAt,
    },
    {
      ...baseCookieProps,
      name: 'csrftoken',
      value: cookies.csrftoken,
      expires: cookies.expiresAt,
      httpOnly: false, // csrftoken needs to be accessible by JavaScript
    },
    {
      ...baseCookieProps,
      name: 'ds_user_id',
      value: cookies.ds_user_id,
      expires: cookies.expiresAt,
    },
    {
      ...baseCookieProps,
      name: 'rur',
      value: cookies.rur,
      expires: cookies.expiresAt,
    },
  ];
}

/**
 * Parses a raw cookie string (from Set-Cookie header) into CookieData
 * @param cookieString - Raw cookie string from HTTP header
 * @returns Parsed CookieData object or null if invalid
 */
export function parseCookieString(cookieString: string): CookieData | null {
  const parts = cookieString.split(';').map((p) => p.trim());

  if (parts.length === 0) {
    return null;
  }

  // First part is name=value
  const [nameValue, ...attributes] = parts;
  const equalsIndex = nameValue.indexOf('=');

  if (equalsIndex === -1) {
    return null;
  }

  const name = nameValue.substring(0, equalsIndex).trim();
  const value = nameValue.substring(equalsIndex + 1).trim();

  const cookie: CookieData = {
    name,
    value,
    domain: INSTAGRAM_DOMAIN,
    path: '/',
  };

  // Parse attributes
  for (const attr of attributes) {
    const attrLower = attr.toLowerCase();
    const [attrName, attrValue] = attr.split('=').map((s) => s.trim());

    if (attrLower.startsWith('domain=')) {
      cookie.domain = attrValue;
    } else if (attrLower.startsWith('path=')) {
      cookie.path = attrValue;
    } else if (attrLower.startsWith('expires=')) {
      cookie.expires = new Date(attrValue).getTime();
    } else if (attrLower.startsWith('max-age=')) {
      cookie.expires = Date.now() + parseInt(attrValue, 10) * 1000;
    } else if (attrLower === 'httponly') {
      cookie.httpOnly = true;
    } else if (attrLower === 'secure') {
      cookie.secure = true;
    } else if (attrLower.startsWith('samesite=')) {
      const sameSiteValue = attrName.split('=')[1]?.toLowerCase();
      if (
        sameSiteValue === 'strict' ||
        sameSiteValue === 'lax' ||
        sameSiteValue === 'none'
      ) {
        cookie.sameSite =
          (sameSiteValue.charAt(0).toUpperCase() +
            sameSiteValue.slice(1)) as CookieData['sameSite'];
      }
    }
  }

  return cookie;
}

/**
 * Checks remaining validity time of cookies
 * @param cookies - Instagram cookies to check
 * @returns Remaining time in milliseconds, or 0 if expired
 */
export function getCookieRemainingTime(cookies: InstagramCookies): number {
  const remaining = cookies.expiresAt - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Checks if cookies need refresh (within threshold of expiry)
 * @param cookies - Instagram cookies to check
 * @param thresholdHours - Hours before expiry to trigger refresh (default: 24)
 * @returns true if cookies should be refreshed
 */
export function shouldRefreshCookies(
  cookies: InstagramCookies,
  thresholdHours: number = 24
): boolean {
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  const remaining = getCookieRemainingTime(cookies);

  return remaining <= thresholdMs;
}
