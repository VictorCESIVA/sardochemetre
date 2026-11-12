'use strict';

/**
 * Limitation de débit en mémoire pour les routes d'analyse payantes.
 *
 * Les routes `POST /api/ai/analyze` et `POST /api/tweets/analyze` appellent un
 * provider facturé. Sans protection, un appelant peut épuiser les crédits.
 * Le compteur est tenu par processus et par adresse IP : il ne remplace pas
 * une authentification (voir `analysisAuth.js`), il borne l'abus et le coût.
 */

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;
const MAX_CLEANUP_ENTRIES = 1_000;

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveRateLimitOptions(env = process.env) {
  return {
    limit: readPositiveInt(env.ANALYZE_RATE_LIMIT, DEFAULT_LIMIT),
    windowMs: readPositiveInt(env.ANALYZE_RATE_WINDOW_MS, DEFAULT_WINDOW_MS),
  };
}

/**
 * TRUST_PROXY=true active un saut de proxy (Railway/Render), un entier précise
 * le nombre de sauts. Sans proxy de confiance, `req.ip` reste l'adresse du
 * socket et X-Forwarded-For ne peut pas être falsifié pour contourner la limite.
 */
function resolveTrustProxy(env = process.env) {
  const raw = String(env.TRUST_PROXY || '')
    .trim()
    .toLowerCase();

  if (!raw || raw === 'false' || raw === '0') return null;
  if (raw === 'true') return 1;

  const hops = Number.parseInt(raw, 10);
  return Number.isFinite(hops) && hops >= 1 ? hops : null;
}

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * @param {object} [options]
 * @param {number} [options.limit] Nombre de requêtes autorisées par fenêtre.
 * @param {number} [options.windowMs] Durée de la fenêtre en millisecondes.
 * @param {() => number} [options.now] Horloge injectable (tests).
 * @param {object} [options.env] Environnement alternatif (tests).
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter(options = {}) {
  const env = options.env || process.env;
  const defaults = resolveRateLimitOptions(env);
  const limit = readPositiveInt(options.limit, defaults.limit);
  const windowMs = readPositiveInt(options.windowMs, defaults.windowMs);
  const now = typeof options.now === 'function' ? options.now : Date.now;

  /** @type {Map<string, {count: number, resetAt: number}>} */
  const entries = new Map();
  let lastSweepAt = now();

  function sweep(at) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= at) entries.delete(key);
    }
    lastSweepAt = at;
  }

  return function rateLimit(req, res, next) {
    // Les prévols CORS et les lectures ne sont pas facturés.
    if (req.method !== 'POST') return next();

    const at = now();

    if (
      entries.size >= MAX_CLEANUP_ENTRIES &&
      at - lastSweepAt >= windowMs
    ) {
      sweep(at);
    }

    const key = clientKey(req);
    let entry = entries.get(key);

    if (!entry || entry.resetAt <= at) {
      entry = { count: 0, resetAt: at + windowMs };
      entries.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, limit - entry.count);
    const resetSeconds = Math.max(
      0,
      Math.ceil((entry.resetAt - at) / 1000)
    );

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (entry.count > limit) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({
        error: 'Trop de requêtes d’analyse. Réessayez plus tard.',
        code: 'RATE_LIMITED',
        retryAfter: resetSeconds,
      });
    }

    next();
  };
}

module.exports = {
  createRateLimiter,
  resolveRateLimitOptions,
  resolveTrustProxy,
  DEFAULT_LIMIT,
  DEFAULT_WINDOW_MS,
};
