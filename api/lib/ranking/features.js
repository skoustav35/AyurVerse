/*
 * =====================================================================
 *  AyurVerse ranking · features — the taste memory
 *  ---------------------------------------------------------------------
 *  A tiny, pure, signed affinity store fed ONLY by server-side events.
 *  Every mutator returns a fresh state; nothing here touches the network,
 *  the clock beyond the `now` argument, or any client-supplied tags.
 *
 *    state = {
 *      version: 1, updated_at, events,
 *      tags: {tag: affinity}, authors: {id: affinity}, kinds: {kind: affinity},
 *      hidden: [postId...], seen: [postId...],
 *    }
 *
 *  Rules enforced here:
 *    · signed exponential decay, half-life 7d
 *    · maps bounded to 80 keys, id lists bounded to 200
 *    · positive affinities saturate (tanh); hide/report always add to `hidden`
 *      and can never be flipped into a positive affinity
 *    · hostile keys (`__proto__`, `constructor`, `prototype`) are dropped and
 *      non-finite values ignored, so a poisoned payload cannot pollute protos
 * =====================================================================
 */

import { LIMITS, clamp, cleanTags, EVENT_TYPES } from './config.js';

const HALF_LIFE = LIMITS.featureHalfLifeMs; // 7d
const MAP_CAP = LIMITS.featureKeys;         // 80
const ID_CAP = LIMITS.hiddenPosts;          // 200
const AFFINITY_CAP = 8;
const DECAY_FLOOR = 0.01;
const DANGEROUS = new Set(['__proto__', 'prototype', 'constructor']);

/** Server event weights. Impression is deliberately whisper-quiet. */
const EVENT_WEIGHTS = Object.freeze({
  impression: 0.02,
  click: 0.5,
  dwell: 0.6,
  like: 1.0,
  save: 1.4,
  hide: -3.0,
  report: -4.0,
});

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeKey(key) {
  const s = String(key ?? '').slice(0, 64);
  return s && !DANGEROUS.has(s) ? s : null;
}

/** Read a plain object into a clean numeric map, dropping junk and hostile keys. */
function sanitizeMap(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const key = safeKey(k);
      if (!key) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n !== 0) out[key] = n;
    }
  }
  return out;
}

function trimMap(map, cap = MAP_CAP) {
  const entries = Object.entries(map);
  if (entries.length <= cap) return map;
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const out = {};
  for (const [k, v] of entries.slice(0, cap)) out[k] = v;
  return out;
}

function sanitizeIds(arr, cap = ID_CAP) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= cap) break;
  }
  return out;
}

/** Saturating signed affinity — positive memory grows then flattens. */
function saturate(value) {
  return AFFINITY_CAP * Math.tanh(value / AFFINITY_CAP);
}

/** Fresh, empty state. */
export function emptyFeatures(now = Date.now()) {
  return {
    version: 1,
    updated_at: num(now, Date.now()),
    events: 0,
    tags: {},
    authors: {},
    kinds: {},
    hidden: [],
    seen: [],
  };
}

/**
 * Signed exponential decay of all affinity maps. Pure; safe on malformed state.
 * A missing/future `updated_at` decays nothing rather than wiping memory.
 */
export function decayFeatures(state, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : emptyFeatures(now);
  const nowMs = num(now, Date.now());
  const last = num(s.updated_at, nowMs);
  const elapsed = last > 0 ? Math.max(0, nowMs - last) : 0;
  const factor = Math.pow(0.5, elapsed / HALF_LIFE);
  const decay = (m) => {
    const out = {};
    for (const [k, v] of Object.entries(sanitizeMap(m))) {
      const nv = v * factor;
      if (Math.abs(nv) >= DECAY_FLOOR) out[k] = nv;
    }
    return trimMap(out);
  };
  return {
    version: 1,
    updated_at: nowMs,
    events: Math.max(0, Math.floor(num(s.events, 0))),
    tags: decay(s.tags),
    authors: decay(s.authors),
    kinds: decay(s.kinds),
    hidden: sanitizeIds(s.hidden),
    seen: sanitizeIds(s.seen),
  };
}

/**
 * Apply one server event to the state. Pure.
 * `event` may be a type string or `{ type, dwell_ms }`.
 * Unknown event types are ignored. `seen` is intentionally untouched here —
 * feed de-duplication is the engine's job.
 */
export function updateFeatures(state, event, post, now = Date.now()) {
  const nowMs = num(now, Date.now());
  const base = decayFeatures(state, nowMs);
  if (!post || typeof post !== 'object') return base;

  const type = typeof event === 'string' ? event : event && typeof event === 'object' ? event.type : null;
  if (!EVENT_TYPES.includes(type)) return base;

  const weight = EVENT_WEIGHTS[type] ?? 0;
  const isNegative = type === 'hide' || type === 'report';

  let hidden = base.hidden;
  const pid = Number(post.id);
  if (isNegative && Number.isFinite(pid) && pid > 0) {
    // Hidden is recorded unconditionally — consent governs taste, not safety.
    hidden = sanitizeIds([pid, ...base.hidden]);
  }

  const tags = { ...base.tags };
  const authors = { ...base.authors };
  const kinds = { ...base.kinds };

  for (const tag of cleanTags(post.tags)) {
    const key = safeKey(tag);
    if (key) tags[key] = saturate(num(tags[key], 0) + weight);
  }
  const aKey = safeKey(post.author_id);
  if (aKey) authors[aKey] = saturate(num(authors[aKey], 0) + weight);
  const kKey = safeKey(post.kind);
  if (kKey) kinds[kKey] = saturate(num(kinds[kKey], 0) + weight);

  return {
    version: 1,
    updated_at: nowMs,
    events: base.events + 1,
    tags: trimMap(tags),
    authors: trimMap(authors),
    kinds: trimMap(kinds),
    hidden,
    seen: base.seen,
  };
}

/**
 * Personalized affinity for one post, bounded to [0,1].
 * Returns 0 outright when personalization is opted out.
 */
export function personalizedScore(post, state, prefs = {}, followIds = [], now = Date.now()) {
  if (!post || typeof post !== 'object') return 0;
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  if (p.personalization === false) return 0;

  const s = state && typeof state === 'object' ? state : emptyFeatures(now);
  const tags = sanitizeMap(s.tags);
  const authors = sanitizeMap(s.authors);
  const kinds = sanitizeMap(s.kinds);

  let tagAff = 0;
  for (const tag of cleanTags(post.tags)) tagAff += num(tags[tag], 0);
  const authorAff = num(authors[safeKey(post.author_id) || ''], 0);
  const kindAff = num(kinds[safeKey(post.kind) || ''], 0);

  const follow = Array.isArray(followIds)
    ? followIds.some((f) => String(f) === String(post.author_id))
    : false;

  const positive = (v) => (v > 0 ? v / (v + 4) : 0); // saturating 0..1
  const score = 0.5 * positive(tagAff) + 0.3 * positive(authorAff) + 0.2 * positive(kindAff) + (follow ? 0.35 : 0);
  return clamp(score, 0, 1);
}

/**
 * The 6-wide bounded context vector the ranker consumes:
 *   [1, cold, activity, freshnessPreference, diversityPreference, followingOrNot]
 */
export function featureContext(state, prefs = {}, now = Date.now()) {
  const s = state && typeof state === 'object' ? state : emptyFeatures(now);
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  const events = Math.max(0, num(s.events, 0));

  const cold = clamp(1 - Math.min(1, events / 20), 0, 1);
  const activity = clamp(Math.log1p(events) / Math.log1p(100), 0, 1);
  const freshnessPreference = clamp(num(p.freshness, 0.5));
  const diversityPreference = clamp(num(p.diversity, 0.35));
  const followingOrNot = p.feed_mode === 'following' ? 1 : 0;

  return [1, cold, activity, freshnessPreference, diversityPreference, followingOrNot]
    .map((v) => (Number.isFinite(v) ? v : 0));
}
