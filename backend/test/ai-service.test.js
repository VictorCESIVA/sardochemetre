'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const aiService = require('../services/aiService');
const { generateMockAnalysis } = require('../services/claudeService');

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });
}

function startServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
  });
}

const REAL_ANALYSIS = {
  bullshit_score: 15,
  verdict: 'VRAI',
  reasoning: 'Affirmation plausible et sourcée.',
  fact_checks: [{ claim: 'Le fait', verdict: 'vrai', note: 'Source connue.' }],
  humor_comment: 'Même un arbitre VAR aurait validé.',
};

function chatCompletion(analysis = REAL_ANALYSIS) {
  return JSON.stringify({
    choices: [{ message: { content: JSON.stringify(analysis) } }],
    usage: { cost: 0.00001, opencode: { billing_source: 'payg' } },
  });
}

test('resolveProvider : OpenCode prioritaire, Anthropic puis mock', () => {
  const both = aiService.resolveProvider({
    OPENCODE_API_KEY: 'oc_sk_test_priority',
    ANTHROPIC_API_KEY: 'sk-ant-test',
  });
  assert.equal(both.provider, 'opencode');
  assert.equal(both.configured, true);
  assert.equal(both.model, 'deepseek-v4.1-flash');
  assert.equal(both.fallback, null);
  assert.equal(both.plan, 'payg');

  const anthropic = aiService.resolveProvider({
    ANTHROPIC_API_KEY: 'sk-ant-test',
  });
  assert.equal(anthropic.provider, 'anthropic');
  assert.equal(anthropic.configured, true);
  assert.equal(anthropic.model, 'claude-sonnet-4-20250514');
  assert.equal(anthropic.fallback, null);

  const mock = aiService.resolveProvider({});
  assert.deepEqual(mock, {
    provider: 'mock',
    model: 'mock',
    configured: false,
    fallback: 'mock',
  });
});

test('resolveProvider : AI_PROVIDER explicite, clé manquante non configurée', () => {
  const explicitMock = aiService.resolveProvider({
    AI_PROVIDER: 'mock',
    OPENCODE_API_KEY: 'oc_sk_test_ignored',
  });
  assert.equal(explicitMock.provider, 'mock');

  const opencodeMissing = aiService.resolveProvider({
    AI_PROVIDER: 'opencode',
  });
  assert.equal(opencodeMissing.provider, 'opencode');
  assert.equal(opencodeMissing.configured, false);
  assert.equal(opencodeMissing.fallback, 'mock');
  assert.equal(opencodeMissing.model, 'deepseek-v4.1-flash');

  const anthropicMissing = aiService.resolveProvider({
    AI_PROVIDER: 'anthropic',
  });
  assert.equal(anthropicMissing.provider, 'anthropic');
  assert.equal(anthropicMissing.configured, false);
  assert.equal(anthropicMissing.fallback, 'mock');

  const opencodeExplicit = aiService.resolveProvider({
    AI_PROVIDER: 'opencode',
    OPENCODE_API_KEY: 'oc_sk_test_explicit',
    OPENCODE_PLAN: 'go',
  });
  assert.equal(opencodeExplicit.provider, 'opencode');
  assert.equal(opencodeExplicit.plan, 'go');
  assert.equal(opencodeExplicit.configured, true);
});

test('analyzeTweet : repli mock sans clé, même hors DEMO_MODE', async () => {
  const content = 'Les licornes existent, ma source est mon voisin.';

  const analysis = await aiService.analyzeTweet(content, {
    env: { DEMO_MODE: 'false' },
  });
  assert.deepEqual(analysis, generateMockAnalysis(content));

  const demo = await aiService.analyzeTweet(content, {
    env: { DEMO_MODE: 'true' },
  });
  assert.deepEqual(demo, generateMockAnalysis(content));
});

test('analyzeTweet : DEMO_MODE=true n’empêche pas l’appel OpenCode', async () => {
  const { server, baseUrl } = await startServer(async (req, res) => {
    await readBody(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(chatCompletion());
  });

  try {
    const analysis = await aiService.analyzeTweet('Le fait est vrai.', {
      env: {
        DEMO_MODE: 'true',
        OPENCODE_API_KEY: 'oc_sk_test_demo',
        OPENCODE_BASE_URL: baseUrl,
      },
    });

    assert.deepEqual(analysis, REAL_ANALYSIS);
  } finally {
    await closeServer(server);
  }
});

test('analyzeWithRealProvider : refuse le mock avec AI_NOT_CONFIGURED', async () => {
  await assert.rejects(
    aiService.analyzeWithRealProvider('un tweet', { env: {} }),
    (error) => {
      assert.equal(error.code, 'AI_NOT_CONFIGURED');
      assert.equal(error.status, 503);
      assert.match(error.message, /OPENCODE_API_KEY/);
      return true;
    }
  );

  await assert.rejects(
    aiService.analyzeWithRealProvider('un tweet', {
      env: { AI_PROVIDER: 'opencode', OPENCODE_API_KEY: '' },
    }),
    (error) => {
      assert.equal(error.code, 'AI_NOT_CONFIGURED');
      return true;
    }
  );
});

test('analyzeWithRealProvider : succès OpenCode et erreur provider typée', async () => {
  let fail = false;
  const { server, baseUrl } = await startServer(async (req, res) => {
    await readBody(req);

    if (fail) {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(chatCompletion());
  });

  const env = {
    OPENCODE_API_KEY: 'oc_sk_test_real',
    OPENCODE_BASE_URL: baseUrl,
  };

  try {
    const analysis = await aiService.analyzeWithRealProvider('un tweet', {
      env,
    });
    assert.deepEqual(analysis, REAL_ANALYSIS);

    fail = true;
    await assert.rejects(
      aiService.analyzeWithRealProvider('un tweet', { env }),
      (error) => {
        assert.equal(error.code, 'AI_PROVIDER_ERROR');
        assert.equal(error.status, 502);
        assert.match(error.message, /HTTP 429/);
        assert.match(error.message, /Rate limit exceeded/);
        return true;
      }
    );
  } finally {
    await closeServer(server);
  }
});
