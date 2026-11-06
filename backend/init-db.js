'use strict';

require('dotenv').config();

const { isDemoMode, resolveDbClient } = require('./db/config');

function main() {
  const dbClient = resolveDbClient();

  if (dbClient !== 'sqlite') {
    console.log(
      'DB_CLIENT=postgres : utilisez `npm run migrate` pour créer le schéma PostgreSQL.'
    );
    return;
  }

  const {
    initDatabase,
    getDatabasePath,
    seedDemoData,
    closeDatabase,
  } = require('./db/sqlite');

  try {
    initDatabase();
    console.log(`✅ Schéma SQLite prêt : ${getDatabasePath()}`);

    if (isDemoMode()) {
      const { seeded } = seedDemoData();
      console.log(`✅ Données de démo synchronisées (${seeded} tweets)`);
    }
  } finally {
    closeDatabase();
  }
}

try {
  main();
} catch (error) {
  console.error('❌ Initialisation impossible :', error.message);
  process.exit(1);
}
