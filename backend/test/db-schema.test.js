'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { createDatabase } = require('../db/sqlite');

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch {
      // déjà absent
    }
  }
}

test('migration : déduplique, nettoie et ajoute les contraintes', () => {
  const dbPath = path.join(
    os.tmpdir(),
    `sardochemetre-migration-${process.pid}-${Date.now()}.db`
  );

  let db;

  try {
    const legacy = new Database(dbPath);
    legacy.pragma('foreign_keys = OFF');
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
      CREATE TABLE analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tweet_id TEXT REFERENCES tweets(id),
        bullshit_score INTEGER NOT NULL,
        verdict TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        fact_checks TEXT,
        humor_comment TEXT,
        analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO tweets (id, content, posted_at, likes, retweets, analyzed)
      VALUES
        ('a', 'Tweet A', '2025-01-01T00:00:00Z', 1, 2, 1),
        ('b', 'Tweet B', '2025-01-02T00:00:00Z', 3, 4, 1);
      INSERT INTO analyses
        (tweet_id, bullshit_score, verdict, reasoning, fact_checks, humor_comment, analyzed_at)
      VALUES
        ('a', 40, 'DOUTEUX', 'ancienne', '[]', '', '2025-01-01T01:00:00Z'),
        ('a', 80, 'BULLSHIT', 'récente', '[]', '', '2025-01-01T02:00:00Z'),
        ('b', 150, 'BULLSHIT', 'invalide', '[]', '', '2025-01-01T03:00:00Z'),
        ('ghost', 50, 'DOUTEUX', 'orpheline', '[]', '', '2025-01-01T04:00:00Z');
    `);
    legacy.close();

    db = createDatabase(dbPath);

    const analyses = db.prepare('SELECT * FROM analyses').all();
    assert.equal(analyses.length, 1);
    assert.equal(analyses[0].tweet_id, 'a');
    assert.equal(analyses[0].bullshit_score, 80);
    assert.equal(analyses[0].reasoning, 'récente');

    const tweets = db
      .prepare('SELECT id, analyzed FROM tweets ORDER BY id')
      .all();
    assert.deepEqual(tweets, [
      { id: 'a', analyzed: 1 },
      { id: 'b', analyzed: 0 },
    ]);

    const schemaSql = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'analyses'")
      .get().sql;
    assert.match(schemaSql, /CHECK \(bullshit_score >= 0/);
    assert.match(schemaSql, /CHECK \(verdict IN/);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => row.name);
    assert.ok(indexes.includes('idx_analyses_tweet_id_unique'));
    assert.ok(indexes.includes('idx_tweets_posted_at'));

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO analyses (tweet_id, bullshit_score, verdict, reasoning)
             VALUES ('a', 50, 'DOUTEUX', 'doublon')`
          )
          .run(),
      /UNIQUE constraint failed/
    );

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO analyses (tweet_id, bullshit_score, verdict, reasoning)
             VALUES ('b', 101, 'BULLSHIT', 'score invalide')`
          )
          .run(),
      /CHECK constraint failed/
    );

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO analyses (tweet_id, bullshit_score, verdict, reasoning)
             VALUES ('b', 10, 'N IMPORTE QUOI', 'verdict invalide')`
          )
          .run(),
      /CHECK constraint failed/
    );

    db.prepare(
      `INSERT INTO analyses (tweet_id, bullshit_score, verdict, reasoning)
       VALUES ('b', 10, 'VRAI', 'valide')`
    ).run();
    assert.equal(
      db.prepare('SELECT COUNT(*) AS total FROM analyses').get().total,
      2
    );
  } finally {
    if (db) db.close();
    cleanup(dbPath);
  }
});

test('schéma neuf : créer deux fois reste idempotent', () => {
  const dbPath = path.join(
    os.tmpdir(),
    `sardochemetre-schema-${process.pid}-${Date.now()}.db`
  );

  try {
    const first = createDatabase(dbPath);
    first
      .prepare(
        `INSERT INTO tweets (id, content, posted_at, analyzed)
         VALUES ('x', 'contenu', '2025-01-01T00:00:00Z', 0)`
      )
      .run();
    first.close();

    const second = createDatabase(dbPath);
    assert.equal(
      second.prepare('SELECT COUNT(*) AS total FROM tweets').get().total,
      1
    );
    assert.equal(
      second.prepare('SELECT COUNT(*) AS total FROM analyses').get().total,
      0
    );
    second.close();
  } finally {
    cleanup(dbPath);
  }
});
