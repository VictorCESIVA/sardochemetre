'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  startScheduler,
  stopScheduler,
  schedulerReadiness,
} = require('../scheduler');

function withEnv(values, fn) {
  const saved = {};
  for (const key of Object.keys(values)) {
    saved[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('schedulerReadiness : désactivé en démo', () => {
  const readiness = schedulerReadiness({
    DEMO_MODE: 'true',
    TWITTER_BEARER_TOKEN: 'token',
    ANTHROPIC_API_KEY: 'key',
  });

  assert.equal(readiness.ready, false);
  assert.match(readiness.reason, /DEMO_MODE/);
});

test('schedulerReadiness : clés requises en source x', () => {
  const readiness = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'x',
  });

  assert.equal(readiness.ready, false);
  assert.match(readiness.reason, /TWITTER_BEARER_TOKEN/);
  assert.match(readiness.reason, /OPENCODE_API_KEY/);
  assert.match(readiness.reason, /ANTHROPIC_API_KEY/);

  assert.deepEqual(
    schedulerReadiness({
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      ANTHROPIC_API_KEY: 'key',
    }),
    { ready: true, reason: null }
  );
});

test('schedulerReadiness : syndication sans token mais IA réelle requise', () => {
  assert.deepEqual(
    schedulerReadiness({
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'syndication',
      AI_PROVIDER: 'opencode',
      OPENCODE_API_KEY: 'oc_sk_test_syndication',
    }),
    { ready: true, reason: null }
  );

  const missingAi = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'syndication',
    AI_PROVIDER: 'anthropic',
  });

  assert.equal(missingAi.ready, false);
  assert.match(missingAi.reason, /ANTHROPIC_API_KEY/);
  assert.doesNotMatch(missingAi.reason, /TWITTER_BEARER_TOKEN/);

  const xWithoutToken = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'x',
    AI_PROVIDER: 'opencode',
    OPENCODE_API_KEY: 'oc_sk_test_syndication',
  });

  assert.equal(xWithoutToken.ready, false);
  assert.match(xWithoutToken.reason, /TWITTER_BEARER_TOKEN/);
});

test('schedulerReadiness : profile sans token mais IA réelle requise', () => {
  assert.deepEqual(
    schedulerReadiness({
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'profile',
      AI_PROVIDER: 'opencode',
      OPENCODE_API_KEY: 'oc_sk_test_profile',
    }),
    { ready: true, reason: null }
  );

  const missingAi = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'profile',
    AI_PROVIDER: 'opencode',
  });

  assert.equal(missingAi.ready, false);
  assert.match(missingAi.reason, /OPENCODE_API_KEY/);
  assert.doesNotMatch(missingAi.reason, /TWITTER_BEARER_TOKEN/);
});

test('schedulerReadiness : OpenCode actif avec clé, clair sans clé', () => {
  const missing = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'x',
    AI_PROVIDER: 'opencode',
    OPENCODE_API_KEY: 'oc_sk_test_scheduler',
  });

  assert.equal(missing.ready, false);
  assert.match(missing.reason, /TWITTER_BEARER_TOKEN/);
  assert.doesNotMatch(missing.reason, /OPENCODE_API_KEY/);

  const missingKey = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'x',
    TWITTER_BEARER_TOKEN: 'token',
    AI_PROVIDER: 'opencode',
  });

  assert.equal(missingKey.ready, false);
  assert.match(missingKey.reason, /OPENCODE_API_KEY/);
  assert.doesNotMatch(missingKey.reason, /ANTHROPIC_API_KEY/);

  assert.deepEqual(
    schedulerReadiness({
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      AI_PROVIDER: 'opencode',
      OPENCODE_API_KEY: 'oc_sk_test_scheduler',
      OPENCODE_PLAN: 'go',
    }),
    { ready: true, reason: null }
  );

  const anthropicMissing = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_SOURCE: 'x',
    TWITTER_BEARER_TOKEN: 'token',
    AI_PROVIDER: 'anthropic',
  });
  assert.equal(anthropicMissing.ready, false);
  assert.match(anthropicMissing.reason, /ANTHROPIC_API_KEY/);
});

test('schedulerReadiness : AI_PROVIDER=mock désactive le scheduler', () => {
  const readiness = schedulerReadiness({
    DEMO_MODE: 'false',
    TWITTER_BEARER_TOKEN: 'token',
    AI_PROVIDER: 'mock',
    OPENCODE_API_KEY: 'oc_sk_test_ignored',
  });

  assert.equal(readiness.ready, false);
  assert.match(readiness.reason, /AI_PROVIDER=mock/);
});

test('startScheduler ne démarre pas en démo', () => {
  withEnv({ DEMO_MODE: 'true' }, () => {
    assert.equal(startScheduler(), null);
  });
});

test('startScheduler refuse un CRON_SCHEDULE invalide', () => {
  withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'key',
      CRON_SCHEDULE: 'pas une expression cron',
      CRON_RUN_ON_START: 'false',
    },
    () => {
      assert.equal(startScheduler(), null);
    }
  );
});

test('startScheduler démarre et s’arrête avec node-cron', () => {
  withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'key',
      CRON_SCHEDULE: '0 3 * * *',
      CRON_RUN_ON_START: 'false',
    },
    () => {
      const task = startScheduler();
      try {
        assert.ok(task);
        assert.equal(typeof task.stop, 'function');
        assert.equal(typeof task.getStatus, 'function');
      } finally {
        stopScheduler(task);
        if (task && typeof task.destroy === 'function') task.destroy();
      }
    }
  );
});

test('startScheduler démarre avec OpenCode', () => {
  withEnv(
    {
      DEMO_MODE: 'false',
      TWITTER_SOURCE: 'x',
      TWITTER_BEARER_TOKEN: 'token',
      AI_PROVIDER: 'opencode',
      OPENCODE_API_KEY: 'oc_sk_test_scheduler',
      OPENCODE_PLAN: 'payg',
      CRON_SCHEDULE: '0 4 * * *',
      CRON_RUN_ON_START: 'false',
    },
    () => {
      const task = startScheduler();
      try {
        assert.ok(task);
      } finally {
        stopScheduler(task);
        if (task && typeof task.destroy === 'function') task.destroy();
      }
    }
  );
});
