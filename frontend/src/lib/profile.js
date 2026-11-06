export const DEFAULT_PROFILE = Object.freeze({
  name: 'Sardoche 🇫🇷',
  username: 'Sardoche',
  avatar_url: '/sardoche-avatar.jpg',
  verified: true,
  followers: 0,
  updated_at: null,
});

function toBoolean(value) {
  return value === true || value === 1 || value === 'true';
}

export function normalizeUsername(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const username = String(value).trim().replace(/^@+/, '');
  return username || fallback;
}

/**
 * Normalizes an X author without injecting fallback values.
 * Returns null when there is not enough information to identify an author.
 */
export function normalizeAuthor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const name = value.name === null || value.name === undefined ? '' : String(value.name).trim();
  const username = normalizeUsername(value.username);
  const avatarUrl =
    value.avatar_url === null || value.avatar_url === undefined
      ? ''
      : String(value.avatar_url).trim();

  if (!name && !username) return null;

  return {
    name,
    username,
    avatar_url: avatarUrl,
    verified: value.verified === undefined ? null : toBoolean(value.verified),
  };
}

export function normalizeProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  const author = normalizeAuthor(source);

  return {
    name: author?.name || DEFAULT_PROFILE.name,
    username: author?.username || DEFAULT_PROFILE.username,
    avatar_url: author?.avatar_url || DEFAULT_PROFILE.avatar_url,
    verified: author?.verified ?? DEFAULT_PROFILE.verified,
    followers: Math.max(0, Math.floor(Number(source.followers) || 0)),
    updated_at:
      source.updated_at === null || source.updated_at === undefined
        ? null
        : String(source.updated_at),
  };
}

/**
 * Resolves the author to display for a tweet: the tweet author wins, then the
 * fetched profile, then the local fallback profile.
 */
export function resolveAuthor(author, profile = null) {
  const fallback = profile ? normalizeProfile(profile) : DEFAULT_PROFILE;
  const normalized = normalizeAuthor(author);

  if (!normalized) return fallback;

  return {
    name: normalized.name || fallback.name,
    username: normalized.username || fallback.username,
    avatar_url: normalized.avatar_url || fallback.avatar_url,
    verified: normalized.verified ?? fallback.verified,
  };
}
