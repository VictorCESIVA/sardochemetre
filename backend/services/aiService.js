'use strict';

const claudeService = require('./claudeService');
const opencodeService = require('./opencodeService');

const PROVIDERS = ['opencode', 'anthropic', 'mock'];

function createAiError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/**
 * AI_PROVIDER explicite, sinon première clé disponible.
 * Une valeur inconnue est ignorée (résolution automatique).
 */
function resolveProvider(env = process.env) {
  const explicit = String(env.AI_PROVIDER || '').trim().toLowerCase();
  const provider = PROVIDERS.includes(explicit) ? explicit : null;

  const opencodeConfig = opencodeService.getConfig(env);
  const anthropicModel =
    String(env.ANTHROPIC_MODEL || '').trim() || claudeService.DEFAULT_MODEL;
  const anthropicConfigured = Boolean(
    String(env.ANTHROPIC_API_KEY || '').trim()
  );

  if (provider === 'mock') {
    return { provider: 'mock', model: 'mock', configured: false, fallback: 'mock' };
  }

  if (provider === 'opencode') {
    return {
      provider: 'opencode',
      model: opencodeConfig.model,
      configured: opencodeConfig.configured,
      fallback: opencodeConfig.configured ? null : 'mock',
      plan: opencodeConfig.plan,
    };
  }

  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      model: anthropicModel,
      configured: anthropicConfigured,
      fallback: anthropicConfigured ? null : 'mock',
    };
  }

  if (opencodeConfig.configured) {
    return {
      provider: 'opencode',
      model: opencodeConfig.model,
      configured: true,
      fallback: null,
      plan: opencodeConfig.plan,
    };
  }

  if (anthropicConfigured) {
    return {
      provider: 'anthropic',
      model: anthropicModel,
      configured: true,
      fallback: null,
    };
  }

  return { provider: 'mock', model: 'mock', configured: false, fallback: 'mock' };
}

/**
 * Le repli mock est un outil de test/démo. En production, une clé manquante
 * doit produire une erreur visible : accepter une analyse simulée permettrait
 * de persister de fausses analyses dans la base.
 */
function mockFallbackAllowed(env) {
  if (String(env.NODE_ENV || '').trim().toLowerCase() === 'test') return true;
  if (String(env.DEMO_MODE || '').trim().toLowerCase() === 'true') return true;
  return String(env.AI_PROVIDER || '').trim().toLowerCase() === 'mock';
}

function getStatus(env = process.env) {
  const status = resolveProvider(env);

  return {
    ...status,
    fallback: status.fallback && mockFallbackAllowed(env) ? status.fallback : null,
    analysisProtected: Boolean(String(env.ANALYZE_API_KEY || '').trim()),
  };
}

/**
 * Analyse pour les routes tweets : repli mock uniquement en test, en démo ou
 * avec AI_PROVIDER=mock explicite. DEMO_MODE ne court-circuite pas l'IA.
 */
async function analyzeTweet(content, options = {}) {
  const env = options.env || process.env;
  const provider = resolveProvider(env);

  if (provider.provider === 'opencode' && provider.configured) {
    return opencodeService.analyzeTweet(content, options);
  }

  if (provider.provider === 'anthropic' && provider.configured) {
    return claudeService.analyzeTweet(content);
  }

  if (!mockFallbackAllowed(env)) return null;

  return claudeService.generateMockAnalysis(content);
}

/**
 * Décrit l'erreur HTTP à renvoyer quand `analyzeTweet` n'a produit aucune
 * analyse : configuration absente (503) ou échec du provider (502).
 */
function getAnalysisFailure(env = process.env) {
  if (!getStatus(env).configured) {
    return {
      status: 503,
      code: 'AI_NOT_CONFIGURED',
      error:
        'Clé IA non configurée : ajoutez OPENCODE_API_KEY ou ANTHROPIC_API_KEY dans backend/.env.',
    };
  }

  return {
    status: 502,
    code: 'AI_PROVIDER_ERROR',
    error: 'Le provider IA n’a pas renvoyé d’analyse exploitable.',
  };
}

/**
 * Analyse pour /api/ai/analyze : refuse le mock et remonte une erreur typée.
 */
async function analyzeWithRealProvider(content, options = {}) {
  const env = options.env || process.env;
  const provider = resolveProvider(env);

  if (!provider.configured || provider.provider === 'mock') {
    const message =
      provider.provider === 'anthropic'
        ? 'Clé Anthropic non configurée. Ajoutez ANTHROPIC_API_KEY dans backend/.env.'
        : 'Clé OpenCode non configurée. Ajoutez OPENCODE_API_KEY dans backend/.env.';

    throw createAiError('AI_NOT_CONFIGURED', message, 503);
  }

  if (provider.provider === 'opencode') {
    const analysis = await opencodeService.analyzeTweet(content, options);
    if (!analysis) {
      const lastError = opencodeService.getLastError();
      throw createAiError(
        'AI_PROVIDER_ERROR',
        lastError && lastError.message
          ? lastError.message
          : 'réponse invalide du provider OpenCode',
        502
      );
    }
    return analysis;
  }

  const analysis = await claudeService.analyzeTweet(content);
  if (!analysis) {
    throw createAiError(
      'AI_PROVIDER_ERROR',
      'réponse invalide du provider Anthropic',
      502
    );
  }
  return analysis;
}

module.exports = {
  resolveProvider,
  getStatus,
  analyzeTweet,
  analyzeWithRealProvider,
  getAnalysisFailure,
  createAiError,
  PROVIDERS,
};
