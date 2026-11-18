'use strict';

const cron = require('node-cron');
const { resolveDbClient } = require('./db/config');
const {
  getRecentTweets,
  getProfileSnapshot,
  getTwitterSource,
  enrichTweets,
} = require('./services/twitterService');
const aiService = require('./services/aiService');
const {
  createSchedulerLock,
  DEFAULT_TTL_MS,
} = require('./services/schedulerLock');
const { createSchedulerLeaseStore } = require('./db/schedulerLeaseStore');

const DEFAULT_CRON = '0 * * * *';
const MIN_LOCK_TTL_MS = 60_000;

function resolveLockTtl(env = process.env, override = undefined) {
  const raw = override === undefined ? env.SCHEDULER_LOCK_TTL_MS : override;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= MIN_LOCK_TTL_MS
    ? parsed
    : DEFAULT_TTL_MS;
}

function schedulerReadiness(env = process.env) {
  if (String(env.DEMO_MODE || '').toLowerCase() === 'true') {
    return {
      ready: false,
      reason: 'DEMO_MODE=true',
      analysisReady: false,
      analysisReason: 'DEMO_MODE=true',
    };
  }

  let source;
  try {
    source = getTwitterSource(env);
  } catch (error) {
    return {
      ready: false,
      reason: error.message,
      analysisReady: false,
      analysisReason: error.message,
    };
  }

  // Seule l'API X exige un token ; syndication et profil sont publics.
  if (source === 'x' && !String(env.TWITTER_BEARER_TOKEN || '').trim()) {
    return {
      ready: false,
      reason: 'clé manquante : TWITTER_BEARER_TOKEN',
      analysisReady: false,
      analysisReason: 'collecte désactivée',
    };
  }

  const explicit = String(env.AI_PROVIDER || '')
    .trim()
    .toLowerCase();
  const ai = aiService.getStatus(env);
  const analysisReady = ai.configured && ai.provider !== 'mock';

  let analysisReason = null;
  if (!analysisReady) {
    if (explicit === 'mock') {
      analysisReason = 'AI_PROVIDER=mock';
    } else if (explicit === 'opencode' && !ai.configured) {
      analysisReason = 'OPENCODE_API_KEY manquante';
    } else if (explicit === 'anthropic' && !ai.configured) {
      analysisReason = 'ANTHROPIC_API_KEY manquante';
    } else {
      analysisReason = 'aucune clé IA configurée';
    }
  }

  return {
    ready: true,
    reason: null,
    analysisReady,
    analysisReason,
  };
}

async function processTweetsSqlite(tweets, profile = null, { analysisReady = true } = {}) {
  const repo = require('./db/sqlite');
  repo.initDatabase();

  if (profile) repo.saveProfile(profile);

  for (const tweet of tweets) {
    try {
      const saved = repo.saveTweet(tweet);
      if (saved.analyzed || !analysisReady) continue;

      console.log(`[Scheduler] Analyse du tweet ${tweet.id}...`);
      const analysis = await aiService.analyzeTweet(tweet.content, { tweet });

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

async function processTweetsPostgres(tweets, profile = null, { analysisReady = true } = {}) {
  const { getPool, saveProfile } = require('./db/postgres');
  const {
    isPoliticalContent,
    extractMentions,
  } = require('./services/politicsService');
  const pool = getPool();

  if (profile) await saveProfile(profile);

  for (const tweet of tweets) {
    try {
      await pool.query(
        `
          INSERT INTO tweets
            (id, content, posted_at, likes, retweets, source, replies, views, media, quoted_tweet, reply_to, political, analyzed)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, false)
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            posted_at = EXCLUDED.posted_at,
            likes = EXCLUDED.likes,
            retweets = EXCLUDED.retweets,
            source = EXCLUDED.source,
            replies = EXCLUDED.replies,
            views = EXCLUDED.views,
            media = EXCLUDED.media,
            quoted_tweet = EXCLUDED.quoted_tweet,
            reply_to = EXCLUDED.reply_to,
            political = EXCLUDED.political
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
          tweet.reply_to ? JSON.stringify(tweet.reply_to) : null,
          isPoliticalContent(tweet.content),
        ]
      );

      const existing = await pool.query(
        'SELECT analyzed FROM tweets WHERE id = $1',
        [String(tweet.id)]
      );

      if ((existing.rows[0] && existing.rows[0].analyzed) || !analysisReady) {
        continue;
      }

      console.log(`[Scheduler] Analyse du tweet ${tweet.id}...`);
      const analysis = await aiService.analyzeTweet(tweet.content, { tweet });

      if (!analysis) {
        console.warn(`[Scheduler] Analyse impossible pour ${tweet.id}`);
        continue;
      }

      const mentions =
        Array.isArray(analysis.mentions) && analysis.mentions.length > 0
          ? analysis.mentions
          : extractMentions(tweet.content);

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
          String(tweet.id),
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
          String(tweet.id),
          analysis.political === true,
          isPoliticalContent(tweet.content),
        ]
      );

      console.log(
        `[Scheduler] ${tweet.id} analysé : ${analysis.verdict} (${analysis.bullshit_score}/100)`
      );
    } catch (error) {
      console.error(`[Scheduler] Erreur tweet ${tweet.id} :`, error.message);
    }
  }
}

let activeCycle = null;

function processTweets(dbClient) {
  if (activeCycle) {
    console.log('[Scheduler] Cycle déjà en cours — appel ignoré');
    return activeCycle;
  }

  activeCycle = runCycle(dbClient).finally(() => {
    activeCycle = null;
  });

  return activeCycle;
}

async function runCycle(dbClient) {
  const client = dbClient || resolveDbClient();
  console.log(`[Scheduler] Cycle démarré (${client})`);

  try {
    const source = getTwitterSource();
    console.log(`[Scheduler] Source de tweets : ${source}`);

    const readiness = schedulerReadiness();
    const fetched = await getRecentTweets();
    const tweets = await enrichTweets(fetched);
    console.log(`[Scheduler] ${tweets.length} tweet(s) récupéré(s)`);

    if (!readiness.analysisReady) {
      console.log(
        `[Scheduler] Analyse IA ignorée (${readiness.analysisReason}) : import seul`
      );
    }

    const profile =
      source === 'profile' && tweets.length > 0
        ? await getProfileSnapshot()
        : null;

    if (client === 'postgres') {
      await processTweetsPostgres(tweets, profile, {
        analysisReady: readiness.analysisReady,
      });
    } else {
      await processTweetsSqlite(tweets, profile, {
        analysisReady: readiness.analysisReady,
      });
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

/**
 * Arrête le cron, le heartbeat et libère le bail. Asynchrone pour que la
 * libération du verrou soit terminée avant la fermeture de la base.
 */
async function stopScheduler(task) {
  if (!task) return;

  if (task.schedulerHeartbeat) {
    clearInterval(task.schedulerHeartbeat);
    task.schedulerHeartbeat = null;
  }

  if (typeof task.stop === 'function') {
    task.stop();
  }

  const lock = task.schedulerLock;
  task.schedulerLock = null;
  if (lock) {
    try {
      await lock.release();
    } catch (error) {
      console.error('[Scheduler] Libération du verrou impossible :', error.message);
    }
  }
}

/**
 * Démarre le cron uniquement en production, si les clés existent et si cette
 * instance obtient le bail partagé. Retourne la tâche cron, ou null.
 */
function shouldRunImmediately(runImmediately, env = process.env) {
  if (runImmediately) return true;

  const raw = env.CRON_RUN_ON_START;
  if (raw === undefined || String(raw).trim() === '') return true;

  return String(raw).trim().toLowerCase() === 'true';
}

async function startScheduler({
  runImmediately = false,
  lockStore = null,
  lockTtlMs = undefined,
} = {}) {
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

  let lock;
  try {
    const store = lockStore || createSchedulerLeaseStore(dbClient);
    lock = createSchedulerLock({ store, ttlMs: resolveLockTtl(undefined, lockTtlMs) });

    if (!(await lock.acquire())) {
      console.log(
        '[Scheduler] Bail détenu par une autre instance — scheduler non démarré'
      );
      return null;
    }
  } catch (error) {
    console.error(
      '[Scheduler] Verrou partagé indisponible :',
      error.message,
      '— exécutez npm run migrate si la table scheduler_leases manque'
    );
    return null;
  }

  let task = null;
  let heartbeat = null;

  try {
    task = cron.schedule(
      schedule,
      async () => {
        try {
          if (!(await lock.renew())) {
            console.warn('[Scheduler] Bail perdu — arrêt du scheduler');
            if (heartbeat) {
              clearInterval(heartbeat);
              heartbeat = null;
              task.schedulerHeartbeat = null;
            }
            if (typeof task.stop === 'function') task.stop();
            return;
          }
          // Attendre le cycle pour que `noOverlap` couvre réellement le travail.
          await processTweets(dbClient);
        } catch (error) {
          console.error(
            '[Scheduler] Renouvellement du bail en échec :',
            error.message
          );
        }
      },
      { noOverlap: true }
    );
  } catch (error) {
    await lock.release().catch(() => {});
    console.error('[Scheduler] Démarrage impossible :', error.message);
    return null;
  }

  // Renouvellement périodique : trois heartbeats par durée de bail.
  const heartbeatMs = Math.max(30_000, Math.floor(lock.ttlMs / 3));
  heartbeat = setInterval(() => {
    lock
      .renew()
      .then((renewed) => {
        if (renewed) return;
        console.warn('[Scheduler] Bail perdu — arrêt du scheduler');
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
          task.schedulerHeartbeat = null;
        }
        if (typeof task.stop === 'function') task.stop();
      })
      .catch((error) => {
        console.error('[Scheduler] Heartbeat en échec :', error.message);
      });
  }, heartbeatMs);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  task.schedulerLock = lock;
  task.schedulerHeartbeat = heartbeat;
  task.schedulerTtlMs = lock.ttlMs;

  console.log(
    `[Scheduler] Démarré (DB ${dbClient}, "${schedule}", bail ${lock.ttlMs} ms, analyse ${
      readiness.analysisReady ? 'active' : 'désactivée'
    })`
  );

  const immediate = shouldRunImmediately(runImmediately);

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
  resolveLockTtl,
  shouldRunImmediately,
  DEFAULT_CRON,
};
