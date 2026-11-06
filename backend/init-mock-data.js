'use strict';

require('dotenv').config();

const { resolveDbClient } = require('./db/config');

function seedSqlite() {
  const { initDatabase, seedDemoData, closeDatabase, getDatabasePath } =
    require('./db/sqlite');

  try {
    initDatabase();
    const { seeded } = seedDemoData();
    console.log(`✅ ${seeded} tweets de démo insérés/mis à jour`);
    console.log(`   Base : ${getDatabasePath()}`);
  } finally {
    closeDatabase();
  }
}

async function seedPostgres() {
  const { seedDemoData, closePool } = require('./db/postgres');

  try {
    const { seeded } = await seedDemoData();
    console.log(`✅ ${seeded} tweets de démo insérés/mis à jour (PostgreSQL)`);
  } finally {
    await closePool();
  }
}

async function main() {
  const dbClient = resolveDbClient();
  console.log(`Seed des données de démo (${dbClient})...`);

  if (dbClient === 'postgres') {
    await seedPostgres();
  } else {
    seedSqlite();
  }
}

main().catch((error) => {
  console.error('❌ Seed impossible :', error.message);
  process.exit(1);
});
