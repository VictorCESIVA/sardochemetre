'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DB_PATH = path.join(
  os.tmpdir(),
  `sardochemetre-auth-${process.pid}-${Date.now()}.db`
);

process.env.SQLITE_PATH = DB_PATH;
process.env.DB_CLIENT = 'sqlite';
process.env.DEMO_MODE = 'true';
process.env.TWITTER_SOURCE = 'mock';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = '*';
process.env.ANALYZE_API_KEY = 'test-secret';
process.env.AI_PROVIDER = 'opencode';
delete process.env.OPENCODE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const createApp = require('../app');
const { createAnalysisAuth } = require('../middleware/analysisAuth');

let server;
let base;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(DB_PATH, { force: true });
  for (const suffix of ['-shm', '-wal']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

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
  return { status: response.status, body, headers: response.headers };
}

test('GET /api/ai/status expose analysisProtected sans la clé', async () => {
  const { status, body } = await request('/api/ai/status');

  assert.equal(status, 200);
  assert.equal(body.analysisProtected, true);
  assert.equal(JSON.stringify(body).includes('test-secret'), false);
});

test('POST /api/tweets/analyze : 401 sans clé ou avec une clé invalide', async () => {
  const missing = await request('/api/tweets/analyze', {
    method: 'POST',
    body: JSON.stringify({ content: 'Un tweet.' }),
  });
  assert.equal(missing.status, 401);
  assert.equal(missing.body.code, 'ANALYSIS_AUTH_REQUIRED');
  assert.equal(
    missing.headers.get('www-authenticate'),
    'Bearer realm="analysis"'
  );

  const invalid = await request('/api/tweets/analyze', {
    method: 'POST',
    headers: { authorization: 'Bearer wrong-secret' },
    body: JSON.stringify({ content: 'Un tweet.' }),
  });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.code, 'ANALYSIS_AUTH_REQUIRED');
});

test('POST /api/tweets/analyze : accepte Bearer et x-analyze-key', async () => {
  const payload = JSON.stringify({ content: 'Un tweet.' });

  const bearer = await request('/api/tweets/analyze', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
    body: payload,
  });
  assert.equal(bearer.status, 200);
  assert.equal(typeof bearer.body.analysis.bullshit_score, 'number');

  const header = await request('/api/tweets/analyze', {
    method: 'POST',
    headers: { 'x-analyze-key': 'test-secret' },
    body: payload,
  });
  assert.equal(header.status, 200);
  assert.equal(typeof header.body.analysis.bullshit_score, 'number');
});

test('POST /api/ai/analyze est protégée par la même clé', async () => {
  const payload = JSON.stringify({ content: 'Un tweet.' });

  const denied = await request('/api/ai/analyze', {
    method: 'POST',
    body: payload,
  });
  assert.equal(denied.status, 401);
  assert.equal(denied.body.code, 'ANALYSIS_AUTH_REQUIRED');

  const allowed = await request('/api/ai/analyze', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
    body: payload,
  });
  assert.equal(allowed.status, 503);
  assert.equal(allowed.body.code, 'AI_NOT_CONFIGURED');
});

test('createAnalysisAuth : sans ANALYZE_API_KEY, laisse passer', () => {
  let called = false;
  const middleware = createAnalysisAuth({});
  middleware(
    { get: () => '' },
    {},
    () => {
      called = true;
    }
  );
  assert.equal(called, true);
});
