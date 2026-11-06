'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {
  parseArgs,
  runSync,
  formatTweetLine,
} = require('../sync-tweets');
const { clearProfileCache } = require('../services/twitterService');
const repo = require('../db/sqlite');
const { buildProfileHtml } = require('./helpers/profile-fixture');

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch {
      // déjà absent
    }
  }
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

test('parseArgs : valeurs par défaut', () => {
  assert.deepEqual(parseArgs([]), {
    source: null,
    limit: 20,
    replaceDemo: false,
    replaceSources: [],
    analyze: false,
    concurrency: 2,
    dryRun: false,
    help: false,
  });
});

test('parseArgs : options et bornes', () => {
  assert.deepEqual(
    parseArgs([
      '--source=profile',
      '--limit=5',
      '--replace-demo',
      '--replace-source=syndication',
      '--replace-source=mock,syndication',
      '--analyze',
      '--concurrency=9',
      '--dry-run',
    ]),
    {
      source: 'profile',
      limit: 5,
      replaceDemo: true,
      replaceSources: ['syndication', 'mock'],
      analyze: true,
      concurrency: 4,
      dryRun: true,
      help: false,
    }
  );

  assert.equal(parseArgs(['--limit=0']).limit, 1);
  assert.equal(parseArgs(['--limit=99']).limit, 50);
  assert.equal(parseArgs(['--concurrency=0']).concurrency, 1);
  assert.equal(parseArgs(['--concurrency', '3']).concurrency, 3);
  assert.equal(parseArgs(['--limit', '7']).limit, 7);
  assert.equal(parseArgs(['--help']).help, true);
});

test('parseArgs : erreurs explicites', () => {
  assert.throws(() => parseArgs(['--limite=5']), /option inconnue/);
  assert.throws(() => parseArgs(['--limit']), /valeur manquante/);
  assert.throws(() => parseArgs(['--limit=abc']), /entier/);
  assert.throws(() => parseArgs(['--concurrency=1.5']), /entier/);
  assert.throws(() => parseArgs(['--source=twitter']), /--source invalide/);
  assert.throws(
    () => parseArgs(['--replace-source=twitter']),
    /--replace-source invalide/
  );
});

test('formatTweetLine expose l’auteur, les médias et la citation', () => {
  const line = formatTweetLine({
    posted_at: '2026-11-05T17:51:06.000Z',
    id: '9001',
    likes: 87,
    retweets: 3,
    replies: 9,
    views: 17611,
    source: 'profile',
    author: { username: 'Sardoche' },
    media: [{ type: 'photo' }],
    quoted_tweet: { id: '8001' },
    content: 'Un tweet',
  });

  assert.match(line, /@Sardoche/);
  assert.match(line, /média:photo/);
  assert.match(line, /citation:8001/);
  assert.match(line, /9 rép\./);
  assert.match(line, /17611 vues/);
});

test('runSync dry-run profile via serveur HTTP local', async () => {
  let hits = 0;
  const { server, baseUrl } = await startServer((req, res) => {
    hits += 1;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(buildProfileHtml());
  });

  try {
    clearProfileCache();

    const code = await runSync(
      {
        source: 'profile',
        limit: 5,
        replaceDemo: false,
        replaceSources: ['syndication'],
        analyze: false,
        concurrency: 2,
        dryRun: true,
        help: false,
      },
      {
        DEMO_MODE: 'false',
        DB_CLIENT: 'sqlite',
        TWITTER_PROFILE_URL: baseUrl,
      }
    );

    assert.equal(code, 0);
    assert.equal(hits, 1);
  } finally {
    clearProfileCache();
    await closeServer(server);
  }
});

test('runSync importe profile, upsert le profil et remplace syndication', async () => {
  const dbPath = path.join(
    os.tmpdir(),
    `sardochemetre-sync-profile-${process.pid}-${Date.now()}.db`
  );
  const savedDbPath = process.env.SQLITE_PATH;
  let hits = 0;
  const { server, baseUrl } = await startServer((req, res) => {
    hits += 1;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(buildProfileHtml());
  });

  try {
    process.env.SQLITE_PATH = dbPath;
    repo.initDatabase();
    repo.saveTweet({
      id: 'old-syndication',
      content: 'Ancien top tweet',
      posted_at: '2024-01-01T00:00:00.000Z',
      source: 'syndication',
    });
    repo.closeDatabase();

    clearProfileCache();

    const code = await runSync(
      {
        source: 'profile',
        limit: 5,
        replaceDemo: false,
        replaceSources: ['syndication'],
        analyze: false,
        concurrency: 2,
        dryRun: false,
        help: false,
      },
      {
        DEMO_MODE: 'false',
        DB_CLIENT: 'sqlite',
        SQLITE_PATH: dbPath,
        TWITTER_PROFILE_URL: baseUrl,
      }
    );

    assert.equal(code, 0);
    assert.equal(hits, 1);

    repo.initDatabase({ filename: dbPath });
    const profile = repo.getProfile();
    assert.equal(profile.username, 'Sardoche');
    assert.equal(profile.followers, 593077);
    assert.equal(repo.getTweetById('old-syndication'), null);

    const first = repo.getTweetById('9001');
    assert.equal(first.source, 'profile');
    assert.equal(first.media.length, 1);
    assert.equal(first.author.username, 'Sardoche');

    const second = repo.getTweetById('9002');
    assert.equal(second.quoted_tweet.id, '8001');
    assert.equal(second.quoted_tweet.author.username, 'grm_off');
  } finally {
    clearProfileCache();
    repo.closeDatabase();
    if (savedDbPath === undefined) delete process.env.SQLITE_PATH;
    else process.env.SQLITE_PATH = savedDbPath;
    await closeServer(server);
    cleanup(dbPath);
  }
});
