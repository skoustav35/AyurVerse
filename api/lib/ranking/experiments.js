/*
 * =====================================================================
 *  AyurVerse Ranking · "experiments" — deterministic A/B assignment
 *  ---------------------------------------------------------------------
 *  Assignment is a pure function of (userId, config). It uses SHA-256 —
 *  never a JS integer hash or `% 100` — so buckets are stable across
 *  processes, requests, Node versions and model changes. The traffic and
 *  variant decisions are salted with DIFFERENT keys, so the two coin
 *  flips are statistically independent: a user's traffic bucket does not
 *  predict their variant.
 *
 *  Anonymous / missing / non-positive-integer identities are never
 *  enrolled; they always resolve to variant "off". Experiments default to
 *  disabled, so a misconfigured call is safe.
 *
 *  This module also owns the reward vocabulary. Rewards are per-slate
 *  outcome scores in [-1, 1] for server-verified events; aggregateReward
 *  bounds cumulative signal so a burst of low-value clicks cannot
 *  dominate a single high-value save or a report.
 * =====================================================================
 */

import { createHash } from 'node:crypto';

export const DEFAULT_EXPERIMENT_ID = 'feed-hybrid-v1';
export const DEFAULT_SALT = 'ayurverse-experiment-v1';
/** Positive reward is capped here so spammy engagement cannot inflate a slate. */
export const MAX_POSITIVE_REWARD = 1;

const ANONYMOUS_IDS = new Set(['', 'anonymous', 'anon', 'guest', 'null', 'undefined', 'unknown']);

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function validUserId(userId) {
  if (typeof userId === 'number') return Number.isSafeInteger(userId) && userId > 0;
  if (typeof userId !== 'string') return false;
  const normalized = userId.trim().toLowerCase();
  return normalized.length > 0 && !ANONYMOUS_IDS.has(normalized);
}

function normalizeConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : DEFAULT_EXPERIMENT_ID;
  return {
    id,
    enabled: source.enabled === true,
    traffic: clamp01(source.traffic, 0.1),
    treatment: clamp01(source.treatment, 0.5),
    salt: typeof source.salt === 'string' && source.salt.length ? source.salt : `${DEFAULT_SALT}:${id}`,
  };
}

function bucketOf(key) {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return parseInt(hex, 16) / 0x1_0000_0000;
}

/**
 * Deterministically assign a user to control / treatment / off.
 *
 * @param {string|number} userId stable, non-anonymous identity
 * @param {{id?:string,enabled?:boolean,traffic?:number,treatment?:number,salt?:string}} config
 * @returns {{id:string, variant:'control'|'treatment'|'off', bucket:number}}
 */
export function assignExperiment(userId, config = {}) {
  const cfg = normalizeConfig(config);
  if (!validUserId(userId)) return { id: cfg.id, variant: 'off', bucket: 0 };

  const userKey = typeof userId === 'number' ? `u:${userId}` : `s:${userId.trim()}`;
  const trafficBucket = bucketOf(`${cfg.salt}|${cfg.id}|traffic|${userKey}`);
  if (!cfg.enabled || trafficBucket >= cfg.traffic) {
    return { id: cfg.id, variant: 'off', bucket: trafficBucket };
  }

  const variantBucket = bucketOf(`${cfg.salt}|${cfg.id}|variant|${userKey}`);
  return {
    id: cfg.id,
    variant: variantBucket < cfg.treatment ? 'treatment' : 'control',
    bucket: trafficBucket,
  };
}

/**
 * Reward for one server-verified outcome event.
 * impression 0 · click 0.1 · dwell ≤0.5 (30s → 0.25) · like 0.35 · save 0.7 · hide −0.8 · report −1
 */
export function rewardForEvent(type, dwellMs = 0) {
  switch (type) {
    case 'impression':
      return 0;
    case 'click':
      return 0.1;
    case 'dwell': {
      const ms = Number(dwellMs);
      const bounded = Number.isFinite(ms) ? Math.max(0, ms) : 0;
      return Math.min(0.5, (bounded / 60_000) * 0.5);
    }
    case 'like':
      return 0.35;
    case 'save':
      return 0.7;
    case 'hide':
      return -0.8;
    case 'report':
      return -1;
    default:
      return 0;
  }
}

/**
 * Aggregate a slate's logged events into one bounded reward in [-1, 1].
 * The positive signal is capped at MAX_POSITIVE_REWARD and the negative
 * signal is the single most negative event — NOT a sum, so repeated
 * low-value clicks or repeated hides cannot swamp the slate.
 *
 * Accepts either raw events ({type, dwellMs}) or pre-computed numbers.
 */
export function aggregateReward(events) {
  let positive = 0;
  let negative = 0;
  for (const event of Array.isArray(events) ? events : []) {
    let reward;
    if (typeof event === 'number') reward = event;
    else if (event && typeof event === 'object') reward = rewardForEvent(event.type, event.dwellMs);
    else continue;
    if (!Number.isFinite(reward)) continue;
    if (reward > 0) positive += reward;
    else if (reward < 0) negative = Math.min(negative, reward);
  }
  const total = Math.min(MAX_POSITIVE_REWARD, positive) + negative;
  return Math.max(-1, Math.min(1, total));
}
