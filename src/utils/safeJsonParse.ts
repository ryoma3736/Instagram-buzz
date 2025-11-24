/**
 * Safe JSON Parse Utility
 * @module utils/safeJsonParse
 *
 * Provides safe JSON parsing with HTML response detection
 * to prevent errors when Instagram returns HTML instead of JSON
 */

/**
 * Error thrown when HTML is detected instead of JSON
 */
export class HtmlResponseError extends Error {
  constructor(
    message: string,
    public readonly context?: string,
    public readonly snippet?: string
  ) {
    super(message);
    this.name = 'HtmlResponseError';
  }
}

/**
 * Detect if text content is HTML instead of JSON
 */
export function isHtmlContent(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();

  return (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML') ||
    trimmed.startsWith('<?xml') ||
    trimmed.includes('<head>') ||
    trimmed.includes('<HEAD>') ||
    /^[\s\uFEFF]*<!DOCTYPE/i.test(trimmed) ||
    /^[\s\uFEFF]*<html/i.test(trimmed)
  );
}

/**
 * Safely parse JSON with HTML detection
 * Throws HtmlResponseError if HTML is detected instead of JSON
 *
 * @param text - The text to parse as JSON
 * @param context - Optional context string for error messages (e.g., endpoint name)
 * @returns Parsed JSON data
 * @throws HtmlResponseError if HTML is detected
 * @throws Error if JSON parsing fails
 *
 * @example
 * ```typescript
 * import { safeJsonParse } from '../utils/safeJsonParse.js';
 *
 * const data = safeJsonParse<MyType>(responseText, 'Instagram API');
 * ```
 */
export function safeJsonParse<T>(text: string, context?: string): T {
  // Check for HTML response
  if (isHtmlContent(text)) {
    throw new HtmlResponseError(
      `Instagram returned HTML instead of JSON${context ? ` (${context})` : ''}. Authentication may be required.`,
      context,
      text.substring(0, 200)
    );
  }

  // Attempt to parse JSON
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const parseError = error as Error;
    throw new Error(
      `Invalid JSON response${context ? ` (${context})` : ''}: ${parseError.message}. Content preview: ${text.substring(0, 100)}...`
    );
  }
}

/**
 * Safely parse JSON without throwing, returns null on failure
 *
 * @param text - The text to parse as JSON
 * @param context - Optional context string for logging
 * @returns Parsed JSON data or null if parsing fails
 *
 * @example
 * ```typescript
 * const data = safeJsonParseOrNull<MyType>(responseText, 'config file');
 * if (data === null) {
 *   console.log('Failed to parse config');
 * }
 * ```
 */
export function safeJsonParseOrNull<T>(text: string, context?: string): T | null {
  try {
    return safeJsonParse<T>(text, context);
  } catch (error) {
    if (context) {
      console.error(`[safeJsonParse] Failed to parse ${context}:`, (error as Error).message);
    }
    return null;
  }
}

/**
 * Parse JSON from file content (local files, not HTTP responses)
 * Less strict than safeJsonParse - doesn't check for HTML
 *
 * @param text - The text to parse as JSON
 * @param context - Optional context string for error messages
 * @returns Parsed JSON data
 * @throws Error if JSON parsing fails
 */
export function parseLocalJson<T>(text: string, context?: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const parseError = error as Error;
    throw new Error(
      `Failed to parse JSON${context ? ` (${context})` : ''}: ${parseError.message}`
    );
  }
}

/**
 * Parse JSON from file content without throwing
 *
 * @param text - The text to parse as JSON
 * @param context - Optional context string for logging
 * @returns Parsed JSON data or null if parsing fails
 */
export function parseLocalJsonOrNull<T>(text: string, context?: string): T | null {
  try {
    return parseLocalJson<T>(text, context);
  } catch (error) {
    if (context) {
      console.error(`[parseLocalJson] Failed to parse ${context}:`, (error as Error).message);
    }
    return null;
  }
}
