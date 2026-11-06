'use strict';

const cron = require('node-cron');
const { resolveDbClient } = require('./db/config');
const {
  getRecentTweets,
  getProfileSnapshot,
  getTwitterSource,
} = require('./services/twitterService');
const aiService = require('./services/aiService');

const DEFAULT_CRON = '0 * * * *';

function schedulerReadiness(env = process.env) {
  const missing = [];

  if (String(env.DEMO_MODE || '').toLowerCase() === 'true') {
    return { ready: false, reason: 'DEMO_MODE=true' };
  }

  let source;
  try {
    source = getTwitterSource(env);
  } catch (error) {
    return { ready: false, reason: error.message };
  }

  const explicit = String(env.AI_PROVIDER || '')
    .trim()
    .toLowerCase();

  if (explicit === 'mock') {
    return { ready: false, reason: 'AI_PROVIDER=mock' };
  }

  // Seule l'API X exige un token ; syndication et profil sont publics.
  if (source === 'x' && !String(env.TWITTER_BEARER_TOKEN || '').trim()) {
    missing.push('TWITTER_BEARER_TOKEN');
  }

  const ai = aiService.getStatus(env);
  if (!ai.configured) {
    if (explicit === 'opencode') {
      missing.push('OPENCODE_API_KEY');
    } else if (explicit === 'anthropic') {
      missing.push('ANTHROPIC_API_KEY');
    } else {
      missing.push('OPENCODE_API_KEY ou ANTHROPIC_API_KEY');
    }
  }

  if (missing.length > 0) {
    return {
      ready: false,
      reason: `clés manquantes : ${missing.join(', ')}`,
    };
  }

  return { ready: true, reason: null };
}

async function processTweetsSqlite(tweets, profile = null) {
  const repo = require('./db/sqlite');
  repo.initDatabase();

  if (profile) repo.saveProfile(profile);

  for (const tweet of tweets) {
    try {
      const saved = repo.saveTweet(tweet);
      if (saved.analyzed) continue;

      console.log(`[Scheduler] Analyse du tweet ${tweet.id}...`);
      const analysis = await analyzeTweet(tweet.content);

      if (!analysis) {
        console.warn(`[Scheduler] Analyse impossible pour ${tweet.id}`);
        continue;
      }

      repo.upsertAnalysis(tweet.id, analysis);
      console.log(
        `[Scheduler] ${tweet.id} analysé : ${analysis.verdict} (${analysis.bullshit_score}/100)`
      );
    } catch (error) {
      console.error(`[Scheduler] Erreur tweet ${tweet.id} :`, error.message);
    }
  }
}

async function processTweetsPostgres(tweets, profile = null) {
  const { getPool, saveProfile } = require('./db/postgres');
  const pool = getPool();

  if (profile) await saveProfile(profile);

  for (const tweet of tweets) {
    try {
      await pool.query(
        `
          INSERT INTO tweets
            (id, content, posted_at, likes, retweets, source, replies, views, media, quoted_tweet, analyzed)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, false)
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            posted_at = EXCLUDED.posted_at,
            likes = EXCLUDED.likes,
            retweets = EXCLUDED.retweets,
            source = EXCLUDED.source,
            replies = EXCLUDED.replies,
            views = EXCLUDED.views,
            media = EXCLUDED.media,
            quoted_tweet = EXCLUDED.quoted_tweet
        `,
        [
          String(tweet.id),
          tweet.content,
          tweet.posted_at,
          Number(tweet.likes) || 0,
          Number(tweet.retweets) || 0,
          String(tweet.source || 'mock'),
          Number(tweet.replies) || 0,
          Number(tweet.views) || 0,
          JSON.stringify(Array.isArray(tweet.media) ? tweet.media : []),
          tweet.quoted_tweet ? JSON.stringify(tweet.quoted_tweet) : null,
        ]
      );

      const existing = await pool.query(
        'SELECT analyzed FROM tweets WHERE id = $1',
        [String(tweet.id)]
      );

      if (existing.rows[0] && existing.rows[0].analyzed) continue;

      console.log(`[Scheduler] Analyse du tweet ${tweet.id}...`);
      const analysis = await analyzeTweet(tweet.content);

      if (!analysis) {
        console.warn(`[Scheduler] Analyse impossible pour ${tweet.id}`);
        continue;
      }

      await pool.query(
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
          analysis.bullshit_score,
          analysis.verdict,
          analysis.reasoning,
          JSON.stringify(analysis.fact_checks || []),
          analysis.humor_comment || '',
        ]
      );

      await pool.query('UPDATE tweets SET analyzed = true WHERE id = $1', [
        String(tweet.id),
      ]);

      console.log(
        `[Scheduler] ${tweet.id} analysé : ${analysis.verdict} (${analysis.bullshit_score}/100)`
      );
    } catch (error) {
      console.error(`[Scheduler] Erreur tweet ${tweet.id} :`, error.message);
    }
  }
}

async function processTweets(dbClient) {
  const client = dbClient || resolveDbClient();
  console.log(`[Scheduler] Cycle démarré (${client})`);

  try {
    const source = getTwitterSource();
    console.log(`[Scheduler] Source de tweets : ${source}`);

    const tweets = await getRecentTweets();
    console.log(`[Scheduler] ${tweets.length} tweet(s) récupéré(s)`);

    const profile =
      source === 'profile' && tweets.length > 0
        ? await getProfileSnapshot()
        : null;

    if (client === 'postgres') {
      await processTweetsPostgres(tweets, profile);
    } else {
      await processTweetsSqlite(tweets, profile);
    }

    console.log('[Scheduler] Cycle terminé');
  } catch (error) {
    // Les erreurs réseau/API ne doivent jamais arrêter le serveur.
    console.error('[Scheduler] Cycle en échec :', error.message);
  }
}

function runNow(dbClient) {
  return processTweets(dbClient);
}

function stopScheduler(task) {
  if (task && typeof task.stop === 'function') {
    task.stop();
  }
}

/**
 * Démarre le cron uniquement en production et si les clés existent.
 * Retourne la tâche cron, ou null si le scheduler est désactivé.
 */
function startScheduler({ runImmediately = false } = {}) {
  const readiness = schedulerReadiness();
  if (!readiness.ready) {
    console.log(`[Scheduler] Désactivé (${readiness.reason})`);
    return null;
  }

  let dbClient;
  try {
    dbClient = resolveDbClient();
  } catch (error) {
    console.error('[Scheduler] Configuration DB invalide :', error.message);
    return null;
  }

  const schedule = process.env.CRON_SCHEDULE || DEFAULT_CRON;
  if (!cron.validate(schedule)) {
    console.error(
      `[Scheduler] CRON_SCHEDULE invalide : "${schedule}" — scheduler non démarré`
    );
    return null;
  }

  let task;
  try {
    task = cron.schedule(
      schedule,
      () => {
        processTweets(dbClient);
      },
      { noOverlap: true }
    );
  } catch (error) {
    console.error('[Scheduler] Démarrage impossible :', error.message);
    return null;
  }

  console.log(`[Scheduler] Démarré (DB ${dbClient}, "${schedule}")`);

  const immediate =
    runImmediately ||
    String(process.env.CRON_RUN_ON_START || '').toLowerCase() === 'true';

  if (immediate) {
    console.log('[Scheduler] Cycle immédiat demandé');
    processTweets(dbClient);
  }

  return task;
}

module.exports = {
  startScheduler,
  stopScheduler,
  runNow,
  processTweets,
  schedulerReadiness,
  DEFAULT_CRON,
};
