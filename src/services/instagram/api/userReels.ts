/**
 * User Reels Service
 * Fetches user reels with Cookie authentication and pagination support
 * @module services/instagram/api/userReels
 */

import type { InstagramCookies } from '../session/types.js';
import { ApiClient, InstagramApiError } from './apiClient.js';
import { resolveUserId } from './userResolver.js';
import {
  DEFAULT_API_CONFIG,
  USER_REELS_ENDPOINTS,
  type ReelData,
  type UserReelsResult,
  type UserReelsOptions,
  type UserProfile,
} from './types.js';

/**
 * Instagram clips/reels API response structure
 */
interface ClipsApiResponse {
  items?: ClipItem[];
  paging_info?: {
    more_available: boolean;
    max_id?: string;
    end_cursor?: string;
  };
  status?: string;
}

/**
 * Individual clip item from API response
 */
interface ClipItem {
  media?: MediaData;
}

/**
 * Media data structure from Instagram API
 */
interface MediaData {
  pk?: string;
  id?: string;
  code?: string;
  taken_at?: number;
  caption?: {
    text?: string;
  };
  like_count?: number;
  comment_count?: number;
  play_count?: number;
  view_count?: number;
  video_duration?: number;
  image_versions2?: {
    candidates?: Array<{
      url: string;
      width: number;
      height: number;
    }>;
  };
  video_versions?: Array<{
    url: string;
    type: number;
    width: number;
    height: number;
  }>;
  user?: {
    pk?: string;
    username?: string;
    full_name?: string;
    profile_pic_url?: string;
    is_verified?: boolean;
    is_private?: boolean;
  };
}

/**
 * Web clips response structure (alternative endpoint)
 * Reserved for future web API implementation
 */
interface _WebClipsResponse {
  data?: {
    xdt_api__v1__clips__user__connection_v2?: {
      edges?: Array<{
        node?: {
          media?: MediaData;
        };
      }>;
      page_info?: {
        has_next_page: boolean;
        end_cursor?: string;
      };
    };
  };
}

/**
 * Transform raw media data to ReelData format
 */
function transformMediaToReel(media: MediaData): ReelData {
  const shortcode = media.code || '';
  const thumbnailUrl =
    media.image_versions2?.candidates?.[0]?.url || '';
  const videoUrl =
    media.video_versions?.[0]?.url || '';

  return {
    id: media.pk || media.id || '',
    shortcode,
    url: shortcode ? `https://www.instagram.com/reel/${shortcode}/` : '',
    videoUrl,
    thumbnailUrl,
    caption: media.caption?.text || '',
    viewCount: media.play_count || media.view_count || 0,
    likeCount: media.like_count || 0,
    commentCount: media.comment_count || 0,
    duration: media.video_duration || 0,
    timestamp: media.taken_at || 0,
  };
}

/**
 * Fetch user reels using the mobile API
 * @param client - Authenticated API client
 * @param userId - Instagram user ID
 * @param options - Fetch options (limit, cursor)
 * @returns Array of reels with pagination info
 */
async function fetchUserClips(
  client: ApiClient,
  userId: string,
  options: UserReelsOptions = {}
): Promise<{ reels: ReelData[]; hasMore: boolean; endCursor: string | null }> {
  const { limit = 12, cursor } = options;

  let url = `${DEFAULT_API_CONFIG.baseUrl}${USER_REELS_ENDPOINTS.USER_CLIPS.replace('{user_id}', userId)}`;
  url += `?count=${limit}`;
  if (cursor) {
    url += `&max_id=${encodeURIComponent(cursor)}`;
  }

  try {
    const response = await client.get<ClipsApiResponse>(url);

    if (!response.items) {
      return { reels: [], hasMore: false, endCursor: null };
    }

    const reels = response.items
      .filter((item): item is ClipItem & { media: MediaData } => !!item.media)
      .map((item) => transformMediaToReel(item.media));

    return {
      reels,
      hasMore: response.paging_info?.more_available || false,
      endCursor: response.paging_info?.max_id || response.paging_info?.end_cursor || null,
    };
  } catch (error) {
    if (error instanceof InstagramApiError) {
      throw error;
    }
    throw new InstagramApiError(
      `Failed to fetch user clips: ${(error as Error).message}`,
      500,
      'fetchUserClips',
      false
    );
  }
}

/**
 * Get single reel details by media ID
 * @param client - Authenticated API client
 * @param mediaId - Media/Reel ID
 * @returns Reel data or null if not found
 */
async function fetchReelById(
  client: ApiClient,
  mediaId: string
): Promise<ReelData | null> {
  const url = `${DEFAULT_API_CONFIG.baseUrl}${USER_REELS_ENDPOINTS.MEDIA_INFO.replace('{media_id}', mediaId)}`;

  try {
    const response = await client.get<{ items?: MediaData[] }>(url);

    if (response.items && response.items.length > 0) {
      return transformMediaToReel(response.items[0]);
    }
    return null;
  } catch (error) {
    if (
      error instanceof InstagramApiError &&
      error.statusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * User Reels Service class
 * Provides methods to fetch reels for a specific user with authentication
 */
export class UserReelsService {
  private client: ApiClient;

  constructor(cookies: InstagramCookies) {
    this.client = new ApiClient(cookies);
  }

  /**
   * Get reels for a specific user by username
   * @param username - Instagram username (without @)
   * @param options - Fetch options (limit, cursor for pagination)
   * @returns User reels result with pagination info
   */
  async getReels(
    username: string,
    options: UserReelsOptions = {}
  ): Promise<UserReelsResult> {
    // Resolve username to user ID
    const userInfo = await resolveUserId(this.client, username);

    // Check if account is private
    if (userInfo.isPrivate) {
      throw new InstagramApiError(
        `Cannot fetch reels from private account: @${username}`,
        403,
        'getReels',
        false
      );
    }

    // Fetch user clips
    const { reels, hasMore, endCursor } = await fetchUserClips(
      this.client,
      userInfo.userId,
      options
    );

    // Build user profile
    const user: UserProfile = {
      id: userInfo.userId,
      username: userInfo.username,
      fullName: userInfo.fullName,
      profilePicUrl: userInfo.profilePicUrl,
      followerCount: userInfo.followerCount,
      isVerified: userInfo.isVerified,
      isPrivate: userInfo.isPrivate,
    };

    return {
      reels,
      hasMore,
      endCursor,
      user,
    };
  }

  /**
   * Get reels for a user by their user ID (skips username resolution)
   * @param userId - Instagram user ID
   * @param options - Fetch options (limit, cursor for pagination)
   * @returns Array of reels with pagination info
   */
  async getReelsByUserId(
    userId: string,
    options: UserReelsOptions = {}
  ): Promise<{ reels: ReelData[]; hasMore: boolean; endCursor: string | null }> {
    return fetchUserClips(this.client, userId, options);
  }

  /**
   * Get a single reel by its ID
   * @param reelId - Reel/Media ID
   * @returns Reel data or null if not found
   */
  async getReelById(reelId: string): Promise<ReelData | null> {
    return fetchReelById(this.client, reelId);
  }

  /**
   * Resolve username to user ID
   * @param username - Instagram username (without @)
   * @returns User ID
   */
  async resolveUserId(username: string): Promise<string> {
    const userInfo = await resolveUserId(this.client, username);
    return userInfo.userId;
  }

  /**
   * Fetch all reels for a user (handles pagination automatically)
   * Warning: This may make many API requests for users with lots of reels
   * @param username - Instagram username (without @)
   * @param maxReels - Maximum number of reels to fetch (default: 100)
   * @returns All reels up to maxReels
   */
  async getAllReels(
    username: string,
    maxReels: number = 100
  ): Promise<UserReelsResult> {
    const allReels: ReelData[] = [];
    let cursor: string | null = null;
    let user: UserProfile | null = null;
    const batchSize = 12;

    while (allReels.length < maxReels) {
      const result = await this.getReels(username, {
        limit: batchSize,
        cursor: cursor ?? undefined,
      });

      if (!user) {
        user = result.user;
      }

      allReels.push(...result.reels);

      if (!result.hasMore || !result.endCursor) {
        break;
      }

      cursor = result.endCursor;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      reels: allReels.slice(0, maxReels),
      hasMore: allReels.length >= maxReels,
      endCursor: cursor,
      user: user!,
    };
  }

  /**
   * Update cookies for the API client
   */
  updateCookies(cookies: InstagramCookies): void {
    this.client.updateCookies(cookies);
  }
}

/**
 * Create a new UserReelsService instance
 * @param cookies - Instagram session cookies
 * @returns UserReelsService instance
 */
export function createUserReelsService(cookies: InstagramCookies): UserReelsService {
  return new UserReelsService(cookies);
}
