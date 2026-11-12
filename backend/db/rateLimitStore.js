'use strict';

const { resolveDbClient } = require('./config');

/**
 * Compteurs de débit partagés entre instances.
 *
 * Le compteur est une ligne par adresse IP et par fenêtre. L'upsert atomique
 * incrémente le compteur courant, ou le remet à 1 quand la fenêtre change.
 */

function createSqliteRateLimitStore(db) {
  const consumeStatement = db.prepare(`
    INSERT INTO analyze_rate_limits (client_key, window_start, count)
    VALUES (?, ?, 1)
    ON CONFLICT(client_key) DO UPDATE SET
      count = CASE
        WHEN analyze_rate_limits.window_start = excluded.window_start
        THEN analyze_rate_limits.count + 1
        ELSE 1
      END,
      window_start = excluded.window_start
    RETURNING count, window_start
  `);
  const sweepStatement = db.prepare(
    'DELETE FROM analyze_rate_limits WHERE window_start < ?'
  );

  let lastSweepAt = 0;

  return {
    async consume({ key, windowMs, now }) {
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const row = consumeStatement.get(key, windowStart);

      if (now - lastSweepAt >= windowMs) {
        sweepStatement.run(now - windowMs);
        lastSweepAt = now;
      }

      return {
        count: Number(row.count),
        resetAt: Number(row.window_start) + windowMs,
      };
    },
  };
}

function createPostgresRateLimitStore(pool) {
  let lastSweepAt = 0;

  return {
    async consume({ key, windowMs, now }) {
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const result = await pool.query(
        `
          INSERT INTO analyze_rate_limits (client_key, window_start, count)
          VALUES ($1, $2, 1)
          ON CONFLICT (client_key) DO UPDATE SET
            count = CASE
              WHEN analyze_rate_limits.window_start = EXCLUDED.window_start
              THEN analyze_rate_limits.count + 1
              ELSE 1
            END,
            window_start = EXCLUDED.window_start
          RETURNING count, window_start
        `,
        [key, windowStart]
      );

      if (now - lastSweepAt >= windowMs) {
        await pool.query(
          'DELETE FROM analyze_rate_limits WHERE window_start < $1',
          [now - windowMs]
        );
        lastSweepAt = now;
      }

      const row = result.rows[0];
      return {
        count: Number(row.count),
        resetAt: Number(row.window_start) + windowMs,
      };
    },
  };
}

function createRateLimitStore(dbClient = resolveDbClient()) {
  if (dbClient === 'postgres') {
    const { getPool } = require('./postgres');
    return createPostgresRateLimitStore(getPool());
  }

  const { getDb } = require('./sqlite');
  return createSqliteRateLimitStore(getDb());
}

module.exports = {
  createSqliteRateLimitStore,
  createPostgresRateLimitStore,
  createRateLimitStore,
};
