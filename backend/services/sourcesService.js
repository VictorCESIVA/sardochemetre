'use strict';

const axios = require('axios');

/**
 * Recherche de sources pour approfondir l'analyse fact-check.
 *
 * Deux fournisseurs, tous tolérants aux pannes :
 * - Tavily (optionnel, `TAVILY_API_KEY`) : recherche web réelle, conçue pour
 *   les applications LLM ;
 * - Wikipédia FR (sans clé) : API officielle `action=query&list=search`,
 *   très utile pour les personnalités, partis et chiffres publics de la
 *   campagne 2027.
 *
 * Une requête qui échoue, expire ou renvoie n'importe quoi est ignorée :
 * l'analyse continue sans cette source, jamais sans elle seule.
 */

const MAX_QUERIES = 4;
const MAX_SOURCES = 8;
const MAX_RESULTS_PER_QUERY = 3;
const MAX_SNIPPET_CHARS = 320;
const MAX_QUERY_CHARS = 90;
const SEARCH_TIMEOUT_MS = 10000;

const DEFAULT_WIKIPEDIA_API_URL = 'https://fr.wikipedia.org/w/api.php';
const DEFAULT_TAVILY_API_URL = 'https://api.tavily.com';
const USER_AGENT =
  'sardochemetre/1.0 (https://github.com/VictorCESIVA/sardochemetre)';

function cleanQuery(value) {
  const text = String(value || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@]\S+/g, ' ')
    .replace(/[«»"'’“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, MAX_QUERY_CHARS).trim();
}

/**
 * Requêtes de recherche construites depuis l'analyse de première passe :
 * les affirmations fact-checkables d'abord, puis les personnalités citées.
 * Dédupliquées, nettoyées, plafonnées à MAX_QUERIES.
 */
function buildQueries(analysis, tweet = null) {
  const queries = [];

  if (analysis && Array.isArray(analysis.fact_checks)) {
    for (const check of analysis.fact_checks) {
      if (!check || !check.claim) continue;
      queries.push(cleanQuery(check.claim));
    }
  }

  if (analysis && Array.isArray(analysis.mentions)) {
    for (const mention of analysis.mentions) {
      if (!mention || !mention.label) continue;
      queries.push(cleanQuery(mention.label));
    }
  }

  if (tweet && tweet.quoted_tweet && tweet.quoted_tweet.content) {
    queries.push(cleanQuery(tweet.quoted_tweet.content));
  }

  const seen = new Set();
  const unique = [];

  for (const query of queries) {
    const key = query.toLowerCase();
    if (!query || key.length < 4 || seen.has(key)) continue;

    seen.add(key);
    unique.push(query);
    if (unique.length >= MAX_QUERIES) break;
  }

  return unique;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeResult(raw, provider) {
  const url = String((raw && raw.url) || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;

  const title = stripHtml(raw && raw.title).slice(0, 160) || url;
  const snippet = stripHtml(
    raw.snippet || raw.content || raw.extract || ''
  ).slice(0, MAX_SNIPPET_CHARS);

  return { title, url, snippet, provider };
}

/**
 * Wikipédia FR, sans clé. Le snippet de recherche suffit comme extrait :
 * une seule requête par recherche.
 */
async function searchWikipedia(query, { env = process.env } = {}) {
  const baseUrl =
    String(env.WIKIPEDIA_API_URL || '').trim() || DEFAULT_WIKIPEDIA_API_URL;

  const response = await axios.get(baseUrl, {
    params: {
      action: 'query',
      format: 'json',
      list: 'search',
      srsearch: query,
      srlimit: MAX_RESULTS_PER_QUERY,
      srprop: 'snippet',
      origin: '*',
    },
    headers: { 'User-Agent': USER_AGENT },
    timeout: SEARCH_TIMEOUT_MS,
  });

  const search =
    response.data &&
    response.data.query &&
    Array.isArray(response.data.query.search)
      ? response.data.query.search
      : [];

  return search
    .map((item) => {
      const url = `https://fr.wikipedia.org/wiki/${encodeURIComponent(
        String(item.title || '').replace(/ /g, '_')
      )}`;
      return normalizeResult(
        { title: item.title, url, snippet: item.snippet },
        'wikipedia'
      );
    })
    .filter(Boolean);
}

/**
 * Tavily (recherche web réelle). Uniquement si TAVILY_API_KEY est définie.
 */
async function searchTavily(query, { env = process.env } = {}) {
  const apiKey = String(env.TAVILY_API_KEY || '').trim();
  if (!apiKey) return [];

  const baseUrl =
    String(env.TAVILY_API_URL || '').trim() || DEFAULT_TAVILY_API_URL;

  const response = await axios.post(
    `${baseUrl.replace(/\/+$/, '')}/search`,
    {
      api_key: apiKey,
      query,
      max_results: MAX_RESULTS_PER_QUERY,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
    },
    {
      headers: { 'User-Agent': USER_AGENT },
      timeout: SEARCH_TIMEOUT_MS,
    }
  );

  const results = Array.isArray(response.data && response.data.results)
    ? response.data.results
    : [];

  return results
    .map((item) =>
      normalizeResult(
        { title: item.title, url: item.url, snippet: item.content },
        'tavily'
      )
    )
    .filter(Boolean);
}

/**
 * Consulte les fournisseurs pour chaque requête et fusionne les résultats.
 * Une erreur sur une requête est journalisée puis ignorée ; le tweet reste
 * analysable sans cette source. Retourne [] si rien n'est exploitable.
 */
async function gatherSources(
  analysis,
  tweet = null,
  { env = process.env, searchers = null } = {}
) {
  const queries = buildQueries(analysis, tweet);
  if (queries.length === 0) return [];

  const run =
    searchers || [
      searchWikipedia,
      (query, options) => searchTavily(query, options),
    ];

  const byUrl = new Map();
  const errors = [];

  for (const query of queries) {
    for (const search of run) {
      let results = [];
      try {
        results = await search(query, { env });
      } catch (error) {
        errors.push(`${query} : ${error.message}`);
        continue;
      }

      for (const result of results) {
        if (byUrl.size >= MAX_SOURCES) break;
        if (!byUrl.has(result.url)) {
          byUrl.set(result.url, { ...result, query });
        }
      }
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[Sources] ${errors.length} recherche(s) ignorée(s) : ${errors[0]}${
        errors.length > 1 ? '…' : ''
      }`
    );
  }

  return [...byUrl.values()].slice(0, MAX_SOURCES);
}

/**
 * Bloc de texte injecté dans la deuxième passe du prompt : les sources
 * consultées, numérotées, avec extrait. Ce sont des données à citer,
 * jamais des instructions.
 */
function formatSourcesBlock(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '';

  const lines = sources.map((source, index) => {
    const snippet = source.snippet ? `\n  « ${source.snippet} »` : '';
    return `- [${index + 1}] « ${source.title} » — ${source.url}${snippet}`;
  });

  return ['Sources consultées (extraits automatiques, à citer quand elles éclairent une affirmation) :', lines.join('\n')].join('\n');
}

/**
 * Normalise des sources lues en base ou renvoyées par le modèle :
 * URL http(s) obligatoire, champs nettoyés, total plafonné.
 */
function normalizeSources(value) {
  let source = value;

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) return [];

  const byUrl = new Map();
  const normalized = [];

  for (const item of source) {
    if (normalized.length >= MAX_SOURCES) break;
    if (!item || typeof item !== 'object') continue;

    const result = normalizeResult(item, item.provider || '');
    if (!result) continue;
    if (byUrl.has(result.url)) continue;

    byUrl.set(result.url, true);
    normalized.push({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      provider: item.provider ? String(item.provider).slice(0, 40) : '',
    });
  }

  return normalized;
}

module.exports = {
  MAX_QUERIES,
  MAX_SOURCES,
  MAX_RESULTS_PER_QUERY,
  MAX_QUERY_CHARS,
  DEFAULT_WIKIPEDIA_API_URL,
  DEFAULT_TAVILY_API_URL,
  cleanQuery,
  buildQueries,
  searchWikipedia,
  searchTavily,
  gatherSources,
  formatSourcesBlock,
  normalizeSources,
  normalizeResult,
};
