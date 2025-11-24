/**
 * User Resolver Service
 * Resolves Instagram username to user ID
 * @module services/instagram/api/userResolver
 */

import type { InstagramCookies } from '../session/types.js';
import { ApiClient, InstagramApiError } from './apiClient.js';
import {
  DEFAULT_API_CONFIG,
  USER_REELS_ENDPOINTS,
  type UserResolverResult,
} from './types.js';

/**
 * User resolver cache to minimize API calls
 */
const userCache = new Map<string, { data: UserResolverResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clear expired cache entries
 */
function cleanCache(): void {
  const now = Date.now();
  for (const [key, value] of userCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      userCache.delete(key);
    }
  }
}

/**
 * Instagram web profile info response structure
 */
interface WebProfileInfoResponse {
  data?: {
    user?: {
      id: string;
      username: string;
      full_name: string;
      profile_pic_url?: string;
      is_private: boolean;
      is_verified: boolean;
      edge_followed_by?: {
        count: number;
      };
      edge_follow?: {
        count: number;
      };
      edge_owner_to_timeline_media?: {
        count: number;
      };
    };
  };
  status?: string;
}

/**
 * Instagram user info response structure
 */
interface UserInfoResponse {
  user?: {
    pk: string;
    pk_id?: string;
    username: string;
    full_name: string;
    profile_pic_url?: string;
    is_private: boolean;
    is_verified: boolean;
    follower_count?: number;
    following_count?: number;
    media_count?: number;
  };
  status?: string;
}

/**
 * Resolve username to user ID using web profile API
 * @param client - Authenticated API client
 * @param username - Instagram username (without @)
 * @returns User information including ID
 */
export async function resolveUserId(
  client: ApiClient,
  username: string
): Promise<UserResolverResult> {
  // Clean username
  const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();

  if (!cleanUsername) {
    throw new InstagramApiError(
      'Username cannot be empty',
      400,
      'userResolver',
      false
    );
  }

  // Check cache first
  const cached = userCache.get(cleanUsername);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Clean expired entries periodically
  cleanCache();

  // Try web profile info endpoint first (more reliable)
  try {
    const url = `${DEFAULT_API_CONFIG.webBaseUrl}${USER_REELS_ENDPOINTS.USER_WEB_PROFILE}?username=${encodeURIComponent(cleanUsername)}`;
    const response = await client.get<WebProfileInfoResponse>(url);

    if (response.data?.user) {
      const user = response.data.user;
      const result: UserResolverResult = {
        userId: user.id,
        username: user.username,
        fullName: user.full_name || '',
        profilePicUrl: user.profile_pic_url,
        isPrivate: user.is_private || false,
        isVerified: user.is_verified || false,
        followerCount: user.edge_followed_by?.count || 0,
        followingCount: user.edge_follow?.count || 0,
        mediaCount: user.edge_owner_to_timeline_media?.count || 0,
      };

      // Cache the result
      userCache.set(cleanUsername, { data: result, timestamp: Date.now() });
      return result;
    }
  } catch (error) {
    // If web profile fails, try mobile API
    if (
      error instanceof InstagramApiError &&
      (error.statusCode === 404 || error.statusCode === 401)
    ) {
      throw error;
    }
    // Continue to fallback method
  }

  // Fallback: Try GraphQL endpoint
  try {
    const graphqlUrl = `${DEFAULT_API_CONFIG.webBaseUrl}/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanUsername)}`;
    const response = await client.get<WebProfileInfoResponse>(graphqlUrl);

    if (response.data?.user) {
      const user = response.data.user;
      const result: UserResolverResult = {
        userId: user.id,
        username: user.username,
        fullName: user.full_name || '',
        profilePicUrl: user.profile_pic_url,
        isPrivate: user.is_private || false,
        isVerified: user.is_verified || false,
        followerCount: user.edge_followed_by?.count || 0,
        followingCount: user.edge_follow?.count || 0,
        mediaCount: user.edge_owner_to_timeline_media?.count || 0,
      };

      userCache.set(cleanUsername, { data: result, timestamp: Date.now() });
      return result;
    }
  } catch {
    // Ignore and throw final error
  }

  throw new InstagramApiError(
    `User not found: ${cleanUsername}`,
    404,
    'userResolver',
    false
  );
}

/**
 * Get user info by user ID
 * @param client - Authenticated API client
 * @param userId - Instagram user ID
 * @returns User information
 */
export async function getUserInfo(
  client: ApiClient,
  userId: string
): Promise<UserResolverResult> {
  const url = `${DEFAULT_API_CONFIG.baseUrl}${USER_REELS_ENDPOINTS.USER_INFO.replace('{user_id}', userId)}`;
  const response = await client.get<UserInfoResponse>(url);

  if (response.user) {
    const user = response.user;
    return {
      userId: user.pk || user.pk_id || userId,
      username: user.username,
      fullName: user.full_name || '',
      profilePicUrl: user.profile_pic_url,
      isPrivate: user.is_private || false,
      isVerified: user.is_verified || false,
      followerCount: user.follower_count || 0,
      followingCount: user.following_count || 0,
      mediaCount: user.media_count || 0,
    };
  }

  throw new InstagramApiError(
    `User not found: ${userId}`,
    404,
    'getUserInfo',
    false
  );
}

/**
 * Create a UserResolver instance with cookies
 */
export class UserResolver {
  private client: ApiClient;

  constructor(cookies: InstagramCookies) {
    this.client = new ApiClient(cookies);
  }

  /**
   * Resolve username to user ID
   */
  async resolve(username: string): Promise<UserResolverResult> {
    return resolveUserId(this.client, username);
  }

  /**
   * Get user info by ID
   */
  async getById(userId: string): Promise<UserResolverResult> {
    return getUserInfo(this.client, userId);
  }

  /**
   * Clear the user cache
   */
  clearCache(): void {
    userCache.clear();
  }
}

/**
 * Create a new UserResolver instance
 */
export function createUserResolver(cookies: InstagramCookies): UserResolver {
  return new UserResolver(cookies);
}
