'use strict';

require('dotenv').config();

const { isDemoMode, resolveDbClient } = require('./db/config');
const { createApp, shouldSeedDemo } = require('./app');
const aiService = require('./services/aiService');

function readConfig(env = process.env) {
  const port = Number(env.PORT || 3001);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT invalide : "${env.PORT}"`);
  }

  return {
    port,
    dbClient: resolveDbClient(env),
    demo: isDemoMode(env),
  };
}

async function closeResources(dbClient) {
  if (dbClient === 'postgres') {
    const { closePool } = require('./db/postgres');
    await closePool();
  } else {
    const { closeDatabase } = require('./db/sqlite');
    closeDatabase();
  }
}

function registerShutdown(server, schedulerTask, dbClient) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Server] ${signal} reçu, arrêt en cours...`);

    const { stopScheduler } = require('./scheduler');
    try {
      await stopScheduler(schedulerTask);
    } catch (error) {
      console.error('[Server] Arrêt du scheduler en échec :', error.message);
    }

    const forceExit = setTimeout(() => {
      console.error('[Server] Arrêt forcé après 10 s');
      process.exit(1);
    }, 10000);
    forceExit.unref();

    server.close(() => {
      closeResources(dbClient)
        .catch((error) => {
          console.error('[Server] Erreur à la fermeture :', error.message);
        })
        .finally(() => {
          clearTimeout(forceExit);
          console.log('[Server] Arrêté proprement');
          process.exit(0);
        });
    });
  };

  const handleSignal = (signal) => {
    shutdown(signal).catch((error) => {
      console.error('[Server] Arrêt en échec :', error.message);
      process.exit(1);
    });
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));
}

async function start() {
  const config = readConfig();

  if (shouldSeedDemo() && config.dbClient === 'postgres') {
    const { seedDemoData } = require('./db/postgres');
    const { seeded } = await seedDemoData();
    console.log(`[DB] Démo PostgreSQL : ${seeded} tweets synchronisés depuis le mock`);
  }

  const app = createApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port);

    server.once('error', reject);

    server.once('listening', async () => {
      const { startScheduler } = require('./scheduler');
      let schedulerTask = null;

      if (!config.demo) {
        try {
          schedulerTask = await startScheduler();
        } catch (error) {
          console.error('[Server] Scheduler non démarré :', error.message);
        }
      }

      const ai = aiService.getStatus();

      console.log('');
      console.log('========================================');
      console.log('  SardocheMètre API');
      console.log('========================================');
      console.log(`  URL        : http://localhost:${config.port}`);
      console.log(`  Mode       : ${config.demo ? 'demo' : 'production'}`);
      console.log(`  Base       : ${config.dbClient}`);
      console.log(
        `  IA         : ${ai.provider} / ${ai.model} (${
          ai.configured
            ? 'configurée'
            : ai.fallback
              ? 'non configurée, repli mock'
              : 'non configurée'
        })`
      );
      console.log(`  Scheduler  : ${schedulerTask ? 'démarré' : 'non démarré'}`);
      console.log('  Endpoints  :');
      console.log('    GET  /health');
      console.log('    GET  /api/ai/status');
      console.log('    POST /api/ai/analyze');
      console.log('    GET  /api/tweets');
      console.log('    GET  /api/tweets/stats');
      console.log('    GET  /api/tweets/bullshitmetre');
      console.log('    GET  /api/tweets/search');
      console.log('    GET  /api/tweets/:id');
      console.log('    POST /api/tweets/analyze');
      console.log('');

      registerShutdown(server, schedulerTask, config.dbClient);
      resolve({ app, server, config });
    });
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[Server] Démarrage impossible :', error.message);
    process.exit(1);
  });
}

module.exports = { start, readConfig };
