'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const DB_PATH = path.join(
  os.tmpdir(),
  `sardochemetre-ai-${process.pid}-${Date.now()}.db`
);

process.env.SQLITE_PATH = DB_PATH;
process.env.DB_CLIENT = 'sqlite';
process.env.DEMO_MODE = 'true';
process.env.TWITTER_SOURCE = 'mock';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = '*';
process.env.AI_PROVIDER = 'opencode';
process.env.OPENCODE_MODEL = 'deepseek-v4.1-flash';
process.env.OPENCODE_PLAN = 'payg';
delete process.env.OPENCODE_API_KEY;
delete process.env.OPENCODE_BASE_URL;
delete process.env.OPENCODE_SESSION;
delete process.env.ANTHROPIC_API_KEY;

const createApp = require('../app');
const repo = require('../db/sqlite');
const { generateMockAnalysis } = require('../services/claudeService');

let server;
let base;

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${base}${url}`, { ...options, headers });
  const text = await response.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

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
    const fake = http.createServer(handler);
    fake.once('error', reject);
    fake.listen(0, '127.0.0.1', () => {
      resolve({
        server: fake,
        baseUrl: `http://127.0.0.1:${fake.address().port}`,
      });
    });
  });
}

function closeServer(fake) {
  return new Promise((resolve) => {
    fake.close(resolve);
    if (typeof fake.closeIdleConnections === 'function') {
      fake.closeIdleConnections();
    }
  });
}

function setEnv(values) {
  const saved = {};
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return saved;
}

function restoreEnv(saved) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const REAL_ANALYSIS = {
  bullshit_score: 27,
  verdict: 'DOUTEUX',
  reasoning: 'Le tweet exagère une étude réelle.',
  fact_checks: [{ claim: 'Une étude', verdict: 'discutable', note: 'Partielle.' }],
  humor_comment: 'C’est à moitié vrai, comme la moitié des tweets.',
};

before(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
    });
  }

  repo.closeDatabase();

  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${DB_PATH}${suffix}`);
    } catch {
      // fichier déjà absent
    }
  }
});

test('GET /health expose le statut IA sans clé', async () => {
  const { status, body } = await request('/health');

  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.mode, 'demo');
  assert.equal(body.database, 'sqlite');
  assert.deepEqual(body.ai, {
    provider: 'opencode',
    model: 'deepseek-v4.1-flash',
    configured: false,
  });
  assert.equal(JSON.stringify(body).includes('oc_sk_'), false);
});

test('GET /api/ai/status : provider OpenCode non configuré', async () => {
  const { status, body } = await request('/api/ai/status');

  assert.equal(status, 200);
  assert.deepEqual(body, {
    provider: 'opencode',
    model: 'deepseek-v4.1-flash',
    configured: false,
    fallback: 'mock',
    plan: 'payg',
  });
  assert.equal(JSON.stringify(body).includes('oc_sk_'), false);
});

test('POST /api/ai/analyze : 503 sans clé OpenCode', async () => {
  const { status, body } = await request('/api/ai/analyze', {
    method: 'POST',
    body: JSON.stringify({ content: 'Un tweet à analyser.' }),
  });

  assert.equal(status, 503);
  assert.deepEqual(body, {
    error:
      'Clé OpenCode non configurée. Ajoutez OPENCODE_API_KEY dans backend/.env.',
    code: 'AI_NOT_CONFIGURED',
  });
});

test('POST /api/ai/analyze : 400 sur contenu invalide', async () => {
  const cases = [
    {},
    { content: '' },
    { content: '   ' },
    { content: 42 },
    { content: 'x'.repeat(1001) },
  ];

  for (const payload of cases) {
    const { status, body } = await request('/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    assert.equal(status, 400);
    assert.match(body.error, /content/);
  }
});

test('POST /api/ai/analyze : 200 avec un serveur OpenCode local', async () => {
  const requests = [];
  const { server: fake, baseUrl } = await startServer(async (req, res) => {
    const raw = await readBody(req);
    requests.push({
      url: req.url,
      headers: req.headers,
      body: JSON.parse(raw),
    });

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify(REAL_ANALYSIS) } },
        ],
        usage: { cost: 0.00002, opencode: { billing_source: 'payg' } },
      })
    );
  });

  const saved = setEnv({
    OPENCODE_API_KEY: 'oc_sk_test_api',
    OPENCODE_BASE_URL: baseUrl,
    OPENCODE_SESSION: 'ses_test_api',
  });

  try {
    const { status, body } = await request('/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ content: 'Le tweet à analyser.' }),
    });

    assert.equal(status, 200);
    assert.deepEqual(body, {
      analysis: REAL_ANALYSIS,
      provider: 'opencode',
      model: 'deepseek-v4.1-flash',
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/openai/v1/chat/completions');
    assert.equal(
      requests[0].headers.authorization,
      'Bearer oc_sk_test_api'
    );
    assert.equal(requests[0].headers['x-opencode-session'], 'ses_test_api');
    assert.equal(requests[0].body.model, 'deepseek-v4.1-flash');
    assert.match(requests[0].body.messages[1].content, /Le tweet à analyser/);
  } finally {
    restoreEnv(saved);
    await closeServer(fake);
  }
});

test('POST /api/ai/analyze : 502 quand le provider échoue', async () => {
  const { server: fake, baseUrl } = await startServer(async (req, res) => {
    await readBody(req);
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
  });

  const saved = setEnv({
    OPENCODE_API_KEY: 'oc_sk_test_bad',
    OPENCODE_BASE_URL: baseUrl,
  });

  try {
    const { status, body } = await request('/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ content: 'Un tweet.' }),
    });

    assert.equal(status, 502);
    assert.equal(body.code, 'AI_PROVIDER_ERROR');
    assert.match(body.error, /^Le provider IA a échoué : HTTP 401/);
    assert.match(body.error, /Invalid API key/);
  } finally {
    restoreEnv(saved);
    await closeServer(fake);
  }
});

test('POST /api/tweets/analyze : repli mock sans clé', async () => {
  const content = 'Les licornes existent, ma source est mon voisin.';
  const saved = setEnv({
    OPENCODE_API_KEY: undefined,
    OPENCODE_BASE_URL: undefined,
  });

  try {
    const first = await request('/api/tweets/analyze', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    const second = await request('/api/tweets/analyze', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });

    assert.equal(first.status, 200);
    assert.deepEqual(first.body, { analysis: generateMockAnalysis(content) });
    assert.deepEqual(second.body, first.body);
  } finally {
    restoreEnv(saved);
  }
});
