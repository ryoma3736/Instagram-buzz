/**
 * Playwright-based Instagram Scraper
 *
 * Uses Playwright headless browser to scrape public Instagram data.
 * No login required - only scrapes publicly accessible content.
 *
 * @module services/instagram/publicScraper/playwrightScraper
 */

import { BuzzReel } from '../../../types/index.js';

/**
 * Configuration for PlaywrightScraper
 */
export interface PlaywrightScraperConfig {
  /** Browser to use */
  browser?: 'chromium' | 'firefox' | 'webkit';
  /** Headless mode */
  headless?: boolean;
  /** Navigation timeout in ms */
  timeout?: number;
  /** User agent string */
  userAgent?: string;
  /** Viewport width */
  viewportWidth?: number;
  /** Viewport height */
  viewportHeight?: number;
}

const DEFAULT_CONFIG: Required<PlaywrightScraperConfig> = {
  browser: 'chromium',
  headless: true,
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewportWidth: 390,
  viewportHeight: 844,
};

/**
 * PlaywrightScraper - Headless browser scraping for public Instagram data
 */
export class PlaywrightScraper {
  private config: Required<PlaywrightScraperConfig>;
  private playwright: any = null;
  private browser: any = null;

  constructor(config: PlaywrightScraperConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize Playwright browser
   */
  private async initBrowser(): Promise<void> {
    if (this.browser) return;

    try {
      // Dynamic import to avoid issues if playwright is not installed
      const pw = await import('playwright');
      this.playwright = pw;

      const browserType = pw[this.config.browser];
      this.browser = await browserType.launch({
        headless: this.config.headless,
      });

      console.log(`[PlaywrightScraper] Browser initialized (${this.config.browser})`);
    } catch (error) {
      console.error('[PlaywrightScraper] Failed to initialize browser:', error);
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
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
    });

    const page = await context.newPage();

    // Block unnecessary resources for faster loading
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico}', (route: any) => route.abort());
    await page.route('**/analytics**', (route: any) => route.abort());
    await page.route('**/logging**', (route: any) => route.abort());

    return page;
  }

  /**
   * Get public reels from a user profile
   */
  async getPublicReels(username: string, limit: number = 12): Promise<BuzzReel[]> {
    console.log(`[PlaywrightScraper] Fetching reels from @${username}`);

    let page: any = null;

    try {
      page = await this.createPage();

      // Navigate to reels tab
      const reelsUrl = `https://www.instagram.com/${username}/reels/`;
      await page.goto(reelsUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Check if profile exists and is public
      const loginPrompt = await page.$('text=Log in');
      const notFound = await page.$('text=Sorry, this page');
      const privateAccount = await page.$('text=This account is private');

      if (notFound) {
        console.log(`[PlaywrightScraper] Profile @${username} not found`);
        return [];
      }

      if (privateAccount) {
        console.log(`[PlaywrightScraper] Profile @${username} is private`);
        return [];
      }

      // Extract reels data from page
      const reels = await page.evaluate((maxItems: number) => {
        const results: any[] = [];

        // Try to find reel links
        const reelLinks = document.querySelectorAll('a[href*="/reel/"]');

        reelLinks.forEach((link) => {
          if (results.length >= maxItems) return;

          const href = link.getAttribute('href');
          const shortcodeMatch = href?.match(/\/reel\/([A-Za-z0-9_-]+)/);
          if (!shortcodeMatch) return;

          const shortcode = shortcodeMatch[1];

          // Try to extract view count from the link's text content
          const viewText = link.querySelector('[class*="view"]')?.textContent || '';
          const views = parseInt(viewText.replace(/[^\d]/g, '')) || 0;

          results.push({
            shortcode,
            href,
            views,
          });
        });

        return results;
      }, limit);

      console.log(`[PlaywrightScraper] Found ${reels.length} reels on profile`);

      // Fetch details for each reel
      const detailedReels: BuzzReel[] = [];

      for (const reel of reels.slice(0, Math.min(limit, 10))) {
        try {
          const details = await this.getReelDetails(page, reel.shortcode);
          if (details) {
            detailedReels.push({
              ...details,
              author: { username, followers: 0 },
            });
          }
        } catch (error) {
          // Continue with partial data
          detailedReels.push({
            id: reel.shortcode,
            url: `https://www.instagram.com/reel/${reel.shortcode}/`,
            shortcode: reel.shortcode,
            title: '',
            views: reel.views || 0,
            likes: 0,
            comments: 0,
            posted_at: new Date(),
            author: { username, followers: 0 },
          });
        }
      }

      return detailedReels;
    } catch (error) {
      console.error('[PlaywrightScraper] Error fetching reels:', error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Get details for a specific reel
   */
  private async getReelDetails(page: any, shortcode: string): Promise<Omit<BuzzReel, 'author'> | null> {
    try {
      const reelUrl = `https://www.instagram.com/reel/${shortcode}/`;
      await page.goto(reelUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      await page.waitForTimeout(1500);

      const data = await page.evaluate(() => {
        // Extract from meta tags
        const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

        // Try to parse metrics from description
        // Format: "1,234 likes, 56 comments - Username on Instagram: "caption...""
        let likes = 0;
        let comments = 0;

        const likesMatch = description.match(/([\d,]+)\s*likes?/i);
        if (likesMatch) {
          likes = parseInt(likesMatch[1].replace(/,/g, ''));
        }

        const commentsMatch = description.match(/([\d,]+)\s*comments?/i);
        if (commentsMatch) {
          comments = parseInt(commentsMatch[1].replace(/,/g, ''));
        }

        // Extract caption
        const captionMatch = description.match(/"([^"]+)"/);
        const caption = captionMatch?.[1] || '';

        // Try to get view count from visible elements
        const viewElements = document.querySelectorAll('[class*="view"]');
        let views = 0;
        viewElements.forEach(el => {
          const text = el.textContent || '';
          const viewMatch = text.match(/([\d,]+)\s*views?/i);
          if (viewMatch) {
            views = parseInt(viewMatch[1].replace(/,/g, ''));
          }
        });

        // Try to get timestamp
        const timeElement = document.querySelector('time');
        const datetime = timeElement?.getAttribute('datetime') || '';

        return {
          caption: caption.slice(0, 100),
          likes,
          comments,
          views,
          thumbnail: ogImage,
          timestamp: datetime ? new Date(datetime).getTime() : Date.now(),
        };
      });

      return {
        id: shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        shortcode,
        title: data.caption,
        views: data.views,
        likes: data.likes,
        comments: data.comments,
        posted_at: new Date(data.timestamp),
        thumbnail_url: data.thumbnail,
      };
    } catch (error) {
      console.error(`[PlaywrightScraper] Error getting reel details for ${shortcode}:`, error);
      return null;
    }
  }

  /**
   * Get reel by URL
   */
  async getReelByUrl(url: string): Promise<BuzzReel | null> {
    console.log(`[PlaywrightScraper] Fetching reel: ${url}`);

    const shortcode = this.extractShortcode(url);
    if (!shortcode) {
      console.log('[PlaywrightScraper] Could not extract shortcode from URL');
      return null;
    }

    let page: any = null;

    try {
      page = await this.createPage();

      const details = await this.getReelDetails(page, shortcode);
      if (!details) return null;

      // Try to get author info
      const reelUrl = `https://www.instagram.com/reel/${shortcode}/`;
      await page.goto(reelUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      });

      const authorData = await page.evaluate(() => {
        // Try to get username from the page
        const usernameLink = document.querySelector('a[href^="/"][role="link"]');
        const href = usernameLink?.getAttribute('href') || '';
        const username = href.replace(/\//g, '');

        return { username };
      });

      return {
        ...details,
        author: {
          username: authorData.username || '',
          followers: 0,
        },
      };
    } catch (error) {
      console.error('[PlaywrightScraper] Error fetching reel by URL:', error);
      return null;
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Search by hashtag
   */
  async searchByHashtag(hashtag: string, limit: number = 20): Promise<BuzzReel[]> {
    console.log(`[PlaywrightScraper] Searching #${hashtag}`);

    let page: any = null;

    try {
      page = await this.createPage();

      const tag = hashtag.replace(/^#/, '');
      const tagUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;

      await page.goto(tagUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });

      await page.waitForTimeout(2000);

      // Extract shortcodes from hashtag page
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
      }, limit);

      console.log(`[PlaywrightScraper] Found ${shortcodes.length} posts for #${tag}`);

      // Fetch details for each
      const reels: BuzzReel[] = [];
      for (const shortcode of shortcodes.slice(0, Math.min(limit, 10))) {
        const details = await this.getReelDetails(page, shortcode);
        if (details) {
          reels.push({
            ...details,
            author: { username: '', followers: 0 },
          });
        }
      }

      return reels;
    } catch (error) {
      console.error('[PlaywrightScraper] Error searching hashtag:', error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Get trending reels from explore page
   */
  async getTrendingReels(limit: number = 20): Promise<BuzzReel[]> {
    console.log('[PlaywrightScraper] Fetching trending reels');

    let page: any = null;

    try {
      page = await this.createPage();

      await page.goto('https://www.instagram.com/reels/', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });

      await page.waitForTimeout(3000);

      // Scroll to load more content
      await page.evaluate(() => {
        window.scrollBy(0, 1000);
      });
      await page.waitForTimeout(1500);

      // Extract reel shortcodes
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
      }, limit);

      console.log(`[PlaywrightScraper] Found ${shortcodes.length} trending reels`);

      // Fetch details
      const reels: BuzzReel[] = [];
      for (const shortcode of shortcodes.slice(0, Math.min(limit, 10))) {
        const details = await this.getReelDetails(page, shortcode);
        if (details) {
          reels.push({
            ...details,
            author: { username: '', followers: 0 },
          });
        }
      }

      // Sort by views
      return reels.sort((a, b) => b.views - a.views);
    } catch (error) {
      console.error('[PlaywrightScraper] Error fetching trending reels:', error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
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
      console.log('[PlaywrightScraper] Browser closed');
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

// Export singleton instance
export const playwrightScraper = new PlaywrightScraper();
