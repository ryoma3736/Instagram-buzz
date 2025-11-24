/**
 * HTML Detection Utility
 * Detects when Instagram returns HTML instead of JSON and provides safe JSON parsing
 * @module utils/htmlDetection
 */

/**
 * Error thrown when HTML is received instead of JSON
 */
export class HtmlResponseError extends Error {
  constructor(message: string = 'Received HTML instead of JSON - Instagram may be blocking the request') {
    super(message);
    this.name = 'HtmlResponseError';
  }
}

/**
 * Check if a string response is HTML instead of JSON
 * @param response - The response string to check
 * @returns true if the response appears to be HTML
 */
export function isHtmlResponse(response: string): boolean {
  if (typeof response !== 'string') return false;
  const trimmed = response.trim();
  return trimmed.startsWith('<!DOCTYPE') ||
         trimmed.startsWith('<html') ||
         trimmed.startsWith('<!doctype');
}

/**
 * Safely parse JSON from a response, throwing an error if HTML is detected
 * @param response - The response string to parse
 * @returns The parsed JSON object
 * @throws HtmlResponseError if HTML is detected
 * @throws SyntaxError if JSON parsing fails
 */
export function safeJsonParse<T = unknown>(response: string): T {
  if (isHtmlResponse(response)) {
    throw new HtmlResponseError();
  }
  return JSON.parse(response) as T;
}

/**
 * Safely get JSON from a fetch Response object
 * Checks for HTML before parsing
 * @param response - The fetch Response object
 * @returns The parsed JSON object
 * @throws HtmlResponseError if HTML is detected
 */
export async function safeResponseJson<T = unknown>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');

  // If content-type indicates HTML, throw immediately
  if (contentType?.includes('text/html')) {
    throw new HtmlResponseError('Response Content-Type is text/html - Instagram may be blocking the request');
  }

  // Get the text first to check for HTML
  const text = await response.text();

  // Check if response is HTML instead of JSON
  if (isHtmlResponse(text)) {
    throw new HtmlResponseError();
  }

  // Parse as JSON
  return JSON.parse(text) as T;
}
