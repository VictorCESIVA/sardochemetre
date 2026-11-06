'use strict';

const express = require('express');
const repo = require('../db/sqlite');
const { normalizePeriod } = require('../db/periods');
const { analyzeTweet } = require('../services/aiService');

function readString(value) {
  return typeof value === 'string' ? value : '';
}

function createTweetsRouter() {
  const router = express.Router();

  function readPeriod(req, res) {
    const period = normalizePeriod(req.query.period || 'all');
    if (!period) {
      res.status(400).json({
        error: 'Invalid period. Must be one of: day, week, month, all',
      });
      return null;
    }
    return period;
  }

  // GET /api/tweets — liste paginée des tweets analysés
  router.get('/', (req, res, next) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;

      const result = repo.listTweets({
        page: req.query.page,
        limit: req.query.limit,
        period,
        q: readString(req.query.q),
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/stats — statistiques par période
  router.get('/stats', (req, res, next) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;

      res.json(repo.getStats(period));
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/bullshitmetre — score global par période
  router.get('/bullshitmetre', (req, res, next) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;

      res.json(repo.getBullshitmetre(period));
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/search?q=... — recherche plein texte simple
  router.get('/search', (req, res, next) => {
    try {
      res.json(repo.searchTweets(readString(req.query.q)));
    } catch (error) {
      next(error);
    }
  });

  // POST /api/tweets/analyze — analyse à la demande
  router.post('/analyze', async (req, res, next) => {
    try {
      const body = req.body || {};
      const content = body.content;

      if (
        typeof content !== 'string' ||
        content.trim().length === 0 ||
        content.length > 1000
      ) {
        return res.status(400).json({
          error:
            'content est requis : chaîne non vide de 1000 caractères maximum',
        });
      }

      const analysis = await analyzeTweet(content);
      if (!analysis) {
        return res.status(500).json({ error: 'Analysis failed' });
      }

      const tweetId =
        body.tweet_id === undefined || body.tweet_id === null
          ? ''
          : String(body.tweet_id).trim();

      if (tweetId) {
        const existing = repo.getTweetById(tweetId);
        if (existing) {
          const tweet = repo.upsertAnalysis(tweetId, analysis);
          return res.json({ tweet });
        }
      }

      res.json({ analysis });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/tweets/:id — détail d'un tweet (après les routes fixes)
  router.get('/:id', (req, res, next) => {
    try {
      const tweet = repo.getTweetById(req.params.id);
      if (!tweet) {
        return res.status(404).json({ error: 'Tweet not found' });
      }
      res.json({ tweet });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createTweetsRouter;
module.exports.createTweetsRouter = createTweetsRouter;
