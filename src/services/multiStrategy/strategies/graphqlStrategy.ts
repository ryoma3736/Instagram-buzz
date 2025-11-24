/**
 * GraphQL API Strategy for Instagram Scraping
 * Issue #15: Uses Instagram's GraphQL endpoints
 * @module services/multiStrategy/strategies/graphqlStrategy
 */

import { BuzzReel } from '../../../types/index.js';
import { StrategyResult, StrategyConfig } from '../types.js';
import { BaseStrategy, USER_AGENTS } from './baseStrategy.js';

/**
 * GraphQL query hashes for different operations
 */
const QUERY_HASHES = {
  // Hashtag posts query
  hashtagPosts: 'f92f56d47dc7a55b606908374b43a314',
  // User media query
  userMedia: 'e769aa130647d2354c40ea6a439bfc08',
  // Single media query
  mediaInfo: '47b90e5a6c69e28f31bc2c30c5a9c0b6',
  // Explore/trending
  explore: '2c5d4d8b70cad329c4a6ebe3abb6eedd',
};

/**
 * GraphQL API Strategy
 * Uses Instagram's internal GraphQL API for data retrieval
 */
export class GraphQLStrategy extends BaseStrategy {
  private readonly graphqlUrl = 'https://www.instagram.com/graphql/query/';

  constructor(config: StrategyConfig) {
    super('graphql_api', config);
  }

  /**
   * Search by hashtag using GraphQL
   */
  async searchByHashtag(
    hashtag: string,
    limit: number
  ): Promise<StrategyResult> {
    const startTime = Date.now();
    const tag = hashtag.replace(/^#/, '');

    this.log(`Searching hashtag #${tag} (limit: ${limit})`);

    try {
      const result = await this.withRetry(async () => {
        // First, get hashtag info from web page
        const pageUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
        const pageResponse = await fetch(pageUrl, {
          headers: this.buildHeaders({
            userAgent: USER_AGENTS.desktop,
            accept: 'text/html',
            referer: 'https://www.instagram.com/',
          }),
        });

        const html = await pageResponse.text();

        // Check for blocking
        const blockDetection = this.detectBlock(pageResponse, html);
        if (blockDetection.blocked) {
          throw new Error(`Blocked: ${blockDetection.blockType}`);
        }

        // Try to extract data from embedded JSON
        const reels = this.extractFromEmbeddedJson(html, limit);
        if (reels.length > 0) {
          return reels;
        }

        // Fallback: Try GraphQL query
        return await this.queryGraphQL(tag, limit);
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
   * Get user reels using GraphQL
   */
  async getUserReels(username: string, limit: number): Promise<StrategyResult> {
    const startTime = Date.now();

    this.log(`Fetching reels from @${username} (limit: ${limit})`);

    try {
      const result = await this.withRetry(async () => {
        // Fetch user page
        const pageUrl = `https://www.instagram.com/${username}/reels/`;
        const pageResponse = await fetch(pageUrl, {
          headers: this.buildHeaders({
            userAgent: USER_AGENTS.ios,
            accept: 'text/html',
            referer: 'https://www.instagram.com/',
          }),
        });

        const html = await pageResponse.text();

        // Check for blocking
        const blockDetection = this.detectBlock(pageResponse, html);
        if (blockDetection.blocked) {
          throw new Error(`Blocked: ${blockDetection.blockType}`);
        }

        return this.extractUserReelsFromHtml(html, username, limit);
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
   * Get single reel by URL using GraphQL
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

    this.log(`Fetching reel ${shortcode}`);

    try {
      const result = await this.withRetry(async () => {
        // Try ?__a=1&__d=dis endpoint
        const infoUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
        const response = await fetch(infoUrl, {
          headers: this.buildHeaders({
            userAgent: USER_AGENTS.ios,
            accept: '*/*',
            xIgAppId: '936619743392459',
            xRequestedWith: 'XMLHttpRequest',
          }),
        });

        const text = await response.text();

        // Check for HTML response
        if (this.isHtmlResponse(text)) {
          throw new Error('Received HTML instead of JSON');
        }

        const data = this.safeJsonParse<any>(text, `reel:${shortcode}`);
        if (!data) {
          throw new Error('Failed to parse response');
        }

        const media = data.graphql?.shortcode_media || data.items?.[0];
        if (!media) {
          throw new Error('Media not found in response');
        }

        return this.transformMediaToReel(media);
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
   * Get trending reels using GraphQL/explore
   */
  async getTrendingReels(limit: number): Promise<StrategyResult> {
    const startTime = Date.now();

    this.log(`Fetching trending reels (limit: ${limit})`);

    try {
      const result = await this.withRetry(async () => {
        // Fetch reels explore page
        const pageUrl = 'https://www.instagram.com/reels/';
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

        // Extract shortcodes from HTML
        const codeMatches = html.matchAll(/"code":"([A-Za-z0-9_-]+)"/g);
        const codes = [...new Set([...codeMatches].map((m) => m[1]))].slice(
          0,
          limit
        );

        // Fetch details for each
        const reels: BuzzReel[] = [];
        for (const code of codes.slice(0, Math.min(10, limit))) {
          try {
            const reelResult = await this.getReelByUrl(
              `https://www.instagram.com/reel/${code}/`
            );
            if (reelResult.status === 'success' && reelResult.reels.length > 0) {
              reels.push(reelResult.reels[0]);
            }
          } catch {
            // Continue with other reels
          }
        }

        return reels;
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
   * Query GraphQL endpoint directly
   */
  private async queryGraphQL(tag: string, limit: number): Promise<BuzzReel[]> {
    const variables = {
      tag_name: tag,
      first: Math.min(limit, 50),
      after: null,
    };

    const url = `${this.graphqlUrl}?query_hash=${QUERY_HASHES.hashtagPosts}&variables=${encodeURIComponent(JSON.stringify(variables))}`;

    const response = await fetch(url, {
      headers: this.buildHeaders({
        userAgent: USER_AGENTS.desktop,
        accept: '*/*',
        xIgAppId: '936619743392459',
        xRequestedWith: 'XMLHttpRequest',
        referer: `https://www.instagram.com/explore/tags/${tag}/`,
      }),
    });

    const text = await response.text();

    if (this.isHtmlResponse(text)) {
      throw new Error('Received HTML instead of JSON from GraphQL');
    }

    const data = this.safeJsonParse<any>(text, 'graphql');
    if (!data) {
      throw new Error('Failed to parse GraphQL response');
    }

    const edges =
      data.data?.hashtag?.edge_hashtag_to_media?.edges ||
      data.data?.hashtag?.edge_hashtag_to_top_posts?.edges ||
      [];

    return edges
      .filter((e: any) => e.node?.is_video)
      .map((e: any) => this.transformNodeToReel(e.node))
      .slice(0, limit);
  }

  /**
   * Extract data from embedded JSON in HTML
   */
  private extractFromEmbeddedJson(html: string, limit: number): BuzzReel[] {
    const reels: BuzzReel[] = [];

    // Try to find shortcodes
    const shortcodeMatches = html.matchAll(/"shortcode":"([A-Za-z0-9_-]+)"/g);
    const shortcodes = [...new Set([...shortcodeMatches].map((m) => m[1]))];

    // Extract basic info from HTML patterns
    for (const shortcode of shortcodes.slice(0, limit)) {
      // Look for associated data in HTML
      const likePattern = new RegExp(
        `"shortcode":"${shortcode}"[^}]*"edge_liked_by":\\{"count":(\\d+)`,
        'g'
      );
      const viewPattern = new RegExp(
        `"shortcode":"${shortcode}"[^}]*"video_view_count":(\\d+)`,
        'g'
      );
      const commentPattern = new RegExp(
        `"shortcode":"${shortcode}"[^}]*"edge_media_to_comment":\\{"count":(\\d+)`,
        'g'
      );

      const likeMatch = likePattern.exec(html);
      const viewMatch = viewPattern.exec(html);
      const commentMatch = commentPattern.exec(html);

      reels.push({
        id: shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        shortcode,
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
   * Extract user reels from HTML
   */
  private extractUserReelsFromHtml(
    html: string,
    username: string,
    limit: number
  ): BuzzReel[] {
    // Try new format
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
          return clips.slice(0, limit).map((edge: any) => ({
            id: edge.node.media?.pk || edge.node.id,
            url: `https://www.instagram.com/reel/${edge.node.media?.code || ''}/`,
            shortcode: edge.node.media?.code || '',
            title: edge.node.media?.caption?.text?.slice(0, 100) || '',
            views: edge.node.media?.play_count || 0,
            likes: edge.node.media?.like_count || 0,
            comments: edge.node.media?.comment_count || 0,
            posted_at: new Date((edge.node.media?.taken_at || 0) * 1000),
            author: { username, followers: 0 },
            thumbnail_url:
              edge.node.media?.image_versions2?.candidates?.[0]?.url,
          }));
        }
      }
    }

    // Fallback to shortcode extraction
    const codeMatches = html.matchAll(/"code":"([A-Za-z0-9_-]+)"/g);
    const codes = [...new Set([...codeMatches].map((m) => m[1]))].slice(
      0,
      limit
    );

    return codes.map((code) => ({
      id: code,
      url: `https://www.instagram.com/reel/${code}/`,
      shortcode: code,
      title: '',
      views: 0,
      likes: 0,
      comments: 0,
      posted_at: new Date(),
      author: { username, followers: 0 },
    }));
  }

  /**
   * Transform GraphQL node to BuzzReel
   */
  private transformNodeToReel(node: any): BuzzReel {
    return {
      id: node.id,
      url: `https://www.instagram.com/reel/${node.shortcode}/`,
      shortcode: node.shortcode,
      title: node.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) || '',
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
   * Transform media item to BuzzReel
   */
  private transformMediaToReel(media: any): BuzzReel {
    return {
      id: media.id || media.pk,
      url: `https://www.instagram.com/reel/${media.shortcode || media.code}/`,
      shortcode: media.shortcode || media.code,
      title:
        media.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) ||
        media.caption?.text?.slice(0, 100) ||
        '',
      views: media.video_view_count || media.play_count || 0,
      likes:
        media.edge_media_preview_like?.count ||
        media.like_count ||
        0,
      comments:
        media.edge_media_to_comment?.count ||
        media.comment_count ||
        0,
      posted_at: new Date(
        (media.taken_at_timestamp || media.taken_at || 0) * 1000
      ),
      author: {
        username: media.owner?.username || media.user?.username || 'unknown',
        followers: media.owner?.edge_followed_by?.count || 0,
      },
      thumbnail_url:
        media.thumbnail_src ||
        media.image_versions2?.candidates?.[0]?.url ||
        media.display_url,
    };
  }
}
