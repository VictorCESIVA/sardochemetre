'use strict';

const express = require('express');
const aiService = require('../services/aiService');

function createAiRouter() {
  const router = express.Router();

  // GET /api/ai/status — configuration active, sans appel réseau ni clé
  router.get('/status', (req, res) => {
    res.json(aiService.getStatus());
  });

  // POST /api/ai/analyze — IA réelle uniquement (503 sans clé)
  router.post('/analyze', async (req, res) => {
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

    try {
      const analysis = await aiService.analyzeWithRealProvider(content);
      const status = aiService.getStatus();

      return res.json({
        analysis,
        provider: status.provider,
        model: status.model,
      });
    } catch (error) {
      if (error.code === 'AI_NOT_CONFIGURED') {
        return res.status(503).json({
          error: error.message,
          code: 'AI_NOT_CONFIGURED',
        });
      }

      console.error('[AI] Analyse en échec :', error.message);
      return res.status(502).json({
        error: `Le provider IA a échoué : ${error.message}`,
        code: 'AI_PROVIDER_ERROR',
      });
    }
  });

  return router;
}

module.exports = createAiRouter;
module.exports.createAiRouter = createAiRouter;
