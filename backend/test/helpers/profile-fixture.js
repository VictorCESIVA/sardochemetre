'use strict';

const PROFILE_USER = {
  __typename: 'User',
  avatar: {
    image_url:
      'https://pbs.twimg.com/profile_images/1777701085828022272/epxsnXzo_normal.jpg',
  },
  core: {
    name: 'Sardoche 🇫🇷',
    screen_name: 'Sardoche',
  },
  verification: { is_blue_verified: true },
  relationship_counts: { followers: 593077 },
};

const QUOTED_USER = {
  __typename: 'User',
  avatar: {
    image_url:
      'https://pbs.twimg.com/profile_images/2117603275159588865/rZr6DVv1_normal.jpg',
  },
  core: {
    name: 'GRM',
    screen_name: 'grm_off',
  },
  verification: { is_blue_verified: true },
  relationship_counts: { followers: 12345 },
};

function tweetResult({
  id,
  user,
  text,
  createdAt,
  counts,
  views,
  media = [],
  quoted = null,
}) {
  return {
    __typename: 'Tweet',
    rest_id: id,
    core: { user_results: { result: user } },
    details: {
      full_text: text,
      created_at_ms: Date.parse(createdAt),
    },
    counts: {
      favorite_count: counts.likes,
      retweet_count: counts.retweets,
      reply_count: counts.replies,
      quote_count: counts.quotes || 0,
    },
    views: { count: String(views) },
    media_entities2: media,
    quoted_tweet_results: quoted ? { result: quoted } : undefined,
  };
}

const MEDIA_PHOTO = {
  type: 'photo',
  media_url_https: 'https://pbs.twimg.com/media/photo-one.jpg',
  expanded_url: 'https://x.com/Sardoche/status/9001/photo/1',
  original_info: { width: 1303, height: 732 },
};

const QUOTED_MEDIA = {
  type: 'photo',
  media_url_https: 'https://pbs.twimg.com/media/quoted.jpg',
  expanded_url: 'https://x.com/grm_off/status/8001/photo/1',
  original_info: { width: 1254, height: 1254 },
};

const PROFILE_DATA = {
  data: {
    user_result_by_screen_name: {
      result: {
        __typename: 'User',
        id: 'VXNlcjo4OTg5OTQ1Mzk=',
        profile_user_originals_timeline: {
          timeline: {
            id: 'profile-timeline',
            instructions: [
              { __typename: 'TimelineClearCache' },
              {
                __typename: 'TimelineAddEntries',
                entries: [
                  {
                    entry_id: 'tweet-9001',
                    content: {
                      __typename: 'TimelineTimelineItem',
                      content: {
                        __typename: 'TimelineTweet',
                        tweet_results: {
                          result: tweetResult({
                            id: '9001',
                            user: PROFILE_USER,
                            text:
                              'Premier tweet &amp; média\nDeuxième ligne https://t.co/abc123',
                            createdAt: '2026-11-05T17:51:06.000Z',
                            counts: {
                              likes: 87,
                              retweets: 3,
                              replies: 9,
                              quotes: 1,
                            },
                            views: 17611,
                            media: [MEDIA_PHOTO],
                          }),
                        },
                      },
                    },
                  },
                  {
                    entry_id: 'tweet-9002',
                    content: {
                      __typename: 'TimelineTimelineItem',
                      content: {
                        __typename: 'TimelineTweet',
                        tweet_results: {
                          result: tweetResult({
                            id: '9002',
                            user: PROFILE_USER,
                            text: 'Citation utile https://t.co/def456',
                            createdAt: '2026-11-05T17:00:23.000Z',
                            counts: {
                              likes: 56,
                              retweets: 5,
                              replies: 2,
                            },
                            views: 11367,
                            quoted: tweetResult({
                              id: '8001',
                              user: QUOTED_USER,
                              text:
                                'Citation &amp; info\nhttps://t.co/xyz789',
                              createdAt: '2026-11-05T16:00:00.000Z',
                              counts: {
                                likes: 10,
                                retweets: 1,
                                replies: 0,
                              },
                              views: 500,
                              media: [QUOTED_MEDIA],
                            }),
                          }),
                        },
                      },
                    },
                  },
                  {
                    entry_id: 'cursor-bottom',
                    content: {
                      __typename: 'TimelineTimelineCursor',
                      entryType: 'TimelineTimelineCursor',
                    },
                  },
                ],
              },
              { __typename: 'TimelineTerminateTimeline', direction: 'Top' },
            ],
          },
        },
      },
    },
  },
};

function escapeForValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildProfileHtml(data = PROFILE_DATA) {
  const escaped = escapeForValue(JSON.stringify(data));

  return `<!doctype html><html><head>
<script>window.__decoy = {value:"{\\"decoy\\":true}"};</script>
<script>window.__timeline = {value:"${escaped}"};</script>
</head><body>profil public</body></html>`;
}

module.exports = {
  PROFILE_DATA,
  PROFILE_USER,
  QUOTED_USER,
  buildProfileHtml,
};
