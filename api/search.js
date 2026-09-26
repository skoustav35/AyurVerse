import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';
import { parseQuery, tokens } from './lib/unicorn.js';
import { gatherCandidates, textEvidence, bestFuzzyInText } from './lib/earlybird.js';
import { heavyScore } from './lib/heavyrank.js';
import { productRules, tierOf } from './lib/productrules.js';

/* =====================================================================
 *  The Library engine, rebuilt as a port of the open "the-algorithm"
 *  search stack:
 *      unicorn    query understanding (operators, terms, phrase, stems)
 *      earlybird  parallel bounded candidate pools (field / tag / operator
 *                 / recency), each carrying Lucene-ish field evidence
 *      heavyrank  weighted engagement + social edge + taste spectrum +
 *                 freshness decay + author authority, floors included
 *      heuristics author-diversity braid, kind mixing, trust tiers
 *
 *  Product contract kept: results NEVER come back empty (the answer
 *  replies with its hands open — exact → close → suggested), people and
 *  circles answer alongside posts, and meta explains itself.
 * ===================================================================== */

const LEXICON_RAW = {
  poetry: ['poem', 'poems', 'verse', 'verses', 'recitation', 'kobita', 'shayari'],
  video: ['reel', 'reels', 'clip', 'film', 'footage'],
  image: ['photo', 'photos', 'photograph', 'picture', 'pic', 'still'],
  yoga: ['asana', 'pranayama', 'sadhana', 'meditation', 'stretch'],
  ayurveda: ['ayurvedic', 'herb', 'herbs', 'dosha', 'wellness', 'remedy'],
  river: ['ghat', 'ghats', 'ganga', 'water'],
  dance: ['kathak', 'ghungroo', 'performance', 'bharatanatyam'],
  food: ['chai', 'spice', 'spices', 'recipe', 'cooking', 'streetfood'],
  code: ['python', 'javascript', 'software', 'algorithm', 'developer'],
  math: ['mathematics', 'equation', 'theorem', 'calculus', 'algebra'],
  ai: ['ml', 'transformer', 'transformers', 'neural', 'llm', 'model'],
  rain: ['monsoon', 'storm', 'downpour'],
  temple: ['shrine', 'mandir', 'puja', 'prayer'],
};

const LEXICON = new Map();
const lexLink = (a, b) => { if (!LEXICON.has(a)) LEXICON.set(a, new Set()); LEXICON.get(a).add(b); };
for (const [k, arr] of Object.entries(LEXICON_RAW)) {
  for (const w of arr) {
    lexLink(k, w);
    lexLink(w, k);
    for (const w2 of arr) if (w2 !== w) lexLink(w, w2);
  }
}

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await resolveUser(req);
  return user || null;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // anonymized reads cacheable at the edge; authed reads carry personal edges
  res.setHeader(
    'Cache-Control',
    req.headers.authorization ? 'private, no-store' : 'public, s-maxage=15, stale-while-revalidate=30',
  );

  const started = Date.now();

  try {
    const qRaw = String(req.query.q || '').trim();
    const kindQ = req.query.kind ? String(req.query.kind) : null; // forge | visual | video | image
    const user = await getAuthUser(req);

    /* -------------------- unicorn · understand the ask -------------------- */
    const plan = parseQuery(qRaw);
    const kindFilter =
      plan.ops.kind === 'forge' ? 'forge'
        : plan.ops.kind === 'visual' ? 'visual'
        : null; // video/image narrow media_type later

    const mediaFilter = (p) => {
      if (plan.ops.kind === 'video') return p.media_type === 'video';
      if (plan.ops.kind === 'image') return p.media_type === 'image';
      return true;
    };

    /* -------------------- discovery landing: no ask at all -------------------- */
    if (!qRaw) {
      const { data: recent } = await db.from('posts').select('*').order('id', { ascending: false }).limit(120);
      const now = Date.now();
      const ctx = { now, viewerFollows: new Set(), taste: {}, authorPostCount: new Map(), ops: {} };
      const disco = productRules(
        (recent || [])
          .map((p) => {
            const evidence = { text: 0, fuzzy: 0, bonus: 0, coverage: 0, exactHits: 0 };
            const { score, features } = heavyScore({ p, pool: 'discovery', evidence }, { ...ctx, ops: {} });
            return { p, evidence, score, ...features };
          })
          .sort((a, b) => b.score - a.score),
      ).slice(0, 30);

      const { data: peopleRows } = await db
        .from('profiles')
        .select('*')
        .order('id', { ascending: false })
        .limit(kindQ === 'people' ? 60 : 12);
      const { data: discoGroups } = await db.from('groups').select('*').order('member_count', { ascending: false }).limit(8);
      let myG = new Set();
      if (user) {
        const { data: mem } = await db.from('group_members').select('group_id').eq('user_id', user.id);
        myG = new Set((mem || []).map((m) => m.group_id));
      }
      return res.status(200).json({
        posts: disco.map((r) => r.p),
        people: peopleRows || [],
        groups: (discoGroups || []).map((g) => ({ ...g, is_member: myG.has(g.id) })),
        meta: {
          engine: 'unicorn+earlybird+heavyrank@1.0',
          stages: { candidates: (recent || []).length, served: disco.length },
          terms: [],
          matchQuality: 'discovery',
          ms: Date.now() - started,
        },
      });
    }

    /* -------------------- earlybird · walk the posting lists -------------------- */
    const candidates = await gatherCandidates({ terms: plan.terms, stems: plan.stems, phrase: plan.phrase, ops: plan.ops }, kindFilter);
    const mediaFiltered = candidates.filter(({ p }) => mediaFilter(p));

    // operator semantics are HARD (Twitter's from:/# obey, never negotiate):
    // typing @aarav or #holi constrains the answer to that author / that tag.
    let pool = mediaFiltered;
    let constrained = false;
    if (plan.ops.author) {
      const narrowed = mediaFiltered.filter(({ p }) =>
        (p.author_username || '').toLowerCase().includes(plan.ops.author.toLowerCase()) ||
        (p.author_name || '').toLowerCase().includes(plan.ops.author.toLowerCase()));
      if (narrowed.length) { pool = narrowed; constrained = true; }
    }
    if (plan.ops.tag) {
      const narrowed = pool.filter(({ p }) => (p.tags || []).map((t) => String(t).toLowerCase()).includes(plan.ops.tag));
      if (narrowed.length) { pool = narrowed; constrained = true; }
    }

    // viewer context for the heavy ranker — the social graph edge, and the
    // taste spectrum (our SimClusters-lite: recent signal tags by affinity)
    let viewerFollows = new Set();
    let taste = {};
    if (user) {
      const [{ data: fol }, { data: sig }] = await Promise.all([
        db.from('follows').select('followee_id').eq('follower_id', user.id).limit(500),
        db.from('signals').select('tags').eq('user_id', user.id).order('id', { ascending: false }).limit(220),
      ]);
      viewerFollows = new Set((fol || []).map((r) => r.followee_id));
      (sig || []).forEach((s) => (s.tags || []).forEach((t) => { taste[t] = (taste[t] || 0) + 1; }));
    }
    const authorPostCount = new Map();
    for (const { p } of pool) authorPostCount.set(p.author_id, (authorPostCount.get(p.author_id) || 0) + 1);

    /* -------------------- heavyrank · the neural bargain -------------------- */
    const ctx = { ...plan, now: Date.now(), viewerFollows, taste, authorPostCount };
    const scored = pool.map((cand) => {
      const evidence = textEvidence(cand.p, ctx);
      const { score, features } = heavyScore({ ...cand, evidence }, ctx);
      return { p: cand.p, evidence, score, features, tier: tierOf({ ...cand, evidence }) };
    });

    /* -------------------- heuristics · braid, cap, never-empty -------------------- */
    let tierUsed = null;
    let bucket = scored.filter((r) => r.tier === 'exact');
    if (bucket.length) tierUsed = 'exact';
    if (!bucket.length) {
      bucket = scored.filter((r) => r.tier === 'close');
      tierUsed = bucket.length ? 'close' : tierUsed;
    }
    if (!bucket.length) {
      bucket = scored;
      tierUsed = 'suggested';
    }

    const termSet = new Set(plan.terms);

    bucket.sort((a, b) => b.score - a.score || b.p.id - a.p.id);
    const braided = productRules(bucket);
    const top = braided.slice(0, 30);

    /* -------------------- people & circles answer too -------------------- */
    const safe = (s) => String(s || '').replace(/[%_,()"\\]/g, '').trim();
    const cleanRaw = qRaw.replace(/^@+/, '').trim().toLowerCase();
    const rawTokens = tokens(cleanRaw);
    const searchTerms = Array.from(new Set([
      cleanRaw,
      ...rawTokens,
      ...plan.terms,
      ...(plan.ops.author ? [plan.ops.author, ...tokens(plan.ops.author)] : []),
    ])).filter((t) => t && t.length >= 1);

    const peopleOr = searchTerms.map(safe).filter(Boolean).flatMap((t) => [
      `username.ilike.%${t}%`,
      `full_name.ilike.%${t}%`,
      `bio.ilike.%${t}%`,
    ]);

    const { data: peopleRows } = peopleOr.length
      ? await db.from('profiles').select('*').or(peopleOr.join(',')).limit(240)
      : await db.from('profiles').select('*').order('id', { ascending: false }).limit(60);

    const scoredPeople = (peopleRows || [])
      .map((pr) => {
        const un = (pr.username || '').toLowerCase();
        const fn = (pr.full_name || '').toLowerCase();
        const bio = (pr.bio || '').toLowerCase();
        const nameWords = `${un} ${fn} ${bio}`.match(/[\p{L}\p{N}]{2,}/gu) || [];
        let s = 0;

        if (cleanRaw && un === cleanRaw) s += 25;
        if (cleanRaw && fn === cleanRaw) s += 20;
        if (cleanRaw && un.startsWith(cleanRaw)) s += 12;
        if (cleanRaw && fn.startsWith(cleanRaw)) s += 10;
        if (cleanRaw && (un.includes(cleanRaw) || fn.includes(cleanRaw))) s += 8;
        if (cleanRaw && bio.includes(cleanRaw)) s += 4;

        for (const t of searchTerms) {
          if (un === t) s += 15;
          else if (un.startsWith(t)) s += 8;
          else if (un.includes(t)) s += 5;
          if (fn === t) s += 12;
          else if (fn.startsWith(t)) s += 6;
          else if (fn.includes(t)) s += 4;
          if (bio.includes(t)) s += 2;
          if (s === 0) {
            const fz = bestFuzzyInText(t, nameWords);
            if (fz >= 0.74) s += fz * 3;
          }
        }
        if (plan.phrase && (un.includes(plan.phrase) || fn.includes(plan.phrase))) s += 4;
        return { pr, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.pr.id || 0) - (a.pr.id || 0))
      .slice(0, kindQ === 'people' ? 50 : 20)
      .map((x) => x.pr);

    const groupOr = plan.terms.slice(0, 3).map(safe).filter(Boolean).flatMap((t) => [`name.ilike.%${t}%`, `description.ilike.%${t}%`]);
    const { data: groupRows } = groupOr.length
      ? await db.from('groups').select('*').or(groupOr.join(',')).limit(120)
      : await db.from('groups').select('*').limit(120);
    let myGSet = new Set();
    if (user) {
      const { data: mem } = await db.from('group_members').select('group_id').eq('user_id', user.id);
      myGSet = new Set((mem || []).map((m) => m.group_id));
    }
    const termWords = plan.terms;
    const scoredGroups = (groupRows || [])
      .map((g) => {
        const hay = `${g.name || ''} ${(g.description || '')} ${(g.tags || []).join(' ')}`.toLowerCase();
        let s = 0;
        for (const t of termWords) if (hay.includes(t)) s += t.length > 4 ? 3 : 2;
        s += Math.min(4, Math.log1p(g.member_count || 1) * 0.8);
        return { g, s };
      })
      .filter((x) => x.s > 1.0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => ({ ...x.g, is_member: myGSet.has(x.g.id) }));

    /* -------------------- attach the why -------------------- */
    const items = top.map((r, i) => ({
      ...r.p,
      rank: i === 0
        ? { engine: 'heavyrank', tier: r.tier, score: Math.round(r.score * 100) / 100, topFeatures: r.features }
        : i < 4
          ? { tier: r.tier, score: Math.round(r.score * 100) / 100 }
          : undefined,
    }));

    const suggestion = (() => {
      if (tierUsed === 'exact' || termSet.size === 0) return null;
      const words = Array.from(new Set(items.flatMap((p) => tokens(p.title || '') .concat(tokens((p.tags || []).join(' '))))));
      return words.length ? words[0] : null;
    })();

    return res.status(200).json({
      posts: items,
      people: scoredPeople,
      groups: scoredGroups,
      meta: {
        engine: 'unicorn+earlybird+heavyrank@1.0',
        ports: { unicorn: 'query-understanding', earlybird: 'candidate generation', heavyrank: 'engagement geometry', productrules: 'heuristics weave' },
        stages: {
          candidates: candidates.length,
          pools: { field: pool.filter((c) => c.pool?.includes('field')).length, tag: pool.filter((c) => c.pool?.includes('tag')).length, operator: pool.filter((c) => c.pool?.includes('-op')).length, recency: pool.filter((c) => c.pool?.includes('recency')).length },
          tier: tierUsed,
          served: items.length,
        },
        ops: plan.ops,
        terms: plan.terms,
        constrained,
        matchQuality: tierUsed,
        suggestion,
        ms: Date.now() - started,
      },
    });
  } catch (err) {
    console.error('library engine error:', err);
    return res.status(500).json({ error: err.message || 'The engine sputtered' });
  }
}
