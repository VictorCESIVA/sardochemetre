'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isDemoMode, resolveDbClient } = require('../db/config');
const {
  analyzeTweet,
  extractJson,
  normalizeAnalysis,
  generateMockAnalysis,
  verdictForScore,
} = require('../services/claudeService');
const {
  getRecentTweets,
  getTwitterSource,
} = require('../services/twitterService');

function withEnv(values, fn) {
  const saved = {};
  for (const key of Object.keys(values)) {
    saved[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('resolveDbClient : SQLite par défaut, détection PostgreSQL, DB_CLIENT prioritaire', () => {
  assert.equal(resolveDbClient({}), 'sqlite');
  assert.equal(
    resolveDbClient({ DATABASE_URL: 'postgresql://user:pass@localhost/db' }),
    'postgres'
  );
  assert.equal(
    resolveDbClient({
      DB_CLIENT: 'sqlite',
      DATABASE_URL: 'postgresql://user:pass@localhost/db',
    }),
    'sqlite'
  );
  assert.equal(
    resolveDbClient({
      DB_CLIENT: 'postgres',
      DATABASE_URL: 'postgresql://user:pass@localhost/db',
    }),
    'postgres'
  );

  assert.throws(() => resolveDbClient({ DB_CLIENT: 'mysql' }), /DB_CLIENT invalide/);
  assert.throws(() => resolveDbClient({ DB_CLIENT: 'postgres' }), /DATABASE_URL/);
});

test('isDemoMode ne confond pas les valeurs', () => {
  assert.equal(isDemoMode({ DEMO_MODE: 'true' }), true);
  assert.equal(isDemoMode({ DEMO_MODE: 'TRUE' }), true);
  assert.equal(isDemoMode({ DEMO_MODE: 'false' }), false);
  assert.equal(isDemoMode({}), false);
});

test('extractJson retire les fences et isole l’objet', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Voici le résultat : {"a":1} — voilà.'), { a: 1 });
  assert.throws(() => extractJson('pas de json'), /JSON/);
});

test('normalizeAnalysis borne le score et normalise les champs', () => {
  const analysis = normalizeAnalysis({
    bullshit_score: 150,
    verdict: 'n importe quoi',
    reasoning: '  explication  ',
    fact_checks: [
      { claim: 'affirmation', verdict: 'faux', note: 'note' },
      null,
    ],
    humor_comment: '  punchline  ',
  });

  assert.deepEqual(analysis, {
    bullshit_score: 100,
    verdict: 'CHAUD BOUILLANT',
    reasoning: 'explication',
    fact_checks: [{ claim: 'affirmation', verdict: 'faux', note: 'note' }],
    humor_comment: 'punchline',
  });

  const low = normalizeAnalysis({
    bullshit_score: -20,
    verdict: 'DOUTEUX',
    reasoning: '',
    fact_checks: 'pas un tableau',
    humor_comment: null,
  });
  assert.equal(low.bullshit_score, 0);
  assert.equal(low.verdict, 'DOUTEUX');
  assert.deepEqual(low.fact_checks, []);
  assert.equal(low.humor_comment, '');

  assert.throws(() => normalizeAnalysis({ verdict: 'VRAI' }), /bullshit_score/);
});

test('generateMockAnalysis est déterministe et cohérent avec le score', () => {
  const samples = [
    'Les NFTs sont l’avenir.',
    'J’ai mangé une pomme.',
    'Le Web3 va sauver le monde.',
  ];

  for (const content of samples) {
    const first = generateMockAnalysis(content);
    const second = generateMockAnalysis(content);

    assert.deepEqual(first, second);
    assert.ok(first.bullshit_score >= 0 && first.bullshit_score <= 100);
    assert.equal(first.verdict, verdictForScore(first.bullshit_score));
    assert.ok(first.fact_checks.length > 0);
    assert.equal(typeof first.humor_comment, 'string');
  }

  assert.equal(verdictForScore(20), 'VRAI');
  assert.equal(verdictForScore(21), 'DOUTEUX');
  assert.equal(verdictForScore(45), 'DOUTEUX');
  assert.equal(verdictForScore(46), 'BULLSHIT');
  assert.equal(verdictForScore(89), 'BULLSHIT');
  assert.equal(verdictForScore(90), 'CHAUD BOUILLANT');
});

test('claudeService.analyzeTweet : null sans clé, même en DEMO_MODE', async () => {
  const savedDemo = process.env.DEMO_MODE;
  const savedKey = process.env.ANTHROPIC_API_KEY;

  process.env.DEMO_MODE = 'true';
  delete process.env.ANTHROPIC_API_KEY;

  try {
    assert.equal(await analyzeTweet('un tweet'), null);
  } finally {
    if (savedDemo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = savedDemo;

    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

test('getTwitterSource : explicite, démo, token puis syndication', () => {
  assert.equal(getTwitterSource({}), 'syndication');
  assert.equal(getTwitterSource({ DEMO_MODE: 'true' }), 'mock');
  assert.equal(
    getTwitterSource({ DEMO_MODE: 'false', TWITTER_BEARER_TOKEN: 'token' }),
    'x'
  );
  assert.equal(
    getTwitterSource({ DEMO_MODE: 'true', TWITTER_BEARER_TOKEN: 'token' }),
    'mock'
  );
  assert.equal(
    getTwitterSource({
      TWITTER_SOURCE: 'syndication',
      DEMO_MODE: 'true',
      TWITTER_BEARER_TOKEN: 'token',
    }),
    'syndication'
  );
  assert.equal(getTwitterSource({ TWITTER_SOURCE: 'x' }), 'x');
  assert.equal(
    getTwitterSource({ TWITTER_SOURCE: 'profile' }),
    'profile'
  );
  assert.throws(
    () => getTwitterSource({ TWITTER_SOURCE: 'twitter' }),
    /TWITTER_SOURCE invalide/
  );
});

test('twitterService : mode démo, dates recalées et 8 tweets', async () => {
  await withEnv({ DEMO_MODE: 'true', TWITTER_SOURCE: 'mock' }, async () => {
    const tweets = await getRecentTweets();
    assert.equal(tweets.length, 8);

    const newestAge = Date.now() - Date.parse(tweets[0].posted_at);
    assert.ok(newestAge >= 60 * 60 * 1000 && newestAge <= 3 * 60 * 60 * 1000);

    for (let index = 1; index < tweets.length; index += 1) {
      const gap = Date.parse(tweets[index - 1].posted_at) - Date.parse(tweets[index].posted_at);
      assert.ok(Math.abs(gap - 24 * 60 * 60 * 1000) < 5000);
    }

    assert.ok(tweets.every((tweet) => tweet.source === 'mock'));
  });
});

test('twitterService : erreur claire sans token en source x', async () => {
  await withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: undefined,
    },
    async () => {
      await assert.rejects(getRecentTweets(), /TWITTER_BEARER_TOKEN/);
    }
  );
});

test('twitterService : limite bornée entre 1 et 50', async () => {
  const tweets = await getRecentTweets({
    limit: 2,
    env: { DEMO_MODE: 'true', TWITTER_SOURCE: 'mock' },
  });
  assert.equal(tweets.length, 2);
});
