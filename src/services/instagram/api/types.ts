/**
 * Instagram API Types
 * @module services/instagram/api/types
 */

/**
 * Trending content item
 */
export interface TrendingContent {
  type: 'reel' | 'post' | 'story';
  id: string;
  shortcode: string;
  url: string;
  mediaUrl: string;
  caption: string;
  engagement: {
    likes: number;
    comments: number;
    views?: number;
    shares?: number;
  };
  owner: {
    id: string;
    username: string;
    isVerified: boolean;
    profilePicUrl?: string;
  };
  timestamp?: number;
  hashtags?: string[];
  mentions?: string[];
}

/**
 * Result of trending content fetch
 */
export interface TrendingResult {
  items: TrendingContent[];
  hasMore: boolean;
  endCursor: string | null;
  category?: string;
  fetchedAt: number;
}

/**
 * Explore page section
 */
export interface ExploreSection {
  id: string;
  title: string;
  type: 'reels' | 'posts' | 'mixed';
  items: TrendingContent[];
}

/**
 * Explore page result
 */
export interface ExploreResult {
  sections: ExploreSection[];
  topPicks: TrendingContent[];
  hasMore: boolean;
  endCursor: string | null;
  fetchedAt: number;
}

/**
 * API request options
 */
export interface ApiRequestOptions {
  limit?: number;
  cursor?: string;
  category?: string;
  region?: string;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

/**
 * Instagram API endpoints
 */
export const API_ENDPOINTS = {
  EXPLORE: '/api/v1/discover/topical_explore/',
  TRENDING_REELS: '/api/v1/clips/trending/',
  REELS_MEDIA: '/api/v1/feed/reels_media/',
  USER_FEED: '/api/v1/feed/user/',
  MEDIA_INFO: '/api/v1/media/{media_id}/info/',
} as const;

/**
 * Default API configuration
 * Updated with latest User-Agent and headers for Issue #44
 */
export const DEFAULT_API_CONFIG = {
  baseUrl: 'https://i.instagram.com',
  webBaseUrl: 'https://www.instagram.com',
  /** Mobile iOS User-Agent - more reliable for API access */
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  /** Instagram Web App ID */
  appId: '936619743392459',
  /** Instagram AJAX version identifier */
  ajaxVersion: '1',
  /** ASBD (App State Bundle Data) ID */
  asbdId: '129477',
  /** IG Capabilities header value */
  igCapabilities: '3brTvw==',
  defaultLimit: 20,
} as const;

/**
 * Alternative User-Agent configurations for different scenarios
 */
export const USER_AGENT_CONFIGS = {
  /** iOS Safari - primary for web requests */
  iOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  /** macOS Chrome - for desktop web requests */
  macOSChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  /** Android Instagram App - for mobile API endpoints */
  androidApp: 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)',
  /** iOS Instagram App - for mobile API endpoints */
  iOSApp: 'Instagram 275.0.0.27.98 iOS (17_0; iPhone14,2; en_US; en-US; scale=3.00; 1170x2532; 458229237)',
} as const;

// ============================================
// Hashtag Search Types (Issue #26)
// ============================================

/**
 * Instagram post data structure
 */
export interface InstagramPost {
  /** Unique post identifier */
  id: string;
  /** Short URL code for the post */
  shortcode: string;
  /** Full URL to the post */
  url: string;
  /** Type of media content */
  mediaType: 'image' | 'video' | 'carousel';
  /** Post caption/description */
  caption: string;
  /** Number of likes */
  likeCount: number;
  /** Number of comments */
  commentCount: number;
  /** Unix timestamp when the post was created */
  timestamp: number;
  /** Post owner information */
  owner: {
    id: string;
    username: string;
  };
}

/**
 * Result of hashtag search operation
 */
export interface HashtagSearchResult {
  /** Array of posts matching the hashtag */
  posts: InstagramPost[];
  /** Whether more results are available */
  hasMore: boolean;
  /** Cursor for pagination */
  endCursor: string | null;
  /** Total count of posts for this hashtag (if available) */
  totalCount: number;
  /** The hashtag that was searched */
  hashtag: string;
}

/**
 * Options for hashtag search
 */
export interface HashtagSearchOptions {
  /** Maximum number of posts to retrieve */
  limit?: number;
  /** Pagination cursor for fetching more results */
  cursor?: string;
  /** Whether to include top posts only */
  topPostsOnly?: boolean;
}

/**
 * Hashtag info response
 */
export interface HashtagInfo {
  /** Hashtag ID */
  id: string;
  /** Hashtag name (without #) */
  name: string;
  /** Total number of posts with this hashtag */
  mediaCount: number;
  /** Profile picture URL for the hashtag */
  profilePicUrl?: string;
}

/**
 * Hashtag search API endpoints
 */
export const HASHTAG_API_ENDPOINTS = {
  /** Search for hashtag ID */
  HASHTAG_SEARCH: '/api/v1/tags/search/',
  /** Get hashtag info */
  HASHTAG_INFO: '/api/v1/tags/{tag_name}/info/',
  /** Get hashtag sections (top + recent) */
  HASHTAG_SECTIONS: '/api/v1/tags/{tag_name}/sections/',
  /** Get hashtag web info (graphql) */
  HASHTAG_WEB_INFO: '/api/v1/tags/web_info/',
  /** Graphql hashtag query */
  HASHTAG_GRAPHQL: '/graphql/query/',
} as const;

// ============================================
// User Reels Types (Issue #27)
// ============================================

/**
 * Individual reel data structure
 */
export interface ReelData {
  /** Unique reel identifier */
  id: string;
  /** Short URL code for the reel */
  shortcode: string;
  /** Full URL to the reel */
  url: string;
  /** Direct video URL (may require authentication) */
  videoUrl: string;
  /** Thumbnail image URL */
  thumbnailUrl: string;
  /** Reel caption/description */
  caption: string;
  /** Number of views */
  viewCount: number;
  /** Number of likes */
  likeCount: number;
  /** Number of comments */
  commentCount: number;
  /** Duration in seconds */
  duration: number;
  /** Unix timestamp when the reel was posted */
  timestamp: number;
}

/**
 * User profile information
 */
export interface UserProfile {
  /** User's unique identifier */
  id: string;
  /** Username (handle) */
  username: string;
  /** Full display name */
  fullName: string;
  /** Profile picture URL */
  profilePicUrl?: string;
  /** Number of followers */
  followerCount?: number;
  /** Whether the account is verified */
  isVerified?: boolean;
  /** Whether the account is private */
  isPrivate?: boolean;
}

/**
 * Result of user reels fetch operation
 */
export interface UserReelsResult {
  /** Array of reels from the user */
  reels: ReelData[];
  /** Whether more results are available */
  hasMore: boolean;
  /** Cursor for pagination */
  endCursor: string | null;
  /** User profile information */
  user: UserProfile;
}

/**
 * Options for fetching user reels
 */
export interface UserReelsOptions {
  /** Maximum number of reels to retrieve (default: 12) */
  limit?: number;
  /** Pagination cursor for fetching more results */
  cursor?: string;
}

/**
 * User resolver result
 */
export interface UserResolverResult {
  /** User ID */
  userId: string;
  /** Username */
  username: string;
  /** Full name */
  fullName: string;
  /** Profile picture URL */
  profilePicUrl?: string;
  /** Whether the account is private */
  isPrivate: boolean;
  /** Whether the account is verified */
  isVerified: boolean;
  /** Number of followers */
  followerCount: number;
  /** Number of following */
  followingCount: number;
  /** Number of posts */
  mediaCount: number;
}

/**
 * User Reels API endpoints
 */
export const USER_REELS_ENDPOINTS = {
  /** Get user profile info from username */
  USER_WEB_PROFILE: '/api/v1/users/web_profile_info/',
  /** Get user info by ID */
  USER_INFO: '/api/v1/users/{user_id}/info/',
  /** Get user's clips/reels by user ID */
  USER_CLIPS: '/api/v1/clips/user/{user_id}/',
  /** Get single media/reel info */
  MEDIA_INFO: '/api/v1/media/{media_id}/info/',
  /** GraphQL user query */
  USER_GRAPHQL: '/graphql/query/',
} as const;
