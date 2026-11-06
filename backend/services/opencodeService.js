'use strict';

const crypto = require('node:crypto');
const axios = require('axios');
const {
  SYSTEM_PROMPT,
  extractJson,
  normalizeAnalysis,
} = require('./claudeService');

const DEFAULT_MODEL = 'deepseek-v4.1-flash';
const DEFAULT_PLAN = 'payg';
const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_TIMEOUT_MS = 30000;
const USER_AGENT = 'sardochemetre/1.0';
const PAYG_BASE_URL = 'https://opencode.ai/inference';
const GO_BASE_URL = 'https://opencode.ai/inference/go';

let generatedSession = null;
let lastError = null;

function normalizePlan(value) {
  const plan = String(value || '').trim().toLowerCase();
  if (plan === 'go') return 'go';
  if (plan === 'payg' || plan === 'pay-as-you-go' || plan === 'pay_as_you_go') {
    return 'payg';
  }
  return null;
}

function stripTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

function buildEndpoint(baseUrl) {
  return `${stripTrailingSlashes(baseUrl)}/openai/v1/chat/completions`;
}

function getConfig(env = process.env) {
  const apiKey = String(env.OPENCODE_API_KEY || '').trim();
  const plan = normalizePlan(env.OPENCODE_PLAN) || DEFAULT_PLAN;
  const override = stripTrailingSlashes(
    String(env.OPENCODE_BASE_URL || '').trim()
  );
  const baseUrl = override || (plan === 'go' ? GO_BASE_URL : PAYG_BASE_URL);

  return {
    apiKey,
    model: String(env.OPENCODE_MODEL || '').trim() || DEFAULT_MODEL,
    plan,
    baseUrl,
    configured: Boolean(apiKey),
  };
}

function getMaxTokens(env = process.env) {
  const value = Number.parseInt(env.OPENCODE_MAX_TOKENS, 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_TOKENS;
}

function getSessionId(env = process.env) {
  const configured = String(env.OPENCODE_SESSION || '').trim();
  if (configured) return configured;

  if (!generatedSession) {
    generatedSession = `ses_${crypto.randomBytes(16).toString('hex')}`;
  }
  return generatedSession;
}

function buildHeaders(config, env = process.env) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'x-opencode-session': getSessionId(env),
  };
}

function extractContent(data) {
  const message = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!message) return '';

  const content = message.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part && typeof part.text === 'string' ? part.text : '';
      })
      .join('\n');
  }

  return '';
}

function formatProviderError(error) {
  if (error && error.response) {
    const { status, statusText, data } = error.response;

    if (status === 402) {
      return 'HTTP 402 - compte OpenCode sans crédits. Ajoutez des crédits sur https://opencode.ai/console ou utilisez une clé OpenCode Go avec OPENCODE_PLAN=go.';
    }

    let detail = '';

    if (typeof data === 'string') {
      detail = data;
    } else if (data && typeof data === 'object') {
      if (typeof data.error === 'string') {
        detail = data.error;
      } else if (data.error && typeof data.error.message === 'string') {
        detail = data.error.message;
      } else if (typeof data.message === 'string') {
        detail = data.message;
      }
    }

    detail = String(detail || statusText || 'réponse inattendue')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    return `HTTP ${status} - ${detail}`;
  }

  return error && error.message ? error.message : 'erreur inconnue';
}

function logUsage(config, usage) {
  const details = [`modèle ${config.model}`];

  if (usage && usage.cost !== undefined && usage.cost !== null) {
    details.push(`coût ${usage.cost}`);
  }

  const billing =
    usage && usage.opencode && usage.opencode.billing_source;
  if (billing) {
    details.push(`facturation ${billing}`);
  }

  console.log(`[OpenCode] Analyse réussie (${details.join(', ')})`);
}

/**
 * Analyse un tweet via l'API OpenCode (OpenAI-compatible).
 * Retourne une analyse normalisée, ou null en cas d'échec.
 * La clé n'est jamais journalisée.
 */
async function analyzeTweet(content, options = {}) {
  const env = options.env || process.env;
  const config = getConfig(env);
  const text = String(content || '').trim();

  if (!config.configured) {
    lastError = {
      code: 'AI_NOT_CONFIGURED',
      status: null,
      message: 'OPENCODE_API_KEY manquante',
    };
    console.error('[OpenCode] OPENCODE_API_KEY manquant : analyse impossible');
    return null;
  }

  if (!text) {
    lastError = {
      code: 'AI_PROVIDER_ERROR',
      status: null,
      message: 'contenu du tweet vide',
    };
    return null;
  }

  const body = {
    model: config.model,
    temperature: options.temperature === undefined ? 0.4 : options.temperature,
    max_tokens:
      options.maxTokens === undefined ? getMaxTokens(env) : options.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Tweet à analyser :\n${text}` },
    ],
  };

  try {
    const response = await axios.post(buildEndpoint(config.baseUrl), body, {
      headers: buildHeaders(config, env),
      timeout: options.timeout || DEFAULT_TIMEOUT_MS,
    });

    const raw = extractContent(response.data);
    if (!raw) {
      throw new Error('réponse vide : choices[0].message.content absent');
    }

    const analysis = normalizeAnalysis(extractJson(raw));
    lastError = null;
    logUsage(config, response.data && response.data.usage);
    return analysis;
  } catch (error) {
    const message = formatProviderError(error);
    const status = error && error.response ? error.response.status : null;

    lastError = {
      code: status === 401 || status === 403 ? 'AI_AUTH_ERROR' : 'AI_PROVIDER_ERROR',
      status,
      message,
    };
    console.error(`[OpenCode] Échec de l'analyse : ${message}`);
    return null;
  }
}

function getLastError() {
  return lastError;
}

/**
 * Statut sans appel réseau, sans jamais exposer la clé.
 */
function getStatus(env = process.env) {
  const config = getConfig(env);

  return {
    provider: 'opencode',
    model: config.model,
    plan: config.plan,
    configured: config.configured,
    baseUrl: config.baseUrl,
    fallback: config.configured ? null : 'mock',
  };
}

module.exports = {
  analyzeTweet,
  getConfig,
  getStatus,
  getLastError,
  buildEndpoint,
  DEFAULT_MODEL,
  DEFAULT_PLAN,
  PAYG_BASE_URL,
  GO_BASE_URL,
  USER_AGENT,
};
