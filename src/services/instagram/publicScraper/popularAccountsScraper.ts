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
 * These are verified public accounts known for creating content in these niches
 * Updated with real, active accounts as of 2024
 */
const KEYWORD_ACCOUNT_MAP: Record<string, string[]> = {
  // Official & General (High traffic, always public)
  'トレンド': ['instagram', 'natgeo', 'nike', 'bbcnews', 'time'],
  '話題': ['instagram', 'natgeo', 'bbcnews', 'cnn', 'reuters'],
  'ニュース': ['bbcnews', 'cnn', 'reuters', 'afpphoto', 'apnews'],

  // Photography & Nature
  '写真': ['natgeo', 'natgeotravel', 'earthpix', 'discoverearth', 'wonderful_places'],
  '自然': ['natgeo', 'natgeowild', 'earthpix', 'wildlife', 'bbcearth'],
  '動物': ['natgeowild', 'wildlife', 'animals', 'bbcearth', 'discovery'],
  '風景': ['natgeotravel', 'earthpix', 'wonderful_places', 'beautifuldestinations', 'discoverearth'],

  // Travel
  '旅行': ['natgeotravel', 'beautifuldestinations', 'wonderful_places', 'travelchannel', 'lonelyplanet'],
  'トラベル': ['beautifuldestinations', 'natgeotravel', 'travelchannel', 'lonelyplanet', 'tripadvisor'],
  '観光': ['beautifuldestinations', 'wonderful_places', 'lonelyplanet', 'tripadvisor', 'airbnb'],

  // Food & Cooking
  '料理': ['tasty', 'buzzfeedtasty', 'foodnetwork', 'food52', 'delish'],
  'レシピ': ['tasty', 'buzzfeedtasty', 'food52', 'delish', 'bonappetitmag'],
  'グルメ': ['foodnetwork', 'eaboraofficial', 'tastemade', 'thefeedfeed', 'food'],
  '食べ物': ['tasty', 'foodnetwork', 'tastemade', 'thefeedfeed', 'food52'],

  // Fitness & Health
  'フィットネス': ['nike', 'niketraining', 'gymshark', 'underarmour', 'adidas'],
  '筋トレ': ['gymshark', 'nike', 'underarmour', 'menshealth', 'muscleandfitness'],
  'ダイエット': ['nike', 'niketraining', 'womenshealthmag', 'shape', 'self'],
  'ヨガ': ['yoga', 'yogajournal', 'alo', 'lululemon', 'gaaborang'],
  '健康': ['womenshealthmag', 'menshealth', 'healthmagazine', 'webmd', 'self'],

  // Fashion & Beauty
  'ファッション': ['vogue', 'elle', 'harpersbazaarus', 'cosmopolitan', 'gq'],
  '美容': ['sephora', 'ultabeauty', 'hudabeauty', 'fentybeauty', 'nyxcosmetics'],
  'メイク': ['sephora', 'hudabeauty', 'fentybeauty', 'maccosmetics', 'nyxcosmetics'],
  'コスメ': ['sephora', 'ultabeauty', 'hudabeauty', 'fentybeauty', 'benefitcosmetics'],

  // Technology & Business
  'テクノロジー': ['wired', 'techcrunch', 'theverge', 'engadget', 'mashable'],
  'AI': ['wired', 'techcrunch', 'mit', 'ibm', 'google'],
  'ビジネス': ['forbes', 'entrepreneur', 'inc', 'fastcompany', 'harvard'],
  'スタートアップ': ['techcrunch', 'forbes', 'entrepreneur', 'ycombinator', 'sequoia'],

  // Entertainment & Music
  '音楽': ['spotify', 'applemusic', 'billboard', 'rollingstone', 'mtv'],
  'エンタメ': ['netflix', 'hbo', 'disney', 'marvel', 'dccomics'],
  '映画': ['netflix', 'disney', 'marvel', 'dccomics', 'warnerbrosent'],
  'アニメ': ['crunchyroll', 'funimation', 'viz', 'netflix', 'disney'],

  // Sports
  'スポーツ': ['espn', 'sportscenter', 'bleacherreport', 'nike', 'adidas'],
  'サッカー': ['championsleague', 'fifaworldcup', 'premierleague', 'laliga', 'seriea'],
  'バスケ': ['nba', 'espn', 'bleacherreport', 'nike', 'jordan'],

  // Art & Design
  'アート': ['artsy', 'arts', 'contemporaryart', 'moma', 'tatemuseum'],
  'デザイン': ['designmilk', 'dezeen', 'archdaily', 'designboom', 'adobe'],
  'インテリア': ['architectural_digest', 'elledecor', 'designmilk', 'dezeen', 'dwell'],

  // Japanese specific (verified public accounts)
  '日本': ['japantravel', 'visitjapanjp', 'japantravelcom', 'japan', 'tokyocameraclub'],
  '東京': ['tokyocameraclub', 'tokyo_camera_club', 'visitjapanjp', 'japantravel', 'japan'],
  '京都': ['visitjapanjp', 'japantravel', 'japan', 'kyoto_style', 'japantravelcom'],

  // Lifestyle & Motivation
  '自己啓発': ['ted', 'goalcast', 'thegoodquote', 'entrepreneur', 'garyvee'],
  'モチベーション': ['goalcast', 'garyvee', 'ted', 'entrepreneur', 'success'],
  'ライフスタイル': ['mindbodygreen', 'goop', 'wellgood', 'thegoodtrade', 'refinery29'],

  // Education
  '教育': ['ted', 'tedtalks', 'natgeo', 'nasa', 'mit'],
  '科学': ['nasa', 'natgeo', 'sciencechannel', 'mit', 'spacex'],
  '宇宙': ['nasa', 'spacex', 'natgeo', 'esa', 'hubble_space'],
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
