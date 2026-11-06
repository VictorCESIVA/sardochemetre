'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const opencodeService = require('../services/opencodeService');

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

const ANALYSIS = {
  bullshit_score: 62,
  verdict: 'BULLSHIT',
  reasoning: 'Les chiffres avancés ne correspondent à aucune source connue.',
  fact_checks: [
    { claim: 'Le chiffre avancé', verdict: 'faux', note: 'Aucune source.' },
  ],
  humor_comment: 'Le seul chiffre solide, c’est le numéro du tweet.',
};

test('getConfig : payg par défaut, Go supporté et URL normalisée', () => {
  const payg = opencodeService.getConfig({
    OPENCODE_API_KEY: 'oc_sk_test_config',
  });
  assert.deepEqual(payg, {
    apiKey: 'oc_sk_test_config',
    model: 'deepseek-v4.1-flash',
    plan: 'payg',
    baseUrl: 'https://opencode.ai/inference',
    configured: true,
  });

  const go = opencodeService.getConfig({
    OPENCODE_API_KEY: 'oc_sk_test_config',
    OPENCODE_PLAN: 'go',
  });
  assert.equal(go.plan, 'go');
  assert.equal(go.baseUrl, 'https://opencode.ai/inference/go');

  const override = opencodeService.getConfig({
    OPENCODE_API_KEY: 'oc_sk_test_config',
    OPENCODE_MODEL: 'autre-modele',
    OPENCODE_BASE_URL: 'http://127.0.0.1:9999/',
  });
  assert.equal(override.model, 'autre-modele');
  assert.equal(override.baseUrl, 'http://127.0.0.1:9999');
});

test('getStatus : configuré / non configuré, payg et go', () => {
  const unconfigured = opencodeService.getStatus({});
  assert.deepEqual(unconfigured, {
    provider: 'opencode',
    model: 'deepseek-v4.1-flash',
    plan: 'payg',
    configured: false,
    baseUrl: 'https://opencode.ai/inference',
    fallback: 'mock',
  });

  const go = opencodeService.getStatus({
    OPENCODE_API_KEY: 'oc_sk_test_status',
    OPENCODE_PLAN: 'go',
  });
  assert.equal(go.configured, true);
  assert.equal(go.fallback, null);
  assert.equal(go.plan, 'go');
  assert.equal(go.baseUrl, 'https://opencode.ai/inference/go');
  assert.equal(
    opencodeService.buildEndpoint(go.baseUrl),
    'https://opencode.ai/inference/go/openai/v1/chat/completions'
  );
});

test('analyzeTweet : requête et réponse Chat Completions valides', async () => {
  const requests = [];
  const { server, baseUrl } = await startServer(async (req, res) => {
    const raw = await readBody(req);
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: JSON.parse(raw),
    });

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${JSON.stringify(ANALYSIS)}\n\`\`\``,
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          cost: 0.00012,
          opencode: { billing_source: 'go' },
        },
      })
    );
  });

  try {
    const env = {
      OPENCODE_API_KEY: 'oc_sk_test_network',
      OPENCODE_PLAN: 'go',
      OPENCODE_BASE_URL: `${baseUrl}/`,
      OPENCODE_SESSION: 'ses_test_fixed',
    };

    const analysis = await opencodeService.analyzeTweet(
      'Le réchauffement climatique est une invention.',
      { env }
    );

    assert.deepEqual(analysis, ANALYSIS);
    assert.equal(requests.length, 1);

    const request = requests[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/openai/v1/chat/completions');
    assert.equal(
      request.headers.authorization,
      'Bearer oc_sk_test_network'
    );
    assert.equal(request.headers['x-opencode-session'], 'ses_test_fixed');
    assert.match(request.headers['user-agent'], /sardochemetre\/1\.0/);
    assert.equal(request.body.model, 'deepseek-v4.1-flash');
    assert.equal(request.body.temperature, 0.4);
    assert.equal(request.body.max_tokens, 3000);
    assert.equal(request.body.messages.length, 2);
    assert.equal(request.body.messages[0].role, 'system');
    assert.match(request.body.messages[0].content, /SardocheMètre/);
    assert.equal(request.body.messages[1].role, 'user');
    assert.match(
      request.body.messages[1].content,
      /réchauffement climatique/
    );
    assert.equal(opencodeService.getLastError(), null);
  } finally {
    await closeServer(server);
  }
});

test('analyzeTweet : x-opencode-session stable et généré si absent', async () => {
  const sessions = [];
  const { server, baseUrl } = await startServer(async (req, res) => {
    await readBody(req);
    sessions.push(req.headers['x-opencode-session']);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(ANALYSIS) } }],
      })
    );
  });

  try {
    const env = {
      OPENCODE_API_KEY: 'oc_sk_test_session',
      OPENCODE_BASE_URL: baseUrl,
    };

    await opencodeService.analyzeTweet('premier tweet', { env });
    await opencodeService.analyzeTweet('second tweet', { env });

    assert.equal(sessions.length, 2);
    assert.match(sessions[0], /^ses_[a-z0-9]+$/);
    assert.equal(sessions[0], sessions[1]);
  } finally {
    await closeServer(server);
  }
});

test('analyzeTweet : erreur 401 explicite, retour null', async () => {
  const { server, baseUrl } = await startServer(async (req, res) => {
    await readBody(req);
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
  });

  try {
    const apiKey = 'oc_sk_test_invalid';
    const analysis = await opencodeService.analyzeTweet('un tweet', {
      env: { OPENCODE_API_KEY: apiKey, OPENCODE_BASE_URL: baseUrl },
    });

    assert.equal(analysis, null);

    const lastError = opencodeService.getLastError();
    assert.equal(lastError.status, 401);
    assert.equal(lastError.code, 'AI_AUTH_ERROR');
    assert.match(lastError.message, /HTTP 401/);
    assert.match(lastError.message, /Invalid API key/);
    assert.equal(lastError.message.includes(apiKey), false);
  } finally {
    await closeServer(server);
  }
});

test('analyzeTweet : erreur 402 sans crédits, message actionnable', async () => {
  const { server, baseUrl } = await startServer(async (req, res) => {
    await readBody(req);
    res.writeHead(402, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Insufficient account funds' } }));
  });

  try {
    const analysis = await opencodeService.analyzeTweet('un tweet', {
      env: {
        OPENCODE_API_KEY: 'oc_sk_test_no_funds',
        OPENCODE_BASE_URL: baseUrl,
      },
    });

    assert.equal(analysis, null);

    const lastError = opencodeService.getLastError();
    assert.equal(lastError.status, 402);
    assert.match(lastError.message, /HTTP 402/);
    assert.match(lastError.message, /crédits/);
    assert.match(lastError.message, /opencode\.ai\/console/);
    assert.equal(lastError.message.includes('oc_sk_test_no_funds'), false);
  } finally {
    await closeServer(server);
  }
});

test('analyzeTweet : réponse JSON malformée, retour null', async () => {
  const { server, baseUrl } = await startServer(async (req, res) => {
    await readBody(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: 'pas de JSON ici' } }],
      })
    );
  });

  try {
    const analysis = await opencodeService.analyzeTweet('un tweet', {
      env: { OPENCODE_API_KEY: 'oc_sk_test_json', OPENCODE_BASE_URL: baseUrl },
    });

    assert.equal(analysis, null);
    assert.match(opencodeService.getLastError().message, /JSON/);
  } finally {
    await closeServer(server);
  }
});
