import { describe, expect, it } from 'vitest';
import {
  filterByPeriod,
  matchesQuery,
  normalizeBullshitmetre,
  normalizeFactChecks,
  normalizeScore,
  normalizeStats,
  normalizeTweet,
  normalizeVerdict,
  paginateTweets,
} from '../tweetUtils';

const NOW = new Date('2026-06-15T12:00:00.000Z').getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TWEETS = [
  { id: '1', posted_at: new Date(NOW - 2 * HOUR).toISOString() },
  { id: '2', posted_at: new Date(NOW - 26 * HOUR).toISOString() },
  { id: '3', posted_at: new Date(NOW - 8 * DAY).toISOString() },
  { id: '4', posted_at: new Date(NOW - 40 * DAY).toISOString() },
];

describe('normalizeTweet', () => {
  it('flattens a nested analysis into UI-ready fields', () => {
    const tweet = normalizeTweet({
      id: '42',
      content: 'Un tweet de test',
      posted_at: '2025-03-28T14:22:00Z',
      likes: 12,
      retweets: 3,
      analysis: {
        bullshit_score: '85',
        verdict: 'chaud bouillant',
        reasoning: 'Explication factuelle.',
        fact_checks: [
          { claim: 'Une affirmation', verdict: 'faux', note: 'Une note' },
        ],
        humor_comment: 'Une punchline.',
      },
    });

    expect(tweet).toMatchObject({
      id: '42',
      content: 'Un tweet de test',
      likes: 12,
      retweets: 3,
      bullshit_score: 85,
      verdict: 'CHAUD BOUILLANT',
      reasoning: 'Explication factuelle.',
      humor_comment: 'Une punchline.',
    });
    expect(tweet).not.toHaveProperty('analysis');
    expect(tweet.fact_checks).toEqual([
      { claim: 'Une affirmation', verdict: 'faux', note: 'Une note' },
    ]);
  });

  it('parses fact_checks stored as a JSON string', () => {
    const tweet = normalizeTweet({
      id: '7',
      content: 'Test',
      bullshit_score: 50,
      verdict: 'DOUTEUX',
      fact_checks:
        '[{"claim":"Affirmation","verdict":"invérifiable","note":"Note"}]',
    });

    expect(tweet.fact_checks).toEqual([
      { claim: 'Affirmation', verdict: 'invérifiable', note: 'Note' },
    ]);
  });

  it('normalizes author, media, quoted tweet and social counters', () => {
    const tweet = normalizeTweet({
      id: '200',
      content: 'Première ligne\nDeuxième ligne',
      posted_at: '2026-11-05T18:51:00Z',
      author: {
        name: 'Sardoche 🇫🇷',
        username: '@Sardoche',
        avatar_url: 'https://pbs.twimg.com/profile.jpg',
        verified: true,
      },
      media: [
        {
          type: 'photo',
          url: 'https://pbs.twimg.com/media/photo.jpg',
          width: '1200',
          height: '800',
          expanded_url: 'https://x.com/Sardoche/status/200/photo/1',
        },
        {
          type: 'video',
          url: 'https://pbs.twimg.com/media/video-thumb.jpg',
          width: 0,
          height: null,
        },
        { url: '' },
      ],
      quoted_tweet: {
        id: 'q1',
        content: 'Un tweet cité',
        author: {
          name: 'Quelqu’un',
          username: 'someone',
          avatar_url: 'https://pbs.twimg.com/other.jpg',
          verified: false,
        },
        media: [
          {
            type: 'animated_gif',
            url: 'https://pbs.twimg.com/media/gif.jpg',
          },
        ],
      },
      replies: '12',
      views: '17000',
    });

    expect(tweet.content).toBe('Première ligne\nDeuxième ligne');
    expect(tweet.author).toEqual({
      name: 'Sardoche 🇫🇷',
      username: 'Sardoche',
      avatar_url: 'https://pbs.twimg.com/profile.jpg',
      verified: true,
    });
    expect(tweet.media).toHaveLength(2);
    expect(tweet.media[0]).toMatchObject({
      type: 'photo',
      width: 1200,
      height: 800,
    });
    expect(tweet.media[1]).toMatchObject({
      type: 'video',
      width: null,
      height: null,
    });
    expect(tweet.quoted_tweet).toMatchObject({
      id: 'q1',
      content: 'Un tweet cité',
      author: { username: 'someone', verified: false },
    });
    expect(tweet.quoted_tweet.media[0].type).toBe('animated_gif');
    expect(tweet.replies).toBe(12);
    expect(tweet.views).toBe(17000);
  });

  it('defaults missing analysis and embed fields without throwing', () => {
    const tweet = normalizeTweet({ id: 3, content: 'Sans analyse' });

    expect(tweet.bullshit_score).toBeNull();
    expect(tweet.verdict).toBeNull();
    expect(tweet.reasoning).toBe('');
    expect(tweet.humor_comment).toBe('');
    expect(tweet.fact_checks).toEqual([]);
    expect(tweet.author).toBeNull();
    expect(tweet.media).toEqual([]);
    expect(tweet.quoted_tweet).toBeNull();
    expect(tweet.replies).toBe(0);
    expect(tweet.views).toBe(0);
    expect(tweet.analyzed).toBe(false);
  });

  it('tolerates a malformed fact_checks payload', () => {
    expect(normalizeFactChecks('{not json')).toEqual([]);
    expect(normalizeFactChecks(null)).toEqual([]);
    expect(normalizeFactChecks(['Une affirmation'])).toEqual([
      { claim: 'Une affirmation', verdict: 'invérifiable', note: '' },
    ]);
  });
});

describe('score and verdict helpers', () => {
  it('clamps scores to 0-100', () => {
    expect(normalizeScore(-12)).toBe(0);
    expect(normalizeScore(150)).toBe(100);
    expect(normalizeScore('42')).toBe(42);
    expect(normalizeScore('nope', 7)).toBe(7);
  });

  it('normalizes verdicts case/accent-insensitively', () => {
    expect(normalizeVerdict('vrai')).toBe('VRAI');
    expect(normalizeVerdict('  Chaud-Bouillant ')).toBe('CHAUD BOUILLANT');
    expect(normalizeVerdict('DOUTEUX')).toBe('DOUTEUX');
    expect(normalizeVerdict('faux')).toBe('BULLSHIT');
    expect(normalizeVerdict('inconnu')).toBe('DOUTEUX');
  });
});

describe('periods and search', () => {
  it('filters day=1, week=2, month=3 and all=4', () => {
    expect(filterByPeriod(TWEETS, 'day', NOW)).toHaveLength(1);
    expect(filterByPeriod(TWEETS, 'week', NOW)).toHaveLength(2);
    expect(filterByPeriod(TWEETS, 'month', NOW)).toHaveLength(3);
    expect(filterByPeriod(TWEETS, 'all', NOW)).toHaveLength(4);
  });

  it('returns a copy for the all period', () => {
    const all = filterByPeriod(TWEETS, 'all', NOW);
    expect(all).not.toBe(TWEETS);
    expect(all).toHaveLength(TWEETS.length);
  });

  it('ignores tweets without a valid date when a period is selected', () => {
    const tweets = [
      ...TWEETS,
      { id: 'invalid', posted_at: 'pas-une-date' },
      { id: 'missing', posted_at: null },
    ];

    expect(filterByPeriod(tweets, 'week', NOW)).toHaveLength(2);
    expect(filterByPeriod(tweets, 'all', NOW)).toHaveLength(6);
  });

  it('matches queries across content, verdict and analysis text', () => {
    const tweet = {
      content: 'Des pâtes au pesto',
      verdict: 'BULLSHIT',
      reasoning: 'Analyse factuelle',
      humor_comment: 'Une chute',
    };

    expect(matchesQuery(tweet, '')).toBe(true);
    expect(matchesQuery(tweet, 'PESTO')).toBe(true);
    expect(matchesQuery(tweet, 'bullshit')).toBe(true);
    expect(matchesQuery(tweet, 'factuelle')).toBe(true);
    expect(matchesQuery(tweet, 'chute')).toBe(true);
    expect(matchesQuery(tweet, 'nft')).toBe(false);
    expect(matchesQuery(null, 'test')).toBe(false);
  });
});

describe('stats and bullshitmetre normalization', () => {
  it('coerces backend stats string percentages to numbers', () => {
    const stats = normalizeStats(
      {
        avgScore: '54.43',
        minScore: '8',
        maxScore: '94.00',
        totalAnalyzed: 8,
        verdictDistribution: {
          VRAI: { count: 2, percentage: '25.00' },
          DOUTEUX: { count: 2, percentage: '25.00' },
          BULLSHIT: { count: 1, percentage: '12.50' },
          'CHAUD BOUILLANT': { count: 3, percentage: '37.50' },
        },
      },
      'all',
    );

    expect(stats).toMatchObject({
      period: 'all',
      totalAnalyzed: 8,
      avgScore: 54.43,
      minScore: 8,
      maxScore: 94,
    });
    expect(stats.verdictDistribution.VRAI).toEqual({
      count: 2,
      percentage: 25,
    });
    expect(stats.verdictDistribution['CHAUD BOUILLANT']).toEqual({
      count: 3,
      percentage: 37.5,
    });
  });

  it('handles an empty stats payload without NaN', () => {
    const stats = normalizeStats(null, 'month');

    expect(stats.period).toBe('month');
    expect(stats.totalAnalyzed).toBe(0);
    expect(stats.avgScore).toBe(0);
    expect(stats.maxScore).toBe(0);
    expect(stats.verdictDistribution.VRAI).toEqual({
      count: 0,
      percentage: 0,
    });
  });

  it('coerces backend bullshitmetre numeric strings', () => {
    const metre = normalizeBullshitmetre(
      {
        globalScore: '54.43',
        level: 'ÉLEVÉ',
        sampleSize: '7',
        timestamp: '2026-06-15T12:00:00.000Z',
      },
      'week',
    );

    expect(metre).toEqual({
      globalScore: 54.43,
      level: 'ÉLEVÉ',
      period: 'week',
      sampleSize: 7,
      timestamp: '2026-06-15T12:00:00.000Z',
    });
  });

  it('derives a level when the backend omits it', () => {
    expect(
      normalizeBullshitmetre({ globalScore: 24, sampleSize: 1 }, 'all').level,
    ).toBe('FAIBLE');
    expect(
      normalizeBullshitmetre({ globalScore: 25, sampleSize: 1 }, 'all').level,
    ).toBe('MODÉRÉ');
    expect(
      normalizeBullshitmetre({ globalScore: 50, sampleSize: 1 }, 'all').level,
    ).toBe('ÉLEVÉ');
    expect(
      normalizeBullshitmetre({ globalScore: 75, sampleSize: 1 }, 'all').level,
    ).toBe('CRITIQUE');
  });

  it('returns a zeroed bullshitmetre for an empty sample', () => {
    const metre = normalizeBullshitmetre({}, 'month');

    expect(metre.globalScore).toBe(0);
    expect(metre.level).toBe('FAIBLE');
    expect(metre.period).toBe('month');
    expect(metre.sampleSize).toBe(0);
    expect(typeof metre.timestamp).toBe('string');
  });
});

describe('pagination', () => {
  const tweets = Array.from({ length: 8 }, (_, index) => ({
    id: String(index + 1),
  }));

  it('paginates page 1/2 with consistent metadata', () => {
    const page1 = paginateTweets(tweets, 1, 5);
    const page2 = paginateTweets(tweets, 2, 5);

    expect(page1.tweets).toHaveLength(5);
    expect(page1.total).toBe(8);
    expect(page1.totalPages).toBe(2);
    expect(page1.pagination).toEqual({
      page: 1,
      limit: 5,
      total: 8,
      totalPages: 2,
      hasNext: true,
      hasPrev: false,
    });

    expect(page2.tweets).toHaveLength(3);
    expect(page2.tweets[0].id).toBe('6');
    expect(page2.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 8,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });
  });

  it('sanitizes invalid page and limit values', () => {
    const result = paginateTweets(tweets, 0, 0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(1);
    expect(result.tweets).toHaveLength(1);
    expect(result.totalPages).toBe(8);
  });
});
