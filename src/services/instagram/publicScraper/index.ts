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
  PlaywrightScraperConfig,
  playwrightScraper,
} from './playwrightScraper.js';
