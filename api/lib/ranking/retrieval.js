/*
 * =====================================================================
 *  AyurVerse ranking · retrieval — candidate generation
 *  ---------------------------------------------------------------------
 *  A self-contained BM25 lexical index plus an independent semantic path,
 *  fused with reciprocal rank fusion (k=60). Nothing here invents meaning:
 *
 *    · BM25 is field-weighted (title/tags > summary > caption > body),
 *      length-normalized, saturated tf, with a small curated synonym
 *      expansion that can never broaden beyond the corpus vocabulary.
 *    · Cosine is only valid between vectors of the SAME model and the SAME
 *      finite dimension. A post without `embedding` + `embedding_model`
 *      simply has no semantic score — never a hashed fake.
 *    · Operators (@user / from:user / #tag / kind:forge|visual|video|image)
 *      are hard, conjunctive filters. No matches ⇒ no results. We never
 *      fall back to "recent" to avoid an empty page.
 *    · For a non-empty text query, personalization may only re-rank; it can
 *      never inject unrelated content (lexical>0 OR semantic>=0.35).
 *
 *  Feed (empty query) candidates are the union of recent / follow / interest.
 * =====================================================================
 */

import { LIMITS, clamp, cleanTags, tokenize, timestamp } from './config.js';
import { personalizedScore } from './features.js';

const FIELD_NAMES = Object.freeze(['title', 'tags', 'summary', 'caption', 'body']);
const FIELD_WEIGHTS = Object.freeze({ title: 3.0, tags: 3.0, summary: 1.8, caption: 1.3, body: 1.0 });
const K1 = 1.2;
const B = 0.75;
const RRF_K = 60;
const SEMANTIC_GATE = 0.35;
const FEED_RECENT_MS = 30 * 86400_000;

/* Small curated synonym groups (bidirectional). Expansion weight 0.5. */
const SYNONYM_GROUPS = [
  ['poetry', 'poem', 'poems', 'verse', 'verses', 'shayari', 'kobita'],
  ['video', 'reel', 'reels', 'clip', 'film', 'footage'],
  ['image', 'photo', 'photos', 'photograph', 'picture', 'pic', 'still'],
  ['yoga', 'asana', 'pranayama', 'sadhana', 'meditation'],
  ['ayurveda', 'ayurvedic', 'herb', 'herbs', 'dosha', 'wellness', 'remedy'],
  ['food', 'chai', 'spice', 'spices', 'recipe', 'cooking', 'streetfood'],
  ['code', 'python', 'javascript', 'software', 'algorithm', 'developer'],
  ['math', 'mathematics', 'equation', 'theorem', 'calculus', 'algebra'],
  ['ai', 'ml', 'transformer', 'transformers', 'neural', 'llm'],
  ['rain', 'monsoon', 'storm', 'downpour'],
  ['temple', 'shrine', 'mandir', 'puja', 'prayer'],
  ['river', 'ghat', 'ganga', 'water'],
  ['dance', 'kathak', 'ghungroo', 'performance', 'bharatanatyam'],
];
const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    let set = SYNONYMS.get(word);
    if (!set) { set = new Set(); SYNONYMS.set(word, set); }
    for (const other of group) if (other !== word) set.add(other);
  }
}

/* ---------------- vector helpers ---------------- */

function toVec(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value !== 'string' && typeof value.length === 'number') {
    try { return Array.from(value); } catch { return null; }
  }
  return null;
}

/** Cosine similarity; 0 for anything invalid (wrong dims, non-finite, zero norm). */
export function cosine(a, b) {
  const va = toVec(a);
  const vb = toVec(b);
  if (!va || !vb || va.length === 0 || va.length !== vb.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < va.length; i++) {
    const x = va[i], y = vb[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Reciprocal rank fusion. `lists` is an array of ranked id arrays; `weights`
 * defaults to 1 per list. Returns `[{id, score}]` sorted desc, ties by id.
 */
export function reciprocalRankFusion(lists, weights) {
  const ls = Array.isArray(lists) ? lists : [];
  const ws = Array.isArray(weights) ? weights : [];
  const scores = new Map();
  ls.forEach((list, li) => {
    const weight = Number.isFinite(Number(ws[li])) ? Number(ws[li]) : 1;
    if (!Array.isArray(list)) return;
    list.forEach((id, rank) => {
      const key = String(id);
      scores.set(key, (scores.get(key) || 0) + weight / (RRF_K + rank + 1));
    });
  });
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/* ---------------- query understanding (strict) ---------------- */

const KIND_ALIAS = { forge: 'forge', lore: 'forge', visual: 'visual', video: 'video', image: 'image' };

function parseStrict(raw) {
  const text = String(raw ?? '').replace(/[“”]/g, '"').slice(0, LIMITS.query);
  const ops = { author: null, tag: null, kind: null };

  let phrase = '';
  const pm = text.match(/"([^"]+)"/);
  if (pm) phrase = pm[1].trim().toLowerCase();

  const stripped = text.replace(/"[^"]*"/g, ' ');
  const bare = [];
  for (const part of stripped.split(/\s+/)) {
    if (!part) continue;
    const ci = part.indexOf(':');
    if (ci > 0) {
      const key = part.slice(0, ci).toLowerCase();
      const val = part.slice(ci + 1).toLowerCase();
      if (!val) continue;
      if (['kind', 'media', 'type'].includes(key)) {
        const mapped = KIND_ALIAS[val];
        if (mapped) ops.kind = mapped;
        continue;
      }
      if (['from', 'by', 'author'].includes(key)) { ops.author = val.replace(/^@/, ''); continue; }
    }
    if (part.startsWith('@') && part.length > 1) { ops.author = part.slice(1).toLowerCase(); continue; }
    if (part.startsWith('#') && part.length > 1) { ops.tag = part.slice(1).toLowerCase(); continue; }
    bare.push(part);
  }

  const tokens = tokenize(bare.join(' ')).slice(0, LIMITS.queryTokens);
  return { ops, tokens, phrase, hasText: tokens.length > 0 || phrase.length >= 2 };
}

function kindMatch(post, k) {
  if (!k) return true;
  if (k === 'forge') return post.kind === 'forge';
  if (k === 'visual') return post.kind === 'visual';
  if (k === 'video') return post.media_type === 'video';
  if (k === 'image') return post.media_type === 'image';
  return true;
}

function authorMatch(post, needle) {
  const n = String(needle || '').toLowerCase();
  if (!n) return false;
  const un = String(post.author_username || '').toLowerCase();
  const nm = String(post.author_name || '').toLowerCase();
  const strip = (s) => s.replace(/[^a-z0-9]/g, '');
  return un === n || nm === n || un.includes(n) || nm.includes(n) || (strip(un) && strip(un) === strip(n));
}

function postHay(post) {
  return [post.title, post.summary, post.caption, (Array.isArray(post.tags) ? post.tags.join(' ') : ''), post.content_md]
    .filter((s) => typeof s === 'string')
    .join(' ')
    .toLowerCase();
}

/* ---------------- index ---------------- */

/**
 * Build a bounded BM25 index over posts. Posts are deduped by id.
 */
export function buildIndex(posts) {
  const list = (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object').slice(0, LIMITS.corpus);
  const byId = new Map();
  const docs = [];
  const inverted = new Map();
  const df = new Map();
  const lens = { title: [], tags: [], summary: [], caption: [], body: [] };

  for (const post of list) {
    const id = String(post.id);
    if (byId.has(id)) continue;
    const docIndex = docs.length;
    byId.set(id, docIndex);

    const fieldTokens = {
      title: tokenize(post.title || '').slice(0, 400),
      tags: tokenize(Array.isArray(post.tags) ? post.tags.join(' ') : '').slice(0, 400),
      summary: tokenize(post.summary || '').slice(0, 800),
      caption: tokenize(post.caption || '').slice(0, 800),
      body: tokenize(post.content_md || '').slice(0, 4000),
    };

    const docLens = {};
    const tokenSet = new Set();
    for (const field of FIELD_NAMES) {
      const toks = fieldTokens[field];
      docLens[field] = toks.length;
      lens[field].push(toks.length);
      const counts = new Map();
      for (const t of toks) {
        counts.set(t, (counts.get(t) || 0) + 1);
        tokenSet.add(t);
      }
      for (const [tok, c] of counts) {
        let posting = inverted.get(tok);
        if (!posting) { posting = new Map(); inverted.set(tok, posting); }
        let entry = posting.get(docIndex);
        if (!entry) { entry = { title: 0, tags: 0, summary: 0, caption: 0, body: 0 }; posting.set(docIndex, entry); }
        entry[field] = c;
      }
    }
    for (const tok of tokenSet) df.set(tok, (df.get(tok) || 0) + 1);

    let vec = null;
    if (Array.isArray(post.embedding) && post.embedding.length > 0 && typeof post.embedding_model === 'string' && post.embedding_model) {
      vec = { model: post.embedding_model, vec: post.embedding };
    }

    docs.push({ i: docIndex, post, id, lens: docLens, tokens: tokenSet, vec, tags: cleanTags(post.tags) });
  }

  const avg = {};
  for (const field of FIELD_NAMES) {
    const arr = lens[field];
    avg[field] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 1;
  }

  return { version: 1, byId, docs, inverted, df, avg, N: docs.length };
}

function bm25(index, doc, weights) {
  const { inverted, df, avg, N } = index;
  let score = 0;
  for (const [tok, w] of weights) {
    const posting = inverted.get(tok);
    if (!posting) continue;
    const entry = posting.get(doc.i);
    if (!entry) continue;
    const dfv = df.get(tok) || 1;
    const idf = Math.max(0, Math.log(1 + (N - dfv + 0.5) / (dfv + 0.5)));
    let fieldScore = 0;
    for (const field of FIELD_NAMES) {
      const tf = entry[field];
      if (!tf) continue;
      const len = doc.lens[field] || 0;
      const av = avg[field] || 1;
      const norm = K1 * (1 - B + B * (len / av));
      fieldScore += FIELD_WEIGHTS[field] * ((tf * (K1 + 1)) / (tf + norm));
    }
    score += w * idf * fieldScore;
  }
  return score;
}

/* ---------------- retrieve ---------------- */

function idDesc(a, b) {
  const na = Number(a.id), nb = Number(b.id);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
  return String(b.id) < String(a.id) ? -1 : String(b.id) > String(a.id) ? 1 : 0;
}

/**
 * @returns {{candidates:Array, plan:object, stats:object}}
 */
export function retrieve(index, opts = {}) {
  const started = Date.now();
  const {
    query = '', userFeatures = {}, preferences = {}, followIds = [],
    queryVector = null, embeddingModel = null,
    limit = LIMITS.candidates, now = Date.now(), kind = null,
  } = opts || {};

  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  const idx = index && Array.isArray(index.docs) && index.inverted ? index : buildIndex([]);

  const parsed = parseStrict(query);
  const kindParam = kind ? String(kind).toLowerCase() : null;
  const plan = {
    raw: String(query ?? '').slice(0, LIMITS.query),
    tokens: parsed.tokens,
    phrase: parsed.phrase,
    ops: { author: parsed.ops.author, tag: parsed.ops.tag, kind: parsed.ops.kind },
    kind: kindParam || parsed.ops.kind,
    kindParam,
    hasText: parsed.hasText,
    mode: parsed.hasText ? 'search' : 'feed',
  };

  const opAuthor = parsed.ops.author;
  const opTag = parsed.ops.tag;
  const opKind = parsed.ops.kind;

  const filteredDocs = idx.docs.filter((d) => {
    const p = d.post;
    if (kindParam && !kindMatch(p, kindParam)) return false;
    if (opKind && !kindMatch(p, opKind)) return false;
    if (opAuthor && !authorMatch(p, opAuthor)) return false;
    if (opTag && !d.tags.includes(opTag)) return false;
    return true;
  });

  // query term weights + curated synonym expansion (reduced weight)
  const qWeights = new Map();
  for (const t of parsed.tokens) {
    qWeights.set(t, Math.max(qWeights.get(t) || 0, 1));
    const syn = SYNONYMS.get(t);
    if (syn) for (const s of syn) if ((qWeights.get(s) || 0) < 0.5) qWeights.set(s, 0.5);
  }
  const phrase = parsed.phrase && parsed.phrase.length >= 2 ? parsed.phrase : '';

  const qVec = toVec(queryVector);
  const semanticUsable = !!(qVec && qVec.length > 0 && typeof embeddingModel === 'string' && embeddingModel);

  const scored = filteredDocs.map((d) => {
    let raw = qWeights.size ? bm25(idx, d, qWeights) : 0;
    if (phrase && postHay(d.post).includes(phrase)) raw += 2.5;
    const lexical = raw > 0 ? raw / (raw + 5) : 0;

    let semantic = 0;
    if (semanticUsable && d.vec && d.vec.model === embeddingModel && d.vec.vec.length === qVec.length) {
      semantic = clamp(cosine(qVec, d.vec.vec), 0, 1);
    }

    const personalized = clamp(personalizedScore(d.post, userFeatures, prefs, followIds, nowMs), 0, 1);
    return { d, lexical, semantic, personalized };
  });

  // Non-empty text query: personalization may re-rank but never inject.
  let pool = scored;
  if (plan.hasText) pool = pool.filter((x) => x.lexical > 0 || x.semantic >= SEMANTIC_GATE);

  const followSet = new Set((Array.isArray(followIds) ? followIds : []).map(String));

  const lexList = pool.filter((x) => x.lexical > 0).sort((a, b) => b.lexical - a.lexical || idDesc(a.d.post, b.d.post)).map((x) => x.d.post.id);
  const semList = pool.filter((x) => x.semantic > 0).sort((a, b) => b.semantic - a.semantic || idDesc(a.d.post, b.d.post)).map((x) => x.d.post.id);
  const perList = pool.filter((x) => x.personalized > 0).sort((a, b) => b.personalized - a.personalized || idDesc(a.d.post, b.d.post)).map((x) => x.d.post.id);
  const rrfById = new Map(reciprocalRankFusion([lexList, semList, perList], [1, 1, 0.4]).map((f) => [String(f.id), f.score]));

  const candidates = pool.map((x) => {
    const p = x.d.post;
    const sources = [];
    if (x.lexical > 0) sources.push('lexical');
    if (x.semantic > 0) sources.push('semantic');
    if (x.personalized > 0) sources.push('personalized');
    if (followSet.has(String(p.author_id))) sources.push('follow');
    if (plan.mode === 'feed') {
      if (timestamp(p.created_at, 0) >= nowMs - FEED_RECENT_MS) sources.push('recent');
      if (x.personalized > 0) sources.push('interest');
    }
    return { post: p, lexical: x.lexical, semantic: x.semantic, personalized: x.personalized, rrf: rrfById.get(String(p.id)) || 0, sources };
  });

  candidates.sort((a, b) => b.rrf - a.rrf || idDesc(a.post, b.post));
  const capped = candidates.slice(0, Math.max(0, Math.min(LIMITS.candidates, Number(limit) || LIMITS.candidates)));

  const stats = {
    candidates: capped.length,
    scanned: idx.N,
    considered: filteredDocs.length,
    lexicalMatches: pool.filter((x) => x.lexical > 0).length,
    semanticMatches: pool.filter((x) => x.semantic > 0).length,
    personalized: pool.filter((x) => x.personalized > 0).length,
    semanticUsed: semanticUsable && pool.some((x) => x.semantic > 0),
    degraded: !semanticUsable,
    ms: Date.now() - started,
  };

  return { candidates: capped, plan, stats };
}
