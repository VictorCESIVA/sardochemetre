'use strict';

const { resolveDbClient } = require('./config');

/**
 * Bail (lease) partagé pour n'exécuter le scheduler que sur une instance.
 *
 * Le propriétaire renouvelle son bail à intervalle régulier. Un bail expiré
 * peut être pris par une autre instance : si la première instance est morte,
 * la relève est automatique. Les deux implémentations utilisent l'heure de la
 * base (`NOW()`), pas l'horloge locale, pour éviter les vols de bail liés au
 * décalage d'horloge entre machines.
 */

function createSqliteLeaseStore(db) {
  const acquireStatement = db.prepare(`
    INSERT INTO scheduler_leases (name, owner, expires_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))
    ON CONFLICT(name) DO UPDATE SET
      owner = excluded.owner,
      expires_at = excluded.expires_at
    WHERE scheduler_leases.expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       OR scheduler_leases.owner = excluded.owner
    RETURNING owner
  `);
  const releaseStatement = db.prepare(
    'DELETE FROM scheduler_leases WHERE name = ? AND owner = ?'
  );

  return {
    async acquire({ name, owner, ttlMs }) {
      const seconds = (Math.max(1, Math.floor(ttlMs)) / 1000).toFixed(3);
      const row = acquireStatement.get(name, owner, `+${seconds} seconds`);
      return Boolean(row && row.owner === owner);
    },
    async release({ name, owner }) {
      releaseStatement.run(name, owner);
    },
  };
}

function createPostgresLeaseStore(pool) {
  return {
    async acquire({ name, owner, ttlMs }) {
      const result = await pool.query(
        `
          INSERT INTO scheduler_leases (name, owner, expires_at)
          VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 millisecond'))
          ON CONFLICT (name) DO UPDATE SET
            owner = EXCLUDED.owner,
            expires_at = EXCLUDED.expires_at
          WHERE scheduler_leases.expires_at <= NOW()
             OR scheduler_leases.owner = EXCLUDED.owner
          RETURNING owner
        `,
        [name, owner, Math.max(1, Math.floor(ttlMs))]
      );
      return Boolean(result.rows[0] && result.rows[0].owner === owner);
    },
    async release({ name, owner }) {
      await pool.query(
        'DELETE FROM scheduler_leases WHERE name = $1 AND owner = $2',
        [name, owner]
      );
    },
  };
}

function createSchedulerLeaseStore(dbClient = resolveDbClient()) {
  if (dbClient === 'postgres') {
    const { getPool } = require('./postgres');
    return createPostgresLeaseStore(getPool());
  }

  const { getDb } = require('./sqlite');
  return createSqliteLeaseStore(getDb());
}

module.exports = {
  createSqliteLeaseStore,
  createPostgresLeaseStore,
  createSchedulerLeaseStore,
};
