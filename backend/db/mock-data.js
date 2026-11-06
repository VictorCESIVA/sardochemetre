'use strict';

const fs = require('fs');
const path = require('path');

const MOCK_PATH = path.join(__dirname, '..', 'mock', 'tweets.json');
const HOUR_MS = 60 * 60 * 1000;

function loadMockTweets() {
  const raw = fs.readFileSync(MOCK_PATH, 'utf8');
  const tweets = JSON.parse(raw);

  if (!Array.isArray(tweets)) {
    throw new Error('mock/tweets.json doit contenir un tableau');
  }

  return tweets;
}

/**
 * Recale les dates du mock : tweet le plus récent il y a 2 h,
 * puis un tweet toutes les 24 h.
 */
function applyDemoDates(tweets, now = new Date()) {
  const newest = now.getTime() - 2 * HOUR_MS;

  return tweets.map((tweet, index) => ({
    ...tweet,
    posted_at: new Date(newest - index * 24 * HOUR_MS).toISOString(),
  }));
}

function loadDemoTweets(now = new Date()) {
  return applyDemoDates(loadMockTweets(), now);
}

module.exports = { MOCK_PATH, loadMockTweets, applyDemoDates, loadDemoTweets };
