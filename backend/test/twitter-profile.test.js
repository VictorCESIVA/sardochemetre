'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  getRecentTweets,
  getTwitterSource,
  getProfileSnapshot,
  clearProfileCache,
  parseProfileHtml,
} = require('../services/twitterService');
const { buildProfileHtml } = require('./helpers/profile-fixture');

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

test('getTwitterSource accepte profile', () => {
  assert.equal(getTwitterSource({ TWITTER_SOURCE: 'profile' }), 'profile');
  assert.equal(getTwitterSource({ TWITTER_SOURCE: 'PROFILE' }), 'profile');
});

test('parseProfileHtml : profil, tweets, médias et citation', () => {
  const { profile, tweets } = parseProfileHtml(buildProfileHtml(), {
    limit: 5,
  });

  assert.deepEqual(profile, {
    username: 'Sardoche',
    name: 'Sardoche 🇫🇷',
    avatar_url:
      'https://pbs.twimg.com/profile_images/1777701085828022272/epxsnXzo_400x400.jpg',
    verified: true,
    followers: 593077,
  });

  assert.equal(tweets.length, 2);
  assert.deepEqual(
    tweets.map((tweet) => tweet.id),
    ['9001', '9002']
  );
  assert.ok(tweets.every((tweet) => tweet.source === 'profile'));

  const first = tweets[0];
  assert.equal(first.content, 'Premier tweet & média\nDeuxième ligne');
  assert.equal(first.posted_at, '2026-11-05T17:51:06.000Z');
  assert.equal(first.likes, 87);
  assert.equal(first.retweets, 3);
  assert.equal(first.replies, 9);
  assert.equal(first.views, 17611);
  assert.deepEqual(first.author, {
    name: 'Sardoche 🇫🇷',
    username: 'Sardoche',
    avatar_url:
      'https://pbs.twimg.com/profile_images/1777701085828022272/epxsnXzo_400x400.jpg',
    verified: true,
  });
  assert.deepEqual(first.media, [
    {
      type: 'photo',
      url: 'https://pbs.twimg.com/media/photo-one.jpg',
      width: 1303,
      height: 732,
      expanded_url: 'https://x.com/Sardoche/status/9001/photo/1',
    },
  ]);
  assert.equal(first.quoted_tweet, null);

  const second = tweets[1];
  assert.equal(second.content, 'Citation utile');
  assert.deepEqual(second.media, []);
  assert.equal(second.quoted_tweet.id, '8001');
  assert.equal(second.quoted_tweet.content, 'Citation & info');
  assert.deepEqual(second.quoted_tweet.author, {
    name: 'GRM',
    username: 'grm_off',
    avatar_url:
      'https://pbs.twimg.com/profile_images/2117603275159588865/rZr6DVv1_400x400.jpg',
    verified: true,
  });
  assert.deepEqual(second.quoted_tweet.media, [
    {
      type: 'photo',
      url: 'https://pbs.twimg.com/media/quoted.jpg',
      width: 1254,
      height: 1254,
      expanded_url: 'https://x.com/grm_off/status/8001/photo/1',
    },
  ]);
});

test('parseProfileHtml : limite à 5 maximum', () => {
  const one = parseProfileHtml(buildProfileHtml(), { limit: 1 });
  assert.equal(one.tweets.length, 1);
  assert.equal(one.tweets[0].id, '9001');

  const many = parseProfileHtml(buildProfileHtml(), { limit: 50 });
  assert.equal(many.tweets.length, 2);
});

test('parseProfileHtml : erreur claire sans flux SSR', () => {
  assert.throws(
    () => parseProfileHtml('<html><body>login</body></html>'),
    /profile_user_originals_timeline/
  );
});

test('getRecentTweets profile : fetch local et cache 60 s', async () => {
  let hits = 0;
  const { server, baseUrl } = await startServer((req, res) => {
    hits += 1;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(buildProfileHtml());
  });

  const env = {
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'profile',
    TWITTER_PROFILE_URL: baseUrl,
  };

  try {
    clearProfileCache();

    const tweets = await getRecentTweets({ limit: 5, env });
    assert.equal(tweets.length, 2);
    assert.equal(tweets[0].id, '9001');
    assert.equal(hits, 1);

    const profile = await getProfileSnapshot({ env });
    assert.equal(profile.username, 'Sardoche');
    assert.equal(hits, 1);

    const limited = await getRecentTweets({ limit: 1, env });
    assert.equal(limited.length, 1);
    assert.equal(hits, 1);
  } finally {
    clearProfileCache();
    await closeServer(server);
  }
});

test('getRecentTweets profile : erreur réseau renvoie []', async () => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('boom');
  });

  const env = {
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'profile',
    TWITTER_PROFILE_URL: baseUrl,
  };

  try {
    clearProfileCache();
    const tweets = await getRecentTweets({ limit: 5, env });
    assert.deepEqual(tweets, []);

    const profile = await getProfileSnapshot({ env });
    assert.equal(profile, null);
  } finally {
    clearProfileCache();
    await closeServer(server);
  }
});
