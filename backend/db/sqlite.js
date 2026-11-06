'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ensureSchema } = require('./schema');
const { normalizePeriod, getPeriodCutoff } = require('./periods');
const { loadDemoTweets } = require('./mock-data');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'sardochemetre.db');
const VALID_VERDICTS = ['VRAI', 'DOUTEUX', 'BULLSHIT', 'CHAUD BOUILLANT'];

let connection = null;
let connectionPath = null;

function resolveDatabasePath(explicitPath) {
  const configured = explicitPath || process.env.SQLITE_PATH;
  if (!configured) return DEFAULT_DB_PATH;
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(path.join(__dirname, '..'), configured);
}

function openDatabase(filename) {
  const resolved = path.resolve(filename);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);
  return db;
}

/**
 * Ouverture autonome (utile pour les scripts/tests de migration).
 */
function createDatabase(filename) {
  return openDatabase(filename);
}

function initDatabase({ filename } = {}) {
  const target = resolveDatabasePath(filename);

  if (connection) {
    if (connectionPath === target) return connection;
    connection.close();
    connection = null;
  }

  connection = openDatabase(target);
  connectionPath = target;
  return connection;
}

function getDb() {
  return connection || initDatabase();
}

function getDatabasePath() {
  return connectionPath || resolveDatabasePath();
}

function closeDatabase() {
  if (connection) {
    connection.close();
    connection = null;
    connectionPath = null;
  }
}

function toIso(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function parseFactChecks(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseMedia(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function parseQuotedTweet(value) {
  const parsed = parseJson(value, null);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed
    : null;
}

function mapTweet(row, author = null) {
  if (!row) return null;

  return {
    id: row.id,
    content: row.content,
    posted_at: row.posted_at,
    likes: Number(row.likes) || 0,
    retweets: Number(row.retweets) || 0,
    replies: Number(row.replies) || 0,
    views: Number(row.views) || 0,
    source: row.source || 'mock',
    author: author || null,
    media: parseMedia(row.media),
    quoted_tweet: parseQuotedTweet(row.quoted_tweet),
    analyzed: Boolean(row.analyzed),
    bullshit_score:
      row.bullshit_score === null || row.bullshit_score === undefined
        ? null
        : Number(row.bullshit_score),
    verdict: row.verdict || null,
    reasoning: row.reasoning || null,
    fact_checks: parseFactChecks(row.fact_checks),
    humor_comment: row.humor_comment || null,
    analyzed_at: row.analyzed_at || null,
  };
}

function mapProfile(row) {
  if (!row) return null;

  return {
    username: row.username,
    name: row.name,
    avatar_url: row.avatar_url || null,
    verified: Boolean(row.verified),
    followers: Number(row.followers) || 0,
    updated_at: row.updated_at || null,
  };
}

function getProfile() {
  return mapProfile(
    getDb()
      .prepare(
        `SELECT username, name, avatar_url, verified, followers, updated_at
         FROM profile WHERE id = 1`
      )
      .get()
  );
}

function authorFromProfile(profile) {
  if (!profile) return null;

  return {
    name: profile.name,
    username: profile.username,
    avatar_url: profile.avatar_url,
    verified: profile.verified,
  };
}

/**
 * Upsert du profil unique (id=1). Les champs absents conservent
 * leur valeur précédente (notamment followers).
 */
function saveProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Profil invalide');
  }

  const existing = getProfile();
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

  getDb()
    .prepare(`
      INSERT INTO profile
        (id, username, name, avatar_url, verified, followers, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        verified = excluded.verified,
        followers = excluded.followers,
        updated_at = excluded.updated_at
    `)
    .run(
      username || name,
      name || username,
      avatarUrl,
      verified ? 1 : 0,
      followers,
      toIso(profile.updated_at)
    );

  return getProfile();
}

function authorForTweets() {
  return authorFromProfile(getProfile());
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function percentage(count, total) {
  return total > 0 ? round2((count / total) * 100) : 0;
}

function levelForScore(score) {
  if (score >= 75) return 'CRITIQUE';
  if (score >= 50) return 'ÉLEVÉ';
  if (score >= 25) return 'MODÉRÉ';
  return 'FAIBLE';
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildPeriodClause(period, params) {
  const cutoff = getPeriodCutoff(period);
  if (!cutoff) return '';
  params.push(cutoff);
  return 'AND t.posted_at >= ?';
}

const TWEET_SELECT = `
  SELECT
    t.id,
    t.content,
    t.posted_at,
    t.likes,
    t.retweets,
    t.replies,
    t.views,
    t.media,
    t.quoted_tweet,
    t.source,
    t.analyzed,
    a.bullshit_score,
    a.verdict,
    a.reasoning,
    a.fact_checks,
    a.humor_comment,
    a.analyzed_at
  FROM tweets t
  LEFT JOIN analyses a ON a.tweet_id = t.id
`;

function listTweets({ page = 1, limit = 20, period = 'all', q = '' } = {}) {
  const db = getDb();
  const safePeriod = normalizePeriod(period) || 'all';
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;
  const query = String(q || '').trim();

  const conditions = ['t.analyzed = 1'];
  const params = [];
  const periodClause = buildPeriodClause(safePeriod, params);
  if (periodClause) conditions.push(periodClause.replace(/^AND /, ''));

  if (query) {
    conditions.push("LOWER(t.content) LIKE LOWER(?) ESCAPE '\\'");
    params.push(`%${escapeLike(query)}%`);
  }

  const where = conditions.join(' AND ');

  const rows = db
    .prepare(`
      SELECT
        t.id,
        t.content,
        t.posted_at,
        t.likes,
        t.retweets,
        t.replies,
        t.views,
        t.media,
        t.quoted_tweet,
        t.source,
        t.analyzed,
        a.bullshit_score,
        a.verdict,
        a.reasoning,
        a.fact_checks,
        a.humor_comment,
        a.analyzed_at
      FROM tweets t
      JOIN analyses a ON a.tweet_id = t.id
      WHERE ${where}
      ORDER BY t.posted_at DESC, t.id DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, safeLimit, offset);

  const { total } = db
    .prepare(`
      SELECT COUNT(*) AS total
      FROM tweets t
      JOIN analyses a ON a.tweet_id = t.id
      WHERE ${where}
    `)
    .get(...params);

  const totalPages = Math.ceil(total / safeLimit);
  const author = authorForTweets();

  return {
    tweets: rows.map((row) => mapTweet(row, author)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
    period: safePeriod,
    query,
  };
}

function getTweetById(id) {
  const row = getDb()
    .prepare(`${TWEET_SELECT} WHERE t.id = ?`)
    .get(String(id));
  return mapTweet(row, authorForTweets());
}

function hasAnalysis(tweetId) {
  return Boolean(
    getDb().prepare('SELECT 1 FROM analyses WHERE tweet_id = ?').get(String(tweetId))
  );
}

function searchTweets(q) {
  const query = String(q || '').trim();
  if (!query) return { tweets: [], total: 0 };

  const rows = getDb()
    .prepare(`
      SELECT
        t.id,
        t.content,
        t.posted_at,
        t.likes,
        t.retweets,
        t.replies,
        t.views,
        t.media,
        t.quoted_tweet,
        t.source,
        t.analyzed,
        a.bullshit_score,
        a.verdict,
        a.reasoning,
        a.fact_checks,
        a.humor_comment,
        a.analyzed_at
      FROM tweets t
      JOIN analyses a ON a.tweet_id = t.id
      WHERE t.analyzed = 1
        AND LOWER(t.content) LIKE LOWER(?) ESCAPE '\\'
      ORDER BY t.posted_at DESC, t.id DESC
    `)
    .all(`%${escapeLike(query)}%`);

  const author = authorForTweets();
  return {
    tweets: rows.map((row) => mapTweet(row, author)),
    total: rows.length,
  };
}

function getStats(period = 'all') {
  const db = getDb();
  const safePeriod = normalizePeriod(period) || 'all';
  const params = [];
  const periodClause = buildPeriodClause(safePeriod, params);

  const stats = db
    .prepare(`
      SELECT
        COUNT(*) AS total_analyzed,
        AVG(a.bullshit_score) AS avg_score,
        MIN(a.bullshit_score) AS min_score,
        MAX(a.bullshit_score) AS max_score,
        SUM(CASE WHEN a.verdict = 'VRAI' THEN 1 ELSE 0 END) AS vrai_count,
        SUM(CASE WHEN a.verdict = 'DOUTEUX' THEN 1 ELSE 0 END) AS douteux_count,
        SUM(CASE WHEN a.verdict = 'BULLSHIT' THEN 1 ELSE 0 END) AS bullshit_count,
        SUM(CASE WHEN a.verdict = 'CHAUD BOUILLANT' THEN 1 ELSE 0 END) AS chaud_bouillant_count
      FROM tweets t
      JOIN analyses a ON a.tweet_id = t.id
      WHERE t.analyzed = 1 ${periodClause}
    `)
    .get(...params);

  const total = Number(stats.total_analyzed) || 0;
  const count = (value) => Number(value) || 0;

  return {
    period: safePeriod,
    avgScore: total > 0 ? round2(Number(stats.avg_score)) : 0,
    minScore: total > 0 ? Number(stats.min_score) : 0,
    maxScore: total > 0 ? Number(stats.max_score) : 0,
    totalAnalyzed: total,
    verdictDistribution: {
      VRAI: {
        count: count(stats.vrai_count),
        percentage: percentage(count(stats.vrai_count), total),
      },
      DOUTEUX: {
        count: count(stats.douteux_count),
        percentage: percentage(count(stats.douteux_count), total),
      },
      BULLSHIT: {
        count: count(stats.bullshit_count),
        percentage: percentage(count(stats.bullshit_count), total),
      },
      'CHAUD BOUILLANT': {
        count: count(stats.chaud_bouillant_count),
        percentage: percentage(count(stats.chaud_bouillant_count), total),
      },
    },
  };
}

function getBullshitmetre(period = 'all') {
  const safePeriod = normalizePeriod(period) || 'all';
  const params = [];
  const periodClause = buildPeriodClause(safePeriod, params);

  const data = getDb()
    .prepare(`
      SELECT
        AVG(a.bullshit_score) AS global_score,
        COUNT(*) AS sample_size
      FROM tweets t
      JOIN analyses a ON a.tweet_id = t.id
      WHERE t.analyzed = 1 ${periodClause}
    `)
    .get(...params);

  const sampleSize = Number(data.sample_size) || 0;
  const globalScore = sampleSize > 0 ? round2(Number(data.global_score)) : 0;

  return {
    period: safePeriod,
    globalScore,
    level: levelForScore(globalScore),
    sampleSize,
    timestamp: new Date().toISOString(),
  };
}

function saveTweet(tweet) {
  if (!tweet || !tweet.id) {
    throw new Error('Tweet invalide : id manquant');
  }

  const source = String(tweet.source || 'mock').trim() || 'mock';
  const media = Array.isArray(tweet.media) ? tweet.media : parseMedia(tweet.media);
  const quotedTweet =
    tweet.quoted_tweet === undefined
      ? null
      : parseQuotedTweet(tweet.quoted_tweet);

  getDb()
    .prepare(`
      INSERT INTO tweets
        (id, content, posted_at, likes, retweets, replies, views, media, quoted_tweet, source, analyzed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        posted_at = excluded.posted_at,
        likes = excluded.likes,
        retweets = excluded.retweets,
        replies = excluded.replies,
        views = excluded.views,
        media = excluded.media,
        quoted_tweet = excluded.quoted_tweet,
        source = excluded.source
    `)
    .run(
      String(tweet.id),
      String(tweet.content || ''),
      toIso(tweet.posted_at),
      Number(tweet.likes) || 0,
      Number(tweet.retweets) || 0,
      Number(tweet.replies) || 0,
      Number(tweet.views) || 0,
      JSON.stringify(media),
      quotedTweet ? JSON.stringify(quotedTweet) : null,
      source
    );

  if (tweet.author) {
    saveProfile(tweet.author);
  }

  return getTweetById(tweet.id);
}

/**
 * Supprime les tweets d'une source (et leurs analyses) sans toucher
 * aux autres sources. Retourne le nombre de tweets supprimés.
 */
function deleteTweetsBySource(source) {
  const value = String(source || '').trim();
  if (!value) {
    throw new Error('source requise pour supprimer des tweets');
  }

  const db = getDb();

  return db.transaction(() => {
    db.prepare(`
      DELETE FROM analyses
      WHERE tweet_id IN (SELECT id FROM tweets WHERE source = ?)
    `).run(value);

    return db.prepare('DELETE FROM tweets WHERE source = ?').run(value).changes;
  })();
}

function replaceMockTweets() {
  return deleteTweetsBySource('mock');
}

/**
 * Tweets pas encore analysés, du plus récent au plus ancien.
 */
function listUnanalyzedTweets({ limit = 50 } = {}) {
  const safeLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 50));
  const author = authorForTweets();

  return getDb()
    .prepare(`
      ${TWEET_SELECT}
      WHERE t.analyzed = 0
      ORDER BY t.posted_at DESC, t.id DESC
      LIMIT ?
    `)
    .all(safeLimit)
    .map((row) => mapTweet(row, author));
}

function normalizeAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') {
    throw new Error('Analyse invalide');
  }

  const score = Math.round(Number(analysis.bullshit_score));
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error('bullshit_score doit être un nombre entre 0 et 100');
  }

  const verdict = String(analysis.verdict || '').trim().toUpperCase();
  if (!VALID_VERDICTS.includes(verdict)) {
    throw new Error(`verdict invalide : "${analysis.verdict}"`);
  }

  return {
    score,
    verdict,
    reasoning: String(analysis.reasoning || '').trim() || 'Analyse indisponible.',
    factChecks: Array.isArray(analysis.fact_checks) ? analysis.fact_checks : [],
    humorComment:
      analysis.humor_comment === null || analysis.humor_comment === undefined
        ? ''
        : String(analysis.humor_comment),
    analyzedAt: toIso(analysis.analyzed_at),
  };
}

function upsertAnalysis(tweetId, analysis) {
  const normalized = normalizeAnalysis(analysis);
  const db = getDb();

  db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM tweets WHERE id = ?').get(String(tweetId));
    if (!exists) {
      throw new Error(`Tweet introuvable : ${tweetId}`);
    }

    db.prepare(`
      INSERT INTO analyses
        (tweet_id, bullshit_score, verdict, reasoning, fact_checks, humor_comment, analyzed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tweet_id) DO UPDATE SET
        bullshit_score = excluded.bullshit_score,
        verdict = excluded.verdict,
        reasoning = excluded.reasoning,
        fact_checks = excluded.fact_checks,
        humor_comment = excluded.humor_comment,
        analyzed_at = excluded.analyzed_at
    `).run(
      String(tweetId),
      normalized.score,
      normalized.verdict,
      normalized.reasoning,
      JSON.stringify(normalized.factChecks),
      normalized.humorComment,
      normalized.analyzedAt
    );

    db.prepare('UPDATE tweets SET analyzed = 1 WHERE id = ?').run(String(tweetId));
  })();

  return getTweetById(tweetId);
}

/**
 * Seed idempotent de la démo : les analyses viennent du mock,
 * seules les dates sont recalées par rapport à maintenant.
 */
function seedDemoData({ now = new Date() } = {}) {
  const tweets = loadDemoTweets(now);
  const db = getDb();

  const upsertTweet = db.prepare(`
    INSERT INTO tweets (id, content, posted_at, likes, retweets, source, analyzed)
    VALUES (?, ?, ?, ?, ?, 'mock', 1)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      posted_at = excluded.posted_at,
      likes = excluded.likes,
      retweets = excluded.retweets,
      source = 'mock',
      analyzed = 1
  `);

  const upsertAnalysisStmt = db.prepare(`
    INSERT INTO analyses
      (tweet_id, bullshit_score, verdict, reasoning, fact_checks, humor_comment, analyzed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tweet_id) DO UPDATE SET
      bullshit_score = excluded.bullshit_score,
      verdict = excluded.verdict,
      reasoning = excluded.reasoning,
      fact_checks = excluded.fact_checks,
      humor_comment = excluded.humor_comment,
      analyzed_at = excluded.analyzed_at
  `);

  const seed = db.transaction(() => {
    for (const tweet of tweets) {
      if (!tweet.analysis) {
        throw new Error(`Analyse manquante dans le mock pour le tweet ${tweet.id}`);
      }

      const normalized = normalizeAnalysis({
        ...tweet.analysis,
        analyzed_at: new Date(Date.parse(tweet.posted_at) + 60 * 60 * 1000).toISOString(),
      });

      upsertTweet.run(
        String(tweet.id),
        String(tweet.content || ''),
        toIso(tweet.posted_at),
        Number(tweet.likes) || 0,
        Number(tweet.retweets) || 0
      );

      upsertAnalysisStmt.run(
        String(tweet.id),
        normalized.score,
        normalized.verdict,
        normalized.reasoning,
        JSON.stringify(normalized.factChecks),
        normalized.humorComment,
        normalized.analyzedAt
      );
    }
  });

  seed();
  return { seeded: tweets.length };
}

module.exports = {
  DEFAULT_DB_PATH,
  resolveDatabasePath,
  createDatabase,
  initDatabase,
  getDb,
  getDatabasePath,
  closeDatabase,
  listTweets,
  getTweetById,
  getProfile,
  saveProfile,
  searchTweets,
  getStats,
  getBullshitmetre,
  saveTweet,
  deleteTweetsBySource,
  replaceMockTweets,
  listUnanalyzedTweets,
  hasAnalysis,
  upsertAnalysis,
  seedDemoData,
  levelForScore,
  mapTweet,
};
