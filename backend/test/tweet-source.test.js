'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const repo = require('../db/sqlite');

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch {
      // déjà absent
    }
  }
}

test('migration source, saveTweet et replaceMockTweets', () => {
  const dbPath = path.join(
    os.tmpdir(),
    `sardochemetre-source-${process.pid}-${Date.now()}.db`
  );

  try {
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE tweets (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        posted_at TIMESTAMP NOT NULL,
        likes INTEGER DEFAULT 0,
        retweets INTEGER DEFAULT 0,
        analyzed BOOLEAN DEFAULT FALSE,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO tweets (id, content, posted_at, likes, retweets, analyzed)
      VALUES ('legacy', 'Ancien tweet', '2025-01-01T00:00:00Z', 1, 2, 0);
    `);
    legacy.close();

    repo.initDatabase({ filename: dbPath });
    const db = repo.getDb();

    const columns = db
      .prepare('PRAGMA table_info(tweets)')
      .all()
      .map((row) => row.name);
    assert.ok(columns.includes('source'));
    assert.equal(repo.getTweetById('legacy').source, 'mock');

    const syndication = repo.saveTweet({
      id: 'real-syndication',
      content: 'Tweet réel',
      posted_at: '2025-02-01T10:00:00Z',
      likes: 10,
      retweets: 3,
      source: 'syndication',
    });
    assert.equal(syndication.source, 'syndication');
    assert.equal(syndication.analyzed, false);

    const xTweet = repo.saveTweet({
      id: 'real-x',
      content: 'Tweet X',
      posted_at: '2025-02-02T10:00:00Z',
      source: 'x',
    });
    assert.equal(xTweet.source, 'x');

    const defaultSource = repo.saveTweet({
      id: 'default-source',
      content: 'Sans source explicite',
      posted_at: '2025-02-03T10:00:00Z',
    });
    assert.equal(defaultSource.source, 'mock');

    repo.upsertAnalysis('real-syndication', {
      bullshit_score: 30,
      verdict: 'DOUTEUX',
      reasoning: 'Analyse conservée.',
      fact_checks: [],
      humor_comment: '',
    });

    const refreshed = repo.saveTweet({
      id: 'real-syndication',
      content: 'Tweet réel mis à jour',
      posted_at: '2025-02-01T11:00:00Z',
      likes: 11,
      retweets: 4,
      source: 'syndication',
    });
    assert.equal(refreshed.source, 'syndication');
    assert.equal(refreshed.likes, 11);
    assert.equal(refreshed.analyzed, true);

    const { seeded } = repo.seedDemoData();
    assert.equal(seeded, 8);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS total FROM tweets WHERE source = 'mock'")
        .get().total,
      10
    );

    const removed = repo.replaceMockTweets();
    assert.equal(removed, 10);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM tweets WHERE source = 'mock'").get()
        .total,
      0
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM tweets').get().total, 2);
    assert.equal(repo.getTweetById('real-syndication').source, 'syndication');
    assert.equal(repo.getTweetById('real-syndication').analyzed, true);
    assert.equal(repo.getTweetById('real-x').source, 'x');
    assert.equal(repo.getTweetById('legacy'), null);

    assert.equal(repo.deleteTweetsBySource('x'), 1);
    assert.equal(repo.getTweetById('real-x'), null);
    assert.ok(repo.getTweetById('real-syndication'));

    repo.seedDemoData();
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM tweets WHERE source = 'mock'").get()
        .total,
      8
    );
    assert.ok(repo.getTweetById('real-syndication'));
  } finally {
    repo.closeDatabase();
    cleanup(dbPath);
  }
});

test('listUnanalyzedTweets ignore les tweets analysés', () => {
  const dbPath = path.join(
    os.tmpdir(),
    `sardochemetre-unanalyzed-${process.pid}-${Date.now()}.db`
  );

  try {
    repo.initDatabase({ filename: dbPath });

    repo.saveTweet({
      id: 'new',
      content: 'Pas encore analysé',
      posted_at: '2025-03-01T10:00:00Z',
      source: 'syndication',
    });
    repo.saveTweet({
      id: 'done',
      content: 'Déjà analysé',
      posted_at: '2025-03-02T10:00:00Z',
      source: 'syndication',
    });
    repo.upsertAnalysis('done', {
      bullshit_score: 10,
      verdict: 'VRAI',
      reasoning: 'OK',
      fact_checks: [],
      humor_comment: '',
    });

    const pending = repo.listUnanalyzedTweets();
    assert.deepEqual(
      pending.map((tweet) => tweet.id),
      ['new']
    );
    assert.equal(pending[0].source, 'syndication');
  } finally {
    repo.closeDatabase();
    cleanup(dbPath);
  }
});
