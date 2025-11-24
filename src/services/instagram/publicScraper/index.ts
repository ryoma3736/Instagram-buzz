/**
 * Public Scraper Module
 *
 * Exports authentication-free Instagram scrapers.
 * These scrapers work without cookies or login.
 *
 * @module services/instagram/publicScraper
 */

// Embed API Scraper
export {
  EmbedScraper,
  embedScraper,
} from './embedScraper.js';

// Playwright Browser Scraper
export {
  PlaywrightScraper,
  playwrightScraper,
} from './playwrightScraper.js';
export type { PlaywrightScraperConfig } from './playwrightScraper.js';

// Google Search-based Scraper
export {
  GoogleSearchScraper,
  googleSearchScraper,
} from './googleSearchScraper.js';
export type { GoogleSearchScraperConfig } from './googleSearchScraper.js';

// Popular Accounts-based Scraper
export {
  PopularAccountsScraper,
  popularAccountsScraper,
} from './popularAccountsScraper.js';
export type { PopularAccountsScraperConfig } from './popularAccountsScraper.js';
