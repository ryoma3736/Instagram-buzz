/**
 * HTML Scraping Strategy for Instagram
 * Issue #15: Direct HTML scraping with multiple extraction methods
 * @module services/multiStrategy/strategies/htmlScrapingStrategy
 */

import { BuzzReel } from '../../../types/index.js';
import { StrategyResult, StrategyConfig } from '../types.js';
import { BaseStrategy, USER_AGENTS } from './baseStrategy.js';

/**
 * HTML Scraping Strategy
 * Uses direct HTML scraping with multiple extraction patterns
 * Best for: When API endpoints are blocked or rate limited
 */
export class HtmlScrapingStrategy extends BaseStrategy {
  constructor(config: StrategyConfig) {
    super('html_scraping', config);
  }

  /**
   * Search by hashtag via HTML scraping
   */
  async searchByHashtag(
    hashtag: string,
    limit: number
  ): Promise<StrategyResult> {
    const startTime = Date.now();
    const tag = hashtag.replace(/^#/, '');

    this.log(`Searching hashtag #${tag} via HTML scraping`);

    try {
      const result = await this.withRetry(async () => {
        const pageUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;

        const response = await fetch(pageUrl, {
          headers: this.buildHeaders({
            userAgent: USER_AGENTS.ios,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
            acceptLanguage: 'en-US,en;q=0.9',
            referer: 'https://www.instagram.com/',
          }),
        });

        const html = await response.text();

        // Check for blocking
        const blockDetection = this.detectBlock(response, html);
        if (blockDetection.blocked) {
          throw new Error(`Blocked: ${blockDetection.blockType}`);
        }

        // Try multiple extraction methods
        let reels = this.extractFromSharedData(html, tag);
        if (reels.length === 0) {
          reels = this.extractFromEmbeddedJson(html);
        }
        if (reels.length === 0) {
          reels = this.extractFromShortcodes(html);
        }

        // Enrich reels with additional info
        const enrichedReels: BuzzReel[] = [];
        for (const reel of reels.slice(0, limit)) {
          const enriched = await this.enrichReelInfo(reel);
          enrichedReels.push(enriched);
        }

        return enrichedReels;
      }, `hashtagSearch:${tag}`);

      const executionTimeMs = Date.now() - startTime;
      return this.createSuccessResult(result, executionTimeMs);
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return this.createFailedResult(
        (error as Error).message,
        executionTimeMs
      );
    }
  }

  /**
   * Get user reels via HTML scraping
   */
  async getUserReels(username: string, limit: number): Promise<StrategyResult> {
    const startTime = Date.now();

    this.log(`Fetching reels from @${username} via HTML scraping`);

    try {
      const result = await this.withRetry(async () => {
        // Try reels page first
        let reels = await this.scrapeUserReelsPage(username, limit);

        // If no results, try main profile page
        if (reels.length === 0) {
          reels = await this.scrapeUserProfilePage(username, limit);
        }

        return reels;
      }, `userReels:${username}`);

      const executionTimeMs = Date.now() - startTime;
      return this.createSuccessResult(result, executionTimeMs);
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return this.createFailedResult(
        (error as Error).message,
        executionTimeMs
      );
    }
  }

  /**
   * Get single reel by URL via HTML scraping
   */
  async getReelByUrl(url: string): Promise<StrategyResult> {
    const startTime = Date.now();
    const shortcode = this.extractShortcode(url);

    if (!shortcode) {
      return this.createFailedResult(
        'Invalid URL: no shortcode found',
        Date.now() - startTime
      );
    }

    this.log(`Fetching reel ${shortcode} via HTML scraping`);

    try {
      const result = await this.withRetry(async () => {
        // Try reel page
        const reelUrl = `https://www.instagram.com/reel/${shortcode}/`;
        let response = await fetch(reelUrl, {
          headers: this.buildHeaders({
            userAgent: USER_AGENTS.ios,
            accept: 'text/html',
          }),
        });

        let html = await response.text();

        // Check for blocking
        let blockDetection = this.detectBlock(response, html);
        if (blockDetection.blocked) {
          // Try post URL as fallback
          const postUrl = `https://www.instagram.com/p/${shortcode}/`;
          response = await fetch(postUrl, {
            headers: this.buildHeaders({
              userAgent: USER_AGENTS.desktop,
              accept: 'text/html',
            }),
          });
          html = await response.text();
          blockDetection = this.detectBlock(response, html);
          if (blockDetection.blocked) {
            throw new Error(`Blocked: ${blockDetection.blockType}`);
          }
        }

        return this.extractReelFromHtml(html, shortcode);
      }, `getReelByUrl:${shortcode}`);

      const executionTimeMs = Date.now() - startTime;
      return this.createSuccessResult(result ? [result] : [], executionTimeMs);
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return this.createFailedResult(
        (error as Error).message,
        executionTimeMs
      );
    }
  }

  /**
   * Get trending reels via HTML scraping
   */
  async getTrendingReels(limit: number): Promise<StrategyResult> {
    const startTime = Date.now();

    this.log(`Fetching trending reels via HTML scraping`);

    try {
      const result = await this.withRetry(async () => {
        const response = await fetch('https://www.instagram.com/reels/', {
          headers: this.buildHeaders({
            userAgent: USER_AGENTS.ios,
            accept: 'text/html',
          }),
        });

        const html = await response.text();

        // Check for blocking
        const blockDetection = this.detectBlock(response, html);
        if (blockDetection.blocked) {
          throw new Error(`Blocked: ${blockDetection.blockType}`);
        }

        // Extract reels from page
        let reels = this.extractFromEmbeddedJson(html);
        if (reels.length === 0) {
          reels = this.extractFromShortcodes(html);
        }

        // Enrich with details
        const enrichedReels: BuzzReel[] = [];
        for (const reel of reels.slice(0, Math.min(10, limit))) {
          const enriched = await this.enrichReelInfo(reel);
          enrichedReels.push(enriched);
        }

        return enrichedReels.sort((a, b) => b.views - a.views);
      }, 'trendingReels');

      const executionTimeMs = Date.now() - startTime;
      return this.createSuccessResult(result, executionTimeMs);
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      return this.createFailedResult(
        (error as Error).message,
        executionTimeMs
      );
    }
  }

  /**
   * Extract data from window._sharedData
   */
  private extractFromSharedData(html: string, context: string): BuzzReel[] {
    const match = html.match(
      /window\._sharedData\s*=\s*(\{.+?\});<\/script>/s
    );
    if (!match) {
      return [];
    }

    const data = this.safeJsonParse<any>(match[1], `sharedData:${context}`);
    if (!data) {
      return [];
    }

    // Try different paths in sharedData
    const edges =
      data?.entry_data?.TagPage?.[0]?.graphql?.hashtag
        ?.edge_hashtag_to_media?.edges ||
      data?.entry_data?.ProfilePage?.[0]?.graphql?.user
        ?.edge_owner_to_timeline_media?.edges ||
      data?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media
        ? [{ node: data.entry_data.PostPage[0].graphql.shortcode_media }]
        : [];

    return edges
      .filter((e: any) => e.node?.is_video)
      .map((e: any) => this.transformNodeToReel(e.node));
  }

  /**
   * Extract data from embedded JSON scripts
   */
  private extractFromEmbeddedJson(html: string): BuzzReel[] {
    const reels: BuzzReel[] = [];

    // Pattern 1: Application JSON scripts
    const jsonMatches = html.matchAll(
      /<script type="application\/json"[^>]*>(.*?)<\/script>/gs
    );

    for (const match of jsonMatches) {
      try {
        const data = JSON.parse(match[1]);

        // Look for clips data
        const clips = this.findClipsInObject(data);
        for (const clip of clips) {
          if (clip.media) {
            reels.push(this.transformMediaToReel(clip.media));
          }
        }
      } catch {
        // Continue with other scripts
      }
    }

    // Pattern 2: Inline scripts with data
    const inlineMatches = html.matchAll(
      /require\(\[\]\,function\(\)\{return\s*(\{.*?\})\}\)/gs
    );

    for (const match of inlineMatches) {
      try {
        const data = JSON.parse(match[1]);
        const clips = this.findClipsInObject(data);
        for (const clip of clips) {
          if (clip.media) {
            reels.push(this.transformMediaToReel(clip.media));
          }
        }
      } catch {
        // Continue
      }
    }

    return reels;
  }

  /**
   * Extract shortcodes from HTML and create basic reel objects
   */
  private extractFromShortcodes(html: string): BuzzReel[] {
    const reels: BuzzReel[] = [];

    // Extract shortcodes
    const shortcodeMatches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
    const codeMatches = html.matchAll(/"code":"([A-Za-z0-9_-]+)"/g);

    const allCodes = new Set([
      ...[...shortcodeMatches].map((m) => m[1]),
      ...[...codeMatches].map((m) => m[1]),
    ]);

    for (const code of allCodes) {
      // Try to find associated metrics
      const likeMatch = new RegExp(
        `"shortcode":"${code}"[^}]*"edge_liked_by":\\{"count":(\\d+)`
      ).exec(html);
      const viewMatch = new RegExp(
        `"code":"${code}"[^}]*"play_count":(\\d+)`
      ).exec(html);
      const commentMatch = new RegExp(
        `"shortcode":"${code}"[^}]*"edge_media_to_comment":\\{"count":(\\d+)`
      ).exec(html);

      reels.push({
        id: code,
        url: `https://www.instagram.com/reel/${code}/`,
        shortcode: code,
        title: '',
        views: viewMatch ? parseInt(viewMatch[1], 10) : 0,
        likes: likeMatch ? parseInt(likeMatch[1], 10) : 0,
        comments: commentMatch ? parseInt(commentMatch[1], 10) : 0,
        posted_at: new Date(),
        author: { username: 'unknown', followers: 0 },
      });
    }

    return reels;
  }

  /**
   * Extract reel from individual reel/post page
   */
  private extractReelFromHtml(html: string, shortcode: string): BuzzReel | null {
    // Try sharedData first
    const sharedDataMatch = html.match(
      /window\._sharedData\s*=\s*(\{.+?\});<\/script>/s
    );

    if (sharedDataMatch) {
      const data = this.safeJsonParse<any>(sharedDataMatch[1], `reel:${shortcode}`);
      if (data?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media) {
        return this.transformNodeToReel(
          data.entry_data.PostPage[0].graphql.shortcode_media
        );
      }
    }

    // Try additional_data
    const additionalDataMatch = html.match(
      /window\.__additionalDataLoaded\s*\([^,]+,\s*(\{.+?\})\);/s
    );

    if (additionalDataMatch) {
      const data = this.safeJsonParse<any>(additionalDataMatch[1], `additionalData:${shortcode}`);
      if (data?.graphql?.shortcode_media) {
        return this.transformNodeToReel(data.graphql.shortcode_media);
      }
      if (data?.items?.[0]) {
        return this.transformMediaToReel(data.items[0]);
      }
    }

    // Try embedded JSON
    const jsonMatches = html.matchAll(
      /<script type="application\/json"[^>]*>(.*?)<\/script>/gs
    );

    for (const match of jsonMatches) {
      try {
        const data = JSON.parse(match[1]);
        const media = this.findMediaByShortcode(data, shortcode);
        if (media) {
          return this.transformMediaToReel(media);
        }
      } catch {
        // Continue
      }
    }

    // Fallback: extract what we can from meta tags
    const ogTitle = this.extractMetaContent(html, 'og:title');
    const ogImage = this.extractMetaContent(html, 'og:image');

    return {
      id: shortcode,
      url: `https://www.instagram.com/reel/${shortcode}/`,
      shortcode,
      title: ogTitle || '',
      views: 0,
      likes: 0,
      comments: 0,
      posted_at: new Date(),
      author: { username: 'unknown', followers: 0 },
      thumbnail_url: ogImage || undefined,
    };
  }

  /**
   * Scrape user's reels page
   */
  private async scrapeUserReelsPage(
    username: string,
    limit: number
  ): Promise<BuzzReel[]> {
    const pageUrl = `https://www.instagram.com/${username}/reels/`;

    const response = await fetch(pageUrl, {
      headers: this.buildHeaders({
        userAgent: USER_AGENTS.ios,
        accept: 'text/html',
      }),
    });

    const html = await response.text();

    // Check for blocking
    const blockDetection = this.detectBlock(response, html);
    if (blockDetection.blocked) {
      throw new Error(`Blocked: ${blockDetection.blockType}`);
    }

    // Try to extract clips from embedded JSON
    const scriptMatch = html.match(
      /<script type="application\/json"[^>]*>(\{.*?"xdt_api__v1__clips__user__connection_v2".*?\})<\/script>/s
    );

    if (scriptMatch) {
      const data = this.safeJsonParse<any>(scriptMatch[1], `userReels:${username}`);
      if (data) {
        const clips =
          data?.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]?.__bbox
            ?.result?.data?.xdt_api__v1__clips__user__connection_v2?.edges;

        if (clips) {
          return clips.slice(0, limit).map((edge: any) =>
            this.transformClipEdgeToReel(edge, username)
          );
        }
      }
    }

    // Fallback to shortcode extraction
    const codes = this.extractFromShortcodes(html);
    return codes.slice(0, limit).map((r) => ({
      ...r,
      author: { username, followers: 0 },
    }));
  }

  /**
   * Scrape user's main profile page
   */
  private async scrapeUserProfilePage(
    username: string,
    limit: number
  ): Promise<BuzzReel[]> {
    const pageUrl = `https://www.instagram.com/${username}/`;

    const response = await fetch(pageUrl, {
      headers: this.buildHeaders({
        userAgent: USER_AGENTS.desktop,
        accept: 'text/html',
      }),
    });

    const html = await response.text();

    // Check for blocking
    const blockDetection = this.detectBlock(response, html);
    if (blockDetection.blocked) {
      throw new Error(`Blocked: ${blockDetection.blockType}`);
    }

    const reels = this.extractFromSharedData(html, username);
    return reels.slice(0, limit).map((r) => ({
      ...r,
      author: { username, followers: r.author.followers },
    }));
  }

  /**
   * Enrich reel with additional info if metrics are missing
   */
  private async enrichReelInfo(reel: BuzzReel): Promise<BuzzReel> {
    // If we already have metrics, no need to enrich
    if (reel.views > 0 || reel.likes > 0) {
      return reel;
    }

    try {
      // Try to get more info from ?__a=1&__d=dis endpoint
      const infoUrl = `https://www.instagram.com/p/${reel.shortcode}/?__a=1&__d=dis`;
      const response = await fetch(infoUrl, {
        headers: this.buildHeaders({
          userAgent: USER_AGENTS.ios,
          xIgAppId: '936619743392459',
          xRequestedWith: 'XMLHttpRequest',
        }),
      });

      const text = await response.text();

      if (!this.isHtmlResponse(text)) {
        const data = this.safeJsonParse<any>(text, `enrich:${reel.shortcode}`);
        if (data) {
          const media = data.graphql?.shortcode_media || data.items?.[0];
          if (media) {
            return {
              ...reel,
              title:
                media.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(
                  0,
                  100
                ) ||
                media.caption?.text?.slice(0, 100) ||
                reel.title,
              views: media.video_view_count || media.play_count || reel.views,
              likes:
                media.edge_media_preview_like?.count ||
                media.like_count ||
                reel.likes,
              comments:
                media.edge_media_to_comment?.count ||
                media.comment_count ||
                reel.comments,
              author: {
                username: media.owner?.username || reel.author.username,
                followers:
                  media.owner?.edge_followed_by?.count ||
                  reel.author.followers,
              },
              thumbnail_url:
                media.thumbnail_src ||
                media.image_versions2?.candidates?.[0]?.url ||
                reel.thumbnail_url,
            };
          }
        }
      }
    } catch {
      // Return original reel if enrichment fails
    }

    return reel;
  }

  /**
   * Find clips data in nested object
   */
  private findClipsInObject(obj: any, depth = 0): any[] {
    if (depth > 10 || !obj || typeof obj !== 'object') {
      return [];
    }

    const clips: any[] = [];

    if (Array.isArray(obj)) {
      for (const item of obj) {
        clips.push(...this.findClipsInObject(item, depth + 1));
      }
    } else {
      // Check if this is a clips container
      if (obj.edges && Array.isArray(obj.edges)) {
        for (const edge of obj.edges) {
          if (edge.node?.media || edge.media) {
            clips.push(edge.node || edge);
          }
        }
      }

      // Check if this is a media item
      if (obj.media && (obj.media.is_video || obj.media.code)) {
        clips.push(obj);
      }

      // Recurse into children
      for (const key of Object.keys(obj)) {
        clips.push(...this.findClipsInObject(obj[key], depth + 1));
      }
    }

    return clips;
  }

  /**
   * Find media by shortcode in nested object
   */
  private findMediaByShortcode(obj: any, shortcode: string, depth = 0): any {
    if (depth > 10 || !obj || typeof obj !== 'object') {
      return null;
    }

    if (obj.shortcode === shortcode || obj.code === shortcode) {
      return obj;
    }

    if (obj.media?.code === shortcode) {
      return obj.media;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = this.findMediaByShortcode(item, shortcode, depth + 1);
        if (found) return found;
      }
    } else {
      for (const key of Object.keys(obj)) {
        const found = this.findMediaByShortcode(
          obj[key],
          shortcode,
          depth + 1
        );
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Extract meta tag content
   */
  private extractMetaContent(html: string, property: string): string | null {
    const match = html.match(
      new RegExp(`<meta[^>]*property="${property}"[^>]*content="([^"]*)"`)
    );
    return match?.[1] || null;
  }

  /**
   * Transform GraphQL node to BuzzReel
   */
  private transformNodeToReel(node: any): BuzzReel {
    return {
      id: node.id,
      url: `https://www.instagram.com/reel/${node.shortcode}/`,
      shortcode: node.shortcode,
      title:
        node.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) || '',
      views: node.video_view_count || 0,
      likes:
        node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
      comments: node.edge_media_to_comment?.count || 0,
      posted_at: new Date(node.taken_at_timestamp * 1000),
      author: {
        username: node.owner?.username || 'unknown',
        followers: node.owner?.edge_followed_by?.count || 0,
      },
      thumbnail_url: node.thumbnail_src || node.display_url,
    };
  }

  /**
   * Transform media object to BuzzReel
   */
  private transformMediaToReel(media: any): BuzzReel {
    return {
      id: media.pk || media.id,
      url: `https://www.instagram.com/reel/${media.code || media.shortcode}/`,
      shortcode: media.code || media.shortcode,
      title: media.caption?.text?.slice(0, 100) || '',
      views: media.play_count || media.video_view_count || 0,
      likes: media.like_count || media.edge_media_preview_like?.count || 0,
      comments: media.comment_count || media.edge_media_to_comment?.count || 0,
      posted_at: new Date((media.taken_at || 0) * 1000),
      author: {
        username: media.user?.username || media.owner?.username || 'unknown',
        followers: 0,
      },
      thumbnail_url: media.image_versions2?.candidates?.[0]?.url,
    };
  }

  /**
   * Transform clip edge to BuzzReel
   */
  private transformClipEdgeToReel(edge: any, username: string): BuzzReel {
    const media = edge.node?.media || edge.media;
    return {
      id: media?.pk || edge.node?.id,
      url: `https://www.instagram.com/reel/${media?.code || ''}/`,
      shortcode: media?.code || '',
      title: media?.caption?.text?.slice(0, 100) || '',
      views: media?.play_count || 0,
      likes: media?.like_count || 0,
      comments: media?.comment_count || 0,
      posted_at: new Date((media?.taken_at || 0) * 1000),
      author: { username, followers: 0 },
      thumbnail_url: media?.image_versions2?.candidates?.[0]?.url,
    };
  }
}
