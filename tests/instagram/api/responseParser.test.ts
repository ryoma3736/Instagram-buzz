/**
 * ResponseParser Tests
 * @module tests/instagram/api/responseParser.test
 */

import { describe, it, expect } from 'vitest';
import {
  extractHashtags,
  extractMentions,
  parseMediaType,
  parseMediaItem,
  parseHashtagGraphqlResponse,
  parseHashtagRestResponse,
  parseHashtagIdResponse,
  parseHashtagWebInfoResponse,
} from '../../../src/services/instagram/api/responseParser.js';

describe('extractHashtags', () => {
  it('should extract hashtags from text', () => {
    const text = 'Hello #world #test #coding';
    const hashtags = extractHashtags(text);

    expect(hashtags).toEqual(['#world', '#test', '#coding']);
  });

  it('should extract Japanese hashtags', () => {
    const text = 'テスト #日本語 #テスト';
    const hashtags = extractHashtags(text);

    expect(hashtags).toContain('#日本語');
    expect(hashtags).toContain('#テスト');
  });

  it('should return empty array for no hashtags', () => {
    const text = 'No hashtags here';
    const hashtags = extractHashtags(text);

    expect(hashtags).toEqual([]);
  });

  it('should handle empty string', () => {
    expect(extractHashtags('')).toEqual([]);
  });
});

describe('extractMentions', () => {
  it('should extract mentions from text', () => {
    const text = 'Hello @user1 and @user2.name';
    const mentions = extractMentions(text);

    expect(mentions).toContain('@user1');
    expect(mentions).toContain('@user2.name');
  });

  it('should return empty array for no mentions', () => {
    const text = 'No mentions here';
    const mentions = extractMentions(text);

    expect(mentions).toEqual([]);
  });

  it('should handle empty string', () => {
    expect(extractMentions('')).toEqual([]);
  });
});

describe('parseMediaType', () => {
  it('should parse numeric media types', () => {
    expect(parseMediaType(1)).toBe('image');
    expect(parseMediaType(2)).toBe('video');
    expect(parseMediaType(8)).toBe('carousel');
  });

  it('should parse string media types', () => {
    expect(parseMediaType('VIDEO')).toBe('video');
    expect(parseMediaType('REELS')).toBe('video');
    expect(parseMediaType('CAROUSEL_ALBUM')).toBe('carousel');
    expect(parseMediaType('IMAGE')).toBe('image');
  });

  it('should use isVideo flag as fallback', () => {
    expect(parseMediaType(undefined, true)).toBe('video');
    expect(parseMediaType(undefined, false)).toBe('image');
  });

  it('should default to image', () => {
    expect(parseMediaType(undefined)).toBe('image');
  });
});

describe('parseMediaItem', () => {
  it('should parse media item from API response', () => {
    const item = {
      pk: '123456789',
      code: 'ABC123',
      media_type: 2,
      caption: { text: 'Test caption' },
      like_count: 1000,
      comment_count: 50,
      taken_at: 1700000000,
      user: {
        pk: '987654321',
        username: 'testuser',
      },
    };

    const post = parseMediaItem(item);

    expect(post).not.toBeNull();
    expect(post?.id).toBe('123456789');
    expect(post?.shortcode).toBe('ABC123');
    expect(post?.mediaType).toBe('video');
    expect(post?.caption).toBe('Test caption');
    expect(post?.likeCount).toBe(1000);
    expect(post?.commentCount).toBe(50);
    expect(post?.timestamp).toBe(1700000000);
    expect(post?.owner.id).toBe('987654321');
    expect(post?.owner.username).toBe('testuser');
  });

  it('should handle graphql format with edges', () => {
    const item = {
      node: {
        id: '123456789',
        shortcode: 'ABC123',
        is_video: true,
        edge_media_to_caption: {
          edges: [{ node: { text: 'Caption text' } }],
        },
        edge_liked_by: { count: 500 },
        edge_media_to_comment: { count: 25 },
        taken_at_timestamp: 1700000000,
        owner: {
          id: '987654321',
          username: 'graphqluser',
        },
      },
    };

    const post = parseMediaItem(item);

    expect(post).not.toBeNull();
    expect(post?.id).toBe('123456789');
    expect(post?.caption).toBe('Caption text');
    expect(post?.likeCount).toBe(500);
    expect(post?.owner.username).toBe('graphqluser');
  });

  it('should handle wrapped media format', () => {
    const item = {
      media: {
        pk: '123456789',
        code: 'ABC123',
        media_type: 1,
        caption: { text: 'Wrapped caption' },
        like_count: 200,
        comment_count: 10,
        taken_at: 1700000000,
        user: {
          pk: '111111',
          username: 'wrappeduser',
        },
      },
    };

    const post = parseMediaItem(item);

    expect(post).not.toBeNull();
    expect(post?.caption).toBe('Wrapped caption');
    expect(post?.owner.username).toBe('wrappeduser');
  });

  it('should return null for invalid input', () => {
    expect(parseMediaItem(null)).toBeNull();
    expect(parseMediaItem(undefined)).toBeNull();
    expect(parseMediaItem({})).toBeNull();
    expect(parseMediaItem({ invalid: 'data' })).toBeNull();
  });

  it('should generate correct URL for video', () => {
    const item = {
      pk: '123',
      code: 'ABC123',
      media_type: 2,
    };

    const post = parseMediaItem(item);
    expect(post?.url).toBe('https://www.instagram.com/reel/ABC123/');
  });

  it('should generate correct URL for image', () => {
    const item = {
      pk: '123',
      code: 'ABC123',
      media_type: 1,
    };

    const post = parseMediaItem(item);
    expect(post?.url).toBe('https://www.instagram.com/p/ABC123/');
  });
});

describe('parseHashtagGraphqlResponse', () => {
  it('should parse graphql hashtag response', () => {
    const data = {
      data: {
        hashtag: {
          media_count: 1000000,
          edge_hashtag_to_top_posts: {
            edges: [
              {
                node: {
                  id: '111',
                  shortcode: 'TOP1',
                  is_video: true,
                  edge_media_to_caption: {
                    edges: [{ node: { text: 'Top post' } }],
                  },
                  edge_liked_by: { count: 5000 },
                  edge_media_to_comment: { count: 200 },
                  taken_at_timestamp: 1700000000,
                  owner: { id: '999', username: 'topuser' },
                },
              },
            ],
          },
          edge_hashtag_to_media: {
            edges: [
              {
                node: {
                  id: '222',
                  shortcode: 'RECENT1',
                  is_video: false,
                  edge_media_to_caption: {
                    edges: [{ node: { text: 'Recent post' } }],
                  },
                  edge_liked_by: { count: 100 },
                  edge_media_to_comment: { count: 10 },
                  taken_at_timestamp: 1700000100,
                  owner: { id: '888', username: 'recentuser' },
                },
              },
            ],
            page_info: {
              has_next_page: true,
              end_cursor: 'cursor123',
            },
          },
        },
      },
    };

    const result = parseHashtagGraphqlResponse(data, 'test');

    expect(result.hashtag).toBe('test');
    expect(result.totalCount).toBe(1000000);
    expect(result.posts.length).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.endCursor).toBe('cursor123');
  });

  it('should return empty result for invalid data', () => {
    const result = parseHashtagGraphqlResponse(null, 'test');

    expect(result.posts).toEqual([]);
    expect(result.hashtag).toBe('test');
  });
});

describe('parseHashtagRestResponse', () => {
  it('should parse sections format', () => {
    const data = {
      sections: [
        {
          layout_content: {
            medias: [
              {
                media: {
                  pk: '123',
                  code: 'ABC',
                  media_type: 2,
                  caption: { text: 'Section post' },
                  like_count: 300,
                  comment_count: 30,
                  taken_at: 1700000000,
                  user: { pk: '777', username: 'sectionuser' },
                },
              },
            ],
          },
        },
      ],
      more_available: true,
      next_max_id: 'nextpage',
    };

    const result = parseHashtagRestResponse(data, 'test');

    expect(result.posts.length).toBe(1);
    expect(result.posts[0].caption).toBe('Section post');
    expect(result.hasMore).toBe(true);
    expect(result.endCursor).toBe('nextpage');
  });

  it('should parse items format', () => {
    const data = {
      items: [
        {
          pk: '456',
          code: 'DEF',
          media_type: 1,
          caption: { text: 'Items post' },
          like_count: 150,
          comment_count: 15,
          taken_at: 1700000000,
          user: { pk: '666', username: 'itemsuser' },
        },
      ],
      more_available: false,
    };

    const result = parseHashtagRestResponse(data, 'test');

    expect(result.posts.length).toBe(1);
    expect(result.posts[0].caption).toBe('Items post');
    expect(result.hasMore).toBe(false);
  });

  it('should parse ranked_items for top posts', () => {
    const data = {
      ranked_items: [
        {
          pk: '789',
          code: 'GHI',
          media_type: 2,
          caption: { text: 'Top ranked' },
          like_count: 10000,
          comment_count: 500,
          taken_at: 1700000000,
          user: { pk: '555', username: 'rankeduser' },
        },
      ],
    };

    const result = parseHashtagRestResponse(data, 'test');

    expect(result.posts.length).toBe(1);
    expect(result.posts[0].caption).toBe('Top ranked');
  });
});

describe('parseHashtagIdResponse', () => {
  it('should parse data array format', () => {
    const data = {
      data: [{ id: '17841401234567890' }],
    };

    const id = parseHashtagIdResponse(data);
    expect(id).toBe('17841401234567890');
  });

  it('should parse results array format', () => {
    const data = {
      results: [{ id: '17841401234567891' }],
    };

    const id = parseHashtagIdResponse(data);
    expect(id).toBe('17841401234567891');
  });

  it('should return null for invalid data', () => {
    expect(parseHashtagIdResponse(null)).toBeNull();
    expect(parseHashtagIdResponse({})).toBeNull();
    expect(parseHashtagIdResponse({ data: [] })).toBeNull();
  });
});

describe('parseHashtagWebInfoResponse', () => {
  it('should parse web info response', () => {
    const data = {
      data: {
        hashtag: {
          id: '17841401234567890',
          name: 'test',
          media_count: 500000,
          edge_hashtag_to_top_posts: {
            edges: [
              {
                node: {
                  id: '111',
                  shortcode: 'TOP1',
                  is_video: true,
                  edge_media_to_caption: {
                    edges: [{ node: { text: 'Web info top' } }],
                  },
                  edge_liked_by: { count: 3000 },
                  edge_media_to_comment: { count: 100 },
                  taken_at_timestamp: 1700000000,
                  owner: { id: '444', username: 'webuser' },
                },
              },
            ],
          },
          edge_hashtag_to_media: {
            edges: [],
            page_info: {
              has_next_page: false,
              end_cursor: null,
            },
          },
        },
      },
    };

    const result = parseHashtagWebInfoResponse(data, 'test');

    expect(result.hashtag).toBe('test');
    expect(result.totalCount).toBe(500000);
    expect(result.posts.length).toBe(1);
    expect(result.posts[0].caption).toBe('Web info top');
    expect(result.hasMore).toBe(false);
  });

  it('should return empty result for missing hashtag data', () => {
    const result = parseHashtagWebInfoResponse({ data: {} }, 'test');

    expect(result.posts).toEqual([]);
    expect(result.hashtag).toBe('test');
  });
});
