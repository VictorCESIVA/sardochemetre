'use strict';

/**
 * DEMO_MODE ne pilote que les sources externes (Twitter/Claude),
 * jamais le choix de la base de données.
 */
function isDemoMode(env = process.env) {
  return String(env.DEMO_MODE || '').trim().toLowerCase() === 'true';
}

/**
 * Choix explicite via DB_CLIENT, sinon détection de DATABASE_URL.
 * Défaut : SQLite.
 */
function resolveDbClient(env = process.env) {
  const explicit = String(env.DB_CLIENT || '').trim().toLowerCase();

  if (explicit) {
    if (explicit !== 'sqlite' && explicit !== 'postgres') {
      throw new Error(
        `DB_CLIENT invalide : "${explicit}" (valeurs acceptées : sqlite, postgres)`
      );
    }
    if (explicit === 'postgres' && !env.DATABASE_URL) {
      throw new Error('DATABASE_URL est requis quand DB_CLIENT=postgres');
    }
    return explicit;
  }

  if (/^postgres(ql)?:\/\//i.test(String(env.DATABASE_URL || ''))) {
    return 'postgres';
  }

  return 'sqlite';
}

module.exports = { isDemoMode, resolveDbClient };
