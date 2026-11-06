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

function getStatus(env = process.env) {
  return resolveProvider(env);
}

/**
 * Analyse pour les routes tweets : repli mock uniquement si aucun
 * provider réel n'est configuré. DEMO_MODE ne court-circuite pas l'IA.
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

  return claudeService.generateMockAnalysis(content);
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
  createAiError,
  PROVIDERS,
};
