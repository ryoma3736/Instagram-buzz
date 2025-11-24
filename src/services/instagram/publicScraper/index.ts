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

// DuckDuckGo Search-based Scraper (more lenient bot detection)
export {
  DuckDuckGoScraper,
  duckduckgoScraper,
} from './duckduckgoScraper.js';
export type { DuckDuckGoScraperConfig } from './duckduckgoScraper.js';

// Popular Accounts-based Scraper
export {
  PopularAccountsScraper,
  popularAccountsScraper,
} from './popularAccountsScraper.js';
export type { PopularAccountsScraperConfig } from './popularAccountsScraper.js';

// Instagram Explore Page Scraper
export {
  ExploreScraper,
  exploreScraper,
} from './exploreScraper.js';
export type { ExploreScraperConfig } from './exploreScraper.js';
