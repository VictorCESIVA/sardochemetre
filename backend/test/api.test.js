'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DB_PATH = path.join(
  os.tmpdir(),
  `sardochemetre-api-${process.pid}-${Date.now()}.db`
);

process.env.SQLITE_PATH = DB_PATH;
process.env.DB_CLIENT = 'sqlite';
process.env.DEMO_MODE = 'true';
process.env.TWITTER_SOURCE = 'mock';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = '*';
// Les tests ne doivent jamais joindre un vrai provider, même si le shell
// contient une clé.
delete process.env.OPENCODE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_PROVIDER;

const createApp = require('../app');
const repo = require('../db/sqlite');

let server;
let base;

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${base}${url}`, { ...options, headers });
  const text = await response.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

function expectedVerdict(score) {
  if (score <= 20) return 'VRAI';
  if (score <= 45) return 'DOUTEUX';
  if (score <= 89) return 'BULLSHIT';
  return 'CHAUD BOUILLANT';
}

before(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
    });
  }

  repo.closeDatabase();

  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${DB_PATH}${suffix}`);
    } catch {
      // fichier déjà absent
    }
  }
});

test('GET /health expose le contrat attendu', async () => {
  const { status, body } = await request('/health');

  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.mode, 'demo');
  assert.equal(body.database, 'sqlite');
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
});

test('GET /api/tweets : pagination, tri et forme plate', async () => {
  const { status, body } = await request('/api/tweets?page=1&limit=3');

  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body).sort(), [
    'pagination',
    'period',
    'query',
    'tweets',
  ]);
  assert.equal(body.period, 'all');
  assert.equal(body.query, '');
  assert.equal(body.tweets.length, 3);
  assert.deepEqual(body.pagination, {
    page: 1,
    limit: 3,
    total: 8,
    totalPages: 3,
    hasNext: true,
    hasPrev: false,
  });

  const dates = body.tweets.map((tweet) => Date.parse(tweet.posted_at));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));

  for (const tweet of body.tweets) {
    assert.deepEqual(Object.keys(tweet).sort(), [
      'analyzed',
      'analyzed_at',
      'author',
      'bullshit_score',
      'content',
      'fact_checks',
      'humor_comment',
      'id',
      'likes',
      'media',
      'posted_at',
      'quoted_tweet',
      'reasoning',
      'replies',
      'retweets',
      'source',
      'verdict',
      'views',
    ]);
    assert.equal(tweet.source, 'mock');
    assert.equal(tweet.author, null);
    assert.deepEqual(tweet.media, []);
    assert.equal(tweet.quoted_tweet, null);
    assert.equal(tweet.replies, 0);
    assert.equal(tweet.views, 0);
    assert.equal(tweet.analyzed, true);
    assert.ok(Array.isArray(tweet.fact_checks));
    assert.equal(typeof tweet.humor_comment, 'string');
    assert.ok(tweet.humor_comment.length > 0);
  }
});

test('GET /api/tweets : pages suivantes et bornes', async () => {
  const first = await request('/api/tweets?page=1&limit=3');
  const second = await request('/api/tweets?page=2&limit=3');
  const last = await request('/api/tweets?page=3&limit=3');
  const beyond = await request('/api/tweets?page=99&limit=3');

  assert.equal(second.status, 200);
  assert.equal(second.body.pagination.hasPrev, true);
  assert.equal(second.body.pagination.hasNext, true);
  assert.equal(last.body.pagination.hasNext, false);
  assert.equal(last.body.pagination.hasPrev, true);
  assert.equal(beyond.body.tweets.length, 0);
  assert.equal(beyond.body.pagination.total, 8);

  const firstIds = new Set(first.body.tweets.map((tweet) => tweet.id));
  assert.equal(
    second.body.tweets.some((tweet) => firstIds.has(tweet.id)),
    false
  );
});

test('GET /api/tweets : filtres period day/week/month/all', async () => {
  const expectations = [
    ['day', 1],
    ['week', 7],
    ['month', 8],
    ['all', 8],
  ];

  for (const [period, expected] of expectations) {
    const { status, body } = await request(
      `/api/tweets?period=${period}&limit=100`
    );
    assert.equal(status, 200);
    assert.equal(body.period, period);
    assert.equal(body.tweets.length, expected);
    assert.equal(body.pagination.total, expected);
  }

  const invalid = await request('/api/tweets?period=year');
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /Invalid period/);
});

test('GET /api/tweets : recherche q insensible à la casse', async () => {
  const lower = await request('/api/tweets?q=nft');
  const upper = await request('/api/tweets?q=NFT');
  const none = await request('/api/tweets?q=zzzzz');
  const combined = await request('/api/tweets?period=day&q=nft');

  assert.equal(lower.status, 200);
  assert.equal(lower.body.query, 'nft');
  assert.equal(lower.body.pagination.total, 1);
  assert.equal(lower.body.tweets[0].id, '1');
  assert.equal(upper.body.pagination.total, 1);
  assert.equal(none.body.pagination.total, 0);
  assert.equal(combined.body.pagination.total, 1);
});

test('GET /api/tweets/stats : période, moyennes et pourcentages numériques', async () => {
  const all = await request('/api/tweets/stats?period=all');
  const day = await request('/api/tweets/stats?period=day');
  const week = await request('/api/tweets/stats?period=week');
  const month = await request('/api/tweets/stats?period=month');

  assert.equal(all.status, 200);
  assert.deepEqual(Object.keys(all.body).sort(), [
    'avgScore',
    'maxScore',
    'minScore',
    'period',
    'totalAnalyzed',
    'verdictDistribution',
  ]);
  assert.equal(all.body.period, 'all');
  assert.equal(all.body.totalAnalyzed, 8);
  assert.equal(all.body.avgScore, 59);
  assert.equal(all.body.minScore, 8);
  assert.equal(all.body.maxScore, 94);

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(all.body.verdictDistribution).map(([key, value]) => [
        key,
        value.count,
      ])
    ),
    {
      VRAI: 2,
      DOUTEUX: 2,
      BULLSHIT: 1,
      'CHAUD BOUILLANT': 3,
    }
  );

  for (const distribution of Object.values(all.body.verdictDistribution)) {
    assert.equal(typeof distribution.count, 'number');
    assert.equal(typeof distribution.percentage, 'number');
    assert.ok(distribution.percentage >= 0 && distribution.percentage <= 100);
  }

  const totalPercentage = Object.values(all.body.verdictDistribution).reduce(
    (sum, distribution) => sum + distribution.percentage,
    0
  );
  assert.ok(Math.abs(totalPercentage - 100) < 0.001);

  assert.equal(day.body.totalAnalyzed, 1);
  assert.equal(day.body.avgScore, 94);
  assert.equal(day.body.verdictDistribution['CHAUD BOUILLANT'].percentage, 100);
  assert.equal(week.body.totalAnalyzed, 7);
  assert.equal(week.body.avgScore, 54.43);
  assert.equal(month.body.totalAnalyzed, 8);

  const invalid = await request('/api/tweets/stats?period=year');
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /Invalid period/);
});

test('GET /api/tweets/bullshitmetre : score, niveau et échantillon', async () => {
  const all = await request('/api/tweets/bullshitmetre?period=all');
  const day = await request('/api/tweets/bullshitmetre?period=day');
  const week = await request('/api/tweets/bullshitmetre?period=week');
  const month = await request('/api/tweets/bullshitmetre?period=month');

  assert.equal(all.status, 200);
  assert.deepEqual(Object.keys(all.body).sort(), [
    'globalScore',
    'level',
    'period',
    'sampleSize',
    'timestamp',
  ]);
  assert.equal(all.body.period, 'all');
  assert.equal(all.body.globalScore, 59);
  assert.equal(all.body.level, 'ÉLEVÉ');
  assert.equal(all.body.sampleSize, 8);
  assert.ok(!Number.isNaN(Date.parse(all.body.timestamp)));

  assert.equal(day.body.globalScore, 94);
  assert.equal(day.body.level, 'CRITIQUE');
  assert.equal(day.body.sampleSize, 1);
  assert.equal(week.body.globalScore, 54.43);
  assert.equal(week.body.sampleSize, 7);
  assert.equal(month.body.sampleSize, 8);

  const invalid = await request('/api/tweets/bullshitmetre?period=year');
  assert.equal(invalid.status, 400);
});

test('levelForScore respecte les seuils 25/50/75', () => {
  assert.equal(repo.levelForScore(24.99), 'FAIBLE');
  assert.equal(repo.levelForScore(25), 'MODÉRÉ');
  assert.equal(repo.levelForScore(49.99), 'MODÉRÉ');
  assert.equal(repo.levelForScore(50), 'ÉLEVÉ');
  assert.equal(repo.levelForScore(74.99), 'ÉLEVÉ');
  assert.equal(repo.levelForScore(75), 'CRITIQUE');
  assert.equal(repo.levelForScore(100), 'CRITIQUE');
});

test('GET /api/tweets/search : résultats et total', async () => {
  const nft = await request('/api/tweets/search?q=nft');
  const upper = await request('/api/tweets/search?q=NFT');
  const pesto = await request('/api/tweets/search?q=pesto');
  const none = await request('/api/tweets/search?q=zzzzz');
  const empty = await request('/api/tweets/search');

  assert.equal(nft.status, 200);
  assert.equal(nft.body.total, 1);
  assert.equal(nft.body.tweets[0].id, '1');
  assert.ok(Array.isArray(nft.body.tweets[0].fact_checks));
  assert.equal(upper.body.total, 1);
  assert.equal(pesto.body.total, 1);
  assert.deepEqual(none.body, { tweets: [], total: 0 });
  assert.deepEqual(empty.body, { tweets: [], total: 0 });
});

test('GET /api/tweets/:id : détail complet et 404', async () => {
  const { status, body } = await request('/api/tweets/1');

  assert.equal(status, 200);
  assert.equal(body.tweet.id, '1');
  assert.equal(body.tweet.analyzed, true);
  assert.equal(body.tweet.bullshit_score, 94);
  assert.equal(body.tweet.verdict, 'CHAUD BOUILLANT');
  assert.equal(body.tweet.fact_checks.length, 3);
  assert.match(body.tweet.humor_comment, /mathématique/i);

  const missing = await request('/api/tweets/999999');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Tweet not found' });
});

test('Les dates de démo sont recalées (2 h puis 24 h)', async () => {
  const { body } = await request('/api/tweets?period=all&limit=100');
  const dates = body.tweets.map((tweet) => Date.parse(tweet.posted_at));
  const now = Date.now();

  const newestAge = now - dates[0];
  assert.ok(newestAge >= 60 * 60 * 1000, 'le tweet le plus récent doit avoir ~2 h');
  assert.ok(newestAge <= 3 * 60 * 60 * 1000, 'le tweet le plus récent doit avoir ~2 h');

  for (let index = 1; index < dates.length; index += 1) {
    const gap = dates[index - 1] - dates[index];
    assert.ok(
      Math.abs(gap - 24 * 60 * 60 * 1000) < 5000,
      `écart de 24 h attendu entre les tweets (${gap} ms)`
    );
  }
});

test('POST /api/tweets/analyze : validation du contenu', async () => {
  const cases = [
    {},
    { content: '' },
    { content: '   ' },
    { content: 42 },
    { content: 'x'.repeat(1001) },
  ];

  for (const payload of cases) {
    const { status, body } = await request('/api/tweets/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    assert.equal(status, 400);
    assert.match(body.error, /content/);
  }
});

test('POST /api/tweets/analyze : analyse mock déterministe et cohérente', async () => {
  const content = 'Les licornes existent, ma source est mon voisin.';
  const first = await request('/api/tweets/analyze', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  const second = await request('/api/tweets/analyze', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

  assert.equal(first.status, 200);
  assert.deepEqual(Object.keys(first.body), ['analysis']);
  assert.deepEqual(Object.keys(first.body.analysis).sort(), [
    'bullshit_score',
    'fact_checks',
    'humor_comment',
    'reasoning',
    'verdict',
  ]);
  assert.equal(first.body.analysis.bullshit_score, second.body.analysis.bullshit_score);
  assert.equal(first.body.analysis.verdict, second.body.analysis.verdict);
  assert.equal(
    first.body.analysis.verdict,
    expectedVerdict(first.body.analysis.bullshit_score)
  );
  assert.ok(Array.isArray(first.body.analysis.fact_checks));
  assert.ok(first.body.analysis.fact_checks.length > 0);

  const list = await request('/api/tweets?limit=100');
  assert.equal(list.body.pagination.total, 8);
});

test('POST /api/tweets/analyze : persistance avec tweet_id', async () => {
  const content = 'Le Web3 est l’avenir de l’humanité, c’est certain.';
  const standalone = await request('/api/tweets/analyze', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  const persisted = await request('/api/tweets/analyze', {
    method: 'POST',
    body: JSON.stringify({ content, tweet_id: '2' }),
  });

  assert.equal(persisted.status, 200);
  assert.deepEqual(Object.keys(persisted.body), ['tweet']);
  assert.equal(persisted.body.tweet.id, '2');
  assert.equal(
    persisted.body.tweet.bullshit_score,
    standalone.body.analysis.bullshit_score
  );
  assert.equal(
    persisted.body.tweet.verdict,
    standalone.body.analysis.verdict
  );
  assert.equal(persisted.body.tweet.analyzed, true);

  const detail = await request('/api/tweets/2');
  assert.equal(detail.body.tweet.bullshit_score, standalone.body.analysis.bullshit_score);
  assert.equal(detail.body.tweet.verdict, standalone.body.analysis.verdict);
  assert.equal(detail.body.tweet.humor_comment, standalone.body.analysis.humor_comment);

  const missing = await request('/api/tweets/analyze', {
    method: 'POST',
    body: JSON.stringify({ content, tweet_id: 'does-not-exist' }),
  });
  assert.equal(missing.status, 200);
  assert.deepEqual(Object.keys(missing.body), ['analysis']);
});

test('Le seed démo est idempotent et restaure les analyses du mock', async () => {
  repo.seedDemoData();
  repo.seedDemoData();

  const list = await request('/api/tweets?limit=100');
  assert.equal(list.body.pagination.total, 8);

  const tweet2 = await request('/api/tweets/2');
  assert.equal(tweet2.body.tweet.bullshit_score, 8);
  assert.equal(tweet2.body.tweet.verdict, 'VRAI');
});

test('GET /api/profile : 404 puis profil enregistré', async () => {
  const missing = await request('/api/profile');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Profile not found' });

  const avatar =
    'https://pbs.twimg.com/profile_images/1777701085828022272/epxsnXzo_400x400.jpg';
  const saved = repo.saveProfile({
    username: 'Sardoche',
    name: 'Sardoche 🇫🇷',
    avatar_url: avatar,
    verified: true,
    followers: 593077,
  });

  const { status, body } = await request('/api/profile');
  assert.equal(status, 200);
  assert.equal(body.profile.username, 'Sardoche');
  assert.equal(body.profile.name, 'Sardoche 🇫🇷');
  assert.equal(body.profile.avatar_url, avatar);
  assert.equal(body.profile.verified, true);
  assert.equal(body.profile.followers, 593077);
  assert.equal(body.profile.updated_at, saved.updated_at);

  const list = await request('/api/tweets?limit=1');
  assert.deepEqual(list.body.tweets[0].author, {
    name: 'Sardoche 🇫🇷',
    username: 'Sardoche',
    avatar_url: avatar,
    verified: true,
  });
});

test('Les routes inconnues renvoient une erreur JSON', async () => {
  const { status, body } = await request('/api/unknown');
  assert.equal(status, 404);
  assert.deepEqual(body, { error: 'Route not found' });
});
