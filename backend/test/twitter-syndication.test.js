'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  getRecentTweets,
  parseSyndicationHtml,
  cleanTweetText,
} = require('../services/twitterService');

const ENTRIES = [
  {
    type: 'tweet',
    content: {
      tweet: {
        id_str: '9002',
        created_at: 'Wed Jun 04 10:00:00 +0000 2025',
        full_text:
          'Nouveau tweet &amp; propre &lt;3 https://t.co/abc123',
        favorite_count: 42,
        retweet_count: 7,
        in_reply_to_status_id_str: null,
      },
    },
  },
  {
    type: 'tweet',
    content: {
      tweet: {
        id_str: '9002',
        created_at: 'Wed Jun 04 10:00:00 +0000 2025',
        full_text: 'Doublon ignoré',
        favorite_count: 999,
        retweet_count: 999,
      },
    },
  },
  {
    type: 'tweet',
    content: {
      tweet: {
        id_str: '9001',
        created_at: 'Tue Jun 03 10:00:00 +0000 2025',
        full_text: 'Ancien tweet avec &quot;guillemets&quot;',
        favorite_count: 3,
        retweet_count: 1,
      },
    },
  },
  {
    type: 'tweet',
    content: {
      tweet: {
        id_str: '9003',
        created_at: 'Thu Jun 05 10:00:00 +0000 2025',
        full_text: 'Une réponse',
        favorite_count: 10,
        retweet_count: 2,
        in_reply_to_status_id_str: '8000',
      },
    },
  },
  {
    type: 'tweet',
    content: {
      tweet: {
        id_str: '9004',
        created_at: 'Fri Jun 06 10:00:00 +0000 2025',
        full_text: 'RT @quelquun: contenu retweeté',
        favorite_count: 20,
        retweet_count: 4,
        retweeted_status: { id_str: '7000' },
      },
    },
  },
  {
    type: 'tweet',
    content: {
      tweet: {
        id_str: '9005',
        created_at: 'Sat Jun 07 10:00:00 +0000 2025',
        full_text: 'https://t.co/onlylink',
        favorite_count: 0,
        retweet_count: 0,
      },
    },
  },
  {
    type: 'tweet',
    content: {
      tweet: {
        id_str: '9006',
        created_at: 'date invalide',
        full_text: 'Date invalide',
        favorite_count: 1,
        retweet_count: 1,
      },
    },
  },
  { type: 'cursor', content: {} },
];

function buildHtml(entries = ENTRIES) {
  const nextData = {
    props: {
      pageProps: {
        timeline: { entries },
      },
    },
  };

  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    nextData
  )}</script></body></html>`;
}

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

test('parseSyndicationHtml : filtre, déduplique, trie et nettoie', () => {
  const tweets = parseSyndicationHtml(buildHtml(), { limit: 10 });

  assert.equal(tweets.length, 2);
  assert.deepEqual(
    tweets.map((tweet) => tweet.id),
    ['9002', '9001']
  );
  assert.ok(tweets.every((tweet) => tweet.source === 'syndication'));

  assert.equal(tweets[0].content, 'Nouveau tweet & propre <3');
  assert.equal(tweets[0].likes, 42);
  assert.equal(tweets[0].retweets, 7);
  assert.equal(tweets[0].posted_at, '2025-06-04T10:00:00.000Z');

  assert.equal(tweets[1].content, 'Ancien tweet avec "guillemets"');
  assert.equal(tweets[1].posted_at, '2025-06-03T10:00:00.000Z');
});

test('parseSyndicationHtml : limite appliquée', () => {
  const tweets = parseSyndicationHtml(buildHtml(), { limit: 1 });
  assert.equal(tweets.length, 1);
  assert.equal(tweets[0].id, '9002');
});

test('cleanTweetText : liens t.co, entités et espaces', () => {
  assert.equal(
    cleanTweetText('  A &amp; B &lt; C https://t.co/xyz   D &quot;E&quot;  '),
    'A & B < C D "E"'
  );
  assert.equal(cleanTweetText('&#39;test&#x27;'), "'test'");
  assert.equal(cleanTweetText('https://t.co/seul'), '');
});

test('getRecentTweets : source syndication via un serveur local', async () => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(buildHtml());
  });

  try {
    const tweets = await getRecentTweets({
      limit: 2,
      env: {
        DEMO_MODE: 'false',
        TWITTER_SOURCE: 'syndication',
        TWITTER_SYNDICATION_URL: baseUrl,
      },
    });

    assert.equal(tweets.length, 2);
    assert.equal(tweets[0].id, '9002');
    assert.equal(tweets[0].source, 'syndication');
    assert.equal(tweets[1].id, '9001');
  } finally {
    await closeServer(server);
  }
});

test('getRecentTweets : échec syndication renvoie [] sans crasher', async () => {
  const { server, baseUrl } = await startServer((req, res) => {
    res.writeHead(429, { 'content-type': 'text/plain' });
    res.end('Rate limit exceeded');
  });

  try {
    const tweets = await getRecentTweets({
      limit: 5,
      env: {
        DEMO_MODE: 'false',
        TWITTER_SOURCE: 'syndication',
        TWITTER_SYNDICATION_URL: baseUrl,
      },
    });

    assert.deepEqual(tweets, []);
  } finally {
    await closeServer(server);
  }
});

test('parseSyndicationHtml : HTML sans __NEXT_DATA__ lève une erreur claire', () => {
  assert.throws(
    () => parseSyndicationHtml('<html><body>rien</body></html>'),
    /__NEXT_DATA__/
  );
});
