'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createRateLimiter,
  resolveRateLimitOptions,
  resolveTrustProxy,
  DEFAULT_LIMIT,
  DEFAULT_WINDOW_MS,
} = require('../middleware/rateLimit');

function invoke(limiter, overrides = {}) {
  const headers = {};
  let statusCode = null;
  let payload = null;
  let nextCalled = false;

  const req = {
    method: 'POST',
    ip: '203.0.113.10',
    socket: { remoteAddress: '203.0.113.10' },
    ...overrides,
  };

  const res = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  limiter(req, res, () => {
    nextCalled = true;
  });

  return { headers, statusCode, payload, nextCalled };
}

test('rate limiter : autorise la limite puis répond 429', () => {
  const clock = { now: 1_000_000 };
  const limiter = createRateLimiter({
    limit: 2,
    windowMs: 60_000,
    now: () => clock.now,
  });

  const first = invoke(limiter);
  assert.equal(first.nextCalled, true);
  assert.equal(first.headers['ratelimit-limit'], '2');
  assert.equal(first.headers['ratelimit-remaining'], '1');

  const second = invoke(limiter);
  assert.equal(second.nextCalled, true);
  assert.equal(second.headers['ratelimit-remaining'], '0');

  const third = invoke(limiter);
  assert.equal(third.nextCalled, false);
  assert.equal(third.statusCode, 429);
  assert.equal(third.payload.code, 'RATE_LIMITED');
  assert.match(third.payload.error, /Trop de requêtes/);
  assert.equal(third.headers['retry-after'], '60');
  assert.equal(third.headers['ratelimit-remaining'], '0');
});

test('rate limiter : compteurs séparés par adresse IP', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

  assert.equal(invoke(limiter, { ip: '203.0.113.1' }).nextCalled, true);
  assert.equal(invoke(limiter, { ip: '203.0.113.1' }).nextCalled, false);
  assert.equal(invoke(limiter, { ip: '203.0.113.2' }).nextCalled, true);
});

test('rate limiter : la fenêtre se réinitialise', () => {
  const clock = { now: 0 };
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: 1_000,
    now: () => clock.now,
  });

  assert.equal(invoke(limiter).nextCalled, true);
  assert.equal(invoke(limiter).nextCalled, false);

  clock.now = 1_001;
  const afterWindow = invoke(limiter);
  assert.equal(afterWindow.nextCalled, true);
  assert.equal(afterWindow.headers['ratelimit-remaining'], '0');
});

test('rate limiter : ignore les méthodes autres que POST', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

  const preflight = invoke(limiter, { method: 'OPTIONS' });
  assert.equal(preflight.nextCalled, true);
  assert.deepEqual(preflight.headers, {});

  assert.equal(invoke(limiter).nextCalled, true);
  assert.equal(invoke(limiter).nextCalled, false);
});

test('rate limiter : repli sur le socket si req.ip est absent', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

  assert.equal(
    invoke(limiter, { ip: undefined, socket: { remoteAddress: '198.51.100.4' } })
      .nextCalled,
    true
  );
  assert.equal(
    invoke(limiter, { ip: undefined, socket: { remoteAddress: '198.51.100.4' } })
      .nextCalled,
    false
  );
});

test('resolveRateLimitOptions : valeurs par défaut et environnement', () => {
  assert.deepEqual(resolveRateLimitOptions({}), {
    limit: DEFAULT_LIMIT,
    windowMs: DEFAULT_WINDOW_MS,
  });

  assert.deepEqual(
    resolveRateLimitOptions({
      ANALYZE_RATE_LIMIT: '3',
      ANALYZE_RATE_WINDOW_MS: '1500',
    }),
    { limit: 3, windowMs: 1500 }
  );

  assert.deepEqual(
    resolveRateLimitOptions({
      ANALYZE_RATE_LIMIT: '0',
      ANALYZE_RATE_WINDOW_MS: 'abc',
    }),
    { limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW_MS }
  );
});

test('resolveTrustProxy : désactivé par défaut, un saut pour true', () => {
  assert.equal(resolveTrustProxy({}), null);
  assert.equal(resolveTrustProxy({ TRUST_PROXY: 'false' }), null);
  assert.equal(resolveTrustProxy({ TRUST_PROXY: '0' }), null);
  assert.equal(resolveTrustProxy({ TRUST_PROXY: 'true' }), 1);
  assert.equal(resolveTrustProxy({ TRUST_PROXY: '2' }), 2);
  assert.equal(resolveTrustProxy({ TRUST_PROXY: 'nope' }), null);
});
