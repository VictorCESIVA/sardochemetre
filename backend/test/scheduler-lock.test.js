'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createDatabase } = require('../db/sqlite');
const { createSqliteLeaseStore } = require('../db/schedulerLeaseStore');
const {
  createSchedulerLock,
  DEFAULT_TTL_MS,
} = require('../services/schedulerLock');

function createDb() {
  const filename = path.join(
    os.tmpdir(),
    `sardochemetre-lock-${process.pid}-${Date.now()}-${Math.random()
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

test('bail SQLite : une seule instance détient le verrou', async () => {
  const { db, cleanup } = createDb();

  try {
    const store = createSqliteLeaseStore(db);
    const first = createSchedulerLock({ store, owner: 'instance-a', ttlMs: 60_000 });
    const second = createSchedulerLock({ store, owner: 'instance-b', ttlMs: 60_000 });

    assert.equal(await first.acquire(), true);
    assert.equal(first.held, true);
    assert.equal(await second.acquire(), false);
    assert.equal(second.held, false);

    // Le propriétaire peut renouveler sans perdre le bail.
    assert.equal(await first.renew(), true);

    // Forcer l'expiration : une autre instance peut reprendre le bail.
    db.prepare(
      "UPDATE scheduler_leases SET expires_at = '2000-01-01T00:00:00.000Z' WHERE name = ?"
    ).run('scheduler');

    assert.equal(await second.acquire(), true);
    assert.equal(second.held, true);

    // L'ancienne instance ne peut plus renouveler ni supprimer le bail repris.
    assert.equal(await first.renew(), false);
    await first.release();
    assert.equal(await second.renew(), true);

    await second.release();
    const row = db
      .prepare('SELECT * FROM scheduler_leases WHERE name = ?')
      .get('scheduler');
    assert.equal(row, undefined);
  } finally {
    cleanup();
  }
});

test('bail SQLite : release ne supprime que le bail de son propriétaire', async () => {
  const { db, cleanup } = createDb();

  try {
    const store = createSqliteLeaseStore(db);
    const first = createSchedulerLock({ store, owner: 'instance-a' });
    const second = createSchedulerLock({ store, owner: 'instance-b' });

    assert.equal(await first.acquire(), true);
    await second.release();

    const row = db
      .prepare('SELECT owner FROM scheduler_leases WHERE name = ?')
      .get('scheduler');
    assert.equal(row.owner, 'instance-a');
  } finally {
    cleanup();
  }
});

test('createSchedulerLock : store requis et TTL par défaut', () => {
  assert.throws(() => createSchedulerLock({}), /store\.acquire/);
  const lock = createSchedulerLock({
    store: { acquire: async () => true, release: async () => {} },
  });
  assert.equal(lock.ttlMs, DEFAULT_TTL_MS);
  assert.match(lock.owner, /^scheduler:\d+:/);
});
