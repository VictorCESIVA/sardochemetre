'use strict';

const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const LEASE_NAME = 'scheduler';

function createOwner() {
  return `scheduler:${process.pid}:${crypto.randomUUID()}`;
}

/**
 * Verrou logique basé sur un bail renouvelable.
 *
 * `acquire` crée ou reprend le bail. `renew` prolonge uniquement si cette
 * instance le détient encore : si une autre instance l'a repris après
 * expiration, le renouvellement échoue et l'appelant doit s'arrêter.
 */
function createSchedulerLock({
  store,
  owner = createOwner(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (!store || typeof store.acquire !== 'function') {
    throw new Error('createSchedulerLock : store.acquire est requis');
  }

  let held = false;

  async function acquire() {
    held = await store.acquire({ name: LEASE_NAME, owner, ttlMs });
    return held;
  }

  async function renew() {
    if (!held) return false;
    held = await store.acquire({ name: LEASE_NAME, owner, ttlMs });
    return held;
  }

  async function release() {
    if (!held) return;
    held = false;
    await store.release({ name: LEASE_NAME, owner });
  }

  return {
    acquire,
    renew,
    release,
    get held() {
      return held;
    },
    name: LEASE_NAME,
    owner,
    ttlMs,
  };
}

module.exports = {
  createSchedulerLock,
  createOwner,
  DEFAULT_TTL_MS,
  LEASE_NAME,
};
