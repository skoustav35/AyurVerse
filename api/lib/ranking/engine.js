/*
 * =====================================================================
 *  AyurVerse ranking · engine — the serving ranker
 *  ---------------------------------------------------------------------
 *  Orchestrates the whole pipeline:
 *
 *    1. hard safety & preferences  (isEligible) — before retrieval AND again
 *       on the final slate. A boost never bypasses this.
 *    2. retrieval                 (buildIndex if none given, then retrieve)
 *    3. bounded scoring           (ARMS weights, tuned by explicit user
 *       freshness/diversity preferences; search lets lexical/semantic lead
 *       so popularity cannot dominate)
 *    4. slate shaping             (MMR on token/tag overlap, rolling author
 *       cap 2-per-10, no consecutive same author where an alternative
 *       exists, topic soft penalty, near-duplicate collapse)
 *    5. feed reserve              (up to 2 quality-safe ≤48h posts in top-10;
 *       spam is never boosted; pages get shorter rather than break the cap)
 *
 *  Deterministic: ties break by id. No randomness — a caller-supplied bandit
 *  arm is the only source of variation. Paid boost fields are never read.
 * =====================================================================
 */

import { ARMS, LIMITS, clamp, cleanTags, normalizePreferences, tokenize, timestamp } from './config.js';
import { buildIndex, retrieve } from './retrieval.js';
import { isEligible, qualitySignals, fingerprint } from './quality.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function short(s) {
  return String(s ?? '').slice(0, 40);
}

function postTokens(post) {
  const set = new Set();
  for (const t of tokenize(`${post.title || ''} ${post.caption || ''} ${post.summary || ''}`).slice(0, 200)) set.add(t);
  for (const t of cleanTags(post.tags)) set.add(t);
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const t of small) if (big.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function idDescPost(a, b) {
  const na = Number(a.id), nb = Number(b.id);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
  return String(b.id) < String(a.id) ? -1 : String(b.id) > String(a.id) ? 1 : 0;
}

function topTag(item) {
  const tags = cleanTags(item.post.tags);
  return tags.length ? tags[0] : null;
}

function bestInterestTag(post, stateTags) {
  for (const t of cleanTags(post.tags)) if (num(stateTags[t], 0) > 0) return t;
  return null;
}

function makeReason(item, ctx) {
  const { plan, prefs, followSet, stateTags } = ctx;
  const p = item.post;
  const handle = p.author_username ? `@${p.author_username}` : 'a channel you follow';

  if (prefs.feed_mode === 'latest') return 'Newest in the garden';
  if (prefs.feed_mode === 'following') return `From ${handle}, a channel you follow`;

  if (plan.hasText) {
    const q = short(plan.raw);
    if (item.features.lexical > 0 && item.features.semantic > 0) return `Matches \u201C${q}\u201D in words and meaning`;
    if (item.features.lexical > 0) return `Strong match for \u201C${q}\u201D`;
    if (item.features.semantic > 0) return `Close in meaning to \u201C${q}\u201D`;
  }
  if (item.sources.includes('follow') || followSet.has(String(p.author_id))) return `From ${handle}, a channel you follow`;
  const tag = item.sources.includes('interest') ? bestInterestTag(p, stateTags) : null;
  if (tag) return `Tuned to your #${tag} interest`;
  if (item.features.newContent) return 'Fresh bloom in the garden';
  if (item.features.engagement >= 0.5) return 'Loud in the atelier this week';
  if (item.sources.includes('recent')) return 'Recent from the garden';
  return 'Suggested for you';
}

/**
 * Rank posts for one request.
 * @returns {{items:Array<{post,score,features,reason,sources}>, meta:object}}
 */
export function rankPosts(input = {}) {
  const {
    posts = [], index = null, query = '', kind = null, userFeatures = {}, preferences = {},
    followIds = [], queryVector = null, embeddingModel = null, arm = 'balanced',
    now = Date.now(), limit = LIMITS.slate,
  } = input && typeof input === 'object' ? input : {};

  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const prefs = normalizePreferences(preferences);
  const armKey = ARMS[arm] ? arm : 'balanced';
  const base = ARMS[armKey];
  const state = userFeatures && typeof userFeatures === 'object' ? userFeatures : {};
  const stateTags = state.tags && typeof state.tags === 'object' ? state.tags : {};
  const seenSet = new Set((Array.isArray(state.seen) ? state.seen : []).map(String));
  const followSet = new Set((Array.isArray(followIds) ? followIds : []).map(String));

  const safePosts = (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object');

  // 1 — hard safety & prefs before retrieval
  const eligible = [];
  let filtered = 0;
  for (const p of safePosts) {
    if (!isEligible(p, { preferences: prefs, userFeatures: state, now: nowMs, followIds })) { filtered++; continue; }
    eligible.push(p);
  }
  const eligibleIds = new Set(eligible.map((p) => String(p.id)));

  // 2 — retrieval
  const idx = index && Array.isArray(index.docs) && index.inverted ? index : buildIndex(eligible);
  const { candidates, plan, stats } = retrieve(idx, {
    query, userFeatures: state, preferences: prefs, followIds, queryVector, embeddingModel,
    limit: LIMITS.candidates, now: nowMs, kind,
  });

  const pool = candidates.filter((c) => eligibleIds.has(String(c.post.id)));

  // 3 — bounded component scores + weights
  const w = {
    relevance: base.relevance,
    personalization: base.personalization,
    freshness: base.freshness * (0.5 + prefs.freshness),
    quality: base.quality,
    engagement: base.engagement,
  };
  if (plan.hasText) {
    // search: text relevance leads, popularity is damped
    w.relevance = base.relevance * 2.4;
    w.personalization = base.personalization * 0.6;
    w.engagement = base.engagement * 0.2;
  }
  if (prefs.feed_mode === 'following') w.personalization = base.personalization * 1.6;
  const wsum = w.relevance + w.personalization + w.freshness + w.quality + w.engagement || 1;

  const ranked = pool.map((c) => {
    const signals = qualitySignals(c.post, { now: nowMs });
    const relevance = plan.hasText
      ? clamp(0.65 * c.lexical + 0.35 * c.semantic, 0, 1)
      : clamp(0.5 * c.lexical + 0.5 * c.semantic, 0, 1);
    const features = {
      relevance,
      lexical: c.lexical,
      semantic: c.semantic,
      personalization: clamp(c.personalized, 0, 1),
      freshness: signals.freshness,
      quality: signals.quality,
      engagement: signals.engagement,
      spam: signals.spam,
      newContent: signals.newContent,
    };
    const score = clamp(
      (w.relevance * features.relevance
        + w.personalization * features.personalization
        + w.freshness * features.freshness
        + w.quality * features.quality
        + w.engagement * features.engagement) / wsum,
      0, 1,
    );
    // seen penalty is a feed concern only — search must still surface seen results
    const seenPenalty = !plan.hasText && seenSet.has(String(c.post.id));
    return {
      post: c.post,
      score: seenPenalty ? clamp(score * 0.55, 0, 1) : score,
      features: { ...features, seen: seenPenalty },
      sources: c.sources,
      fp: fingerprint(c.post),
      tokens: postTokens(c.post),
    };
  });

  // near-duplicate collapse (keep the strongest representative)
  const byFp = new Map();
  let dupDropped = 0;
  for (const r of ranked) {
    const prev = byFp.get(r.fp);
    if (!prev) byFp.set(r.fp, r);
    else { dupDropped++; if (r.score > prev.score) byFp.set(r.fp, r); }
  }
  const uniq = [...byFp.values()];

  const cap = Math.max(0, Math.min(LIMITS.slate, Math.floor(num(limit, LIMITS.slate)) || LIMITS.slate));
  let selected;

  if (prefs.feed_mode === 'latest') {
    // chronological, still safety-filtered and muted
    uniq.sort((a, b) => timestamp(b.post.created_at, 0) - timestamp(a.post.created_at, 0) || idDescPost(a.post, b.post));
    selected = uniq.slice(0, cap);
  } else {
    selected = selectSlate(uniq, { cap, plan, prefs, base, stateTags });
  }

  // 4/5 — reasons + meta
  const reasonCtx = { plan, prefs, followSet, stateTags };
  const items = selected.map((x) => ({
    post: x.post,
    score: x.score,
    features: x.features,
    reason: makeReason(x, reasonCtx),
    sources: x.sources,
  }));

  const authors = new Set(selected.map((x) => String(x.post.author_id)));
  const topics = new Set();
  for (const x of selected) for (const t of cleanTags(x.post.tags)) topics.add(t);
  const freshShare = selected.length ? selected.filter((x) => x.features.newContent).length / selected.length : 0;

  const meta = {
    candidates: stats.candidates,
    eligible: eligible.length,
    semanticUsed: !!stats.semanticUsed,
    personalized: prefs.personalization !== false && num(state.events, 0) > 0 && selected.some((x) => x.sources.includes('personalized')),
    coldStart: num(state.events, 0) === 0,
    diversity: { authors: authors.size, topics: topics.size },
    freshShare,
    filtered: filtered + dupDropped,
    plan,
  };

  return { items, meta };
}

/* ---------------- slate shaping ---------------- */

function authorCount(window, author) {
  let c = 0;
  for (const a of window) if (String(a) === String(author)) c++;
  return c;
}

function selectSlate(uniq, { cap, plan, prefs, base, stateTags }) {
  const pool = [...uniq].sort((a, b) => b.score - a.score || idDescPost(a.post, b.post));
  const selected = [];
  const authorWindow = [];
  const topicCount = {};
  const lambda = clamp(1 - (0.5 * prefs.diversity + 0.5 * (base.diversity || 0.25)), 0.35, 1);
  const feed = !plan.hasText && prefs.feed_mode !== 'latest';
  let newInTop = 0;

  while (selected.length < cap) {
    let bestFull = -1, bestFullVal = -Infinity;
    let bestCap = -1, bestCapVal = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      const author = cand.post.author_id;
      // hard rolling cap: at most 2 per last 10
      if (author != null && authorCount(authorWindow, author) >= 2) continue;
      if (selected.some((s) => s.fp === cand.fp)) continue;

      let maxSim = 0;
      for (const s of selected) { const sim = jaccard(s.tokens, cand.tokens); if (sim > maxSim) maxSim = sim; }
      const tag = topTag(cand);
      const topicPen = 0.04 * Math.max(0, (topicCount[tag] || 0) - 3);
      const reserve = feed && selected.length < 10 && newInTop < 2 && cand.features.newContent && cand.features.spam < 0.6 ? 0.15 : 0;
      const val = lambda * cand.score - (1 - lambda) * maxSim - topicPen + reserve;

      const consecutive = authorWindow.length > 0 && String(authorWindow[authorWindow.length - 1]) === String(author);
      if (val > bestCapVal) { bestCapVal = val; bestCap = i; }
      if (!consecutive && val > bestFullVal) { bestFullVal = val; bestFull = i; }
    }

    // prefer an author change when one exists; otherwise accept the cap-legal one
    const pickIdx = bestFull >= 0 ? bestFull : bestCap;
    if (pickIdx < 0) break; // shorter page rather than break the author cap

    const [pick] = pool.splice(pickIdx, 1);
    selected.push(pick);
    authorWindow.push(pick.post.author_id);
    if (authorWindow.length > 10) authorWindow.shift();
    const tag = topTag(pick);
    if (tag) topicCount[tag] = (topicCount[tag] || 0) + 1;
    if (selected.length <= 10 && pick.features.newContent && pick.features.spam < 0.6) newInTop++;
  }

  return selected;
}
