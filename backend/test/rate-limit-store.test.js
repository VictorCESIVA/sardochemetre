'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createDatabase } = require('../db/sqlite');
const { createSqliteRateLimitStore } = require('../db/rateLimitStore');

function createDb() {
  const filename = path.join(
    os.tmpdir(),
    `sardochemetre-rate-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.db`
  );
  const db = createDatabase(filename);
  return {
    db,
    cleanup() {
      db.close();
      for (const suffix of ['', '-shm', '-wal']) {
        fs.rmSync(`${filename}${suffix}`, { force: true });
      }
    },
  };
}

test('compteur partagé SQLite : les stores voient le même compteur', async () => {
  const { db, cleanup } = createDb();

  try {
    const first = createSqliteRateLimitStore(db);
    const second = createSqliteRateLimitStore(db);

    const a = await first.consume({
      key: '203.0.113.5',
      windowMs: 60_000,
      now: 1_000_000,
    });
    assert.equal(a.count, 1);
    assert.equal(a.resetAt, 1_020_000);

    const b = await second.consume({
      key: '203.0.113.5',
      windowMs: 60_000,
      now: 1_001_000,
    });
    assert.equal(b.count, 2);
    assert.equal(b.resetAt, 1_020_000);

    const other = await second.consume({
      key: '203.0.113.6',
      windowMs: 60_000,
      now: 1_001_000,
    });
    assert.equal(other.count, 1);
  } finally {
    cleanup();
  }
});

test('compteur partagé SQLite : nouvelle fenêtre et purge', async () => {
  const { db, cleanup } = createDb();

  try {
    const store = createSqliteRateLimitStore(db);

    assert.equal(
      (await store.consume({ key: 'ip', windowMs: 60_000, now: 1_000_000 })).count,
      1
    );
    assert.equal(
      (await store.consume({ key: 'ip', windowMs: 60_000, now: 1_020_000 })).count,
      1
    );

    const rows = db
      .prepare('SELECT COUNT(*) AS total FROM analyze_rate_limits')
      .get();
    assert.equal(rows.total, 1);

    // Une fenêtre suffisamment avancée purge les anciennes lignes.
    await store.consume({ key: 'autre', windowMs: 60_000, now: 1_200_000 });
    const remaining = db
      .prepare('SELECT client_key FROM analyze_rate_limits')
      .all();
    assert.deepEqual(
      remaining.map((row) => row.client_key),
      ['autre']
    );
  } finally {
    cleanup();
  }
});
