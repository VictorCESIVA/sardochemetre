'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const createApp = require('../app');
const { shouldSeedDemo } = createApp;

test('shouldSeedDemo : seed uniquement en démo avec source mock', () => {
  assert.equal(
    shouldSeedDemo({ DEMO_MODE: 'true', TWITTER_SOURCE: 'mock' }),
    true
  );
  assert.equal(shouldSeedDemo({ DEMO_MODE: 'true' }), true);
  assert.equal(
    shouldSeedDemo({ DEMO_MODE: 'true', TWITTER_SOURCE: 'syndication' }),
    false
  );
  assert.equal(
    shouldSeedDemo({ DEMO_MODE: 'true', TWITTER_SOURCE: 'x' }),
    false
  );
  assert.equal(
    shouldSeedDemo({ DEMO_MODE: 'true', TWITTER_SOURCE: 'profile' }),
    false
  );
  assert.equal(shouldSeedDemo({ DEMO_MODE: 'false' }), false);
});

test('shouldSeedDemo : SEED_DEMO force explicitement le choix', () => {
  assert.equal(
    shouldSeedDemo({
      DEMO_MODE: 'true',
      TWITTER_SOURCE: 'syndication',
      SEED_DEMO: 'true',
    }),
    true
  );
  assert.equal(
    shouldSeedDemo({
      DEMO_MODE: 'true',
      TWITTER_SOURCE: 'mock',
      SEED_DEMO: 'false',
    }),
    false
  );
});
