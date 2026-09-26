/** Versioned serving contract. Change the version when feature semantics change. */
export const MODEL_VERSION = 'hybrid-v1';
export const FEATURE_VERSION = 1;
export const LIMITS = Object.freeze({
  corpus: 500, candidates: 240, slate: 120, page: 20, query: 160,
  queryTokens: 16, featureKeys: 80, hiddenPosts: 200,
  sessionMs: 15 * 60_000, attributionMs: 30 * 60_000,
  featureHalfLifeMs: 7 * 86400_000, stateRetentionMs: 30 * 86400_000,
  feedbackPerMinute: 120, requestsPerMinute: 60,
  semanticTimeoutMs: 180, retrievalTimeoutMs: 800,
});

/** Small, reviewed policy arms; not arbitrary generated weights. */
export const ARMS = Object.freeze({
  balanced: { relevance: 0.35, personalization: 0.20, freshness: 0.18, quality: 0.17, engagement: 0.10, diversity: 0.25 },
  fresh: { relevance: 0.30, personalization: 0.15, freshness: 0.30, quality: 0.17, engagement: 0.08, diversity: 0.25 },
  discovery: { relevance: 0.32, personalization: 0.12, freshness: 0.20, quality: 0.26, engagement: 0.10, diversity: 0.50 },
  familiar: { relevance: 0.33, personalization: 0.32, freshness: 0.13, quality: 0.15, engagement: 0.07, diversity: 0.20 },
});
export const ARM_NAMES = Object.freeze(Object.keys(ARMS));
export const DEFAULT_PREFS = Object.freeze({
  boosted_tags: [], muted_tags: [], muted_authors: [],
  feed_mode: 'balanced', diversity: 0.35, freshness: 0.5,
  personalization: true, exploration: 0.10,
  dinacharya_mode: true,
});
export const EVENT_TYPES = Object.freeze(['impression', 'click', 'dwell', 'like', 'save', 'hide', 'report']);

export function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
export function normalizeTag(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{M}\p{N}._-]/gu, '').slice(0, 40);
}
export function cleanTags(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((x) => typeof x === 'string').map(normalizeTag).filter(Boolean))].slice(0, 30);
}
export function normalizePreferences(input = {}, previous = DEFAULT_PREFS) {
  const value = { ...DEFAULT_PREFS, ...previous, ...input };
  const muted = cleanTags(value.muted_tags);
  return {
    boosted_tags: cleanTags(value.boosted_tags).filter((t) => !muted.includes(t)),
    muted_tags: muted,
    muted_authors: [...new Set((Array.isArray(value.muted_authors) ? value.muted_authors : []).filter((v) => typeof v === 'string' && v.length > 0 && v.length <= 128))].slice(0, 100),
    feed_mode: ['balanced', 'following', 'latest'].includes(value.feed_mode) ? value.feed_mode : 'balanced',
    diversity: clamp(value.diversity), freshness: clamp(value.freshness),
    personalization: value.personalization !== false,
    exploration: clamp(value.exploration, 0, 0.2),
    dinacharya_mode: value.dinacharya_mode !== false,
  };
}
export function validId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
export function timestamp(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value?.toMillis) return value.toMillis();
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : fallback;
}
export function tokenize(text) {
  return (String(text ?? '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []).slice(0, 4096);
}
export function postText(post) {
  return [post.title, post.summary, post.caption, (post.tags || []).join(' '), post.content_md].filter((s) => typeof s === 'string').join(' ').slice(0, 16000);
}
export function httpError(status, message, code = 'ranking_error') {
  return Object.assign(new Error(message), { status, code });
}
export function deadline(promise, ms, fallback) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]).finally(() => clearTimeout(timer));
}
