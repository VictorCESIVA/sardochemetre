const DAY_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const TWEET_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TWEET_TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "28 mars 2025", or "Date inconnue" for an absent/invalid date.
 */
export function formatDate(value) {
  const date = parseDate(value);
  return date ? DAY_FORMATTER.format(date) : 'Date inconnue';
}

/**
 * "Vendredi 6 novembre 2026" — capitalised French long date.
 */
export function formatToday(value = new Date()) {
  const date = parseDate(value);
  if (!date) return '';
  const formatted = LONG_DATE_FORMATTER.format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(fallback);
  return Math.round(number).toLocaleString('fr-FR');
}

export function formatDecimal(value, maximumFractionDigits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

export function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0 %';
  return `${number.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })} %`;
}

/**
 * "5 nov. 2026" for compact embeds.
 */
export function formatTweetDate(value) {
  const date = parseDate(value);
  return date ? TWEET_DATE_FORMATTER.format(date) : 'Date inconnue';
}

/**
 * "5 nov. 2026 · 18:51" for full embeds.
 */
export function formatTweetTimestamp(value) {
  const date = parseDate(value);
  if (!date) return 'Date inconnue';
  return `${TWEET_DATE_FORMATTER.format(date)} · ${TWEET_TIME_FORMATTER.format(date)}`;
}

/**
 * "1 240" below 10k, then "17,5 k" / "1,2 M" for social counters.
 */
export function formatCompactNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(fallback);
  if (number < 10000) return formatNumber(number);
  return COMPACT_NUMBER_FORMATTER.format(number).replace(/[\u202f\u00a0]/g, ' ');
}

export function formatIndex(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return '01';
  return String(Math.floor(number)).padStart(2, '0');
}
