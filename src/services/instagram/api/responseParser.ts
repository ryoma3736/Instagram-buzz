/**
 * Instagram API Response Parser
 * Utilities for parsing and transforming Instagram API responses
 * @module services/instagram/api/responseParser
 */

import type { InstagramPost, HashtagSearchResult } from './types.js';

/**
 * Extract hashtags from text
 */
export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g);
  return matches || [];
}

/**
 * Extract mentions from text
 */
export function extractMentions(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/@[\w.]+/g);
  return matches || [];
}

/**
 * Determine media type from API response
 */
export function parseMediaType(
  mediaType: number | string | undefined,
  isVideo?: boolean
): 'image' | 'video' | 'carousel' {
  if (typeof mediaType === 'number') {
    switch (mediaType) {
      case 1:
        return 'image';
      case 2:
        return 'video';
      case 8:
        return 'carousel';
      default:
        return isVideo ? 'video' : 'image';
    }
  }
  if (mediaType === 'VIDEO' || mediaType === 'REELS' || isVideo) {
    return 'video';
  }
  if (mediaType === 'CAROUSEL_ALBUM') {
    return 'carousel';
  }
  return 'image';
}

/**
 * Parse a single media item from various API response formats
 */
export function parseMediaItem(item: unknown): InstagramPost | null {
  if (!item || typeof item !== 'object') return null;

  const media = item as Record<string, unknown>;
  const node = (media.media || media.node || media) as Record<string, unknown>;

  const id = String(node.pk || node.id || '');
  const shortcode = String(node.code || node.shortcode || '');

  if (!id && !shortcode) return null;

  // Parse caption
  let caption = '';
  if (typeof node.caption === 'object' && node.caption !== null) {
    const captionObj = node.caption as Record<string, unknown>;
    caption = String(captionObj.text || '');
  } else if (typeof node.caption === 'string') {
    caption = node.caption;
  } else if (node.edge_media_to_caption) {
    const edges = (node.edge_media_to_caption as Record<string, unknown>).edges as Array<Record<string, unknown>>;
    if (edges?.[0]?.node) {
      caption = String((edges[0].node as Record<string, unknown>).text || '');
    }
  }

  // Parse owner
  const owner = (node.user || node.owner || {}) as Record<string, unknown>;
  const ownerId = String(owner.pk || owner.id || '');
  const ownerUsername = String(owner.username || '');

  // Parse engagement metrics
  const likeCount =
    Number(node.like_count) ||
    Number((node.edge_liked_by as Record<string, unknown>)?.count) ||
    Number((node.edge_media_preview_like as Record<string, unknown>)?.count) ||
    0;

  const commentCount =
    Number(node.comment_count) ||
    Number((node.edge_media_to_comment as Record<string, unknown>)?.count) ||
    0;

  // Parse timestamp
  const timestamp =
    Number(node.taken_at) ||
    Number(node.taken_at_timestamp) ||
    Math.floor(Date.now() / 1000);

  // Parse media type
  const isVideo = Boolean(node.is_video || node.media_type === 2);
  const mediaType = parseMediaType(
    node.media_type as number | string | undefined,
    isVideo
  );

  // Build URL
  const url =
    mediaType === 'video'
      ? `https://www.instagram.com/reel/${shortcode}/`
      : `https://www.instagram.com/p/${shortcode}/`;

  return {
    id,
    shortcode,
    url,
    mediaType,
    caption,
    likeCount,
    commentCount,
    timestamp,
    owner: {
      id: ownerId,
      username: ownerUsername,
    },
  };
}

/**
 * Parse hashtag API response (graphql format)
 */
export function parseHashtagGraphqlResponse(
  data: unknown,
  hashtag: string
): HashtagSearchResult {
  const result: HashtagSearchResult = {
    posts: [],
    hasMore: false,
    endCursor: null,
    totalCount: 0,
    hashtag,
  };

  if (!data || typeof data !== 'object') return result;

  const response = data as Record<string, unknown>;

  // Try different response structures
  const hashtagData =
    (response.data as Record<string, unknown>)?.hashtag ||
    response.hashtag ||
    response;

  if (!hashtagData || typeof hashtagData !== 'object') return result;

  const hashtagObj = hashtagData as Record<string, unknown>;

  // Get total count
  result.totalCount =
    Number(hashtagObj.media_count) ||
    Number((hashtagObj.edge_hashtag_to_media as Record<string, unknown>)?.count) ||
    0;

  // Parse top posts (edge_hashtag_to_top_posts)
  const topPosts = hashtagObj.edge_hashtag_to_top_posts as Record<string, unknown>;
  if (topPosts?.edges) {
    const edges = topPosts.edges as Array<Record<string, unknown>>;
    for (const edge of edges) {
      const post = parseMediaItem(edge);
      if (post) {
        result.posts.push(post);
      }
    }
  }

  // Parse recent posts (edge_hashtag_to_media)
  const recentPosts = hashtagObj.edge_hashtag_to_media as Record<string, unknown>;
  if (recentPosts?.edges) {
    const edges = recentPosts.edges as Array<Record<string, unknown>>;
    for (const edge of edges) {
      const post = parseMediaItem(edge);
      if (post && !result.posts.find((p) => p.id === post.id)) {
        result.posts.push(post);
      }
    }

    // Get pagination info
    const pageInfo = recentPosts.page_info as Record<string, unknown>;
    if (pageInfo) {
      result.hasMore = Boolean(pageInfo.has_next_page);
      result.endCursor = pageInfo.end_cursor
        ? String(pageInfo.end_cursor)
        : null;
    }
  }

  return result;
}

/**
 * Parse hashtag API response (REST API format)
 */
export function parseHashtagRestResponse(
  data: unknown,
  hashtag: string
): HashtagSearchResult {
  const result: HashtagSearchResult = {
    posts: [],
    hasMore: false,
    endCursor: null,
    totalCount: 0,
    hashtag,
  };

  if (!data || typeof data !== 'object') return result;

  const response = data as Record<string, unknown>;

  // Parse sections format (from /api/v1/tags/{tag}/sections/)
  const sections = response.sections as Array<Record<string, unknown>>;
  if (sections) {
    for (const section of sections) {
      const layoutContent = section.layout_content as Record<string, unknown>;
      const medias = layoutContent?.medias as Array<Record<string, unknown>>;
      if (medias) {
        for (const mediaWrapper of medias) {
          const post = parseMediaItem(mediaWrapper);
          if (post) {
            result.posts.push(post);
          }
        }
      }
    }

    result.hasMore = Boolean(response.more_available);
    result.endCursor = response.next_max_id
      ? String(response.next_max_id)
      : null;
  }

  // Parse items format (from direct API)
  const items = response.items as Array<Record<string, unknown>>;
  if (items) {
    for (const item of items) {
      const post = parseMediaItem(item);
      if (post) {
        result.posts.push(post);
      }
    }

    result.hasMore = Boolean(response.more_available);
    result.endCursor = response.next_max_id
      ? String(response.next_max_id)
      : null;
  }

  // Parse ranked_items (for top posts)
  const rankedItems = response.ranked_items as Array<Record<string, unknown>>;
  if (rankedItems) {
    for (const item of rankedItems) {
      const post = parseMediaItem(item);
      if (post && !result.posts.find((p) => p.id === post.id)) {
        result.posts.unshift(post); // Add to beginning as these are top posts
      }
    }
  }

  return result;
}

/**
 * Parse hashtag search ID response
 */
export function parseHashtagIdResponse(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const response = data as Record<string, unknown>;

  // Try different response formats
  const dataArray = response.data as Array<Record<string, unknown>>;
  if (dataArray?.[0]?.id) {
    return String(dataArray[0].id);
  }

  const results = response.results as Array<Record<string, unknown>>;
  if (results?.[0]?.id) {
    return String(results[0].id);
  }

  return null;
}

/**
 * Parse web info response for hashtag
 */
export function parseHashtagWebInfoResponse(
  data: unknown,
  hashtag: string
): HashtagSearchResult {
  const result: HashtagSearchResult = {
    posts: [],
    hasMore: false,
    endCursor: null,
    totalCount: 0,
    hashtag,
  };

  if (!data || typeof data !== 'object') return result;

  const response = data as Record<string, unknown>;
  const hashtagData = (response.data as Record<string, unknown>)?.hashtag as Record<string, unknown>;

  if (!hashtagData) return result;

  result.totalCount = Number(hashtagData.media_count) || 0;

  // Parse top posts
  const topPosts = hashtagData.edge_hashtag_to_top_posts as Record<string, unknown>;
  if (topPosts?.edges) {
    const edges = topPosts.edges as Array<Record<string, unknown>>;
    for (const edge of edges) {
      const post = parseMediaItem(edge);
      if (post) {
        result.posts.push(post);
      }
    }
  }

  // Parse recent media
  const media = hashtagData.edge_hashtag_to_media as Record<string, unknown>;
  if (media?.edges) {
    const edges = media.edges as Array<Record<string, unknown>>;
    for (const edge of edges) {
      const post = parseMediaItem(edge);
      if (post && !result.posts.find((p) => p.id === post.id)) {
        result.posts.push(post);
      }
    }

    const pageInfo = media.page_info as Record<string, unknown>;
    if (pageInfo) {
      result.hasMore = Boolean(pageInfo.has_next_page);
      result.endCursor = pageInfo.end_cursor
        ? String(pageInfo.end_cursor)
        : null;
    }
  }

  return result;
}
