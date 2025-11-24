/**
 * Instagram Embed API Scraper
 *
 * Uses Instagram's oEmbed API and embed endpoints for authentication-free data retrieval.
 * These endpoints are public and do not require cookies or login.
 *
 * @module services/instagram/publicScraper/embedScraper
 */

import { BuzzReel } from '../../../types/index.js';

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

/**
 * Response from Instagram oEmbed API
 */
interface OEmbedResponse {
  version: string;
  title: string;
  author_name: string;
  author_url: string;
  author_id: number;
  media_id: string;
  provider_name: string;
  provider_url: string;
  type: string;
  width: number;
  height?: number;
  html: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
}

/**
 * Parsed data from embed HTML
 */
interface EmbedData {
  shortcode: string;
  caption?: string;
  authorUsername?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  timestamp?: number;
}

/**
 * EmbedScraper - Authentication-free Instagram scraper using embed endpoints
 */
export class EmbedScraper {
  private readonly oembedBaseUrl = 'https://api.instagram.com/oembed/';
  private readonly embedBaseUrl = 'https://www.instagram.com';

  /**
   * Get reel information using oEmbed API
   * This is the most reliable method as it's an official API
   */
  async getReelByUrl(url: string): Promise<BuzzReel | null> {
    console.log('[EmbedScraper] Fetching reel via oEmbed API');

    try {
      const shortcode = this.extractShortcode(url);
      if (!shortcode) {
        console.log('[EmbedScraper] Could not extract shortcode from URL');
        return null;
      }

      // Normalize URL for oEmbed
      const normalizedUrl = `https://www.instagram.com/reel/${shortcode}/`;
      const oembedUrl = `${this.oembedBaseUrl}?url=${encodeURIComponent(normalizedUrl)}&omitscript=true`;

      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.log(`[EmbedScraper] oEmbed API returned ${response.status}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.log('[EmbedScraper] oEmbed returned non-JSON response');
        return null;
      }

      const data: OEmbedResponse = await response.json();

      // Try to get additional data from embed page
      const embedData = await this.scrapeEmbedPage(shortcode);

      return {
        id: data.media_id || shortcode,
        url: normalizedUrl,
        shortcode,
        title: data.title || embedData?.caption?.slice(0, 100) || '',
        views: 0, // oEmbed doesn't provide view count
        likes: 0, // oEmbed doesn't provide like count
        comments: 0, // oEmbed doesn't provide comment count
        posted_at: embedData?.timestamp ? new Date(embedData.timestamp * 1000) : new Date(),
        author: {
          username: data.author_name || embedData?.authorUsername || '',
          followers: 0,
        },
        thumbnail_url: data.thumbnail_url || embedData?.thumbnailUrl,
      };
    } catch (error) {
      console.error('[EmbedScraper] Error fetching reel:', error);
      return null;
    }
  }

  /**
   * Scrape the embed page for additional data
   * The embed page is publicly accessible without authentication
   */
  async scrapeEmbedPage(shortcode: string): Promise<EmbedData | null> {
    try {
      const embedUrl = `${this.embedBaseUrl}/p/${shortcode}/embed/`;

      const response = await fetch(embedUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      return this.parseEmbedHtml(html, shortcode);
    } catch (error) {
      console.error('[EmbedScraper] Error scraping embed page:', error);
      return null;
    }
  }

  /**
   * Parse embed HTML to extract data
   */
  private parseEmbedHtml(html: string, shortcode: string): EmbedData {
    const data: EmbedData = { shortcode };

    // Extract caption from embed HTML
    const captionMatch = html.match(/<div class="Caption"[^>]*>.*?<div[^>]*>([^<]+)/s);
    if (captionMatch) {
      data.caption = captionMatch[1].trim();
    }

    // Extract author username
    const authorMatch = html.match(/class="UsernameText"[^>]*>([^<]+)/);
    if (authorMatch) {
      data.authorUsername = authorMatch[1].trim();
    }

    // Extract thumbnail URL
    const thumbnailMatch = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/);
    if (thumbnailMatch) {
      data.thumbnailUrl = thumbnailMatch[1];
    }

    // Extract video URL if available
    const videoMatch = html.match(/<video[^>]*src="([^"]+)"/);
    if (videoMatch) {
      data.videoUrl = videoMatch[1];
    }

    // Extract timestamp
    const timeMatch = html.match(/datetime="([^"]+)"/);
    if (timeMatch) {
      data.timestamp = Math.floor(new Date(timeMatch[1]).getTime() / 1000);
    }

    return data;
  }

  /**
   * Get basic reel info from multiple reels (batch)
   */
  async getReelsBatch(urls: string[]): Promise<BuzzReel[]> {
    console.log(`[EmbedScraper] Batch fetching ${urls.length} reels`);

    const results: BuzzReel[] = [];

    // Process in parallel with rate limiting
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const promises = batch.map(url => this.getReelByUrl(url));
      const batchResults = await Promise.all(promises);

      batchResults.forEach(result => {
        if (result) results.push(result);
      });

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < urls.length) {
        await this.delay(500);
      }
    }

    return results;
  }

  /**
   * Search for public posts by username using embed scraping
   * Limited functionality without authentication
   */
  async getPublicReelsFromUser(username: string, limit: number = 10): Promise<BuzzReel[]> {
    console.log(`[EmbedScraper] Attempting to get reels from @${username} (limited)`);

    try {
      // Try to scrape the profile page for shortcodes
      const profileUrl = `${this.embedBaseUrl}/${username}/`;

      const response = await fetch(profileUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        console.log(`[EmbedScraper] Could not access profile page: ${response.status}`);
        return [];
      }

      const html = await response.text();

      // Extract shortcodes from profile page
      const shortcodeMatches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
      const shortcodes = [...new Set([...shortcodeMatches].map(m => m[1]))].slice(0, limit);

      if (shortcodes.length === 0) {
        // Try alternative pattern
        const altMatches = html.matchAll(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/g);
        const altShortcodes = [...new Set([...altMatches].map(m => m[1]))].slice(0, limit);
        shortcodes.push(...altShortcodes);
      }

      console.log(`[EmbedScraper] Found ${shortcodes.length} shortcodes`);

      // Fetch details for each shortcode
      const urls = shortcodes.map(code => `https://www.instagram.com/reel/${code}/`);
      return this.getReelsBatch(urls);
    } catch (error) {
      console.error('[EmbedScraper] Error getting user reels:', error);
      return [];
    }
  }

  /**
   * Check if the oEmbed API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Test with a known public post
      const testUrl = `${this.oembedBaseUrl}?url=${encodeURIComponent('https://www.instagram.com/p/test/')}&omitscript=true`;

      const response = await fetch(testUrl, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      // 400 is expected for invalid shortcode, but confirms API is available
      // 200 or 404 also indicates API is responding
      return response.status !== 503 && response.status !== 502;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract shortcode from Instagram URL
   */
  private extractShortcode(url: string): string | null {
    const match = url.match(/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    return match?.[1] || null;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const embedScraper = new EmbedScraper();
