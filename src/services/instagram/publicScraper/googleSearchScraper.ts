/**
 * Google Search-based Instagram Scraper
 *
 * Uses Google Search to find Instagram reels/posts without authentication.
 * Searches for "site:instagram.com/reel #hashtag" to find related content.
 *
 * @module services/instagram/publicScraper/googleSearchScraper
 */

import { BuzzReel } from '../../../types/index.js';

/**
 * Configuration for GoogleSearchScraper
 */
export interface GoogleSearchScraperConfig {
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
  /** Maximum results per search */
  maxResultsPerSearch?: number;
}

const DEFAULT_CONFIG: Required<GoogleSearchScraperConfig> = {
  browser: 'chromium',
  headless: true,
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  requestDelay: 2000,
  maxResultsPerSearch: 20,
};

/**
 * GoogleSearchScraper - Find Instagram content via Google Search
 *
 * This scraper works by:
 * 1. Performing Google searches with site:instagram.com/reel
 * 2. Extracting Instagram URLs from search results
 * 3. Fetching reel details using existing scrapers
 */
export class GoogleSearchScraper {
  private config: Required<GoogleSearchScraperConfig>;
  private playwright: any = null;
  private browser: any = null;

  constructor(config: GoogleSearchScraperConfig = {}) {
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

      console.log(`[GoogleSearchScraper] Browser initialized (${this.config.browser})`);
    } catch (error) {
      console.error('[GoogleSearchScraper] Failed to initialize browser:', error);
      throw new Error('Playwright not available. Please install: npm install playwright');
    }
  }

  /**
   * Create a new page with common settings
   */
  private async createPage(): Promise<any> {
    await this.initBrowser();

    const context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: {
        width: 1280,
        height: 720,
      },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
    });

    const page = await context.newPage();
    return page;
  }

  /**
   * Search Google for Instagram reels by hashtag
   *
   * @param hashtag - The hashtag to search for (without #)
   * @param limit - Maximum number of results to return
   * @returns Array of extracted shortcodes
   */
  async searchByHashtag(hashtag: string, limit: number = 20): Promise<string[]> {
    const tag = hashtag.replace(/^#/, '');
    console.log(`[GoogleSearchScraper] Searching Google for Instagram reels with #${tag}`);

    let page: any = null;

    try {
      page = await this.createPage();

      // Build Google search query
      const searchQuery = `site:instagram.com/reel #${tag}`;
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${Math.min(limit, this.config.maxResultsPerSearch)}`;

      await page.goto(googleUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      // Wait for results to load
      await page.waitForTimeout(2000);

      // Handle cookie consent if present
      try {
        const acceptButton = await page.$('button:has-text("Accept"), button:has-text("I agree"), button:has-text("Agree")');
        if (acceptButton) {
          await acceptButton.click();
          await page.waitForTimeout(1000);
        }
      } catch {
        // Consent dialog may not be present
      }

      // Extract Instagram URLs from search results
      const shortcodes = await page.evaluate(() => {
        const results: string[] = [];
        const links = document.querySelectorAll('a[href*="instagram.com/reel/"]');

        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          // Handle both direct links and Google redirect links
          let url = href;

          // Parse Google redirect URL if present
          if (href.includes('/url?')) {
            try {
              const urlObj = new URL(href, window.location.origin);
              url = urlObj.searchParams.get('q') || urlObj.searchParams.get('url') || href;
            } catch {
              // Use original href
            }
          }

          const match = url.match(/instagram\.com\/reel\/([A-Za-z0-9_-]+)/);
          if (match && !results.includes(match[1])) {
            results.push(match[1]);
          }
        });

        return results;
      });

      console.log(`[GoogleSearchScraper] Found ${shortcodes.length} reel shortcodes from Google`);

      // Rate limiting delay
      await page.waitForTimeout(this.config.requestDelay);

      return shortcodes.slice(0, limit);
    } catch (error) {
      console.error('[GoogleSearchScraper] Error searching Google:', error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Search Google for Instagram reels by keyword
   *
   * @param keyword - The keyword to search for
   * @param limit - Maximum number of results to return
   * @returns Array of extracted shortcodes
   */
  async searchByKeyword(keyword: string, limit: number = 20): Promise<string[]> {
    console.log(`[GoogleSearchScraper] Searching Google for Instagram reels with keyword: ${keyword}`);

    let page: any = null;

    try {
      page = await this.createPage();

      // Build Google search query
      const searchQuery = `site:instagram.com/reel "${keyword}"`;
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${Math.min(limit, this.config.maxResultsPerSearch)}`;

      await page.goto(googleUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      await page.waitForTimeout(2000);

      // Handle cookie consent if present
      try {
        const acceptButton = await page.$('button:has-text("Accept"), button:has-text("I agree")');
        if (acceptButton) {
          await acceptButton.click();
          await page.waitForTimeout(1000);
        }
      } catch {
        // Consent dialog may not be present
      }

      // Extract Instagram URLs from search results
      const shortcodes = await page.evaluate(() => {
        const results: string[] = [];
        const links = document.querySelectorAll('a[href*="instagram.com/reel/"], a[href*="instagram.com/p/"]');

        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          let url = href;

          if (href.includes('/url?')) {
            try {
              const urlObj = new URL(href, window.location.origin);
              url = urlObj.searchParams.get('q') || urlObj.searchParams.get('url') || href;
            } catch {
              // Use original href
            }
          }

          const match = url.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
          if (match && !results.includes(match[1])) {
            results.push(match[1]);
          }
        });

        return results;
      });

      console.log(`[GoogleSearchScraper] Found ${shortcodes.length} shortcodes from Google`);

      await page.waitForTimeout(this.config.requestDelay);

      return shortcodes.slice(0, limit);
    } catch (error) {
      console.error('[GoogleSearchScraper] Error searching Google:', error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Get BuzzReels by hashtag using Google Search
   *
   * @param hashtag - The hashtag to search for
   * @param limit - Maximum number of results
   * @returns Array of BuzzReel objects
   */
  async getReelsByHashtag(hashtag: string, limit: number = 20): Promise<BuzzReel[]> {
    const shortcodes = await this.searchByHashtag(hashtag, limit);

    if (shortcodes.length === 0) {
      return [];
    }

    // Fetch details for each reel
    const reels: BuzzReel[] = [];

    for (const shortcode of shortcodes) {
      try {
        const reel = await this.getReelDetails(shortcode);
        if (reel) {
          reels.push(reel);
        }
      } catch (error) {
        console.error(`[GoogleSearchScraper] Error fetching reel ${shortcode}:`, error);
      }

      // Rate limiting
      await this.delay(500);
    }

    return reels;
  }

  /**
   * Get BuzzReels by keyword using Google Search
   *
   * @param keyword - The keyword to search for
   * @param limit - Maximum number of results
   * @returns Array of BuzzReel objects
   */
  async getReelsByKeyword(keyword: string, limit: number = 20): Promise<BuzzReel[]> {
    const shortcodes = await this.searchByKeyword(keyword, limit);

    if (shortcodes.length === 0) {
      return [];
    }

    const reels: BuzzReel[] = [];

    for (const shortcode of shortcodes) {
      try {
        const reel = await this.getReelDetails(shortcode);
        if (reel) {
          reels.push(reel);
        }
      } catch (error) {
        console.error(`[GoogleSearchScraper] Error fetching reel ${shortcode}:`, error);
      }

      await this.delay(500);
    }

    return reels;
  }

  /**
   * Get reel details from shortcode using oEmbed API
   */
  private async getReelDetails(shortcode: string): Promise<BuzzReel | null> {
    try {
      const normalizedUrl = `https://www.instagram.com/reel/${shortcode}/`;
      const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(normalizedUrl)}&omitscript=true`;

      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        // Try post URL instead
        const postUrl = `https://www.instagram.com/p/${shortcode}/`;
        const postOembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(postUrl)}&omitscript=true`;

        const postResponse = await fetch(postOembedUrl, {
          headers: {
            'User-Agent': this.config.userAgent,
            'Accept': 'application/json',
          },
        });

        if (!postResponse.ok) {
          return null;
        }

        const data = await postResponse.json();
        return this.createBuzzReel(shortcode, postUrl, data);
      }

      const data = await response.json();
      return this.createBuzzReel(shortcode, normalizedUrl, data);
    } catch (error) {
      console.error(`[GoogleSearchScraper] Error getting reel details for ${shortcode}:`, error);
      return null;
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
      console.log('[GoogleSearchScraper] Browser closed');
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
export const googleSearchScraper = new GoogleSearchScraper();
