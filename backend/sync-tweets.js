#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { resolveDbClient } = require('./db/config');
const {
  getRecentTweets,
  getProfileSnapshot,
  getTwitterSource,
  VALID_SOURCES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PROFILE_TWEETS,
} = require('./services/twitterService');

const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 4;

function printHelp() {
  console.log(`Usage : node sync-tweets.js [options]

Options :
  --source=SOURCE    Source : ${VALID_SOURCES.join('|')} (sinon TWITTER_SOURCE)
  --limit=N          Nombre de tweets récupérés (1-${MAX_LIMIT}, défaut ${DEFAULT_LIMIT},
                     ${MAX_PROFILE_TWEETS} max pour la source profile)
  --replace-demo     Supprime les tweets source='mock' avant l'import
  --replace-source=S Supprime les tweets de la source S avant l'import (répétable)
  --analyze          Analyse les tweets non analysés via le provider IA
  --concurrency=N    Analyses en parallèle (1-${MAX_CONCURRENCY}, défaut ${DEFAULT_CONCURRENCY})
  --dry-run          Affiche les tweets sans écrire en base ni appeler l'IA
  -h, --help         Affiche cette aide

Exemples :
  npm run sync
  npm run sync:analyze
  npm run sync:analyze -- --source=profile --limit=5 --replace-source=syndication
  TWITTER_SOURCE=profile DEMO_MODE=false node sync-tweets.js --dry-run --limit=5`);
}

function readOptionValue(argv, index, name) {
  const arg = argv[index];

  if (arg.startsWith(`${name}=`)) {
    return { value: arg.slice(name.length + 1), nextIndex: index };
  }

  const next = argv[index + 1];
  if (next === undefined || next.startsWith('--')) {
    throw new Error(`valeur manquante pour ${name}`);
  }

  return { value: next, nextIndex: index + 1 };
}

function parseBoundedInteger(value, name, min, max) {
  const parsed = Number(String(value).trim());

  if (String(value).trim() === '' || !Number.isInteger(parsed)) {
    throw new Error(`${name} doit être un entier (reçu : "${value}")`);
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseSource(value, name) {
  const source = String(value || '')
    .trim()
    .toLowerCase();

  if (!VALID_SOURCES.includes(source)) {
    throw new Error(
      `${name} invalide : "${value}" (valeurs acceptées : ${VALID_SOURCES.join(', ')})`
    );
  }

  return source;
}

/**
 * Parse les arguments CLI. Les valeurs hors bornes sont ramenées
 * dans l'intervalle autorisé.
 */
function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    source: null,
    limit: DEFAULT_LIMIT,
    replaceDemo: false,
    replaceSources: [],
    analyze: false,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--replace-demo') {
      options.replaceDemo = true;
    } else if (arg === '--analyze') {
      options.analyze = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--source' || arg.startsWith('--source=')) {
      const { value, nextIndex } = readOptionValue(argv, index, '--source');
      options.source = parseSource(value, '--source');
      index = nextIndex;
    } else if (
      arg === '--replace-source' ||
      arg.startsWith('--replace-source=')
    ) {
      const { value, nextIndex } = readOptionValue(
        argv,
        index,
        '--replace-source'
      );
      const sources = String(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => parseSource(entry, '--replace-source'));

      for (const source of sources) {
        if (!options.replaceSources.includes(source)) {
          options.replaceSources.push(source);
        }
      }
      index = nextIndex;
    } else if (arg === '--limit' || arg.startsWith('--limit=')) {
      const { value, nextIndex } = readOptionValue(argv, index, '--limit');
      options.limit = parseBoundedInteger(value, '--limit', 1, MAX_LIMIT);
      index = nextIndex;
    } else if (arg === '--concurrency' || arg.startsWith('--concurrency=')) {
      const { value, nextIndex } = readOptionValue(
        argv,
        index,
        '--concurrency'
      );
      options.concurrency = parseBoundedInteger(
        value,
        '--concurrency',
        1,
        MAX_CONCURRENCY
      );
      index = nextIndex;
    } else {
      throw new Error(`option inconnue : ${arg}`);
    }
  }

  return options;
}

function formatTweetLine(tweet) {
  const content = String(tweet.content || '')
    .replace(/\s+/g, ' ')
    .trim();
  const details = [];

  if (tweet.author && tweet.author.username) {
    details.push(`@${tweet.author.username}`);
  }
  if (tweet.replies) details.push(`${tweet.replies} rép.`);
  if (tweet.views) details.push(`${tweet.views} vues`);
  if (Array.isArray(tweet.media) && tweet.media.length > 0) {
    details.push(
      `média:${tweet.media.map((media) => media.type).join('+')}`
    );
  }
  if (tweet.quoted_tweet) {
    details.push(`citation:${tweet.quoted_tweet.id}`);
  }

  return `  ${tweet.posted_at} | ${tweet.id} | ${tweet.likes} likes | ${
    tweet.retweets
  } RT | ${tweet.source}${details.length ? ` | ${details.join(' | ')}` : ''} | ${content.slice(0, 140)}`;
}

async function analyzePending(repo, pending, { concurrency, env }) {
  const aiService = require('./services/aiService');
  let cursor = 0;
  let analyzed = 0;
  let failures = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= pending.length) return;

      const tweet = pending[index];

      try {
        const analysis = await aiService.analyzeTweet(tweet.content, { env });

        if (!analysis) {
          failures += 1;
          console.error(`[sync] Analyse impossible pour ${tweet.id}`);
        } else {
          repo.upsertAnalysis(tweet.id, analysis);
          analyzed += 1;
        }
      } catch (error) {
        failures += 1;
        console.error(`[sync] Erreur analyse ${tweet.id} : ${error.message}`);
      } finally {
        completed += 1;
        console.log(
          `[sync] Analyse ${completed}/${pending.length} (${tweet.id})`
        );
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, pending.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { analyzed, failures };
}

async function runSync(options, env = process.env) {
  const sourceEnv = options.source
    ? { ...env, TWITTER_SOURCE: options.source }
    : env;
  const source = getTwitterSource(sourceEnv);
  console.log(`[sync] Source : ${source}`);

  // Le dry-run ne touche ni la base ni le provider IA.
  if (!options.dryRun) {
    const dbClient = resolveDbClient(env);

    if (dbClient !== 'sqlite') {
      console.error(
        '[sync] PostgreSQL non supporté par ce script : utilisez DB_CLIENT=sqlite (ou le scheduler).'
      );
      return 1;
    }
  }

  let provider = null;
  if (options.analyze && !options.dryRun) {
    const aiService = require('./services/aiService');
    provider = aiService.getStatus(env);

    if (!provider.configured || provider.provider === 'mock') {
      console.error(
        '[sync] --analyze nécessite un provider IA réel (OPENCODE_API_KEY ou ANTHROPIC_API_KEY).'
      );
      return 1;
    }
  }

  console.log(`[sync] Récupération de ${options.limit} tweet(s)...`);
  const tweets = await getRecentTweets({
    limit: options.limit,
    env: sourceEnv,
  });

  if (tweets.length === 0) {
    console.error('[sync] Aucun tweet récupéré : rien à importer.');
    return 1;
  }

  console.log(`[sync] ${tweets.length} tweet(s) récupéré(s)`);

  if (options.dryRun) {
    for (const tweet of tweets) {
      console.log(formatTweetLine(tweet));
    }
    console.log(
      `[sync] Dry-run terminé : ${tweets.length} tweet(s), aucune écriture en base${
        options.analyze ? ', analyse ignorée' : ''
      }.`
    );
    return 0;
  }

  const repo = require('./db/sqlite');

  try {
    repo.initDatabase();

    if (source === 'profile') {
      const profile = await getProfileSnapshot({ env: sourceEnv });

      if (profile) {
        repo.saveProfile(profile);
        console.log(
          `[sync] Profil @${profile.username} : ${profile.name}, ${profile.followers} followers`
        );
      }
    }

    let replaced = 0;
    const replaceSources = new Set(options.replaceSources);
    if (options.replaceDemo) replaceSources.add('mock');

    for (const replaceSource of replaceSources) {
      const removed = repo.deleteTweetsBySource(replaceSource);
      replaced += removed;
      console.log(
        `[sync] Tweets source=${replaceSource} supprimés : ${removed}`
      );
    }

    let inserted = 0;
    let updated = 0;
    let saveFailures = 0;

    for (const tweet of tweets) {
      try {
        const existing = repo.getTweetById(tweet.id);
        repo.saveTweet(tweet);

        if (existing) {
          updated += 1;
        } else {
          inserted += 1;
        }
      } catch (error) {
        saveFailures += 1;
        console.error(`[sync] Erreur d'import ${tweet.id} : ${error.message}`);
      }
    }

    let analyzed = 0;
    let analysisFailures = 0;

    if (options.analyze) {
      const pending = repo.listUnanalyzedTweets({ limit: 500 });
      console.log(
        `[sync] ${pending.length} tweet(s) à analyser avec ${provider.provider}/${provider.model}`
      );

      const result = await analyzePending(repo, pending, {
        concurrency: options.concurrency,
        env,
      });
      analyzed = result.analyzed;
      analysisFailures = result.failures;
    }

    const failures = saveFailures + analysisFailures;

    console.log(
      `[sync] Résumé : source=${source}, récupérés=${tweets.length}, insérés=${inserted}, mis à jour=${updated}, remplacés=${replaced}, analysés=${analyzed}, échecs=${failures}`
    );

    const nothingSaved = inserted + updated === 0;
    const analysisBlocked =
      options.analyze && failures > 0 && analyzed === 0 && !nothingSaved;

    return nothingSaved || analysisBlocked ? 1 : 0;
  } finally {
    repo.closeDatabase();
  }
}

async function main() {
  let options;

  try {
    options = parseArgs();
  } catch (error) {
    console.error(`[sync] ${error.message}`);
    printHelp();
    return 1;
  }

  if (options.help) {
    printHelp();
    return 0;
  }

  try {
    return await runSync(options);
  } catch (error) {
    console.error(`[sync] Erreur : ${error.message}`);
    return 1;
  }
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[sync] Erreur inattendue : ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  runSync,
  analyzePending,
  formatTweetLine,
  printHelp,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
};
