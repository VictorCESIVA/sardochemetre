'use strict';

const VALID_PERIODS = ['day', 'week', 'month', 'all'];

const PERIOD_HOURS = {
  day: 24,
  week: 7 * 24,
  month: 30 * 24,
};

function normalizePeriod(value = 'all') {
  const period = String(value || 'all').trim().toLowerCase();
  return VALID_PERIODS.includes(period) ? period : null;
}

/**
 * Retourne la borne ISO basse de la période, ou null pour "all".
 */
function getPeriodCutoff(period, now = new Date()) {
  const hours = PERIOD_HOURS[period];
  if (!hours) return null;
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

module.exports = { VALID_PERIODS, normalizePeriod, getPeriodCutoff };
