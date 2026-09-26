/*
 * =====================================================================
 *  AyurVerse ranking · quality — safety floor + trust signals
 *  ---------------------------------------------------------------------
 *  Two jobs, kept apart on purpose:
 *
 *    isEligible()      the hard floor. Nothing below ever passes — not a
 *                      paid boost, not a fresh post, not a followed author.
 *    qualitySignals()  soft, bounded 0..1 signals the ranker may weigh.
 *
 *  Engagement is Bayesian: `post.ranking_stats` is authoritative
 *  {impressions, positive, negative, updated_at}. Raw likes/views are
 *  untrusted and contribute only a whisper, capped at 0.05. No follower
 *  count is ever consulted as a quality barrier.
 *
 *  Spam is link-density + repetition + explicit reports. Short creative
 *  and media posts are NOT penalized for being short or visual.
 * =====================================================================
 */

import { clamp, cleanTags, timestamp, validId, tokenize, postText } from './config.js';

const MOD_BLOCKED = new Set(['blocked', 'removed', 'pending', 'quarantined']);
const FRESH_HALF_LIFE = 48 * 3600_000; // 48h
const NEW_WINDOW = 48 * 3600_000;
export const SPAM_REJECT = 0.9;

function num(value, min = 0, max = 1e9) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

/**
 * Soft quality signals for one post. Always returns finite, bounded numbers.
 * @returns {{quality:number, spam:number, engagement:number, freshness:number, newContent:boolean}}
 */
export function qualitySignals(post, { now = Date.now() } = {}) {
  const p = post && typeof post === 'object' ? post : {};
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const created = timestamp(p.created_at, nowMs);
  const age = Math.max(0, nowMs - created);

  const freshness = clamp(Math.pow(0.5, age / FRESH_HALF_LIFE), 0, 1);
  const newContent = age <= NEW_WINDOW;

  // ---- engagement: authoritative ranking_stats with Bayesian shrinkage ----
  const stats = p.ranking_stats && typeof p.ranking_stats === 'object' ? p.ranking_stats : null;
  const impressions = num(stats?.impressions, 0, 1e9);
  const positive = num(stats?.positive, 0, 1e9);
  const negative = num(stats?.negative, 0, 1e9);
  const PRIOR_MEAN = 0.03;
  const PRIOR_WEIGHT = 25;
  const denom = impressions + positive + negative + PRIOR_WEIGHT;
  const smoothed = denom > 0 ? (positive + PRIOR_MEAN * PRIOR_WEIGHT) / denom : PRIOR_MEAN;

  // raw counters are untrusted → capped whisper only (≤0.05 no matter how large)
  const rawSignal = clamp(Math.log1p(num(p.likes_count, 0)) / 40 + Math.log1p(num(p.views_count, 0)) / 80, 0, 0.05);
  const engagement = clamp(smoothed * 4 + rawSignal, 0, 1);

  // ---- spam: link density + repetition + explicit reports ----
  const text = postText(p);
  const toks = tokenize(text);
  const urls = (text.match(/https?:\/\/\S+/gi) || []).length;
  const linkDensity = urls / Math.max(6, toks.length);
  let spam = clamp(linkDensity * 2.2, 0, 0.7);
  const unique = new Set(toks).size;
  const repeat = toks.length >= 8 ? 1 - unique / toks.length : 0;
  spam += clamp(repeat * 0.7, 0, 0.3);
  const reports = num(p.report_count ?? p.spam_reports ?? p.reports, 0, 1e6);
  spam += clamp(reports / 12, 0, 0.9);
  spam = clamp(spam, 0, 1);

  // ---- completeness: presence-based, never punishes short/media ----
  let completeness = 0;
  if (typeof p.title === 'string' && p.title.trim()) completeness += 0.3;
  else if (typeof p.caption === 'string' && p.caption.trim()) completeness += 0.3;
  if (p.media_url) completeness += 0.25;
  if (cleanTags(p.tags).length) completeness += 0.2;
  if ((typeof p.summary === 'string' && p.summary.trim()) || (typeof p.content_md === 'string' && p.content_md.trim())) completeness += 0.25;
  completeness = clamp(completeness, 0, 1);

  const quality = clamp(0.7 * (1 - spam) + 0.3 * completeness, 0, 1);

  return { quality, spam, engagement, freshness, newContent };
}

/**
 * The hard floor. Returns true only when a post may be served to this viewer.
 * Boost/paid fields are never consulted — a boost cannot bypass a reject.
 */
export function isEligible(post, { preferences = {}, userFeatures = {}, now = Date.now(), followIds = [] } = {}) {
  if (!post || typeof post !== 'object') return false;
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  const user = userFeatures && typeof userFeatures === 'object' ? userFeatures : {};

  if (!validId(post.id)) return false;
  if (post.author_id === undefined || post.author_id === null || post.author_id === '') return false;

  if (post.deleted === true || post.deleted_at) return false;
  // missing `visibility` is allowed for legacy rows; anything non-public is not
  if (post.visibility !== undefined && post.visibility !== null && post.visibility !== 'public') return false;
  if (post.is_public === false) return false;
  if (post.moderation_status && MOD_BLOCKED.has(String(post.moderation_status).toLowerCase())) return false;

  const created = timestamp(post.created_at, NaN);
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  if (!Number.isFinite(created)) return false;
  if (created > nowMs + 5 * 60_000) return false;

  // viewer-hidden posts (recorded regardless of personalization consent)
  if (Array.isArray(user.hidden) && user.hidden.some((h) => Number(h) === Number(post.id))) return false;

  // mutes — tags and authors
  const mutedTags = new Set(cleanTags(prefs.muted_tags));
  if (mutedTags.size && cleanTags(post.tags).some((t) => mutedTags.has(t))) return false;
  const mutedAuthors = new Set((Array.isArray(prefs.muted_authors) ? prefs.muted_authors : []).map(String));
  if (mutedAuthors.size) {
    if (mutedAuthors.has(String(post.author_id))) return false;
    if (post.author_username && mutedAuthors.has(String(post.author_username))) return false;
  }

  // following mode is a hard follow filter (empty follow set ⇒ nothing eligible)
  if (prefs.feed_mode === 'following') {
    const follows = new Set((Array.isArray(followIds) ? followIds : []).map(String));
    if (!follows.has(String(post.author_id))) return false;
  }

  // spam floor
  if (qualitySignals(post, { now: nowMs }).spam >= SPAM_REJECT) return false;

  return true;
}

/* ---------------- canonical fingerprint (true-duplicate detection) ---------------- */

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function normalizeCanonical(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

function normalizeMedia(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  let s = url.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const m = s.match(/^https?:\/\/[^/]+(\/.*)?$/);
  return m ? m[1] || '' : s;
}

/**
 * Canonical identity of a post's content: normalized text + media URL.
 * Blank visuals (no text, no media) fall back to their id so unrelated
 * empty posts are never collapsed together.
 */
export function fingerprint(post) {
  const p = post && typeof post === 'object' ? post : {};
  const text = normalizeCanonical(postText(p));
  const media = normalizeMedia(p.media_url);
  if (!text && !media) {
    const id = Number(p.id);
    return Number.isFinite(id) && id > 0 ? `id:${id}` : `anon:${hash32(String(p.id) + '|' + text)}`;
  }
  return `t:${hash32(text)}|m:${hash32(media)}`;
}
