'use strict';

const express = require('express');
const cors = require('cors');
const { isDemoMode, resolveDbClient } = require('./db/config');
const { getTwitterSource } = require('./services/twitterService');
const aiService = require('./services/aiService');
const {
  createRateLimiter,
  resolveTrustProxy,
} = require('./middleware/rateLimit');

/**
 * Le seed de démo n'a de sens que si la source de tweets est le mock.
 * SEED_DEMO=true/false force explicitement le comportement.
 */
function shouldSeedDemo(env = process.env) {
  const explicit = String(env.SEED_DEMO || '')
    .trim()
    .toLowerCase();

  if (explicit) return explicit === 'true';
  if (!isDemoMode(env)) return false;

  try {
    return getTwitterSource(env) === 'mock';
  } catch {
    return false;
  }
}

function buildCorsOptions() {
  const raw = String(process.env.CORS_ORIGIN || '*').trim();

  if (!raw || raw === '*') {
    return { origin: '*' };
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return { origin: origins.length === 1 ? origins[0] : origins };
}

/**
 * Construit l'application Express sans écouter de port.
 */
function createApp() {
  const dbClient = resolveDbClient();
  const demo = isDemoMode();

  if (dbClient === 'sqlite') {
    const repo = require('./db/sqlite');
    repo.initDatabase();

    if (shouldSeedDemo()) {
      const { seeded } = repo.seedDemoData();
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[DB] Démo : ${seeded} tweets synchronisés depuis le mock`);
      }
    }
  }

  const tweetsRouter =
    dbClient === 'postgres'
      ? require('./routes/tweets')
      : require('./routes/tweets-sqlite');

  const app = express();
  app.locals.dbClient = dbClient;
  app.locals.demoMode = demo;

  const trustProxy = resolveTrustProxy();
  if (trustProxy !== null) {
    app.set('trust proxy', trustProxy);
  }

  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: true, limit: '64kb' }));

  // Un seul compteur par IP pour toutes les routes d'analyse facturées.
  const analyzeLimiter = createRateLimiter();
  app.use('/api/ai/analyze', analyzeLimiter);
  app.use('/api/tweets/analyze', analyzeLimiter);

  app.get('/health', (req, res) => {
    const ai = aiService.getStatus();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mode: demo ? 'demo' : 'production',
      database: dbClient,
      ai: {
        provider: ai.provider,
        model: ai.model,
        configured: ai.configured,
      },
    });
  });

  app.get('/api/profile', async (req, res, next) => {
    try {
      const repo =
        dbClient === 'postgres'
          ? require('./db/postgres')
          : require('./db/sqlite');
      const profile = await repo.getProfile();

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      res.json({ profile });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/ai', require('./routes/ai')());
  app.use('/api/tweets', tweetsRouter());

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
      console.error('Error:', err.stack || err.message);
    }

    res.status(status).json({
      error: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && status >= 500
        ? { stack: err.stack }
        : {}),
    });
  });

  return app;
}

module.exports = createApp;
module.exports.createApp = createApp;
module.exports.shouldSeedDemo = shouldSeedDemo;
