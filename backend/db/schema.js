'use strict';

const TWEETS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS tweets (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  retweets INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  media TEXT NOT NULL DEFAULT '[]',
  quoted_tweet TEXT,
  source TEXT NOT NULL DEFAULT 'mock',
  analyzed INTEGER NOT NULL DEFAULT 0 CHECK (analyzed IN (0, 1)),
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

const PROFILE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  followers INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

const ANALYSES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL UNIQUE REFERENCES tweets(id) ON DELETE CASCADE,
  bullshit_score INTEGER NOT NULL CHECK (bullshit_score >= 0 AND bullshit_score <= 100),
  verdict TEXT NOT NULL CHECK (verdict IN ('VRAI', 'DOUTEUX', 'BULLSHIT', 'CHAUD BOUILLANT')),
  reasoning TEXT NOT NULL,
  fact_checks TEXT NOT NULL DEFAULT '[]',
  humor_comment TEXT,
  analyzed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

const INDEXES_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_tweet_id_unique ON analyses(tweet_id);
CREATE INDEX IF NOT EXISTS idx_analyses_tweet_id ON analyses(tweet_id);
CREATE INDEX IF NOT EXISTS idx_analyses_verdict ON analyses(verdict);
CREATE INDEX IF NOT EXISTS idx_analyses_analyzed_at ON analyses(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_posted_at ON tweets(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_analyzed ON tweets(analyzed);
CREATE INDEX IF NOT EXISTS idx_tweets_source ON tweets(source);
`;

function getTableSql(db, table) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return row && row.sql ? row.sql : '';
}

function hasColumn(db, table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
}

/**
 * Migration douce : ajoute tweets.source sur les bases antérieures.
 * Les lignes existantes (démo) prennent la valeur par défaut 'mock'.
 */
function ensureTweetSourceColumn(db) {
  if (hasColumn(db, 'tweets', 'source')) return;
  db.exec("ALTER TABLE tweets ADD COLUMN source TEXT NOT NULL DEFAULT 'mock'");
}

/**
 * Migration douce des colonnes d'embed X (média, citation, compteurs).
 */
function ensureTweetColumns(db) {
  ensureTweetSourceColumn(db);

  const migrations = [
    ['replies', 'replies INTEGER NOT NULL DEFAULT 0'],
    ['views', 'views INTEGER NOT NULL DEFAULT 0'],
    ['media', "media TEXT NOT NULL DEFAULT '[]'"],
    ['quoted_tweet', 'quoted_tweet TEXT'],
  ];

  for (const [column, sql] of migrations) {
    if (!hasColumn(db, 'tweets', column)) {
      db.exec(`ALTER TABLE tweets ADD COLUMN ${sql}`);
    }
  }
}

function analysesNeedsRebuild(sql) {
  if (!sql) return false;
  const hasScoreCheck = /CHECK\s*\(\s*bullshit_score\b/i.test(sql);
  const hasVerdictCheck = /CHECK\s*\(\s*verdict\s+IN/i.test(sql);
  return !hasScoreCheck || !hasVerdictCheck;
}

/**
 * Reconstruit l'ancienne table analyses (sans CHECK) en dédupliquant
 * et en écartant les lignes invalides.
 */
function rebuildAnalyses(db) {
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        DROP INDEX IF EXISTS idx_analyses_tweet_id;
        DROP INDEX IF EXISTS idx_analyses_tweet_id_unique;
        DROP INDEX IF EXISTS idx_analyses_verdict;
        DROP INDEX IF EXISTS idx_analyses_analyzed_at;
        ALTER TABLE analyses RENAME TO analyses_legacy;
      `);
      db.exec(ANALYSES_TABLE_SQL);
      db.exec(`
        INSERT INTO analyses
          (id, tweet_id, bullshit_score, verdict, reasoning, fact_checks, humor_comment, analyzed_at)
        SELECT
          id, tweet_id, bullshit_score, verdict, reasoning, fact_checks, humor_comment, analyzed_at
        FROM analyses_legacy
        WHERE id IN (
          SELECT MAX(id)
          FROM analyses_legacy
          WHERE tweet_id IS NOT NULL
            AND bullshit_score BETWEEN 0 AND 100
            AND verdict IN ('VRAI', 'DOUTEUX', 'BULLSHIT', 'CHAUD BOUILLANT')
            AND tweet_id IN (SELECT id FROM tweets)
          GROUP BY tweet_id
        )
        ORDER BY id;
      `);
      db.exec('DROP TABLE analyses_legacy;');
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function dedupeAnalyses(db) {
  db.exec(`
    DELETE FROM analyses
    WHERE tweet_id IS NULL
       OR tweet_id NOT IN (SELECT id FROM tweets)
       OR bullshit_score NOT BETWEEN 0 AND 100
       OR verdict NOT IN ('VRAI', 'DOUTEUX', 'BULLSHIT', 'CHAUD BOUILLANT')
       OR id NOT IN (
         SELECT MAX(id)
         FROM analyses
         WHERE bullshit_score BETWEEN 0 AND 100
           AND verdict IN ('VRAI', 'DOUTEUX', 'BULLSHIT', 'CHAUD BOUILLANT')
         GROUP BY tweet_id
       );
  `);
}

/**
 * Crée le schéma si nécessaire, migre l'ancienne DB et maintient
 * tweets.analyzed cohérent avec la présence d'une analyse.
 */
function ensureSchema(db) {
  db.exec(TWEETS_TABLE_SQL);
  ensureTweetColumns(db);
  db.exec(PROFILE_TABLE_SQL);

  const existingAnalysesSql = getTableSql(db, 'analyses');
  if (!existingAnalysesSql) {
    db.exec(ANALYSES_TABLE_SQL);
  } else if (analysesNeedsRebuild(existingAnalysesSql)) {
    rebuildAnalyses(db);
  }

  dedupeAnalyses(db);
  db.exec(INDEXES_SQL);

  db.exec(`
    UPDATE tweets
    SET analyzed = CASE
      WHEN EXISTS (SELECT 1 FROM analyses a WHERE a.tweet_id = tweets.id) THEN 1
      ELSE 0
    END;
  `);
}

module.exports = {
  TWEETS_TABLE_SQL,
  PROFILE_TABLE_SQL,
  ANALYSES_TABLE_SQL,
  INDEXES_SQL,
  ensureSchema,
  ensureTweetSourceColumn,
  ensureTweetColumns,
  hasColumn,
};
