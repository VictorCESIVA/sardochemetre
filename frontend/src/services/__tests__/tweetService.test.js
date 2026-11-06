import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  analyzeTweet,
  clearProfileCache,
  getAIStatus,
  getBullshitmetre,
  getProfile,
  getStats,
  getTweetById,
  getTweets,
  searchTweets,
} from '../tweetService';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  clearProfileCache();
});

describe('getTweets', () => {
  it('returns the normalized pagination contract', async () => {
    axios.get.mockResolvedValue({
      data: {
        tweets: [
          {
            id: '1',
            content: 'Un tweet',
            posted_at: '2025-03-28T14:22:00Z',
            likes: 12,
            retweets: 3,
            analysis: {
              bullshit_score: '85',
              verdict: 'chaud bouillant',
              reasoning: 'Une analyse.',
              fact_checks: [],
              humor_comment: 'Une chute.',
            },
          },
        ],
        pagination: {
          page: 2,
          limit: 5,
          total: 8,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        },
      },
    });

    const result = await getTweets(2, 5, 'all');

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tweets$/),
      { params: { page: 2, limit: 5, period: 'all' } },
    );
    expect(result).toMatchObject({
      total: 8,
      page: 2,
      limit: 5,
      totalPages: 2,
    });
    expect(result.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 8,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    });
    expect(result.tweets[0]).not.toHaveProperty('analysis');
    expect(result.tweets[0]).toMatchObject({
      bullshit_score: 85,
      verdict: 'CHAUD BOUILLANT',
      reasoning: 'Une analyse.',
      humor_comment: 'Une chute.',
    });
  });

  it('normalizes the new embed fields from a backend tweet', async () => {
    axios.get.mockResolvedValue({
      data: {
        tweets: [
          {
            id: '200',
            content: 'Un tweet\navec un retour à la ligne',
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
                width: 1200,
                height: 800,
                expanded_url: 'https://x.com/Sardoche/status/200/photo/1',
              },
            ],
            quoted_tweet: {
              id: 'q1',
              content: 'Citation',
              author: {
                name: 'Quelqu’un',
                username: 'someone',
                avatar_url: 'https://pbs.twimg.com/other.jpg',
                verified: false,
              },
              media: [],
            },
            replies: '7',
            views: '125000',
            bullshit_score: 62,
            verdict: 'BULLSHIT',
          },
        ],
        pagination: { total: 1, totalPages: 1 },
      },
    });

    const result = await getTweets();

    expect(result.tweets[0]).toMatchObject({
      id: '200',
      views: 125000,
      replies: 7,
      author: {
        name: 'Sardoche 🇫🇷',
        username: 'Sardoche',
        verified: true,
      },
    });
    expect(result.tweets[0].content).toContain('\n');
    expect(result.tweets[0].media[0]).toMatchObject({
      type: 'photo',
      width: 1200,
      height: 800,
    });
    expect(result.tweets[0].quoted_tweet).toMatchObject({
      id: 'q1',
      content: 'Citation',
      author: { username: 'someone' },
    });
  });

  it('passes the trimmed search query and period to the list endpoint', async () => {
    axios.get.mockResolvedValue({
      data: { tweets: [], pagination: { total: 0, totalPages: 0 } },
    });

    await getTweets(1, 12, 'week', '  pesto  ');

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tweets$/),
      {
        params: {
          page: 1,
          limit: 12,
          period: 'week',
          q: 'pesto',
        },
      },
    );
  });

  it('derives pagination metadata when the backend omits it', async () => {
    axios.get.mockResolvedValue({
      data: {
        tweets: [{ id: '1', content: 'Un tweet' }, { id: '2', content: 'Deux' }],
        total: 2,
      },
    });

    const result = await getTweets(1, 12, 'all');

    expect(result).toMatchObject({
      total: 2,
      page: 1,
      limit: 12,
      totalPages: 1,
    });
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('propagates a readable backend error', async () => {
    axios.get.mockRejectedValue({
      response: {
        status: 500,
        data: { error: 'Base de données indisponible' },
      },
    });

    await expect(getTweets()).rejects.toMatchObject({
      message: 'Base de données indisponible',
      status: 500,
    });
  });

  it('explains an unreachable backend', async () => {
    axios.get.mockRejectedValue({
      request: {},
      message: 'Network Error',
    });

    await expect(getTweets()).rejects.toThrow(
      'Impossible de joindre le backend. Vérifiez qu’il est démarré.',
    );
  });
});

describe('getTweetById', () => {
  it('returns a flat tweet from the detail endpoint', async () => {
    axios.get.mockResolvedValue({
      data: {
        tweet: {
          id: '3',
          content: 'Mon setup',
          posted_at: '2024-01-01T10:00:00Z',
          likes: 10,
          retweets: 2,
          bullshit_score: 76,
          verdict: 'BULLSHIT',
          reasoning: 'Une analyse.',
          fact_checks: [],
          humor_comment: '',
        },
      },
    });

    const tweet = await getTweetById('3');

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tweets\/3$/),
    );
    expect(tweet).toMatchObject({
      id: '3',
      content: 'Mon setup',
      bullshit_score: 76,
      verdict: 'BULLSHIT',
    });
  });

  it('keeps the HTTP status on a 404', async () => {
    axios.get.mockRejectedValue({
      response: { status: 404, data: { error: 'Tweet not found' } },
    });

    await expect(getTweetById('999')).rejects.toMatchObject({
      message: 'Tweet not found',
      status: 404,
    });
  });
});

describe('getStats and getBullshitmetre', () => {
  it('requests and normalizes stats for the period', async () => {
    axios.get.mockResolvedValue({
      data: {
        period: 'week',
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
    });

    const stats = await getStats('week');

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tweets\/stats$/),
      { params: { period: 'week' } },
    );
    expect(stats).toMatchObject({
      period: 'week',
      totalAnalyzed: 8,
      avgScore: 54.43,
      maxScore: 94,
    });
    expect(stats.verdictDistribution['CHAUD BOUILLANT']).toEqual({
      count: 3,
      percentage: 37.5,
    });
  });

  it('requests and normalizes the global score', async () => {
    axios.get.mockResolvedValue({
      data: {
        globalScore: '54.43',
        level: 'ÉLEVÉ',
        sampleSize: '7',
        timestamp: '2026-06-15T12:00:00.000Z',
      },
    });

    const metre = await getBullshitmetre('week');

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tweets\/bullshitmetre$/),
      { params: { period: 'week' } },
    );
    expect(metre).toEqual({
      globalScore: 54.43,
      level: 'ÉLEVÉ',
      period: 'week',
      sampleSize: 7,
      timestamp: '2026-06-15T12:00:00.000Z',
    });
  });
});

describe('getProfile', () => {
  it('fetches, normalizes and caches the profile in memory', async () => {
    axios.get.mockResolvedValue({
      data: {
        profile: {
          username: '@Sardoche',
          name: 'Sardoche 🇫🇷',
          avatar_url: 'https://pbs.twimg.com/profile_images/sardoche.jpg',
          verified: true,
          followers: '123456',
          updated_at: '2026-11-06T10:00:00.000Z',
        },
      },
    });

    const first = await getProfile();
    const second = await getProfile();

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/profile$/),
    );
    expect(first).toMatchObject({
      username: 'Sardoche',
      name: 'Sardoche 🇫🇷',
      avatar_url: 'https://pbs.twimg.com/profile_images/sardoche.jpg',
      verified: true,
      followers: 123456,
      updated_at: '2026-11-06T10:00:00.000Z',
    });
    expect(second).toBe(first);
  });

  it('falls back to the local Sardoche profile when the endpoint is unavailable', async () => {
    axios.get.mockRejectedValue({
      response: { status: 404, data: { error: 'Route not found' } },
    });

    await expect(getProfile()).resolves.toMatchObject({
      name: 'Sardoche 🇫🇷',
      username: 'Sardoche',
      avatar_url: '/sardoche-avatar.jpg',
      verified: true,
    });
  });
});

describe('AI status and analysis', () => {
  it('fetches the AI provider status from the backend', async () => {
    const status = {
      provider: 'opencode',
      model: 'deepseek-v4.1-flash',
      configured: true,
      fallback: null,
      plan: 'go',
    };
    axios.get.mockResolvedValue({ data: status });

    await expect(getAIStatus()).resolves.toEqual(status);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/ai\/status$/),
    );
  });

  it('propagates AI status network failures so the UI can ignore them', async () => {
    axios.get.mockRejectedValue(new Error('Network Error'));

    await expect(getAIStatus()).rejects.toThrow('Network Error');
  });

  it('persists an analysis through /api/tweets/analyze', async () => {
    axios.post.mockResolvedValue({
      data: {
        tweet: {
          id: '3',
          content: 'Un tweet à vérifier',
          bullshit_score: 42,
          verdict: 'DOUTEUX',
          reasoning: 'Analyse persistée.',
          fact_checks: [
            { claim: 'Une affirmation', verdict: 'faux', note: 'Une note' },
          ],
          humor_comment: 'Punchline.',
        },
      },
    });

    const analyzed = await analyzeTweet({
      id: '3',
      content: 'Un tweet à vérifier',
      likes: 4,
      retweets: 1,
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tweets\/analyze$/),
      { content: 'Un tweet à vérifier', tweet_id: '3' },
    );
    expect(analyzed).toMatchObject({
      id: '3',
      content: 'Un tweet à vérifier',
      bullshit_score: 42,
      verdict: 'DOUTEUX',
      reasoning: 'Analyse persistée.',
      humor_comment: 'Punchline.',
      analyzed: true,
    });
    expect(analyzed.analyzed_at).toEqual(expect.any(String));
  });

  it('merges a bare analysis payload with the original tweet', async () => {
    axios.post.mockResolvedValue({
      data: {
        analysis: {
          bullshit_score: 67,
          verdict: 'BULLSHIT',
          reasoning: 'Analyse brute.',
          fact_checks: [],
          humor_comment: 'Chute.',
        },
      },
    });

    const analyzed = await analyzeTweet({
      id: '4',
      content: 'Un tweet sans ligne en base',
      posted_at: '2023-09-01T08:00:00Z',
      likes: 9,
      retweets: 1,
    });

    expect(analyzed).toMatchObject({
      id: '4',
      content: 'Un tweet sans ligne en base',
      posted_at: '2023-09-01T08:00:00Z',
      bullshit_score: 67,
      verdict: 'BULLSHIT',
    });
  });

  it('propagates the backend error message, code and status', async () => {
    axios.post.mockRejectedValue({
      response: {
        status: 503,
        data: {
          error:
            'Clé OpenCode non configurée. Ajoutez OPENCODE_API_KEY dans backend/.env.',
          code: 'AI_NOT_CONFIGURED',
        },
      },
    });

    await expect(
      analyzeTweet({ id: '1', content: 'Un tweet' }),
    ).rejects.toMatchObject({
      message:
        'Clé OpenCode non configurée. Ajoutez OPENCODE_API_KEY dans backend/.env.',
      code: 'AI_NOT_CONFIGURED',
      status: 503,
    });
  });

  it('propagates a rate limit rejection', async () => {
    axios.post.mockRejectedValue({
      response: {
        status: 429,
        data: {
          error: 'Trop de requêtes d’analyse. Réessayez plus tard.',
          code: 'RATE_LIMITED',
          retryAfter: 42,
        },
      },
    });

    await expect(
      analyzeTweet({ id: '1', content: 'Un tweet' }),
    ).rejects.toMatchObject({
      message: 'Trop de requêtes d’analyse. Réessayez plus tard.',
      code: 'RATE_LIMITED',
      status: 429,
    });
  });

  it('exposes a clear message when the backend is unreachable', async () => {
    axios.post.mockRejectedValue({
      request: {},
      message: 'Network Error',
    });

    await expect(
      analyzeTweet({ id: '1', content: 'Un tweet' }),
    ).rejects.toThrow(
      'Impossible de joindre le backend. Vérifiez qu’il est démarré.',
    );
  });

  it('rejects an empty tweet before calling the backend', async () => {
    await expect(analyzeTweet({ id: '1', content: '   ' })).rejects.toThrow(
      'Invalid tweet: content is required',
    );
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('searchTweets', () => {
  it('returns normalized tweets from the search endpoint', async () => {
    axios.get.mockResolvedValue({
      data: {
        tweets: [
          {
            id: '7',
            content: 'Linux',
            bullshit_score: 8,
            verdict: 'VRAI',
          },
        ],
      },
    });

    const results = await searchTweets('  Linux  ');

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tweets\/search$/),
      { params: { q: 'Linux' } },
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: '7',
      verdict: 'VRAI',
      bullshit_score: 8,
    });
  });

  it('does not call the API for an empty query', async () => {
    await expect(searchTweets('   ')).resolves.toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('wraps search failures with a readable message', async () => {
    axios.get.mockRejectedValue({
      response: { status: 500, data: { error: 'Recherche indisponible' } },
    });

    await expect(searchTweets('test')).rejects.toMatchObject({
      message: 'Recherche indisponible',
      status: 500,
    });
  });
});
