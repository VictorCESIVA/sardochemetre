/**
 * API-only tweet service. Tweets, statistics and AI analyses all come from the
 * backend; every method returns the same flat tweet shape used by the UI.
 */
import axios from 'axios';
import {
  DEFAULT_PROFILE,
  normalizeProfile,
} from '../lib/profile';
import {
  normalizeBullshitmetre,
  normalizeStats,
  normalizeTweet,
} from '../lib/tweetUtils';

const API_BASE_URL = (
  import.meta.env?.VITE_API_URL || 'http://localhost:3001'
).replace(/\/+$/, '');

export const BACKEND_HEALTH_URL = `${API_BASE_URL}/health`;

let cachedProfile = null;
let pendingProfile = null;

/**
 * Clears the in-memory profile cache. Exposed for tests and relogin flows.
 */
export function clearProfileCache() {
  cachedProfile = null;
  pendingProfile = null;
}

function toNonNegativeInt(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeListResponse(data, requestedPage, requestedLimit) {
  const source = Array.isArray(data) ? { tweets: data } : data || {};
  const paginationSource =
    source.pagination && typeof source.pagination === 'object'
      ? source.pagination
      : {};

  const rawTweets = Array.isArray(source.tweets)
    ? source.tweets
    : Array.isArray(source.data)
      ? source.data
      : [];
  const tweets = rawTweets.map(normalizeTweet).filter(Boolean);

  const page = Math.max(
    1,
    toNonNegativeInt(source.page ?? paginationSource.page, requestedPage),
  );
  const limit = Math.max(
    1,
    toNonNegativeInt(source.limit ?? paginationSource.limit, requestedLimit),
  );
  const total = toNonNegativeInt(
    source.total ?? paginationSource.total,
    tweets.length,
  );
  const totalPages = toNonNegativeInt(
    source.totalPages ?? paginationSource.totalPages,
    Math.ceil(total / limit),
  );

  return {
    tweets,
    total,
    page,
    limit,
    totalPages,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext:
        typeof paginationSource.hasNext === 'boolean'
          ? paginationSource.hasNext
          : page < totalPages,
      hasPrev:
        typeof paginationSource.hasPrev === 'boolean'
          ? paginationSource.hasPrev
          : page > 1,
    },
  };
}

/**
 * Turns an axios failure into an Error carrying the backend message and,
 * when available, its error code and HTTP status.
 */
function toRequestError(error, fallbackMessage) {
  const response = error?.response;
  const data = response?.data ?? {};

  let message =
    typeof data.error === 'string' && data.error.trim()
      ? data.error
      : typeof data.message === 'string' && data.message.trim()
        ? data.message
        : '';

  if (!message) {
    if (error?.code === 'ECONNABORTED') {
      message =
        'Le backend met trop de temps à répondre. Vérifiez qu’il est démarré.';
    } else if (error?.request || error?.message === 'Network Error') {
      message = 'Impossible de joindre le backend. Vérifiez qu’il est démarré.';
    } else {
      message = error?.message || fallbackMessage;
    }
  }

  const normalized = new Error(message);
  if (data.code) normalized.code = data.code;
  if (response?.status) normalized.status = response.status;
  return normalized;
}

/**
 * Fetches the paginated tweet archive.
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page (1-100)
 * @param {string} period - 'day' | 'week' | 'month' | 'all'
 * @param {string} query - Optional search text
 * @returns {Promise<Object>} { tweets, total, page, limit, totalPages, pagination }
 */
export async function getTweets(page = 1, limit = 12, period = 'all', query = '') {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 12)));
  const search = typeof query === 'string' ? query.trim() : '';

  try {
    const response = await axios.get(`${API_BASE_URL}/api/tweets`, {
      params: {
        page: safePage,
        limit: safeLimit,
        period: period || 'all',
        ...(search ? { q: search } : {}),
      },
    });

    return normalizeListResponse(response.data, safePage, safeLimit);
  } catch (error) {
    throw toRequestError(error, 'Impossible de charger les archives.');
  }
}

/**
 * Fetches a single tweet by ID.
 * @param {string|number} id - Tweet ID
 * @returns {Promise<Object>} Flat tweet object
 */
export async function getTweetById(id) {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/tweets/${id}`);
    const tweet = normalizeTweet(response.data?.tweet ?? response.data);

    if (!tweet) {
      throw new Error('Le backend a renvoyé un tweet invalide.');
    }

    return tweet;
  } catch (error) {
    if (error?.message === 'Le backend a renvoyé un tweet invalide.') {
      throw error;
    }
    throw toRequestError(error, 'Impossible de charger ce tweet.');
  }
}

/**
 * Fetches statistics for a period, in the same shape as the backend.
 * @param {string} period - 'day' | 'week' | 'month' | 'all'
 * @returns {Promise<Object>} Stats object
 */
export async function getStats(period = 'all') {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/tweets/stats`, {
      params: { period: period || 'all' },
    });
    return normalizeStats(response.data, period);
  } catch (error) {
    throw toRequestError(error, 'Impossible de charger les statistiques.');
  }
}

/**
 * Fetches the global BullshitMètre score for a period.
 * @param {string} period - 'day' | 'week' | 'month' | 'all'
 * @returns {Promise<Object>} { globalScore, level, period, sampleSize, timestamp }
 */
export async function getBullshitmetre(period = 'all') {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/tweets/bullshitmetre`,
      { params: { period: period || 'all' } },
    );
    return normalizeBullshitmetre(response.data, period);
  } catch (error) {
    throw toRequestError(error, 'Impossible de charger l’indice de bullshit.');
  }
}

/**
 * Fetches the public profile used by tweet embeds. The result is cached in
 * memory; a missing or unavailable profile falls back to the local profile.
 * @returns {Promise<Object>} { name, username, avatar_url, verified, followers, updated_at }
 */
export async function getProfile() {
  if (cachedProfile) return cachedProfile;

  if (!pendingProfile) {
    pendingProfile = axios
      .get(`${API_BASE_URL}/api/profile`)
      .then((response) => {
        cachedProfile = normalizeProfile(
          response.data?.profile ?? response.data,
        );
        return cachedProfile;
      })
      .catch(() => ({ ...DEFAULT_PROFILE }))
      .finally(() => {
        pendingProfile = null;
      });
  }

  return pendingProfile;
}

/**
 * Fetches the AI provider status. Network failures are propagated so the UI
 * can present them as a non-blocking, ignorable status error.
 * @returns {Promise<Object>} { provider, model, configured, fallback, plan }
 */
export async function getAIStatus() {
  const response = await axios.get(`${API_BASE_URL}/api/ai/status`);
  const data = response.data;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Statut IA invalide reçu du backend.');
  }

  return data;
}

/**
 * Runs an AI analysis through the backend and persists it in SQLite.
 * @param {Object} tweet - Tweet object with a 'content' field
 * @returns {Promise<Object>} Flat analyzed tweet
 */
export async function analyzeTweet(tweet) {
  if (!tweet || typeof tweet.content !== 'string' || !tweet.content.trim()) {
    throw new Error('Invalid tweet: content is required');
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/api/tweets/analyze`, {
      content: tweet.content,
      tweet_id: tweet.id ?? null,
    });

    const data = response.data ?? {};
    const analysisSource =
      data.tweet ??
      (data.analysis && typeof data.analysis === 'object'
        ? { ...tweet, ...data.analysis, analyzed: true }
        : data);

    const analyzed = normalizeTweet({
      ...tweet,
      ...analysisSource,
      analyzed: true,
      analyzed_at: analysisSource?.analyzed_at ?? new Date().toISOString(),
    });

    if (!analyzed || analyzed.bullshit_score === null) {
      throw new Error('Le backend a renvoyé une analyse IA invalide.');
    }

    return analyzed;
  } catch (error) {
    if (error?.message === 'Le backend a renvoyé une analyse IA invalide.') {
      throw error;
    }
    throw toRequestError(error, 'L’analyse du tweet a échoué.');
  }
}

/**
 * Searches tweets by keyword. Used as a fallback when the paginated endpoint
 * does not filter server-side.
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of flat tweets
 */
export async function searchTweets(query) {
  const search = typeof query === 'string' ? query.trim() : '';
  if (!search) return [];

  try {
    const response = await axios.get(`${API_BASE_URL}/api/tweets/search`, {
      params: { q: search },
    });
    const data = response.data;
    const tweets = Array.isArray(data)
      ? data
      : Array.isArray(data?.tweets)
        ? data.tweets
        : [];

    return tweets.map(normalizeTweet).filter(Boolean);
  } catch (error) {
    throw toRequestError(error, 'La recherche a échoué.');
  }
}
