/**
 * Playwright Fallback Service
 * Provides browser-based scraping as fallback when API access fails
 * @module services/instagram/playwright/playwrightFallback
 */

import type { BuzzReel } from '../../../types/index.js';
import type { InstagramCookies } from '../session/types.js';

/**
 * Playwright fallback configuration
 */
export interface PlaywrightFallbackConfig {
  /** Whether to run browser in headless mode */
  headless: boolean;
  /** Request timeout in milliseconds */
  timeout: number;
  /** User agent string */
  userAgent: string;
  /** Viewport dimensions */
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * Default fallback configuration
 */
export const DEFAULT_FALLBACK_CONFIG: PlaywrightFallbackConfig = {
  headless: true,
  timeout: 30000,
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: {
    width: 1280,
    height: 720,
  },
};

/**
 * Check if Playwright is available
 */
export async function isPlaywrightAvailable(): Promise<boolean> {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
}

/**
 * Result type for Playwright fallback operations
 */
export interface PlaywrightFallbackResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  usedFallback: boolean;
}

/**
 * Playwright Fallback Service
 * Uses browser automation to scrape Instagram when API fails
 */
export class PlaywrightFallbackService {
  private config: PlaywrightFallbackConfig;
  private isAvailable: boolean | null = null;

  constructor(config: Partial<PlaywrightFallbackConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
  }

  /**
   * Check if Playwright is available
   */
  async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }
    this.isAvailable = await isPlaywrightAvailable();
    console.log(
      `[PlaywrightFallback] Availability: ${this.isAvailable ? 'Available' : 'Not installed'}`
    );
    return this.isAvailable;
  }

  /**
   * Get a reel by URL using Playwright
   */
  async getReelByUrl(
    url: string,
    cookies?: InstagramCookies
  ): Promise<PlaywrightFallbackResult<BuzzReel>> {
    if (!(await this.checkAvailability())) {
      return {
        success: false,
        error: 'Playwright is not installed',
        usedFallback: true,
      };
    }

    const shortcode = this.extractShortcode(url);
    if (!shortcode) {
      return {
        success: false,
        error: 'Invalid reel URL',
        usedFallback: true,
      };
    }

    console.log(`[PlaywrightFallback] Fetching reel: ${shortcode}`);

    try {
      const playwright = await import('playwright');
      const browser = await playwright.chromium.launch({
        headless: this.config.headless,
      });

      try {
        const context = await browser.newContext({
          userAgent: this.config.userAgent,
          viewport: this.config.viewport,
        });

        // Add cookies if provided
        if (cookies) {
          await this.addCookiesToContext(context, cookies);
        }

        const page = await context.newPage();

        // Navigate to reel page
        const reelUrl = `https://www.instagram.com/reel/${shortcode}/`;
        await page.goto(reelUrl, {
          waitUntil: 'networkidle',
          timeout: this.config.timeout,
        });

        // Wait for content to load
        await page.waitForTimeout(2000);

        // Extract reel data from the page
        const reelData = await this.extractReelData(page, shortcode, url);

        await context.close();

        if (reelData) {
          console.log(`[PlaywrightFallback] Successfully fetched reel: ${shortcode}`);
          return {
            success: true,
            data: reelData,
            usedFallback: true,
          };
        }

        return {
          success: false,
          error: 'Could not extract reel data from page',
          usedFallback: true,
        };
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error('[PlaywrightFallback] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usedFallback: true,
      };
    }
  }

  /**
   * Get user reels using Playwright
   */
  async getUserReels(
    username: string,
    limit: number = 12,
    cookies?: InstagramCookies
  ): Promise<PlaywrightFallbackResult<BuzzReel[]>> {
    if (!(await this.checkAvailability())) {
      return {
        success: false,
        error: 'Playwright is not installed',
        usedFallback: true,
      };
    }

    console.log(`[PlaywrightFallback] Fetching reels for @${username}`);

    try {
      const playwright = await import('playwright');
      const browser = await playwright.chromium.launch({
        headless: this.config.headless,
      });

      try {
        const context = await browser.newContext({
          userAgent: this.config.userAgent,
          viewport: this.config.viewport,
        });

        // Add cookies if provided
        if (cookies) {
          await this.addCookiesToContext(context, cookies);
        }

        const page = await context.newPage();

        // Navigate to user's reels page
        const reelsUrl = `https://www.instagram.com/${username}/reels/`;
        await page.goto(reelsUrl, {
          waitUntil: 'networkidle',
          timeout: this.config.timeout,
        });

        // Wait for content to load
        await page.waitForTimeout(2000);

        // Scroll to load more reels if needed
        await this.scrollToLoadReels(page, limit);

        // Extract reels from the page
        const reels = await this.extractUserReels(page, username, limit);

        await context.close();

        console.log(`[PlaywrightFallback] Found ${reels.length} reels for @${username}`);
        return {
          success: true,
          data: reels,
          usedFallback: true,
        };
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error('[PlaywrightFallback] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usedFallback: true,
      };
    }
  }

  /**
   * Search reels by hashtag using Playwright
   */
  async searchByHashtag(
    hashtag: string,
    limit: number = 20,
    cookies?: InstagramCookies
  ): Promise<PlaywrightFallbackResult<BuzzReel[]>> {
    if (!(await this.checkAvailability())) {
      return {
        success: false,
        error: 'Playwright is not installed',
        usedFallback: true,
      };
    }

    console.log(`[PlaywrightFallback] Searching #${hashtag}`);

    try {
      const playwright = await import('playwright');
      const browser = await playwright.chromium.launch({
        headless: this.config.headless,
      });

      try {
        const context = await browser.newContext({
          userAgent: this.config.userAgent,
          viewport: this.config.viewport,
        });

        // Add cookies if provided (required for hashtag pages)
        if (cookies) {
          await this.addCookiesToContext(context, cookies);
        }

        const page = await context.newPage();

        // Navigate to hashtag page
        const tagUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`;
        await page.goto(tagUrl, {
          waitUntil: 'networkidle',
          timeout: this.config.timeout,
        });

        // Wait for content to load
        await page.waitForTimeout(2000);

        // Check for login requirement
        const isLoginRequired = await page.evaluate(() => {
          return window.location.href.includes('/accounts/login');
        });

        if (isLoginRequired) {
          await context.close();
          return {
            success: false,
            error: 'Login required to view hashtag content',
            usedFallback: true,
          };
        }

        // Scroll to load more posts
        await this.scrollToLoadReels(page, limit);

        // Extract reels from hashtag page
        const reels = await this.extractHashtagReels(page, hashtag, limit);

        await context.close();

        console.log(`[PlaywrightFallback] Found ${reels.length} reels for #${hashtag}`);
        return {
          success: true,
          data: reels,
          usedFallback: true,
        };
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error('[PlaywrightFallback] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usedFallback: true,
      };
    }
  }

  /**
   * Add cookies to browser context
   */
  private async addCookiesToContext(
    context: import('playwright').BrowserContext,
    cookies: InstagramCookies
  ): Promise<void> {
    const cookieList = [
      {
        name: 'sessionid',
        value: cookies.sessionid,
        domain: '.instagram.com',
        path: '/',
      },
      {
        name: 'csrftoken',
        value: cookies.csrftoken,
        domain: '.instagram.com',
        path: '/',
      },
      {
        name: 'ds_user_id',
        value: cookies.ds_user_id,
        domain: '.instagram.com',
        path: '/',
      },
      {
        name: 'rur',
        value: cookies.rur,
        domain: '.instagram.com',
        path: '/',
      },
    ];

    await context.addCookies(cookieList);
  }

  /**
   * Scroll page to load more reels
   */
  private async scrollToLoadReels(
    page: import('playwright').Page,
    targetCount: number
  ): Promise<void> {
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = Math.ceil(targetCount / 12) + 3;

    while (scrollAttempts < maxScrollAttempts) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight) {
        break;
      }

      previousHeight = currentHeight;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      scrollAttempts++;
    }
  }

  /**
   * Extract reel data from page
   */
  private async extractReelData(
    page: import('playwright').Page,
    shortcode: string,
    originalUrl: string
  ): Promise<BuzzReel | null> {
    try {
      const data = await page.evaluate(() => {
        // Try to get data from window._sharedData or meta tags
        const sharedData = (window as unknown as { _sharedData?: { entry_data?: { PostPage?: Array<{ graphql?: { shortcode_media?: Record<string, unknown> } }> } } })._sharedData;
        if (sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media) {
          const media = sharedData.entry_data.PostPage[0].graphql.shortcode_media;
          return {
            id: String(media.id || ''),
            caption: String(
              (media.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> })?.edges?.[0]?.node?.text || ''
            ),
            likes: Number((media.edge_media_preview_like as { count?: number })?.count || 0),
            comments: Number((media.edge_media_to_comment as { count?: number })?.count || 0),
            views: Number(media.video_view_count || 0),
            timestamp: Number(media.taken_at_timestamp || 0),
            username: String((media.owner as { username?: string })?.username || ''),
            followers: Number(
              ((media.owner as { edge_followed_by?: { count?: number } })?.edge_followed_by?.count) || 0
            ),
          };
        }

        // Fallback: Try to extract from meta tags
        const getMetaContent = (property: string): string => {
          const meta = document.querySelector(`meta[property="${property}"]`);
          return meta?.getAttribute('content') || '';
        };

        const description = getMetaContent('og:description');
        const title = getMetaContent('og:title');

        // Try to extract likes/comments from description
        const likesMatch = description.match(/(\d+(?:,\d+)*)\s*(?:likes?|いいね)/i);
        const commentsMatch = description.match(/(\d+(?:,\d+)*)\s*(?:comments?|コメント)/i);

        return {
          id: '',
          caption: description,
          likes: likesMatch ? parseInt(likesMatch[1].replace(/,/g, ''), 10) : 0,
          comments: commentsMatch ? parseInt(commentsMatch[1].replace(/,/g, ''), 10) : 0,
          views: 0,
          timestamp: 0,
          username: title.split(/\s*[•(@]/)[0]?.trim() || '',
          followers: 0,
        };
      });

      if (!data) {
        return null;
      }

      return {
        id: data.id || shortcode,
        url: originalUrl,
        shortcode,
        title: data.caption.slice(0, 100),
        views: data.views,
        likes: data.likes,
        comments: data.comments,
        posted_at: data.timestamp ? new Date(data.timestamp * 1000) : new Date(),
        author: {
          username: data.username || 'unknown',
          followers: data.followers,
        },
      };
    } catch (error) {
      console.error('[PlaywrightFallback] Error extracting reel data:', error);
      return null;
    }
  }

  /**
   * Extract reels from user profile page
   */
  private async extractUserReels(
    page: import('playwright').Page,
    username: string,
    limit: number
  ): Promise<BuzzReel[]> {
    try {
      const reelLinks = await page.evaluate(() => {
        const links: string[] = [];
        const elements = document.querySelectorAll('a[href*="/reel/"]');
        elements.forEach((el) => {
          const href = el.getAttribute('href');
          if (href && !links.includes(href)) {
            links.push(href);
          }
        });
        return links;
      });

      const reels: BuzzReel[] = [];
      const shortcodes = reelLinks
        .map((link) => this.extractShortcode(`https://www.instagram.com${link}`))
        .filter((s): s is string => s !== null)
        .slice(0, limit);

      for (const shortcode of shortcodes) {
        reels.push({
          id: shortcode,
          url: `https://www.instagram.com/reel/${shortcode}/`,
          shortcode,
          title: '',
          views: 0,
          likes: 0,
          comments: 0,
          posted_at: new Date(),
          author: {
            username,
            followers: 0,
          },
        });
      }

      return reels;
    } catch (error) {
      console.error('[PlaywrightFallback] Error extracting user reels:', error);
      return [];
    }
  }

  /**
   * Extract reels from hashtag page
   */
  private async extractHashtagReels(
    page: import('playwright').Page,
    hashtag: string,
    limit: number
  ): Promise<BuzzReel[]> {
    try {
      const reelLinks = await page.evaluate(() => {
        const links: string[] = [];
        const elements = document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]');
        elements.forEach((el) => {
          const href = el.getAttribute('href');
          if (href && !links.includes(href)) {
            links.push(href);
          }
        });
        return links;
      });

      const reels: BuzzReel[] = [];
      const shortcodes = reelLinks
        .map((link) => this.extractShortcode(`https://www.instagram.com${link}`))
        .filter((s): s is string => s !== null)
        .slice(0, limit);

      for (const shortcode of shortcodes) {
        const isReel = reelLinks.some((l) => l.includes('/reel/') && l.includes(shortcode));
        reels.push({
          id: shortcode,
          url: isReel
            ? `https://www.instagram.com/reel/${shortcode}/`
            : `https://www.instagram.com/p/${shortcode}/`,
          shortcode,
          title: `#${hashtag}`,
          views: 0,
          likes: 0,
          comments: 0,
          posted_at: new Date(),
          author: {
            username: 'unknown',
            followers: 0,
          },
        });
      }

      return reels;
    } catch (error) {
      console.error('[PlaywrightFallback] Error extracting hashtag reels:', error);
      return [];
    }
  }

  /**
   * Extract shortcode from URL
   */
  private extractShortcode(url: string): string | null {
    const match = url.match(/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    return match?.[1] || null;
  }
}

/**
 * Singleton instance
 */
export const playwrightFallbackService = new PlaywrightFallbackService();
