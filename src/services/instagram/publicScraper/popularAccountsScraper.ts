/**
 * Popular Accounts-based Instagram Scraper
 *
 * Scrapes reels from popular public accounts related to specific keywords/hashtags.
 * Maintains a mapping of keywords to relevant popular accounts.
 *
 * @module services/instagram/publicScraper/popularAccountsScraper
 */

import { BuzzReel } from '../../../types/index.js';

/**
 * Configuration for PopularAccountsScraper
 */
export interface PopularAccountsScraperConfig {
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
  /** Maximum accounts to scrape per keyword */
  maxAccountsPerKeyword?: number;
  /** Maximum reels per account */
  maxReelsPerAccount?: number;
}

const DEFAULT_CONFIG: Required<PopularAccountsScraperConfig> = {
  browser: 'chromium',
  headless: true,
  timeout: 30000,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  requestDelay: 2000,
  maxAccountsPerKeyword: 5,
  maxReelsPerAccount: 10,
};

/**
 * Mapping of keywords to popular Instagram accounts
 * These are public accounts known for creating content in these niches
 */
const KEYWORD_ACCOUNT_MAP: Record<string, string[]> = {
  // Psychology & Mental Health (Japanese)
  '心理学': ['psychology_tips_jp', 'mental_health_jp', 'shinrigaku_channel'],
  'メンタルヘルス': ['mental_health_jp', 'kokoro_care', 'mindfulness_japan'],
  '自己啓発': ['self_improvement_jp', 'jikokeihatu', 'motivation_japan'],

  // Business & Finance
  'ビジネス': ['business_tips_jp', 'startup_japan', 'keiei_gaku'],
  '投資': ['investment_japan', 'kabu_tips', 'toushi_beginner'],
  '副業': ['fukugyo_tips', 'side_business_jp', 'freelance_japan'],

  // Lifestyle
  'ライフハック': ['lifehack_japan', 'seikatsu_tips', 'smart_living_jp'],
  'ダイエット': ['diet_tips_jp', 'fitness_japan', 'kenko_channel'],
  '料理': ['cooking_japan', 'recipe_easy', 'gourmet_japan'],
  'レシピ': ['recipe_easy', 'cooking_tips_jp', 'bento_ideas'],

  // Technology
  'プログラミング': ['programming_jp', 'tech_japan', 'code_beginners'],
  'AI': ['ai_news_jp', 'tech_trends_jp', 'ai_japan'],
  'テクノロジー': ['tech_japan', 'gadget_jp', 'digital_life_jp'],

  // Education
  '英語': ['english_learning_jp', 'eigo_tips', 'toeic_study'],
  '勉強': ['study_tips_jp', 'benkyou_method', 'gakushuu_channel'],

  // Entertainment
  '旅行': ['travel_japan', 'ryokou_tips', 'trip_advisor_jp'],
  'グルメ': ['gourmet_japan', 'food_lover_jp', 'tabelog_tips'],

  // Generic popular categories
  'トレンド': ['trends_japan', 'buzz_japan', 'viral_jp'],
  '話題': ['wadai_now', 'hot_topics_jp', 'news_jp'],
};

/**
 * PopularAccountsScraper - Scrape reels from popular accounts by keyword
 *
 * Strategy:
 * 1. Map keyword to list of relevant popular accounts
 * 2. Scrape public reels from each account
 * 3. Filter reels that contain the keyword in caption
 * 4. Return combined results
 */
export class PopularAccountsScraper {
  private config: Required<PopularAccountsScraperConfig>;
  private playwright: any = null;
  private browser: any = null;
  private customAccountMap: Map<string, string[]> = new Map();

  constructor(config: PopularAccountsScraperConfig = {}) {
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

      console.log(`[PopularAccountsScraper] Browser initialized (${this.config.browser})`);
    } catch (error) {
      console.error('[PopularAccountsScraper] Failed to initialize browser:', error);
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
        width: 390,
        height: 844,
      },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
    });

    const page = await context.newPage();

    // Block unnecessary resources
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico}', (route: any) => route.abort());
    await page.route('**/analytics**', (route: any) => route.abort());
    await page.route('**/logging**', (route: any) => route.abort());

    return page;
  }

  /**
   * Add custom keyword-account mapping
   */
  addAccountMapping(keyword: string, accounts: string[]): void {
    this.customAccountMap.set(keyword, accounts);
    console.log(`[PopularAccountsScraper] Added mapping: ${keyword} -> ${accounts.join(', ')}`);
  }

  /**
   * Get accounts for a keyword
   */
  getAccountsForKeyword(keyword: string): string[] {
    // Check custom map first
    if (this.customAccountMap.has(keyword)) {
      return this.customAccountMap.get(keyword)!;
    }

    // Check built-in map
    const normalizedKeyword = keyword.toLowerCase().replace(/^#/, '');

    for (const [key, accounts] of Object.entries(KEYWORD_ACCOUNT_MAP)) {
      if (key.toLowerCase() === normalizedKeyword || normalizedKeyword.includes(key.toLowerCase())) {
        return accounts;
      }
    }

    // Try partial match
    for (const [key, accounts] of Object.entries(KEYWORD_ACCOUNT_MAP)) {
      if (key.toLowerCase().includes(normalizedKeyword) || normalizedKeyword.includes(key.toLowerCase())) {
        return accounts;
      }
    }

    return [];
  }

  /**
   * Get reels from a public user profile
   */
  async getPublicReels(username: string, limit: number = 10): Promise<BuzzReel[]> {
    console.log(`[PopularAccountsScraper] Fetching reels from @${username}`);

    let page: any = null;

    try {
      page = await this.createPage();

      const reelsUrl = `https://www.instagram.com/${username}/reels/`;
      await page.goto(reelsUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });

      await page.waitForTimeout(2000);

      // Check if profile is accessible
      const notFound = await page.$('text=Sorry, this page');
      const privateAccount = await page.$('text=This account is private');
      const loginRequired = await page.$('text=Log in');

      if (notFound || privateAccount) {
        console.log(`[PopularAccountsScraper] Profile @${username} not accessible`);
        return [];
      }

      // If login is required, try alternative approach
      if (loginRequired) {
        console.log(`[PopularAccountsScraper] Login required for @${username}, trying alternative`);
        return this.getReelsViaOEmbed(username, limit);
      }

      // Extract reel shortcodes
      const shortcodes = await page.evaluate((maxItems: number) => {
        const results: string[] = [];
        const reelLinks = document.querySelectorAll('a[href*="/reel/"]');

        reelLinks.forEach((link) => {
          if (results.length >= maxItems) return;

          const href = link.getAttribute('href');
          const match = href?.match(/\/reel\/([A-Za-z0-9_-]+)/);
          if (match && !results.includes(match[1])) {
            results.push(match[1]);
          }
        });

        return results;
      }, limit);

      console.log(`[PopularAccountsScraper] Found ${shortcodes.length} reels from @${username}`);

      // Fetch details for each reel
      const reels: BuzzReel[] = [];

      for (const shortcode of shortcodes.slice(0, limit)) {
        const reel = await this.getReelDetails(shortcode, username);
        if (reel) {
          reels.push(reel);
        }

        await this.delay(300);
      }

      return reels;
    } catch (error) {
      console.error(`[PopularAccountsScraper] Error fetching reels from @${username}:`, error);
      return [];
    } finally {
      if (page) {
        await page.context().close();
      }
    }
  }

  /**
   * Get reels via oEmbed API (fallback)
   */
  private async getReelsViaOEmbed(username: string, limit: number): Promise<BuzzReel[]> {
    try {
      // Try to fetch profile page HTML to extract shortcodes
      const profileUrl = `https://www.instagram.com/${username}/`;

      const response = await fetch(profileUrl, {
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        return [];
      }

      const html = await response.text();

      // Extract shortcodes
      const shortcodeMatches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
      const shortcodes = [...new Set([...shortcodeMatches].map(m => m[1]))].slice(0, limit);

      if (shortcodes.length === 0) {
        const altMatches = html.matchAll(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/g);
        const altShortcodes = [...new Set([...altMatches].map(m => m[1]))].slice(0, limit);
        shortcodes.push(...altShortcodes);
      }

      // Fetch details
      const reels: BuzzReel[] = [];
      for (const shortcode of shortcodes) {
        const reel = await this.getReelDetails(shortcode, username);
        if (reel) {
          reels.push(reel);
        }
        await this.delay(300);
      }

      return reels;
    } catch (error) {
      console.error(`[PopularAccountsScraper] Error in oEmbed fallback:`, error);
      return [];
    }
  }

  /**
   * Get reel details using oEmbed API
   */
  private async getReelDetails(shortcode: string, username: string = ''): Promise<BuzzReel | null> {
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
        // Try post URL
        const postUrl = `https://www.instagram.com/p/${shortcode}/`;
        const postOembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(postUrl)}&omitscript=true`;

        const postResponse = await fetch(postOembedUrl, {
          headers: {
            'User-Agent': this.config.userAgent,
            'Accept': 'application/json',
          },
        });

        if (!postResponse.ok) {
          return this.createBasicReel(shortcode, username);
        }

        const data = await postResponse.json();
        return this.createBuzzReel(shortcode, postUrl, data, username);
      }

      const data = await response.json();
      return this.createBuzzReel(shortcode, normalizedUrl, data, username);
    } catch {
      return this.createBasicReel(shortcode, username);
    }
  }

  /**
   * Create a BuzzReel object from oEmbed data
   */
  private createBuzzReel(shortcode: string, url: string, oembedData: any, defaultUsername: string = ''): BuzzReel {
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
        username: oembedData.author_name || defaultUsername,
        followers: 0,
      },
      thumbnail_url: oembedData.thumbnail_url,
    };
  }

  /**
   * Create a basic BuzzReel with minimal data
   */
  private createBasicReel(shortcode: string, username: string): BuzzReel {
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
        username,
        followers: 0,
      },
    };
  }

  /**
   * Search for reels by keyword using popular accounts
   *
   * @param keyword - The keyword/hashtag to search for
   * @param limit - Maximum number of results
   * @returns Array of BuzzReel objects
   */
  async searchByKeyword(keyword: string, limit: number = 20): Promise<BuzzReel[]> {
    const normalizedKeyword = keyword.replace(/^#/, '').toLowerCase();
    console.log(`[PopularAccountsScraper] Searching for keyword: ${normalizedKeyword}`);

    const accounts = this.getAccountsForKeyword(keyword);

    if (accounts.length === 0) {
      console.log(`[PopularAccountsScraper] No accounts mapped for keyword: ${normalizedKeyword}`);
      return [];
    }

    console.log(`[PopularAccountsScraper] Found ${accounts.length} accounts for keyword`);

    const allReels: BuzzReel[] = [];
    const accountsToScrape = accounts.slice(0, this.config.maxAccountsPerKeyword);

    for (const account of accountsToScrape) {
      try {
        const reels = await this.getPublicReels(account, this.config.maxReelsPerAccount);

        // Filter reels that contain the keyword
        const matchingReels = reels.filter(reel => {
          const title = reel.title.toLowerCase();
          return title.includes(normalizedKeyword) ||
                 title.includes(`#${normalizedKeyword}`);
        });

        allReels.push(...matchingReels);
        console.log(`[PopularAccountsScraper] Found ${matchingReels.length} matching reels from @${account}`);

        // Rate limiting
        await this.delay(this.config.requestDelay);
      } catch (error) {
        console.error(`[PopularAccountsScraper] Error scraping @${account}:`, error);
      }

      if (allReels.length >= limit) {
        break;
      }
    }

    return allReels.slice(0, limit);
  }

  /**
   * Get all reels from popular accounts for a keyword (without filtering)
   */
  async getAllReelsForKeyword(keyword: string, limit: number = 20): Promise<BuzzReel[]> {
    const accounts = this.getAccountsForKeyword(keyword);

    if (accounts.length === 0) {
      return [];
    }

    const allReels: BuzzReel[] = [];

    for (const account of accounts.slice(0, this.config.maxAccountsPerKeyword)) {
      try {
        const reels = await this.getPublicReels(account, this.config.maxReelsPerAccount);
        allReels.push(...reels);

        await this.delay(this.config.requestDelay);
      } catch (error) {
        console.error(`[PopularAccountsScraper] Error scraping @${account}:`, error);
      }

      if (allReels.length >= limit) {
        break;
      }
    }

    return allReels.slice(0, limit);
  }

  /**
   * Get list of all mapped keywords
   */
  getAvailableKeywords(): string[] {
    const builtInKeywords = Object.keys(KEYWORD_ACCOUNT_MAP);
    const customKeywords = Array.from(this.customAccountMap.keys());
    return [...new Set([...builtInKeywords, ...customKeywords])];
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
      console.log('[PopularAccountsScraper] Browser closed');
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
export const popularAccountsScraper = new PopularAccountsScraper();
