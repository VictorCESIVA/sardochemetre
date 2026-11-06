'use strict';

const axios = require('axios');
const { isDemoMode } = require('../db/config');
const { loadDemoTweets } = require('../db/mock-data');

const TWITTER_API = 'https://api.twitter.com/2';
const SYNDICATION_URL =
  'https://syndication.twitter.com/srv/timeline-profile/screen-name';
const PROFILE_URL = 'https://x.com';
const DEFAULT_USERNAME = 'Sardoche';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PROFILE_TWEETS = 5;
const PROFILE_CACHE_TTL_MS = 60 * 1000;
const VALID_SOURCES = ['mock', 'x', 'syndication', 'profile'];
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

let cachedUserId = null;
let cachedUsername = null;
let cachedToken = null;
let profileCache = null;

function twitterHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function formatApiError(error) {
  if (error && error.response) {
    const status = error.response.status;
    const data = error.response.data;
    let detail = '';

    if (typeof data === 'string') {
      detail = data;
    } else if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') {
        detail = data.detail;
      } else if (typeof data.title === 'string') {
        detail = data.title;
      }
    }

    detail = String(detail || error.response.statusText || 'réponse inattendue')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);

    return `HTTP ${status} - ${detail}`;
  }

  return error && error.message ? error.message : 'erreur inconnue';
}

function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

/**
 * Source des tweets : TWITTER_SOURCE explicite, sinon mock en démo,
 * sinon API X si un token est présent, sinon syndication publique.
 * `profile` lit la page publique x.com (5 derniers tweets, sans token).
 */
function getTwitterSource(env = process.env) {
  const explicit = String(env.TWITTER_SOURCE || '')
    .trim()
    .toLowerCase();

  if (explicit) {
    if (!VALID_SOURCES.includes(explicit)) {
      throw new Error(
        `TWITTER_SOURCE invalide : "${explicit}" (valeurs acceptées : ${VALID_SOURCES.join(', ')})`
      );
    }
    return explicit;
  }

  if (isDemoMode(env)) return 'mock';
  if (String(env.TWITTER_BEARER_TOKEN || '').trim()) return 'x';
  return 'syndication';
}

/**
 * Résout l'utilisateur par SARDOCHE_USER_ID, sinon par SARDOCHE_USERNAME
 * (défaut : Sardoche) via /2/users/by/username/:username.
 */
async function resolveUserId(bearerToken, env = process.env) {
  if (env.SARDOCHE_USER_ID) {
    return String(env.SARDOCHE_USER_ID).trim();
  }

  const username = String(env.SARDOCHE_USERNAME || DEFAULT_USERNAME).trim();

  if (
    cachedUserId &&
    cachedUsername === username &&
    cachedToken === bearerToken
  ) {
    return cachedUserId;
  }

  try {
    const response = await axios.get(
      `${TWITTER_API}/users/by/username/${encodeURIComponent(username)}`,
      { headers: twitterHeaders(bearerToken), timeout: 10000 }
    );

    const id = response.data && response.data.data && response.data.data.id;
    if (!id) {
      throw new Error(`utilisateur @${username} introuvable dans la réponse`);
    }

    cachedUserId = String(id);
    cachedUsername = username;
    cachedToken = bearerToken;
    return cachedUserId;
  } catch (error) {
    throw new Error(
      `Impossible de résoudre l'utilisateur Twitter @${username} : ${formatApiError(error)}`
    );
  }
}

function getMockTweets(limit) {
  console.log('🎭 Source mock : tweets de démonstration, dates recalées');
  return loadDemoTweets()
    .slice(0, limit)
    .map((tweet) => ({
      id: String(tweet.id),
      content: tweet.content,
      posted_at: tweet.posted_at,
      likes: Number(tweet.likes) || 0,
      retweets: Number(tweet.retweets) || 0,
      source: 'mock',
    }));
}

/**
 * API X v2 : exclut replies et retweets. Le token reste obligatoire.
 * Une erreur réseau/API renvoie [] pour ne jamais bloquer le scheduler.
 */
async function getXTweets({ limit, env, userId }) {
  const bearerToken = String(env.TWITTER_BEARER_TOKEN || '').trim();
  if (!bearerToken) {
    throw new Error(
      'TWITTER_BEARER_TOKEN manquant : TWITTER_SOURCE=x nécessite un token API X'
    );
  }

  try {
    const resolvedUserId = userId
      ? String(userId).trim()
      : await resolveUserId(bearerToken, env);

    const response = await axios.get(
      `${TWITTER_API}/users/${encodeURIComponent(resolvedUserId)}/tweets`,
      {
        headers: twitterHeaders(bearerToken),
        params: {
          // L'API X exige au moins 5 résultats par page.
          max_results: Math.max(5, Math.min(100, limit)),
          'tweet.fields': 'created_at,public_metrics,referenced_tweets',
          exclude: 'retweets,replies',
        },
        timeout: 15000,
      }
    );

    if (!response.data || !Array.isArray(response.data.data)) {
      return [];
    }

    return response.data.data
      .filter((tweet) => {
        const references = Array.isArray(tweet.referenced_tweets)
          ? tweet.referenced_tweets
          : [];
        return !references.some(
          (reference) =>
            reference.type === 'replied_to' || reference.type === 'retweeted'
        );
      })
      .slice(0, limit)
      .map((tweet) => ({
        id: String(tweet.id),
        content: tweet.text,
        posted_at: tweet.created_at,
        likes:
          Number(tweet.public_metrics && tweet.public_metrics.like_count) || 0,
        retweets:
          Number(tweet.public_metrics && tweet.public_metrics.retweet_count) || 0,
        source: 'x',
      }));
  } catch (error) {
    console.error(`[Twitter] Échec de l'API X : ${formatApiError(error)}`);
    return [];
  }
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  return String(value || '').replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (match, code) => {
      const lower = code.toLowerCase();

      if (lower.startsWith('#x')) {
        const codepoint = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : match;
      }

      if (lower.startsWith('#')) {
        const codepoint = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : match;
      }

      return Object.prototype.hasOwnProperty.call(named, lower)
        ? named[lower]
        : match;
    }
  );
}

function cleanTweetText(value) {
  const withoutLinks = String(value || '').replace(
    /https?:\/\/t\.co\/\S+/gi,
    ' '
  );

  return decodeHtmlEntities(withoutLinks).replace(/\s+/g, ' ').trim();
}

function extractNextData(html) {
  const match = String(html || '').match(
    /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (!match) {
    throw new Error('__NEXT_DATA__ introuvable dans la réponse de syndication');
  }

  return JSON.parse(match[1]);
}

/**
 * Parse le HTML de syndication X : filtre replies/retweets, déduplique,
 * nettoie le texte et trie par date décroissante.
 */
function parseSyndicationHtml(html, { limit = DEFAULT_LIMIT } = {}) {
  const data = extractNextData(html);
  const entries =
    data &&
    data.props &&
    data.props.pageProps &&
    data.props.pageProps.timeline &&
    data.props.pageProps.timeline.entries;

  if (!Array.isArray(entries)) {
    throw new Error(
      'timeline.entries introuvable dans les données de syndication'
    );
  }

  const safeLimit = normalizeLimit(limit);
  const byId = new Map();

  for (const entry of entries) {
    if (!entry || entry.type !== 'tweet') continue;

    const tweet = entry.content && entry.content.tweet;
    if (!tweet) continue;

    const id = String(tweet.id_str || tweet.id || '').trim();
    if (!id) continue;

    if (tweet.in_reply_to_status_id_str || tweet.in_reply_to_user_id_str) {
      continue;
    }
    if (tweet.retweeted_status || tweet.retweeted_status_id_str) continue;

    const content = cleanTweetText(tweet.full_text || tweet.text || '');
    if (!content || /^RT @\w+:/.test(content)) continue;

    const createdAt = new Date(tweet.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    if (!byId.has(id)) {
      byId.set(id, {
        id,
        content,
        posted_at: createdAt.toISOString(),
        likes: Number(tweet.favorite_count) || 0,
        retweets: Number(tweet.retweet_count) || 0,
        source: 'syndication',
      });
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
    .slice(0, safeLimit);
}

/**
 * Flux public de syndication X : aucun token requis.
 * Une erreur réseau/parse renvoie [] pour ne jamais bloquer l'application.
 */
async function getSyndicationTweets({ limit, env }) {
  const username = String(env.SARDOCHE_USERNAME || DEFAULT_USERNAME).trim();
  const url =
    String(env.TWITTER_SYNDICATION_URL || '').trim() ||
    `${SYNDICATION_URL}/${encodeURIComponent(username)}`;

  try {
    console.log(
      `[Twitter] Récupération de ${limit} tweet(s) via syndication (@${username})`
    );

    const response = await axios.get(url, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      timeout: 15000,
      responseType: 'text',
    });

    return parseSyndicationHtml(response.data, { limit });
  } catch (error) {
    console.error(
      `[Twitter] Échec de la syndication (@${username}) : ${formatApiError(error)}`
    );
    return [];
  }
}

function cleanProfileText(value) {
  const withoutLinks = String(value || '').replace(
    /https?:\/\/t\.co\/\S+/gi,
    ' '
  );

  return decodeHtmlEntities(withoutLinks)
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeAvatarUrl(value) {
  const url = String(value || '').trim();
  if (!url) return null;

  return url.replace(
    /_(?:normal|bigger|mini|reasonably_small)\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i,
    '_400x400.$1$2'
  );
}

function profileDateToIso(value) {
  if (value === undefined || value === null || value === '') return null;

  const asString = String(value).trim();
  const numeric = typeof value === 'number' || /^\d+$/.test(asString);
  const date = new Date(numeric ? Number(value) : value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Auteur complet (avec followers) depuis core.user_results.result.
 * Retourne null si l'objet ne contient pas d'identité exploitable.
 */
function mapProfileAuthor(userResult) {
  if (!userResult || typeof userResult !== 'object') return null;

  const core = userResult.core || {};
  const legacy = userResult.legacy || {};
  const name = String(core.name || legacy.name || '').trim();
  const username = String(
    core.screen_name || legacy.screen_name || ''
  ).trim();

  if (!name && !username) return null;

  const verification = userResult.verification || {};
  const relationship = userResult.relationship_counts || {};
  const avatar =
    (userResult.avatar && userResult.avatar.image_url) ||
    legacy.profile_image_url_https ||
    null;

  return {
    name,
    username,
    avatar_url: normalizeAvatarUrl(avatar),
    verified: Boolean(
      verification.is_blue_verified !== undefined
        ? verification.is_blue_verified
        : legacy.verified
    ),
    followers: Number(relationship.followers || legacy.followers_count) || 0,
  };
}

function toPublicAuthor(author) {
  if (!author) return null;

  return {
    name: author.name,
    username: author.username,
    avatar_url: author.avatar_url,
    verified: author.verified,
  };
}

function mapProfileMedia(entities) {
  if (!Array.isArray(entities)) return [];

  return entities
    .map((media) => {
      const info = media.original_info || {};

      return {
        type: String(media.type || 'photo'),
        url: String(media.media_url_https || media.media_url || ''),
        width: Number(info.width) || 0,
        height: Number(info.height) || 0,
        expanded_url: String(media.expanded_url || ''),
      };
    })
    .filter((media) => media.url);
}

function mapQuotedTweet(quotedResult) {
  if (!quotedResult) return null;

  const result =
    quotedResult.__typename === 'TweetWithVisibilityResults' &&
    quotedResult.tweet
      ? quotedResult.tweet
      : quotedResult;
  const id = String(result.rest_id || result.id || '').trim();
  if (!id) return null;

  const author = mapProfileAuthor(
    result.core && result.core.user_results && result.core.user_results.result
  );

  return {
    id,
    content: cleanProfileText(
      (result.details && result.details.full_text) ||
        (result.legacy && result.legacy.full_text) ||
        ''
    ),
    author: toPublicAuthor(author),
    media: mapProfileMedia(result.media_entities2),
  };
}

/**
 * Extrait le JSON SSR `profile_user_originals_timeline` de la page x.com.
 */
function extractProfilePayload(html) {
  const pattern = /value:"((?:\\.|[^"\\])*)"/g;
  const source = String(html || '');
  let match;
  let captured = null;

  while ((match = pattern.exec(source))) {
    if (match[1].includes('profile_user_originals_timeline')) {
      captured = match[1];
      break;
    }
  }

  if (!captured) {
    throw new Error(
      'flux profile_user_originals_timeline introuvable dans la page x.com'
    );
  }

  let decoded;
  try {
    decoded = JSON.parse(`"${captured}"`);
  } catch {
    throw new Error('chaîne SSR du profil X invalide');
  }

  try {
    return JSON.parse(decoded);
  } catch {
    throw new Error('JSON SSR du profil X invalide');
  }
}

function profileTimelineEntries(data) {
  const instructions =
    data &&
    data.data &&
    data.data.user_result_by_screen_name &&
    data.data.user_result_by_screen_name.result &&
    data.data.user_result_by_screen_name.result.profile_user_originals_timeline &&
    data.data.user_result_by_screen_name.result.profile_user_originals_timeline
      .timeline &&
    data.data.user_result_by_screen_name.result.profile_user_originals_timeline
      .timeline.instructions;

  if (!Array.isArray(instructions)) {
    throw new Error('timeline.instructions introuvable dans le profil X');
  }

  const entries = [];
  for (const instruction of instructions) {
    const type = instruction.__typename || instruction.type;
    if (type && type !== 'TimelineAddEntries') continue;
    if (Array.isArray(instruction.entries)) entries.push(...instruction.entries);
  }

  return entries;
}

/**
 * Parse la page publique x.com : profil + 5 derniers tweets originaux.
 */
function parseProfileHtml(html, { limit = MAX_PROFILE_TWEETS } = {}) {
  const data = extractProfilePayload(html);
  const entries = profileTimelineEntries(data);
  const safeLimit = Math.min(
    MAX_PROFILE_TWEETS,
    normalizeLimit(limit, MAX_PROFILE_TWEETS)
  );
  const byId = new Map();
  let firstAuthor = null;

  for (const entry of entries) {
    const rawResult =
      entry &&
      entry.content &&
      entry.content.content &&
      entry.content.content.tweet_results &&
      entry.content.content.tweet_results.result;
    if (!rawResult) continue;

    const result =
      rawResult.__typename === 'TweetWithVisibilityResults' && rawResult.tweet
        ? rawResult.tweet
        : rawResult;
    const id = String(result.rest_id || result.id || '').trim();
    if (!id) continue;

    const authorResult =
      result.core &&
      result.core.user_results &&
      result.core.user_results.result;
    const author = mapProfileAuthor(authorResult);
    if (!firstAuthor && author) firstAuthor = author;

    const postedAt = profileDateToIso(
      result.details && result.details.created_at_ms
    );
    if (!postedAt) continue;

    const content = cleanProfileText(
      (result.details && result.details.full_text) ||
        (result.legacy && result.legacy.full_text) ||
        ''
    );
    const media = mapProfileMedia(result.media_entities2);
    const quotedTweet = mapQuotedTweet(
      result.quoted_tweet_results && result.quoted_tweet_results.result
    );

    if (!content && media.length === 0 && !quotedTweet) continue;

    if (!byId.has(id)) {
      const counts = result.counts || {};
      byId.set(id, {
        id,
        content,
        posted_at: postedAt,
        likes: Number(counts.favorite_count) || 0,
        retweets: Number(counts.retweet_count) || 0,
        replies: Number(counts.reply_count) || 0,
        views: Number(result.views && result.views.count) || 0,
        source: 'profile',
        author: toPublicAuthor(author),
        media,
        quoted_tweet: quotedTweet,
      });
    }
  }

  const root =
    data &&
    data.data &&
    data.data.user_result_by_screen_name &&
    data.data.user_result_by_screen_name.result;
  const profileAuthor = mapProfileAuthor(root) || firstAuthor;
  const profile = profileAuthor
    ? {
        username: profileAuthor.username,
        name: profileAuthor.name,
        avatar_url: profileAuthor.avatar_url,
        verified: profileAuthor.verified,
        followers: profileAuthor.followers,
      }
    : null;

  const tweets = Array.from(byId.values())
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
    .slice(0, safeLimit);

  return { profile, tweets };
}

function clearProfileCache() {
  profileCache = null;
}

/**
 * Récupère la page x.com avec un cache mémoire de 60 s.
 * En cas d'erreur réseau/parse : profil null et tweets [].
 */
async function fetchProfileTimeline({ env = process.env, force = false } = {}) {
  const username = String(env.SARDOCHE_USERNAME || DEFAULT_USERNAME).trim();
  const override = String(env.TWITTER_PROFILE_URL || '').trim();
  const cacheKey = override || `profile:${username}`;
  const url =
    override ||
    `${PROFILE_URL}/${encodeURIComponent(username)}?f=live&_=${Date.now()}`;

  if (
    !force &&
    profileCache &&
    profileCache.key === cacheKey &&
    Date.now() - profileCache.cachedAt < PROFILE_CACHE_TTL_MS
  ) {
    return profileCache.data;
  }

  try {
    console.log(`[Twitter] Récupération du profil @${username} via x.com`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      timeout: 25000,
      responseType: 'text',
    });

    const data = parseProfileHtml(response.data, {
      limit: MAX_PROFILE_TWEETS,
    });
    profileCache = { key: cacheKey, cachedAt: Date.now(), data };
    return data;
  } catch (error) {
    console.error(
      `[Twitter] Échec du profil (@${username}) : ${formatApiError(error)}`
    );
    return { profile: null, tweets: [] };
  }
}

async function getProfileSnapshot(options = {}) {
  const env = options.env || process.env;
  const { profile } = await fetchProfileTimeline({
    env,
    force: Boolean(options.force),
  });
  return profile;
}

/**
 * Récupère les tweets récents de Sardoche.
 * - mock : données de démo, dates recalées.
 * - x : API X v2 (TWITTER_BEARER_TOKEN requis).
 * - syndication : flux public X, sans token.
 * - profile : page publique x.com, 5 derniers tweets, sans token.
 *
 * Options : { limit = TWITTER_SYNC_LIMIT || 20, env = process.env }.
 * Un argument chaîne reste accepté pour l'ancien appel getRecentTweets(userId).
 */
async function getRecentTweets(options = {}) {
  const normalized =
    typeof options === 'string' ? { userId: options } : options || {};
  const env = normalized.env || process.env;
  const limit = normalizeLimit(
    normalized.limit === undefined ? env.TWITTER_SYNC_LIMIT : normalized.limit
  );
  const source = getTwitterSource(env);

  if (source === 'mock') {
    return getMockTweets(limit);
  }

  if (source === 'x') {
    return getXTweets({ limit, env, userId: normalized.userId });
  }

  if (source === 'profile') {
    const { tweets } = await fetchProfileTimeline({ env });
    return tweets.slice(0, Math.min(limit, MAX_PROFILE_TWEETS));
  }

  return getSyndicationTweets({ limit, env });
}

module.exports = {
  getRecentTweets,
  getTwitterSource,
  getProfileSnapshot,
  clearProfileCache,
  resolveUserId,
  parseSyndicationHtml,
  parseProfileHtml,
  extractProfilePayload,
  cleanTweetText,
  cleanProfileText,
  decodeHtmlEntities,
  normalizeLimit,
  VALID_SOURCES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PROFILE_TWEETS,
  PROFILE_CACHE_TTL_MS,
  DEFAULT_USERNAME,
};
