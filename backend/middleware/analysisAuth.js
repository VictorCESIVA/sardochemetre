'use strict';

const crypto = require('node:crypto');

/**
 * Protection optionnelle des routes d'analyse facturées.
 *
 * Si `ANALYZE_API_KEY` est définie, les requêtes POST doivent fournir la clé
 * via `Authorization: Bearer <clé>` ou `x-analyze-key: <clé>`. Sans clé, le
 * middleware laisse passer : la limitation de débit reste la seule barrière,
 * ce qui préserve le fonctionnement local et les déploiements publics simples.
 */

function readExpectedKey(env = process.env) {
  return String(env.ANALYZE_API_KEY || '').trim();
}

function readProvidedKey(req) {
  const authorization = String(req.get('authorization') || '').trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization);
  if (bearer) return bearer[1].trim();

  return String(req.get('x-analyze-key') || '').trim();
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {object} [env] Environnement alternatif (tests).
 * @returns {import('express').RequestHandler}
 */
function createAnalysisAuth(env = process.env) {
  const expected = readExpectedKey(env);

  return function analysisAuth(req, res, next) {
    if (!expected) return next();

    const provided = readProvidedKey(req);
    if (provided && safeEqual(provided, expected)) return next();

    res.setHeader('WWW-Authenticate', 'Bearer realm="analysis"');
    return res.status(401).json({
      error: 'Analyse protégée : clé API requise.',
      code: 'ANALYSIS_AUTH_REQUIRED',
    });
  };
}

module.exports = {
  createAnalysisAuth,
  readExpectedKey,
  readProvidedKey,
};
