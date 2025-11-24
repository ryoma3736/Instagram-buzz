/**
 * Instagram Explore Page Scraper
 *
 * Scrapes trending reels from Instagram's public explore page.
 * Works without authentication by accessing publicly available content.
 *
 * @module services/instagram/publicScraper/exploreScraper
 */

import { BuzzReel } from '../../../types/index.js';

/**
 * Configuration for ExploreScraper
 */
export interface ExploreScraperConfig {
  /** Browser to use */
  browser?: 'chromium' | 'firefox' | 'webkit';
  /** Headless mode */
  headless?: boolean;
  /** Navigation timeout in ms */
  timeout?: number;
  /** User agent string */
  userAgent?: string;
  /** Delay between requests in ms (rate limiting) */
  requestDelay?: number;
  /** Number of scroll iterations to load more content */
  scrollIterations?: number;
}

const DEFAULT_CONFIG: Required<ExploreScraperConfig> = {
  browser: 'chromium',
  headless: true,
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  requestDelay: 1500,
  scrollIterations: 3,
};

/**
 * ExploreScraper - Scrape trending content from Instagram Explore page
 *
 * Strategy:
 * 1. Navigate to /explore/ or /explore/tags/{tag}/
 * 2. Extract post/reel shortcodes from the grid
 * 3. Fetch details using oEmbed API
 */
export class ExploreScraper {
  private config: Required<ExploreScraperConfig>;
  private playwright: any = null;
  private browser: any = null;

  constructor(config: ExploreScraperConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize Playwright browser
   */
  private async initBrowser(): Promise<void> {
    if (this.browser) return;

    try {
      const pw = await import('playwright');
      this.playwright = pw;

      const browserType = pw[this.config.browser];
      this.browser = await browserType.launch({
        headless: this.config.headless,
      });

      console.log(`[ExploreScraper] Browser initialized (${this.config.browser})`);
    } catch (error) {
      console.error('[ExploreScraper] Failed to initialize browser:', error);
      throw new Error('Playwright not available. Please install: npm install playwright');
    }
  }

  /**
   * Create a new page with mobile user agent settings
   */
  private async createPage(): Promise<any> {
    await this.initBrowser();

    const context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: {
        width: 390,
        height: 844,
      },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();

    // Block heavy resources for faster loading
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,mp4,webm}', (route: any) => {
      // Allow thumbnails but block large media
      const url = route.request().url();
      if (url.includes('thumbnail') || url.includes('150x150')) {
        return route.continue();
      }
      return route.abort();
    });
    await page.route('**/analytics**', (route: any) => route.abort());
    await page.route('**/logging**', (route: any) => route.abort());

    return page;
  }

  /**
   * Get trending reels from the main explore page
   *
   * @param limit - Maximum number of reels to return
   * @returns Array of BuzzReel objects
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    console.log(`[ExploreScraper] Fetching trending reels from explore page`);

    let page: any = null;

    try {
      page = await this.createPage();

      // Navigate to explore page
      await page.goto('https://www.instagram.com/explore/', {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      await page.waitForTimeout(3000);

      // Check if we hit a login wall
      const loginPrompt = await page.$('input[name="username"], button:has-text("Log In")');
      if (loginPrompt) {
        console.log('[ExploreScraper] Login wall detected, trying alternative approach');
        return this.getTrendingViaReelsPage(limit);
      }

      // Scroll to load more content
      for (let i = 0; i < this.config.scrollIterations; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
      }

      // Extract shortcodes from the explore grid
      const shortcodes = await page.evaluate((maxItems: number) => {
        const results: string[] = [];
        const links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');

        links.forEach(link => {
          if (results.length >= maxItems) return;

          const href = link.getAttribute('href') || '';
          const match = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
          if (match && !results.includes(match[1])) {
            results.push(match[1]);
          }
        });

        return results;
      }, limit * 2); // Get more than needed since some might fail

      console.log(`[ExploreScraper] Found ${shortcodes.length} shortcodes from explore page`);

      // Fetch details for each shortcode
      const reels = await this.fetchReelDetails(shortcodes.slice(0, limit));

      return reels;
    } catch (error) {
      console.error('[ExploreScraper] Error fetching trending reels:', error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Alternative method: Get trending from /reels/ page
   */
  private async getTrendingViaReelsPage(limit: number): Promise<BuzzReel[]> {
    let page: any = null;

    try {
      page = await this.createPage();

      await page.goto('https://www.instagram.com/reels/', {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      await page.waitForTimeout(3000);

      // Scroll to load more
      for (let i = 0; i < this.config.scrollIterations; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
      }

      const shortcodes = await page.evaluate((maxItems: number) => {
        const results: string[] = [];
        const links = document.querySelectorAll('a[href*="/reel/"]');

        links.forEach(link => {
          if (results.length >= maxItems) return;

          const href = link.getAttribute('href') || '';
          const match = href.match(/\/reel\/([A-Za-z0-9_-]+)/);
          if (match && !results.includes(match[1])) {
            results.push(match[1]);
          }
        });

        return results;
      }, limit * 2);

      console.log(`[ExploreScraper] Found ${shortcodes.length} shortcodes from reels page`);

      return this.fetchReelDetails(shortcodes.slice(0, limit));
    } catch (error) {
      console.error('[ExploreScraper] Error fetching from reels page:', error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Get reels by hashtag from explore tags page
   *
   * @param hashtag - The hashtag to search for (without #)
   * @param limit - Maximum number of reels to return
   * @returns Array of BuzzReel objects
   */
  async getReelsByHashtag(hashtag: string, limit: number = 20): Promise<BuzzReel[]> {
    const tag = hashtag.replace(/^#/, '');
    console.log(`[ExploreScraper] Fetching reels for #${tag} from explore`);

    let page: any = null;

    try {
      page = await this.createPage();

      // Navigate to hashtag explore page
      const tagUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
      await page.goto(tagUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      await page.waitForTimeout(3000);

      // Check for errors
      const notFound = await page.$('text=Sorry, this page');
      if (notFound) {
        console.log(`[ExploreScraper] Hashtag #${tag} not found`);
        return [];
      }

      // Scroll to load more content
      for (let i = 0; i < this.config.scrollIterations; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
      }

      // Extract shortcodes
      const shortcodes = await page.evaluate((maxItems: number) => {
        const results: string[] = [];
        const links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');

        links.forEach(link => {
          if (results.length >= maxItems) return;

          const href = link.getAttribute('href') || '';
          const match = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
          if (match && !results.includes(match[1])) {
            results.push(match[1]);
          }
        });

        return results;
      }, limit * 2);

      console.log(`[ExploreScraper] Found ${shortcodes.length} shortcodes for #${tag}`);

      return this.fetchReelDetails(shortcodes.slice(0, limit));
    } catch (error) {
      console.error(`[ExploreScraper] Error fetching reels for #${tag}:`, error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Get reels by keyword using explore search
   *
   * @param keyword - The keyword to search for
   * @param limit - Maximum number of reels to return
   * @returns Array of BuzzReel objects
   */
  async getReelsByKeyword(keyword: string, limit: number = 20): Promise<BuzzReel[]> {
    console.log(`[ExploreScraper] Searching explore for keyword: ${keyword}`);

    // First try as hashtag
    const hashtagResults = await this.getReelsByHashtag(keyword, limit);
    if (hashtagResults.length > 0) {
      return hashtagResults;
    }

    // If no results, try with related tags
    console.log(`[ExploreScraper] No results for #${keyword}, trying general explore`);
    return this.getTrendingReels(limit);
  }

  /**
   * Fetch reel details for an array of shortcodes
   */
  private async fetchReelDetails(shortcodes: string[]): Promise<BuzzReel[]> {
    const reels: BuzzReel[] = [];

    for (const shortcode of shortcodes) {
      try {
        const reel = await this.getReelDetails(shortcode);
        if (reel) {
          reels.push(reel);
        }
      } catch (error) {
        console.error(`[ExploreScraper] Error fetching reel ${shortcode}:`, error);
      }

      // Rate limiting
      await this.delay(300);
    }

    return reels;
  }

  /**
   * Get reel details using oEmbed API
   */
  private async getReelDetails(shortcode: string): Promise<BuzzReel | null> {
    try {
      // Try reel URL first
      const reelUrl = `https://www.instagram.com/reel/${shortcode}/`;
      const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(reelUrl)}&omitscript=true`;

      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return this.createBuzzReel(shortcode, reelUrl, data);
      }

      // Try post URL as fallback
      const postUrl = `https://www.instagram.com/p/${shortcode}/`;
      const postOembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(postUrl)}&omitscript=true`;

      const postResponse = await fetch(postOembedUrl, {
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'application/json',
        },
      });

      if (postResponse.ok) {
        const data = await postResponse.json();
        return this.createBuzzReel(shortcode, postUrl, data);
      }

      // Return basic reel if oEmbed fails
      return this.createBasicReel(shortcode);
    } catch (error) {
      console.error(`[ExploreScraper] Error getting details for ${shortcode}:`, error);
      return this.createBasicReel(shortcode);
    }
  }

  /**
   * Create a BuzzReel object from oEmbed data
   */
  private createBuzzReel(shortcode: string, url: string, oembedData: any): BuzzReel {
    return {
      id: oembedData.media_id || shortcode,
      url,
      shortcode,
      title: oembedData.title || '',
      views: 0,
      likes: 0,
      comments: 0,
      posted_at: new Date(),
      author: {
        username: oembedData.author_name || '',
        followers: 0,
      },
      thumbnail_url: oembedData.thumbnail_url,
    };
  }

  /**
   * Create a basic BuzzReel with minimal data
   */
  private createBasicReel(shortcode: string): BuzzReel {
    return {
      id: shortcode,
      url: `https://www.instagram.com/reel/${shortcode}/`,
      shortcode,
      title: '',
      views: 0,
      likes: 0,
      comments: 0,
      posted_at: new Date(),
      author: {
        username: '',
        followers: 0,
      },
    };
  }

  /**
   * Check if Playwright is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await import('playwright');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('[ExploreScraper] Browser closed');
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const exploreScraper = new ExploreScraper();
