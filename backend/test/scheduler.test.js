'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  startScheduler,
  stopScheduler,
  schedulerReadiness,
  shouldRunImmediately,
  processTweets,
} = require('../scheduler');
const repo = require('../db/sqlite');
const aiService = require('../services/aiService');
const {
  clearProfileCache,
  clearTweetDetailCache,
} = require('../services/twitterService');
const { buildProfileHtml } = require('./helpers/profile-fixture');

function createMemoryLeaseStore() {
  const leases = new Map();

  return {
    async acquire({ name, owner, ttlMs }) {
      const current = leases.get(name);
      const now = Date.now();
      if (current && current.owner !== owner && current.expiresAt > now) {
        return false;
      }
      leases.set(name, { owner, expiresAt: now + ttlMs });
      return true;
    },
    async release({ name, owner }) {
      const current = leases.get(name);
      if (current && current.owner === owner) leases.delete(name);
    },
  };
}

async function withEnv(values, fn) {
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
    return await fn();
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

test('schedulerReadiness : désactivé en démo', () => {
  const readiness = schedulerReadiness({
    DEMO_MODE: 'true',
    TWITTER_BEARER_TOKEN: 'token',
    ANTHROPIC_API_KEY: 'key',
  });

  assert.equal(readiness.ready, false);
  assert.match(readiness.reason, /DEMO_MODE/);
});

test('schedulerReadiness : source x exige un token, import seul sans IA', () => {
  const missingToken = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'x',
  });

  assert.equal(missingToken.ready, false);
  assert.match(missingToken.reason, /TWITTER_BEARER_TOKEN/);

  const noAi = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'x',
    TWITTER_BEARER_TOKEN: 'token',
  });

  assert.equal(noAi.ready, true);
  assert.equal(noAi.reason, null);
  assert.equal(noAi.analysisReady, false);
  assert.match(noAi.analysisReason, /IA/);
});

test('schedulerReadiness : syndication et profile importent sans token ni IA', () => {
  for (const twitterSource of ['syndication', 'profile']) {
    const readiness = schedulerReadiness({
      DEMO_MODE: 'false',
      TWITTER_SOURCE: twitterSource,
      AI_PROVIDER: 'opencode',
    });

    assert.equal(readiness.ready, true);
    assert.equal(readiness.reason, null);
    assert.equal(readiness.analysisReady, false);
    assert.match(readiness.analysisReason, /OPENCODE_API_KEY/);
  }
});

test('schedulerReadiness : analyse active avec une clé IA réelle', () => {
  const opencode = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'profile',
    AI_PROVIDER: 'opencode',
    OPENCODE_API_KEY: 'oc_sk_test_profile',
  });

  assert.deepEqual(opencode, {
    ready: true,
    reason: null,
    analysisReady: true,
    analysisReason: null,
  });

  const anthropic = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'syndication',
    AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'key',
  });

  assert.equal(anthropic.ready, true);
  assert.equal(anthropic.analysisReady, true);
  assert.equal(anthropic.analysisReason, null);

  const missingAnthropic = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'syndication',
    AI_PROVIDER: 'anthropic',
  });

  assert.equal(missingAnthropic.ready, true);
  assert.equal(missingAnthropic.analysisReady, false);
  assert.match(missingAnthropic.analysisReason, /ANTHROPIC_API_KEY/);
});

test('schedulerReadiness : AI_PROVIDER=mock laisse l’import actif', () => {
  const readiness = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'profile',
    AI_PROVIDER: 'mock',
    OPENCODE_API_KEY: 'oc_sk_test_ignored',
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.analysisReady, false);
  assert.match(readiness.analysisReason, /AI_PROVIDER=mock/);
});

test('startScheduler ne démarre pas en démo', async () => {
  await withEnv({ DEMO_MODE: 'true' }, async () => {
    assert.equal(await startScheduler(), null);
  });
});

test('startScheduler refuse un CRON_SCHEDULE invalide', async () => {
  await withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'key',
      CRON_SCHEDULE: 'pas une expression cron',
      CRON_RUN_ON_START: 'false',
    },
    async () => {
      assert.equal(await startScheduler(), null);
    }
  );
});

test('startScheduler démarre et s’arrête avec node-cron', async () => {
  await withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'key',
      CRON_SCHEDULE: '0 3 * * *',
      CRON_RUN_ON_START: 'false',
    },
    async () => {
      const task = await startScheduler({ lockStore: createMemoryLeaseStore() });
      try {
        assert.ok(task);
        assert.equal(typeof task.stop, 'function');
        assert.equal(typeof task.getStatus, 'function');
        assert.ok(task.schedulerLock);
        assert.ok(task.schedulerHeartbeat);
      } finally {
        await stopScheduler(task);
        if (task && typeof task.destroy === 'function') task.destroy();
      }
    }
  );
});

test('shouldRunImmediately : actif par défaut, désactivable', () => {
  assert.equal(shouldRunImmediately(false, {}), true);
  assert.equal(shouldRunImmediately(false, { CRON_RUN_ON_START: '' }), true);
  assert.equal(shouldRunImmediately(false, { CRON_RUN_ON_START: 'false' }), false);
  assert.equal(shouldRunImmediately(false, { CRON_RUN_ON_START: 'true' }), true);
  assert.equal(shouldRunImmediately(true, { CRON_RUN_ON_START: 'false' }), true);
});

test('startScheduler importe même sans clé IA', async () => {
  await withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'profile',
      AI_PROVIDER: 'opencode',
      OPENCODE_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      CRON_SCHEDULE: '0 6 * * *',
      CRON_RUN_ON_START: 'false',
    },
    async () => {
      const task = await startScheduler({ lockStore: createMemoryLeaseStore() });
      try {
        assert.ok(task);
      } finally {
        await stopScheduler(task);
        if (task && typeof task.destroy === 'function') task.destroy();
      }
    }
  );
});

test('startScheduler démarre avec OpenCode', async () => {
  await withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      AI_PROVIDER: 'opencode',
      OPENCODE_API_KEY: 'oc_sk_test_scheduler',
      OPENCODE_PLAN: 'payg',
      CRON_SCHEDULE: '0 4 * * *',
      CRON_RUN_ON_START: 'false',
    },
    async () => {
      const task = await startScheduler({ lockStore: createMemoryLeaseStore() });
      try {
        assert.ok(task);
      } finally {
        await stopScheduler(task);
        if (task && typeof task.destroy === 'function') task.destroy();
      }
    }
  );
});

test('startScheduler refuse une deuxième instance et libère le bail', async () => {
  const store = createMemoryLeaseStore();

  await withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'key',
      CRON_SCHEDULE: '0 5 * * *',
      CRON_RUN_ON_START: 'false',
    },
    async () => {
      const first = await startScheduler({ lockStore: store, lockTtlMs: 60_000 });
      assert.ok(first);

      try {
        assert.equal(
          await startScheduler({ lockStore: store, lockTtlMs: 60_000 }),
          null
        );
      } finally {
        await stopScheduler(first);
        if (typeof first.destroy === 'function') first.destroy();
      }

      assert.equal(first.schedulerLock, null);

      const second = await startScheduler({ lockStore: store, lockTtlMs: 60_000 });
      assert.ok(second);
      await stopScheduler(second);
      if (typeof second.destroy === 'function') second.destroy();
    }
  );
});


function startHttpServer(handler) {
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

function closeHttpServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
  });
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch {
      // déjà absent
    }
  }
}

test('processTweets : importe puis analyse avec le contexte enrichi', async () => {
  const detail = {
    __typename: 'Tweet',
    id_str: '9001',
    text: 'Premier tweet & média',
    created_at: '2026-11-05T17:51:06.000Z',
    favorite_count: 87,
    retweet_count: 3,
    conversation_count: 9,
    user: {
      name: 'Sardoche 🇫🇷',
      screen_name: 'Sardoche',
      is_blue_verified: true,
    },
    mediaDetails: [
      {
        type: 'photo',
        media_url_https: 'https://pbs.twimg.com/media/photo-one.jpg',
      },
    ],
    parent: {
      id_str: '7001',
      text: 'Tweet de base',
      created_at: '2026-11-05T17:00:00.000Z',
      user: { name: 'Sardoche 🇫🇷', screen_name: 'Sardoche' },
      mediaDetails: [],
    },
  };
  const secondDetail = { ...detail, id_str: '9002', text: 'Citation utile', parent: undefined };

  const { server, baseUrl } = await startHttpServer((req, res) => {
    if (req.url.startsWith('/profile')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(buildProfileHtml());
      return;
    }

    const url = new URL(req.url, baseUrl);
    const payload = url.searchParams.get('id') === '9001' ? detail : secondDetail;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });

  const dbPath = path.join(
    os.tmpdir(),
    `sardochemetre-process-${process.pid}-${Date.now()}.db`
  );
  const originalAnalyze = aiService.analyzeTweet;
  const calls = [];

  aiService.analyzeTweet = async (content, options = {}) => {
    calls.push({ content, tweet: options.tweet });
    return {
      bullshit_score: 42,
      verdict: 'DOUTEUX',
      reasoning: 'Analyse stub.',
      fact_checks: [],
      humor_comment: 'Punchline.',
    };
  };

  try {
    await withEnv(
      {
        SQLITE_PATH: dbPath,
        DEMO_MODE: 'false',
        TWITTER_SOURCE: 'profile',
        TWITTER_PROFILE_URL: `${baseUrl}/profile`,
        TWITTER_TWEET_DETAIL_URL: `${baseUrl}/tweet-result`,
        AI_PROVIDER: 'opencode',
        OPENCODE_API_KEY: 'oc_sk_test_process',
        TWITTER_SYNC_LIMIT: '5',
      },
      async () => {
        clearProfileCache();
        clearTweetDetailCache();
        await processTweets('sqlite');

        const rows = repo
          .getDb()
          .prepare(
            'SELECT id, analyzed, reply_to FROM tweets ORDER BY posted_at DESC'
          )
          .all();

        assert.equal(rows.length, 2);
        assert.deepEqual(
          rows.map((row) => row.id),
          ['9001', '9002']
        );
        assert.ok(rows.every((row) => row.analyzed === 1));

        const saved = repo.getTweetById('9001');
        assert.equal(saved.reply_to.id, '7001');
        assert.equal(saved.reply_to.content, 'Tweet de base');
        assert.equal(saved.media[0].url, 'https://pbs.twimg.com/media/photo-one.jpg');

        assert.equal(calls.length, 2);
        assert.equal(calls[0].tweet.reply_to.id, '7001');
        assert.equal(calls[1].content, 'Citation utile');
        assert.equal(
          repo.getDb().prepare('SELECT COUNT(*) AS total FROM analyses').get()
            .total,
          2
        );
      }
    );
  } finally {
    aiService.analyzeTweet = originalAnalyze;
    clearProfileCache();
    clearTweetDetailCache();
    repo.closeDatabase();
    cleanupDb(dbPath);
    await closeHttpServer(server);
  }
});


test('processTweets : un seul cycle à la fois', async () => {
  let profileHits = 0;
  let detailHits = 0;

  const { server, baseUrl } = await startHttpServer((req, res) => {
    if (req.url.startsWith('/profile')) {
      profileHits += 1;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(buildProfileHtml());
      return;
    }

    detailHits += 1;
    const url = new URL(req.url, baseUrl);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id_str: url.searchParams.get('id'),
        text: 'Texte',
        created_at: '2026-11-05T17:51:06.000Z',
        user: { name: 'Sardoche', screen_name: 'Sardoche' },
        mediaDetails: [],
      })
    );
  });

  const dbPath = path.join(
    os.tmpdir(),
    `sardochemetre-single-${process.pid}-${Date.now()}.db`
  );
  const originalAnalyze = aiService.analyzeTweet;
  let calls = 0;

  aiService.analyzeTweet = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      bullshit_score: 50,
      verdict: 'BULLSHIT',
      reasoning: 'Stub.',
      fact_checks: [],
      humor_comment: '',
    };
  };

  try {
    await withEnv(
      {
        SQLITE_PATH: dbPath,
        DEMO_MODE: 'false',
        TWITTER_SOURCE: 'profile',
        TWITTER_PROFILE_URL: `${baseUrl}/profile`,
        TWITTER_TWEET_DETAIL_URL: `${baseUrl}/tweet-result`,
        AI_PROVIDER: 'opencode',
        OPENCODE_API_KEY: 'oc_sk_test_single',
      },
      async () => {
        clearProfileCache();
        clearTweetDetailCache();
        await Promise.all([
          processTweets('sqlite'),
          processTweets('sqlite'),
        ]);
      }
    );

    assert.equal(profileHits, 1);
    assert.equal(detailHits, 2);
    assert.equal(calls, 2);
  } finally {
    aiService.analyzeTweet = originalAnalyze;
    clearProfileCache();
    clearTweetDetailCache();
    repo.closeDatabase();
    cleanupDb(dbPath);
    await closeHttpServer(server);
  }
});
