#!/usr/bin/env node

require('dotenv').config();

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { resolveDbClient } = require('../db/config');

async function runMigrations() {
  if (resolveDbClient() !== 'postgres') {
    console.log(
      'DB_CLIENT=sqlite : le schéma SQLite est créé automatiquement. Utilisez `npm run init-db`.'
    );
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL est requis pour les migrations PostgreSQL');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get all migration files
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      
      // Check if migration already applied
      const { rows } = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version]
      );

      if (rows.length > 0) {
        console.log(`Migration ${version} already applied, skipping`);
        continue;
      }

      // Run migration
      console.log(`Applying migration ${version}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await client.query('COMMIT');
        console.log(`Migration ${version} applied successfully`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('All migrations completed');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    try {
      await client.end();
    } catch {
      // connexion déjà fermée
    }
  }
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
