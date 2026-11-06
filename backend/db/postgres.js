'use strict';

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL est requis pour utiliser PostgreSQL');
  }

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on('error', (error) => {
    console.error('[PostgreSQL] Erreur du pool :', error.message);
  });

  return pool;
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  try {
    await current.end();
  } catch (error) {
    console.error('[PostgreSQL] Erreur à la fermeture du pool :', error.message);
  }
}

function mapProfile(row) {
  if (!row) return null;

  return {
    username: row.username,
    name: row.name,
    avatar_url: row.avatar_url || null,
    verified: Boolean(row.verified),
    followers: Number(row.followers) || 0,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at || null,
  };
}

async function getProfile() {
  const result = await getPool().query(
    `SELECT username, name, avatar_url, verified, followers, updated_at
     FROM profile WHERE id = 1`
  );
  return mapProfile(result.rows[0]);
}

/**
 * Upsert du profil unique (id=1), en conservant les champs absents.
 */
async function saveProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Profil invalide');
  }

  const existing = await getProfile();
  const username = String(
    profile.username !== undefined && profile.username !== null
      ? profile.username
      : existing && existing.username
        ? existing.username
        : ''
  ).trim();
  const name = String(
    profile.name !== undefined && profile.name !== null
      ? profile.name
      : existing && existing.name
        ? existing.name
        : ''
  ).trim();

  if (!username && !name) {
    throw new Error('Profil invalide : username ou name requis');
  }

  const avatarUrl =
    profile.avatar_url === undefined
      ? existing && existing.avatar_url
      : profile.avatar_url
        ? String(profile.avatar_url).trim()
        : null;
  const verified =
    profile.verified === undefined
      ? Boolean(existing && existing.verified)
      : Boolean(profile.verified);
  const followers =
    profile.followers === undefined
      ? Number(existing && existing.followers) || 0
      : Number(profile.followers) || 0;

  await getPool().query(
    `
      INSERT INTO profile
        (id, username, name, avatar_url, verified, followers, updated_at)
      VALUES (1, $1, $2, $3, $4, $5, NOW())
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url,
        verified = EXCLUDED.verified,
        followers = EXCLUDED.followers,
        updated_at = NOW()
    `,
    [username || name, name || username, avatarUrl, verified, followers]
  );

  return getProfile();
}

/**
 * Seed idempotent des tweets de démo (mêmes données que SQLite).
 */
async function seedDemoData({ now = new Date() } = {}) {
  const { loadDemoTweets } = require('./mock-data');
  const tweets = loadDemoTweets(now);
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    for (const tweet of tweets) {
      const analysis = tweet.analysis;
      if (!analysis) {
        throw new Error(`Analyse manquante dans le mock pour le tweet ${tweet.id}`);
      }

      const score = Math.round(Number(analysis.bullshit_score));
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        throw new Error(`Score invalide dans le mock pour le tweet ${tweet.id}`);
      }

      await client.query(
        `
          INSERT INTO tweets (id, content, posted_at, likes, retweets, source, analyzed)
          VALUES ($1, $2, $3, $4, $5, 'mock', true)
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            posted_at = EXCLUDED.posted_at,
            likes = EXCLUDED.likes,
            retweets = EXCLUDED.retweets,
            source = 'mock',
            analyzed = true
        `,
        [
          String(tweet.id),
          tweet.content,
          tweet.posted_at,
          Number(tweet.likes) || 0,
          Number(tweet.retweets) || 0,
        ]
      );

      await client.query(
        `
          INSERT INTO analyses
            (tweet_id, bullshit_score, verdict, reasoning, fact_checks, humor_comment)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6)
          ON CONFLICT (tweet_id) DO UPDATE SET
            bullshit_score = EXCLUDED.bullshit_score,
            verdict = EXCLUDED.verdict,
            reasoning = EXCLUDED.reasoning,
            fact_checks = EXCLUDED.fact_checks,
            humor_comment = EXCLUDED.humor_comment,
            analyzed_at = NOW()
        `,
        [
          String(tweet.id),
          score,
          analysis.verdict,
          analysis.reasoning,
          JSON.stringify(Array.isArray(analysis.fact_checks) ? analysis.fact_checks : []),
          analysis.humor_comment || '',
        ]
      );
    }

    await client.query('COMMIT');
    return { seeded: tweets.length };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // transaction déjà annulée
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  closePool,
  getProfile,
  saveProfile,
  seedDemoData,
};
