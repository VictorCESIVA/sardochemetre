/**
 * Pure helpers shared by the tweet service, the pages and their unit tests.
 * No network, browser API or UI import is allowed in this module.
 */
import { normalizeAuthor } from './profile';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const PERIOD_WINDOWS = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
};

const LEVELS = ['FAIBLE', 'MODÉRÉ', 'ÉLEVÉ', 'CRITIQUE'];

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDateMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(value);
}

function toReferenceMs(now) {
  const reference = toDateMs(now);
  return Number.isFinite(reference) ? reference : Date.now();
}

/**
 * Clamps a score to the 0-100 range. Invalid values fall back to `fallback`.
 */
export function normalizeScore(value, fallback = 0) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(100, Math.max(0, score));
}

/**
 * Normalizes a verdict regardless of case, accents, hyphens or surrounding spaces.
 */
export function normalizeVerdict(value, fallback = 'DOUTEUX') {
  if (typeof value !== 'string') return fallback;

  const key = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, ' ');

  if (key === 'CHAUD BOUILLANT') return 'CHAUD BOUILLANT';
  if (key === 'VRAI' || key === 'TRUE') return 'VRAI';
  if (key === 'DOUTEUX' || key === 'DOUTE' || key === 'INCERTAIN') return 'DOUTEUX';
  if (key === 'BULLSHIT' || key === 'FALSE' || key === 'FAUX') return 'BULLSHIT';

  return fallback;
}

/**
 * Converts fact checks to an array of `{ claim, verdict, note }`.
 * A JSON string is tolerated because some models or SQLite rows return one.
 */
export function normalizeFactChecks(value) {
  let checks = value;

  if (typeof checks === 'string') {
    try {
      checks = JSON.parse(checks);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(checks)) return [];

  return checks
    .map((check) => {
      if (typeof check === 'string') {
        return { claim: check, verdict: 'invérifiable', note: '' };
      }
      if (!check || typeof check !== 'object') return null;

      return {
        claim: check.claim == null ? '' : String(check.claim),
        verdict: check.verdict == null ? 'invérifiable' : String(check.verdict),
        note: check.note == null ? '' : String(check.note),
      };
    })
    .filter(Boolean);
}

const MEDIA_TYPES = new Set(['photo', 'video', 'animated_gif']);

function toPositiveInt(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Normalizes the media array used by X embeds.
 */
export function normalizeMedia(value) {
  let source = value;

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) return [];

  return source
    .map((media) => {
      if (!media || typeof media !== 'object') return null;

      const url =
        media.url ?? media.preview_image_url ?? media.media_url_https ?? '';
      if (!url) return null;

      const type = MEDIA_TYPES.has(media.type) ? media.type : 'photo';

      return {
        type,
        url: String(url),
        width: toPositiveInt(media.width),
        height: toPositiveInt(media.height),
        expanded_url:
          media.expanded_url === null || media.expanded_url === undefined
            ? ''
            : String(media.expanded_url),
        alt: media.alt === null || media.alt === undefined ? '' : String(media.alt),
      };
    })
    .filter(Boolean);
}

function normalizeQuotedTweet(value) {
  let source = value;

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }

  return {
    id: source.id ?? null,
    content: source.content == null ? '' : String(source.content),
    posted_at: source.posted_at ?? null,
    author: normalizeAuthor(source.author),
    media: normalizeMedia(source.media),
  };
}

/**
 * Flattens a tweet from the backend into UI-ready fields.
 * The returned object is safe for the UI: analysis fields are top-level.
 */
export function normalizeTweet(tweet) {
  if (!tweet || typeof tweet !== 'object') return null;

  const analysis =
    tweet.analysis && typeof tweet.analysis === 'object' ? tweet.analysis : {};

  const scoreValue = tweet.bullshit_score ?? analysis.bullshit_score;
  const verdictValue = tweet.verdict ?? analysis.verdict;
  const hasScore = scoreValue !== null && scoreValue !== undefined && scoreValue !== '';

  return {
    id: tweet.id,
    content: tweet.content == null ? '' : String(tweet.content),
    posted_at: tweet.posted_at ?? null,
    author: normalizeAuthor(tweet.author),
    media: normalizeMedia(tweet.media),
    quoted_tweet: normalizeQuotedTweet(
      tweet.quoted_tweet ?? tweet.quotedTweet,
    ),
    likes: Math.max(0, toNumber(tweet.likes, 0)),
    retweets: Math.max(0, toNumber(tweet.retweets, 0)),
    replies: Math.max(0, Math.floor(toNumber(tweet.replies, 0))),
    views: Math.max(0, Math.floor(toNumber(tweet.views, 0))),
    analyzed: tweet.analyzed ?? hasScore,
    bullshit_score: hasScore ? normalizeScore(scoreValue, 0) : null,
    verdict: verdictValue ? normalizeVerdict(verdictValue, 'DOUTEUX') : null,
    reasoning:
      tweet.reasoning != null
        ? String(tweet.reasoning)
        : analysis.reasoning != null
          ? String(analysis.reasoning)
          : '',
    fact_checks: normalizeFactChecks(tweet.fact_checks ?? analysis.fact_checks),
    humor_comment:
      tweet.humor_comment != null
        ? String(tweet.humor_comment)
        : analysis.humor_comment != null
          ? String(analysis.humor_comment)
          : '',
    analyzed_at: tweet.analyzed_at ?? analysis.analyzed_at ?? null,
  };
}

/**
 * Keeps tweets posted during the requested period (day=24h, week=7d, month=30d).
 * Used by the occasional client-side search fallback.
 */
export function filterByPeriod(tweets, period = 'all', now = Date.now()) {
  if (!Array.isArray(tweets)) return [];

  const windowMs = PERIOD_WINDOWS[period];
  if (!windowMs) return [...tweets];

  const cutoff = toReferenceMs(now) - windowMs;

  return tweets.filter((tweet) => {
    const postedAt = toDateMs(tweet?.posted_at);
    return Number.isFinite(postedAt) && postedAt >= cutoff;
  });
}

/**
 * Case-insensitive search over the useful text fields of a tweet.
 */
export function matchesQuery(tweet, query) {
  if (!query || !String(query).trim()) return true;
  if (!tweet) return false;

  const needle = String(query).trim().toLowerCase();
  return [tweet.content, tweet.verdict, tweet.reasoning, tweet.humor_comment]
    .filter((value) => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(needle));
}

/**
 * Paginates a list and exposes both top-level fields and a `pagination` object.
 * Used for the client-side search fallback.
 */
export function paginateTweets(tweets, page = 1, limit = 20) {
  const list = Array.isArray(tweets) ? tweets : [];
  const safeLimit = Math.min(100, Math.max(1, Math.floor(toNumber(limit, 20))));
  const safePage = Math.max(1, Math.floor(toNumber(page, 1)));
  const total = list.length;
  const totalPages = Math.ceil(total / safeLimit);
  const start = (safePage - 1) * safeLimit;

  return {
    tweets: list.slice(start, start + safeLimit),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
  };
}

function emptyVerdictDistribution() {
  return {
    VRAI: { count: 0, percentage: 0 },
    DOUTEUX: { count: 0, percentage: 0 },
    BULLSHIT: { count: 0, percentage: 0 },
    'CHAUD BOUILLANT': { count: 0, percentage: 0 },
  };
}

/**
 * Maps a 0-100 score to the backend-compatible bullshitmetre level.
 */
export function levelForScore(score) {
  const safeScore = normalizeScore(score);
  if (safeScore < 25) return LEVELS[0];
  if (safeScore < 50) return LEVELS[1];
  if (safeScore < 75) return LEVELS[2];
  return LEVELS[3];
}

/**
 * Normalizes a backend stats response, including string percentages.
 */
export function normalizeStats(data, period = 'all') {
  const source = data && typeof data === 'object' ? data : {};
  const totalAnalyzed = Math.max(
    0,
    Math.floor(toNumber(source.totalAnalyzed ?? source.total_analyzed, 0)),
  );

  const sourceDistribution =
    source.verdictDistribution ?? source.verdict_distribution ?? {};
  const verdictDistribution = emptyVerdictDistribution();

  Object.entries(sourceDistribution).forEach(([key, entry]) => {
    const verdict = normalizeVerdict(key, 'DOUTEUX');
    const count = Math.max(0, Math.floor(toNumber(entry?.count, 0)));
    const percentage =
      entry?.percentage !== undefined && entry?.percentage !== null
        ? toNumber(entry.percentage, 0)
        : totalAnalyzed > 0
          ? (count / totalAnalyzed) * 100
          : 0;

    verdictDistribution[verdict].count += count;
    verdictDistribution[verdict].percentage = round2(
      verdictDistribution[verdict].percentage + percentage,
    );
  });

  return {
    period: source.period ?? period,
    totalAnalyzed,
    avgScore: toNumber(source.avgScore ?? source.avg_score, 0),
    maxScore: toNumber(source.maxScore ?? source.max_score, 0),
    minScore: toNumber(source.minScore ?? source.min_score, 0),
    verdictDistribution,
  };
}

/**
 * Normalizes a backend bullshitmetre response.
 */
export function normalizeBullshitmetre(data, period = 'all') {
  const source = data && typeof data === 'object' ? data : {};
  const globalScore = normalizeScore(
    source.globalScore ?? source.global_score,
    0,
  );
  const level =
    typeof source.level === 'string' && source.level.trim()
      ? source.level
      : levelForScore(globalScore);

  return {
    globalScore,
    level,
    period: source.period ?? period,
    sampleSize: Math.max(
      0,
      Math.floor(toNumber(source.sampleSize ?? source.sample_size, 0)),
    ),
    timestamp:
      typeof source.timestamp === 'string'
        ? source.timestamp
        : new Date().toISOString(),
  };
}
