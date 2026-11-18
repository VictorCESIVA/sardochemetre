'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  parseTweetDetail,
  enrichTweets,
  clearTweetDetailCache,
} = require('../services/twitterService');

const AUTHOR = {
  name: 'Sardoche 🇫🇷',
  screen_name: 'Sardoche',
  profile_image_url_https:
    'https://pbs.twimg.com/profile_images/1777701085828022272/epxsnXzo_normal.jpg',
  is_blue_verified: true,
};

const DETAIL = {
  __typename: 'Tweet',
  id_str: '9001',
  text: 'Réponse avec image https://t.co/abc',
  created_at: '2026-11-13T10:00:00.000Z',
  favorite_count: 12,
  retweet_count: 3,
  conversation_count: 5,
  user: AUTHOR,
  mediaDetails: [
    {
      type: 'photo',
      media_url_https: 'https://pbs.twimg.com/media/reply-photo.jpg',
      original_info: { width: 1200, height: 800 },
      expanded_url: 'https://x.com/Sardoche/status/9001/photo/1',
    },
  ],
  quoted_tweet: {
    id_str: '8002',
    text: 'Tweet cité',
    created_at: '2026-11-13T09:00:00.000Z',
    user: { name: 'GRM', screen_name: 'grm_off' },
    mediaDetails: [],
  },
  parent: {
    id_str: '7001',
    text: 'Tweet de base',
    created_at: '2026-11-13T08:00:00.000Z',
    favorite_count: 42,
    user: { name: 'Quelqu’un', screen_name: 'quelquun' },
    mediaDetails: [
      {
        type: 'photo',
        media_url_https: 'https://pbs.twimg.com/media/parent-photo.png',
        original_info: { width: 640, height: 480 },
      },
    ],
  },
  in_reply_to_status_id_str: '7001',
};

function startServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
  });
}

test('parseTweetDetail : texte, auteur, médias, citation et parent', () => {
  const tweet = parseTweetDetail(DETAIL);

  assert.equal(tweet.id, '9001');
  assert.equal(tweet.content, 'Réponse avec image');
  assert.equal(tweet.posted_at, '2026-11-13T10:00:00.000Z');
  assert.equal(tweet.likes, 12);
  assert.equal(tweet.retweets, 3);
  assert.equal(tweet.replies, 5);
  assert.deepEqual(tweet.author, {
    name: 'Sardoche 🇫🇷',
    username: 'Sardoche',
    avatar_url:
      'https://pbs.twimg.com/profile_images/1777701085828022272/epxsnXzo_400x400.jpg',
    verified: true,
  });
  assert.deepEqual(tweet.media, [
    {
      type: 'photo',
      url: 'https://pbs.twimg.com/media/reply-photo.jpg',
      width: 1200,
      height: 800,
      expanded_url: 'https://x.com/Sardoche/status/9001/photo/1',
      alt: '',
    },
  ]);
  assert.equal(tweet.quoted_tweet.id, '8002');
  assert.equal(tweet.quoted_tweet.content, 'Tweet cité');
  assert.equal(tweet.reply_to.id, '7001');
  assert.equal(tweet.reply_to.content, 'Tweet de base');
  assert.equal(tweet.reply_to.author.username, 'quelquun');
  assert.equal(tweet.reply_to.media[0].url, 'https://pbs.twimg.com/media/parent-photo.png');
  assert.equal(tweet.in_reply_to_id, '7001');
});

test('parseTweetDetail : objet vide renvoie null', () => {
  assert.equal(parseTweetDetail(null), null);
  assert.equal(parseTweetDetail({}), null);
});

test('enrichTweets : récupère le parent et les médias, tolère les échecs', async () => {
  const hits = [];
  const { server, baseUrl } = await startServer((req, res) => {
    const url = new URL(req.url, baseUrl);
    hits.push(url.searchParams.get('id'));

    if (url.searchParams.get('id') === '9001') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(DETAIL));
      return;
    }

    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'boom' }));
  });

  const env = { TWITTER_TWEET_DETAIL_URL: `${baseUrl}/tweet-result` };
  const tweets = [
    {
      id: '9001',
      content: 'Réponse avec image',
      posted_at: '2026-11-13T10:00:00.000Z',
      likes: 10,
      source: 'profile',
      author: { name: 'Sardoche', username: 'Sardoche' },
    },
    {
      id: '9002',
      content: 'Tweet sans détail',
      posted_at: '2026-11-13T09:00:00.000Z',
      source: 'profile',
    },
    {
      id: '9003',
      content: 'Mock inchangé',
      source: 'mock',
    },
  ];

  try {
    clearTweetDetailCache();
    const enriched = await enrichTweets(tweets, { env });

    assert.equal(enriched.length, 3);
    assert.equal(enriched[0].reply_to.id, '7001');
    assert.equal(enriched[0].reply_to.content, 'Tweet de base');
    assert.equal(enriched[0].media[0].url, 'https://pbs.twimg.com/media/reply-photo.jpg');
    assert.equal(enriched[0].quoted_tweet.id, '8002');
    assert.equal(enriched[1].reply_to, undefined);
    assert.equal(enriched[1].content, 'Tweet sans détail');
    assert.deepEqual(enriched[2], tweets[2]);
    assert.deepEqual(hits, ['9001', '9002']);
  } finally {
    clearTweetDetailCache();
    await closeServer(server);
  }
});

test('enrichTweets : résout le parent via un second appel si absent', async () => {
  const hits = [];
  const { server, baseUrl } = await startServer((req, res) => {
    const url = new URL(req.url, baseUrl);
    const id = url.searchParams.get('id');
    hits.push(id);
    res.writeHead(200, { 'content-type': 'application/json' });

    if (id === '9001') {
      res.end(
        JSON.stringify({
          ...DETAIL,
          parent: undefined,
          in_reply_to_status_id_str: '7001',
        })
      );
      return;
    }

    res.end(JSON.stringify({ ...DETAIL, id_str: '7001', text: 'Parent seul' }));
  });

  const env = { TWITTER_TWEET_DETAIL_URL: `${baseUrl}/tweet-result` };

  try {
    clearTweetDetailCache();
    const [tweet] = await enrichTweets(
      [{ id: '9001', content: 'Réponse', source: 'profile' }],
      { env }
    );

    assert.equal(tweet.reply_to.id, '7001');
    assert.equal(tweet.reply_to.content, 'Parent seul');
    assert.deepEqual(hits, ['9001', '7001']);
  } finally {
    clearTweetDetailCache();
    await closeServer(server);
  }
});
