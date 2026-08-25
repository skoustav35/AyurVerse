/*
 * =====================================================================
 *  AyurVerse Library · "earlybird" — candidate generation
 *  ---------------------------------------------------------------------
 *  Faithful port note: EarlyBird is Twitter's real-time Lucene tier. It
 *  answers ONLY "who could possibly match?" — several parallel posting
 *  lists (text fields, tags, entities, recency window) are walked and
 *  merged with per-field evidence. Rankings happen later; candidates are
 *  pooled here with their Lucene-ish textScore, so the Heavy Ranker gets
 *  everyone who could plausibly matter, cheaply.
 *
 *  Our posting lists are PostgREST-prefiltered queries + a fuzzy remainder
 *  sweep over vocabulary — bounded, so the Library stays swift regardless
 *  of how large the corpus grows.
 * =====================================================================
 */

import { db } from '../db-client.js';
import { tokens, stem } from './unicorn.js';

/* ---------------- fuzzy (Levenshtein, length-gated) ---------------- */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export function similarity(a, b) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function bestFuzzyInText(term, words) {
  let best = 0;
  for (const w of words) {
    if (Math.abs(w.length - term.length) > 3) continue;
    const s = similarity(term, w);
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}

function tfCount(text, term) {
  if (!text) return 0;
  let c = 0, i = 0;
  while ((i = text.indexOf(term, i)) !== -1) { c++; i += term.length; }
  return c;
}

/** field-weighted Lucene-ish text evidence for one post */
export function fieldsOf(p) {
  return [
    [(p.title || '').toLowerCase(), 6.0],
    [(p.tags || []).join(' ').toLowerCase(), 5.5],
    [(p.summary || '').toLowerCase(), 3.0],
    [(p.caption || '').toLowerCase(), 2.6],
    [`${p.author_name || ''} ${p.author_username || ''}`.toLowerCase(), 2.2],
    [(p.location || '').toLowerCase(), 1.6],
    [(p.content_md || '').slice(0, 6000).toLowerCase(), 1.0],
  ];
}

export function textEvidence(p, ctx) {
  const { terms, stems, phrase } = ctx;
  const fields = fieldsOf(p);
  let text = 0, exactHits = 0;
  const blob = fields.map((f) => f[0]).join(' ');
  const words = blob.match(/[\p{L}\p{N}]{2,}/gu) || [];
  let fuzzyCredit = 0;
  let bestField = null;

  terms.forEach((term, idx) => {
    const st = stems[idx];
    let best = 0, sum = 0, hit = false;
    for (const [txt, w] of fields) {
      const tf = tfCount(txt, term) + (st !== term ? tfCount(txt, st) : 0);
      if (tf > 0) {
        hit = true;
        const contrib = w * (tf / (tf + 1.2));
        sum += contrib;
        if (contrib > best) { best = contrib; bestField = ['title','tags','summary','caption','author','location','content'][fields.findIndex(f=>f[0]===txt)]; }
      }
    }
    if (hit) { exactHits++; text += best + 0.35 * (sum - best); }
    else {
      const fz = Math.max(bestFuzzyInText(term, words), bestFuzzyInText(st, words));
      if (fz >= 0.72) fuzzyCredit += fz * 3.4;
    }
  });

  let bonus = 0;
  if (phrase.length >= 3) {
    if (fields[0][0].includes(phrase)) bonus += 9;
    if (fields[1][0].includes(phrase)) bonus += 6;
    if (fields[2][0].includes(phrase) || fields[3][0].includes(phrase)) bonus += 4;
    if (fields[6][0].includes(phrase)) bonus += 2;
  }
  const coverage = terms.length ? exactHits / terms.length : 0;

  return { text, fuzzy: fuzzyCredit, bonus, coverage, exactHits, bestField };
}

const sanitize = (s) => String(s || '').replace(/[%_,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Gather bounded candidate pools in parallel (the posting-list walk).
 * Returns merged, deduped posts carrying pool evidence for the heavy ranker.
 */
export async function gatherCandidates(ctx, kindFilter) {
  const pools = [];
  const terms = ctx.terms.slice(0, 4).map(sanitize).filter(Boolean);

  // (a) title/summary/tag/author pools — server-side OR'ed ILIKE sweep
  if (terms.length || ctx.phrase) {
    const ors = [];
    for (const t of [...terms, ...(ctx.phrase ? [sanitize(ctx.phrase)] : [])]) {
      if (!t) continue;
      ors.push(`title.ilike.%${t}%`, `summary.ilike.%${t}%`, `caption.ilike.%${t}%`, `author_name.ilike.%${t}%`);
    }
    if (ors.length) {
      let q = db.from('posts').select('*').or(ors.join(',')).order('id', { ascending: false }).limit(90);
      if (kindFilter) q = q.eq('kind', kindFilter);
      const { data } = await q;
      pools.push((data || []).map((p) => ({ p, pool: 'field' })));
    }
  }

  // (b) tag pool — jsonb containment is index-friendly on our corpus
  if (terms.length) {
    const tagPool = await Promise.all(terms.slice(0, 3).map(async (t) => {
      const { data } = await db.from('posts').select('*').contains('tags', JSON.stringify([t])).limit(40);
      return (data || []).map((p) => ({ p, pool: 'tag' }));
    }));
    pools.push(...tagPool);
  }

  // (c) operator-driven pools
  if (ctx.ops.author) {
    const { data } = await db.from('posts').select('*')
      .ilike('author_username', `%${sanitize(ctx.ops.author)}%`).order('id', { ascending: false }).limit(60);
    pools.push((data || []).map((p) => ({ p, pool: 'author-op' })));
  }
  if (ctx.ops.tag) {
    const { data } = await db.from('posts').select('*').contains('tags', JSON.stringify([ctx.ops.tag])).limit(80);
    pools.push((data || []).map((p) => ({ p, pool: 'tag-op' })));
  }

  // (d) recency pool — EarlyBird's freshness window; catches brands the
  // typed terms never mention (the system prompt for "never empty"). It is
  // deliberately small and enters scoring with a timescale advantage, not a
  // text excuse.
  {
    let q = db.from('posts').select('*').order('id', { ascending: false }).limit(80);
    if (kindFilter) q = q.eq('kind', kindFilter);
    const { data } = await q;
    pools.push((data || []).map((p) => ({ p, pool: 'recency' })));
  }

  const seen = new Map();
  for (const pool of pools.flat()) {
    const prev = seen.get(pool.p.id);
    if (!prev) seen.set(pool.p.id, pool);
    else prev.pool = `${prev.pool}+${pool.pool}`;
  }
  return [...seen.values()];
}
