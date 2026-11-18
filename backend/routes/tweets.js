'use strict';

const express = require('express');
const { getPool, getProfile } = require('../db/postgres');
const { normalizePeriod } = require('../db/periods');
const {
  analyzeTweet,
  getAnalysisFailure,
} = require('../services/aiService');
const {
  isPoliticalContent,
  extractMentions,
  normalizeMentions,
} = require('../services/politicsService');

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
    t.reply_to,
    t.source,
    t.analyzed,
    t.political,
    a.bullshit_score,
    a.verdict,
    a.reasoning,
    a.fact_checks,
    a.mentions,
    a.sources,
    a.humor_comment,
    a.analyzed_at
  FROM tweets t
  LEFT JOIN analyses a ON a.tweet_id = t.id
`;

const TWEET_LIST_COLUMNS = `
            t.id,
            t.content,
            t.posted_at,
            t.likes,
            t.retweets,
            t.replies,
            t.views,
            t.media,
            t.quoted_tweet,
            t.reply_to,
            t.source,
            t.analyzed,
            t.political,
            a.bullshit_score,
            a.verdict,
            a.reasoning,
            a.fact_checks,
            a.mentions,
            a.sources,
            a.humor_comment,
            a.analyzed_at
`;

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

function authorFromProfile(profile) {
  if (!profile) return null;

  return {
    name: profile.name,
    username: profile.username,
    avatar_url: profile.avatar_url,
    verified: profile.verified,
  };
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

function parseMentions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSources(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapTweet(row, author = null) {
  if (!row) return null;

  return {
    id: row.id,
    content: row.content,
    posted_at:
      row.posted_at instanceof Date ? row.posted_at.toISOString() : row.posted_at,
    likes: Number(row.likes) || 0,
    retweets: Number(row.retweets) || 0,
    replies: Number(row.replies) || 0,
    views: Number(row.views) || 0,
    source: row.source || 'mock',
    author: author || null,
    media: parseMedia(row.media),
    quoted_tweet: parseQuotedTweet(row.quoted_tweet),
    reply_to: parseQuotedTweet(row.reply_to),
    analyzed: Boolean(row.analyzed),
    political: Boolean(row.political),
    bullshit_score:
      row.bullshit_score === null || row.bullshit_score === undefined
        ? null
        : Number(row.bullshit_score),
    verdict: row.verdict || null,
    reasoning: row.reasoning || null,
    fact_checks: parseFactChecks(row.fact_checks),
    mentions: parseMentions(row.mentions),
    sources: parseSources(row.sources),
    humor_comment: row.humor_comment || null,
    analyzed_at:
      row.analyzed_at instanceof Date
        ? row.analyzed_at.toISOString()
        : row.analyzed_at || null,
  };
}

function readString(value) {
  return typeof value === 'string' ? value : '';
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

function levelForScore(score) {
  if (score >= 75) return 'CRITIQUE';
  if (score >= 50) return 'ÉLEVÉ';
  if (score >= 25) return 'MODÉRÉ';
  return 'FAIBLE';
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function percentage(count, total) {
  return total > 0 ? round2((count / total) * 100) : 0;
}

function periodClause(period) {
  switch (period) {
    case 'day':
      return "AND t.posted_at >= NOW() - INTERVAL '24 hours'";
    case 'week':
      return "AND t.posted_at >= NOW() - INTERVAL '7 days'";
    case 'month':
      return "AND t.posted_at >= NOW() - INTERVAL '30 days'";
    default:
      return '';
  }
}

function buildFilters(period, query, theme = null) {
  const conditions = ['t.analyzed = true'];
  const values = [];

  if (theme === 'politics') {
    conditions.push('t.political = true');
  }

  if (query) {
    values.push(`%${escapeLike(query)}%`);
    conditions.push(`t.content ILIKE $${values.length} ESCAPE '\\'`);
  }

  return {
    where: `${conditions.join(' AND ')} ${periodClause(period)}`.trim(),
    values,
  };
}

async function fetchTweet(pool, id) {
  const [result, profile] = await Promise.all([
    pool.query(`${TWEET_SELECT} WHERE t.id = $1`, [String(id)]),
    getProfile(),
  ]);

  return result.rows.length > 0
    ? mapTweet(result.rows[0], authorFromProfile(profile))
    : null;
}

function createTweetsRouter() {
  const router = express.Router();

  function readPeriod(req, res) {
    const period = normalizePeriod(req.query.period || 'all');
    if (!period) {
      res.status(400).json({
        error: 'Invalid period. Must be one of: day, week, month, all',
      });
      return null;
    }
    return period;
  }

  function readTheme(req, res) {
    const theme = readString(req.query.theme).trim();
    if (!theme) return null;
    if (theme !== 'politics') {
      res.status(400).json({
        error: 'Invalid theme. Must be one of: politics',
      });
      return undefined;
    }
    return theme;
  }

  // GET /api/tweets — liste paginée des tweets analysés
  router.get('/', async (req, res, next) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;

      const theme = readTheme(req, res);
      if (theme === undefined) return;

      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
      );
      const offset = (page - 1) * limit;
      const query = readString(req.query.q).trim();
      const pool = getPool();
      const { where, values } = buildFilters(period, query, theme);

      const limitIndex = values.length + 1;
      const offsetIndex = values.length + 2;

      const result = await pool.query(
        `
          SELECT
            ${TWEET_LIST_COLUMNS}
          FROM tweets t
          JOIN analyses a ON a.tweet_id = t.id
          WHERE ${where}
          ORDER BY t.posted_at DESC, t.id DESC
          LIMIT $${limitIndex} OFFSET $${offsetIndex}
        `,
        [...values, limit, offset]
      );

      const countResult = await pool.query(
        `
          SELECT COUNT(*) AS total
          FROM tweets t
          JOIN analyses a ON a.tweet_id = t.id
          WHERE ${where}
        `,
        values
      );

      const total = Number.parseInt(countResult.rows[0].total, 10) || 0;
      const totalPages = Math.ceil(total / limit);
      const author = authorFromProfile(await getProfile());

      res.json({
        tweets: result.rows.map((row) => mapTweet(row, author)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        period,
        query,
        theme: theme === 'politics' ? theme : null,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/election — dossier présidentielle 2027 (avant /:id)
  router.get('/election', async (req, res, next) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;

      const limit = Math.min(
        50,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
      );
      const pool = getPool();
      const author = authorFromProfile(await getProfile());

      const rows = await pool.query(
        `
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
            t.reply_to,
            t.source,
            t.analyzed,
            t.political,
            a.bullshit_score,
            a.verdict,
            a.reasoning,
            a.fact_checks,
            a.mentions,
            a.sources,
            a.humor_comment,
            a.analyzed_at
          FROM tweets t
          JOIN analyses a ON a.tweet_id = t.id
          WHERE t.analyzed = true AND t.political = true ${periodClause(period)}
          ORDER BY t.posted_at DESC, t.id DESC
        `
      );

      const countResult = await pool.query(
        `
          SELECT COUNT(*) AS total
          FROM tweets t
          JOIN analyses a ON a.tweet_id = t.id
          WHERE t.analyzed = true ${periodClause(period)}
        `
      );

      const politicalRows = rows.rows;
      const scores = politicalRows
        .map((row) => Number(row.bullshit_score))
        .filter((score) => Number.isFinite(score));
      const avgPoliticalScore =
        scores.length > 0
          ? round2(scores.reduce((sum, score) => sum + score, 0) / scores.length)
          : 0;

      const byLabel = new Map();
      for (const row of politicalRows) {
        for (const mention of parseMentions(row.mentions)) {
          const entry = byLabel.get(mention.label) || {
            label: mention.label,
            type: mention.type || 'personnalité',
            total: 0,
            soutien: 0,
            attaque: 0,
            neutre: 0,
            tweetIds: [],
          };

          entry.total += 1;
          if (mention.stance === 'soutien') entry.soutien += 1;
          else if (mention.stance === 'attaque') entry.attaque += 1;
          else entry.neutre += 1;
          if (entry.tweetIds.length < 20) entry.tweetIds.push(row.id);

          byLabel.set(mention.label, entry);
        }
      }

      res.json({
        period,
        politicalCount: politicalRows.length,
        totalAnalyzed: Number.parseInt(countResult.rows[0].total, 10) || 0,
        avgPoliticalScore,
        mentions: [...byLabel.values()].sort((a, b) => b.total - a.total),
        tweets: politicalRows
          .slice(0, limit)
          .map((row) => mapTweet(row, author)),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/stats — statistiques par période (avant /:id)
  router.get('/stats', async (req, res, next) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;

      const result = await getPool().query(`
        SELECT
          COUNT(*) AS total_analyzed,
          ROUND(AVG(a.bullshit_score)::numeric, 2) AS avg_score,
          MIN(a.bullshit_score) AS min_score,
          MAX(a.bullshit_score) AS max_score,
          COUNT(CASE WHEN a.verdict = 'VRAI' THEN 1 END) AS vrai_count,
          COUNT(CASE WHEN a.verdict = 'DOUTEUX' THEN 1 END) AS douteux_count,
          COUNT(CASE WHEN a.verdict = 'BULLSHIT' THEN 1 END) AS bullshit_count,
          COUNT(CASE WHEN a.verdict = 'CHAUD BOUILLANT' THEN 1 END) AS chaud_bouillant_count
        FROM tweets t
        JOIN analyses a ON a.tweet_id = t.id
        WHERE t.analyzed = true ${periodClause(period)}
      `);

      const stats = result.rows[0];
      const total = Number.parseInt(stats.total_analyzed, 10) || 0;
      const count = (value) => Number.parseInt(value, 10) || 0;

      res.json({
        period,
        avgScore: total > 0 ? round2(Number.parseFloat(stats.avg_score)) : 0,
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
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/bullshitmetre — score global (avant /:id)
  router.get('/bullshitmetre', async (req, res, next) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;

      const result = await getPool().query(`
        SELECT
          ROUND(AVG(a.bullshit_score)::numeric, 2) AS global_score,
          COUNT(*) AS sample_size
        FROM tweets t
        JOIN analyses a ON a.tweet_id = t.id
        WHERE t.analyzed = true ${periodClause(period)}
      `);

      const data = result.rows[0];
      const sampleSize = Number.parseInt(data.sample_size, 10) || 0;
      const globalScore =
        sampleSize > 0 ? round2(Number.parseFloat(data.global_score)) : 0;

      res.json({
        period,
        globalScore,
        level: levelForScore(globalScore),
        sampleSize,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/historique — courbe de l'indice par bucket (avant /:id)
  router.get('/historique', async (req, res, next) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;

      const bucket = readString(req.query.bucket).trim() || 'week';
      if (!['day', 'week', 'month'].includes(bucket)) {
        return res.status(400).json({
          error: 'Invalid bucket. Must be one of: day, week, month',
        });
      }

      const interval =
        bucket === 'day'
          ? 'day'
          : bucket === 'month'
            ? 'month'
            : 'week';

      const result = await getPool().query(
        `
          SELECT
            to_char(date_trunc($1, t.posted_at), 'YYYY-MM-DD') AS bucket_date,
            ROUND(AVG(a.bullshit_score)::numeric, 2) AS avg_score,
            COUNT(*) AS count_all,
            COUNT(CASE WHEN t.political THEN 1 END) AS count_political,
            ROUND(
              AVG(CASE WHEN t.political THEN a.bullshit_score END)::numeric, 2
            ) AS avg_political
          FROM tweets t
          JOIN analyses a ON a.tweet_id = t.id
          WHERE t.analyzed = true ${periodClause(period)}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        [interval]
      );

      const points = result.rows.slice(-120).map((row) => ({
        date: row.bucket_date,
        avgScore: Number.parseFloat(row.avg_score) || 0,
        count: Number.parseInt(row.count_all, 10) || 0,
        politicalCount: Number.parseInt(row.count_political, 10) || 0,
        avgPoliticalScore:
          row.avg_political === null
            ? null
            : Number.parseFloat(row.avg_political),
      }));

      res.json({
        period,
        bucket,
        points,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/search?q=... (avant /:id)
  router.get('/search', async (req, res, next) => {
    try {
      const query = readString(req.query.q).trim();
      if (!query) {
        return res.json({ tweets: [], total: 0 });
      }

      const { where, values } = buildFilters('all', query);
      const result = await getPool().query(
        `
          SELECT
            ${TWEET_LIST_COLUMNS}
          FROM tweets t
          JOIN analyses a ON a.tweet_id = t.id
          WHERE ${where}
          ORDER BY t.posted_at DESC, t.id DESC
        `,
        values
      );

      const author = authorFromProfile(await getProfile());
      const tweets = result.rows.map((row) => mapTweet(row, author));
      res.json({ tweets, total: tweets.length });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/tweets/analyze — analyse à la demande (avant /:id)
  router.post('/analyze', async (req, res, next) => {
    try {
      const body = req.body || {};
      const content = body.content;

      if (
        typeof content !== 'string' ||
        content.trim().length === 0 ||
        content.length > 1000
      ) {
        return res.status(400).json({
          error:
            'content est requis : chaîne non vide de 1000 caractères maximum',
        });
      }

      const tweetId =
        body.tweet_id === undefined || body.tweet_id === null
          ? ''
          : String(body.tweet_id).trim();
      const pool = getPool();
      const existing = tweetId ? await fetchTweet(pool, tweetId) : null;
      const analysis = await analyzeTweet(content, { tweet: existing });

      if (!analysis) {
        const failure = getAnalysisFailure();
        return res.status(failure.status).json({
          error: failure.error,
          code: failure.code,
        });
      }

      if (tweetId) {
        if (existing) {
          const mentions =
            normalizeMentions(analysis.mentions).length > 0
              ? normalizeMentions(analysis.mentions)
              : extractMentions(existing.content);

          await pool.query(
            `
              INSERT INTO analyses
                (tweet_id, bullshit_score, verdict, reasoning, fact_checks, mentions, sources, humor_comment)
              VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
              ON CONFLICT (tweet_id) DO UPDATE SET
                bullshit_score = EXCLUDED.bullshit_score,
                verdict = EXCLUDED.verdict,
                reasoning = EXCLUDED.reasoning,
                fact_checks = EXCLUDED.fact_checks,
                mentions = EXCLUDED.mentions,
                sources = EXCLUDED.sources,
                humor_comment = EXCLUDED.humor_comment,
                analyzed_at = NOW()
            `,
            [
              tweetId,
              analysis.bullshit_score,
              analysis.verdict,
              analysis.reasoning,
              JSON.stringify(analysis.fact_checks || []),
              JSON.stringify(mentions),
              JSON.stringify(analysis.sources || []),
              analysis.humor_comment || '',
            ]
          );

          await pool.query(
            `
              UPDATE tweets
              SET analyzed = true,
                  political = CASE
                    WHEN $2 = true OR $3 = true THEN true
                    ELSE political
                  END
              WHERE id = $1
            `,
            [
              tweetId,
              analysis.political === true,
              isPoliticalContent(existing.content),
            ]
          );

          const tweet = await fetchTweet(pool, tweetId);
          return res.json({ tweet });
        }
      }

      res.json({ analysis });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/:id — détail d'un tweet
  router.get('/:id', async (req, res, next) => {
    try {
      const tweet = await fetchTweet(getPool(), req.params.id);
      if (!tweet) {
        return res.status(404).json({ error: 'Tweet not found' });
      }
      res.json({ tweet });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createTweetsRouter;
module.exports.createTweetsRouter = createTweetsRouter;
