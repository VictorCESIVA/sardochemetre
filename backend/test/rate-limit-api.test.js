'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DB_PATH = path.join(
  os.tmpdir(),
  `sardochemetre-rate-limit-${process.pid}-${Date.now()}.db`
);

process.env.SQLITE_PATH = DB_PATH;
process.env.DB_CLIENT = 'sqlite';
process.env.DEMO_MODE = 'true';
process.env.TWITTER_SOURCE = 'mock';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = '*';
process.env.ANALYZE_RATE_LIMIT = '2';
process.env.ANALYZE_RATE_WINDOW_MS = '60000';
process.env.TRUST_PROXY = '1';
delete process.env.OPENCODE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_PROVIDER;

const createApp = require('../app');
const repo = require('../db/sqlite');

let server;
let base;

async function request(url, { ip = '203.0.113.10', body } = {}) {
  const headers = { 'x-forwarded-for': ip };
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${base}${url}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return {
    status: response.status,
    body: parsed,
    headers: Object.fromEntries(response.headers),
  };
}

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

test('POST /api/tweets/analyze : limite par IP et en-têtes RateLimit', async () => {
  const first = await request('/api/tweets/analyze', {
    body: { content: 'Premier tweet à analyser.' },
  });
  assert.equal(first.status, 200);
  assert.equal(first.headers['ratelimit-limit'], '2');
  assert.equal(first.headers['ratelimit-remaining'], '1');

  const second = await request('/api/tweets/analyze', {
    body: { content: 'Deuxième tweet à analyser.' },
  });
  assert.equal(second.status, 200);
  assert.equal(second.headers['ratelimit-remaining'], '0');

  const third = await request('/api/tweets/analyze', {
    body: { content: 'Troisième tweet à analyser.' },
  });
  assert.equal(third.status, 429);
  assert.equal(third.body.code, 'RATE_LIMITED');
  assert.ok(third.body.retryAfter > 0);
  assert.equal(third.headers['retry-after'], String(third.body.retryAfter));

  const otherIp = await request('/api/tweets/analyze', {
    ip: '203.0.113.11',
    body: { content: 'Tweet d’une autre IP.' },
  });
  assert.equal(otherIp.status, 200);
});

test('POST /api/ai/analyze : partage la limite des routes d’analyse', async () => {
  const exhausted = await request('/api/ai/analyze', {
    body: { content: 'Analyse sans clé IA.' },
  });
  assert.equal(exhausted.status, 429);
  assert.equal(exhausted.body.code, 'RATE_LIMITED');

  const fresh = await request('/api/ai/analyze', {
    ip: '203.0.113.12',
    body: { content: 'Analyse sans clé IA.' },
  });
  assert.equal(fresh.status, 503);
  assert.equal(fresh.body.code, 'AI_NOT_CONFIGURED');
});
