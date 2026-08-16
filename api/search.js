import supabase, { db, enterScope, applyCors } from './db-client.js';

/* ------------------------------------------------------------------ *
 *  AyurVerse Library search — fuzzy, forgiving, never-empty.
 *
 *  Pipeline:
 *   1. tokenize + normalize (light stemmer)         → base terms
 *   2. expand with a domain lexicon (synonyms)       → expanded terms
 *   3. score every post with a BM25-style field mix  → text score
 *        + fuzzy partial credit (typos / near-miss)
 *        + phrase & proximity bonuses
 *        + term-coverage boost
 *   4. re-rank with engagement · freshness · taste
 *   5. relaxation cascade so results are NEVER empty:
 *        exact → close (fuzzy/synonym) → suggested (loose/popular)
 *   6. return matchQuality + a "did you mean" suggestion
 * ------------------------------------------------------------------ */

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'or', 'for', 'with', 'is', 'are',
  'at', 'by', 'from', 'that', 'this', 'it', 'as', 'be', 'was', 'were', 'my', 'me',
]);

// domain lexicon — each key expands to related terms (bidirectional at build time)
const LEXICON_RAW = {
  poetry: ['poem', 'poems', 'verse', 'verses', 'recitation', 'kobita', 'shayari', 'sonnet'],
  video: ['reel', 'reels', 'clip', 'film', 'movie', 'footage'],
  image: ['photo', 'photos', 'photograph', 'picture', 'pic', 'still', 'snapshot'],
  yoga: ['asana', 'asanas', 'pranayama', 'sadhana', 'meditation', 'stretch'],
  ayurveda: ['ayurvedic', 'herb', 'herbs', 'herbal', 'dosha', 'doshas', 'wellness', 'remedy', 'tonic'],
  river: ['ghat', 'ghats', 'ganga', 'ganges', 'water', 'stream'],
  dance: ['kathak', 'chakkar', 'chakkars', 'ghungroo', 'performance', 'nritya'],
  food: ['chai', 'spice', 'spices', 'recipe', 'cooking', 'streetfood', 'rasa', 'cuisine'],
  code: ['coding', 'programming', 'software', 'developer', 'dev', 'algorithm', 'python', 'javascript'],
  math: ['mathematics', 'equation', 'equations', 'theorem', 'calculus', 'algebra', 'euler'],
  temple: ['shrine', 'mandir', 'aarti', 'ritual', 'puja', 'prayer'],
  mountain: ['mountains', 'himalaya', 'himalayas', 'peak', 'hill', 'hills'],
  rain: ['monsoon', 'storm', 'showers', 'downpour'],
  festival: ['diwali', 'holi', 'celebration', 'diya', 'diyas', 'lights'],
  ai: ['ml', 'model', 'models', 'transformer', 'transformers', 'neural', 'llm'],
};

// build a flat expansion map both directions
const LEXICON = new Map();
function link(a, b) {
  if (!LEXICON.has(a)) LEXICON.set(a, new Set());
  LEXICON.get(a).add(b);
}
for (const [key, arr] of Object.entries(LEXICON_RAW)) {
  for (const w of arr) {
    link(key, w);
    link(w, key);
    for (const w2 of arr) if (w2 !== w) link(w, w2);
  }
}

const tokens = (q) => (q || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];

// very light stemmer — strips common English suffixes to a stable base
function stem(w) {
  let s = w;
  s = s.replace(/(ies)$/,'y');
  s = s.replace(/(sses)$/,'ss');
  s = s.replace(/(ing|edly|ed|ly|es|s)$/,'');
  if (s.length < 2) return w;
  return s;
}

/* -------- fuzzy string similarity (Levenshtein → 0..1) -------- */
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
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

function similarity(a, b) {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// best fuzzy match of `term` against the words already present in a text blob
function bestFuzzyInText(term, words) {
  let best = 0;
  for (const w of words) {
    if (Math.abs(w.length - term.length) > 3) continue; // cheap length gate
    const s = similarity(term, w);
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}

function tfCount(text, term) {
  if (!text) return 0;
  let c = 0;
  let i = 0;
  while ((i = text.indexOf(term, i)) !== -1) {
    c++;
    i += term.length;
  }
  return c;
}

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

// build the searchable field set for a post, with per-field weights
function fieldsOf(p) {
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

/*
 * Score one post against the query.
 * Returns { text, coverage, fuzzy, exactHits } so the caller can decide
 * which relaxation stage a result belongs to.
 */
function scorePost(p, ctx) {
  const { terms, stems, expanded, phrase } = ctx;
  const fields = fieldsOf(p);
  const blob = fields.map((f) => f[0]).join(' ');
  const words = blob.match(/[\p{L}\p{N}]{2,}/gu) || [];

  let text = 0;
  let exactHits = 0;
  let fuzzyCredit = 0;
  const covered = new Set();

  terms.forEach((term, idx) => {
    const st = stems[idx];
    let best = 0;
    let sum = 0;
    let hitExact = false;

    for (const [txt, w] of fields) {
      // exact / substring term frequency (saturating)
      const tf = tfCount(txt, term) + (st !== term ? tfCount(txt, st) : 0);
      if (tf > 0) {
        hitExact = true;
        const contrib = w * (tf / (tf + 1.2));
        sum += contrib;
        if (contrib > best) best = contrib;
      }
    }

    if (hitExact) {
      exactHits++;
      covered.add(idx);
      text += best + 0.35 * (sum - best);
    } else {
      // no exact hit — try fuzzy against the post's own vocabulary
      const fz = Math.max(bestFuzzyInText(term, words), bestFuzzyInText(st, words));
      if (fz >= 0.72) {
        covered.add(idx);
        fuzzyCredit += fz * 3.4; // near-miss / typo partial credit
      }
    }
  });

  // synonym / related-term expansion credit (weaker than a real hit)
  let synCredit = 0;
  for (const syn of expanded) {
    if (blob.includes(syn)) synCredit += 1.4;
  }

  // exact-phrase & field bonuses
  let bonus = 0;
  if (phrase.length >= 3) {
    if (fields[0][0].includes(phrase)) bonus += 9;
    if (fields[1][0].includes(phrase)) bonus += 6;
    if (fields[2][0].includes(phrase) || fields[3][0].includes(phrase)) bonus += 4;
    if (fields[6][0].includes(phrase)) bonus += 2;
  }

  // term-coverage boost — reward results that touch more of the query
  const coverage = terms.length ? covered.size / terms.length : 0;
  const coverageBoost = coverage * 4.5;

  return {
    text,
    fuzzy: fuzzyCredit,
    syn: synCredit,
    bonus,
    coverage,
    exactHits,
    combined: text * 3 + fuzzyCredit + synCredit + bonus + coverageBoost,
  };
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Edge caching: anonymous reads are shared across the CDN; authed reads
    // carry personal flags (liked/saved), so they stay private and uncached.
    res.setHeader(
      'Cache-Control',
      req.headers.authorization ? 'private, no-store' : 'public, s-maxage=15, stale-while-revalidate=30'
    );

    const raw = String(req.query.q || '').trim();
    const kind = req.query.kind ? String(req.query.kind) : null;

    const user = await getAuthUser(req);

    // fetch the candidate pool once
    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .order('id', { ascending: false })
      .limit(600);
    if (error) throw error;

    const kindFilter = (p) => {
      if (kind === 'forge') return p.kind === 'forge';
      if (kind === 'video') return p.media_type === 'video';
      if (kind === 'image') return p.media_type === 'image';
      return true;
    };
    const pool = (posts || []).filter(kindFilter);

    // empty query → curated discovery (popular + fresh), never an error
    if (!raw) {
      const now = Date.now();
      const disco = [...pool]
        .map((p) => {
          const ageDays = (now - new Date(p.created_at).getTime()) / 86400000;
          const score =
            Math.log1p(p.likes_count || 0) * 1.2 +
            Math.log1p(p.views_count || 0) +
            2.2 * Math.exp((-Math.LN2 * ageDays) / 20);
          return { p, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
        .map((s) => s.p);
      const { data: peopleRows } = await db.from('profiles').select('*').limit(8);
      const { data: discoGroups } = await db.from('groups').select('*').order('member_count', { ascending: false }).limit(8);
      let myG = new Set();
      if (user) {
        const { data: mem } = await db.from('group_members').select('group_id').eq('user_id', user.id);
        myG = new Set((mem || []).map((m) => m.group_id));
      }
      return res.status(200).json({
        posts: disco,
        people: peopleRows || [],
        groups: (discoGroups || []).map((g) => ({ ...g, is_member: myG.has(g.id) })),
        meta: { terms: 0, ranked: disco.length, matchQuality: 'discovery', suggestion: null },
      });
    }

    /* ---------- prepare query ---------- */
    const rawTerms = tokens(raw).filter((t) => !STOP.has(t)).slice(0, 12);
    const terms = rawTerms.length ? rawTerms : tokens(raw).slice(0, 12);
    const stems = terms.map(stem);
    const phrase = raw.toLowerCase();

    // synonym expansion set (from lexicon on both raw + stem)
    const expanded = new Set();
    for (const t of [...terms, ...stems]) {
      const set = LEXICON.get(t);
      if (set) for (const s of set) expanded.add(s);
    }

    // light personal taste weights
    const tagW = {};
    if (user) {
      const { data: sig } = await supabase
        .from('signals').select('tags, created_at').eq('user_id', user.id)
        .order('id', { ascending: false }).limit(200);
      (sig || []).forEach((s) => (s.tags || []).forEach((t) => { tagW[t] = (tagW[t] || 0) + 1; }));
    }

    const ctx = { terms, stems, expanded, phrase };
    const now = Date.now();

    const scored = pool.map((p) => {
      const s = scorePost(p, ctx);
      const ageDays = (now - new Date(p.created_at).getTime()) / 86400000;
      const engage = (1.3 * Math.log1p(p.views_count || 0)) / 10 + (0.9 * Math.log1p(p.likes_count || 0)) / 9;
      const fresh = 0.9 * Math.exp((-Math.LN2 * ageDays) / 17);
      let perso = 0;
      for (const tg of p.tags || []) perso += (tagW[tg] || 0) * 0.5;
      const finalScore = s.combined + engage + fresh + perso;
      return { p, s, finalScore };
    });

    /* ---------- relaxation cascade — never empty ---------- */
    // Stage 1 · strong: at least one exact term hit or a real phrase bonus
    let bucket = scored.filter((r) => r.s.exactHits > 0 || r.s.bonus > 0);
    let matchQuality = 'exact';

    // Stage 2 · close: fuzzy typo / synonym matches
    if (bucket.length === 0) {
      bucket = scored.filter((r) => r.s.fuzzy > 0 || r.s.syn > 0);
      matchQuality = 'close';
    }

    // Stage 3 · suggested: anything with any positive signal at all
    if (bucket.length === 0) {
      bucket = scored.filter((r) => r.finalScore > 0.5);
      matchQuality = 'suggested';
    }

    // Stage 4 · safety net: closest-by-popularity so we always answer
    if (bucket.length === 0) {
      bucket = scored
        .map((r) => ({
          ...r,
          finalScore:
            Math.log1p(r.p.likes_count || 0) +
            Math.log1p(r.p.views_count || 0) +
            2 * Math.exp((-Math.LN2 * ((now - new Date(r.p.created_at).getTime()) / 86400000)) / 20),
        }));
      matchQuality = 'suggested';
    }

    bucket.sort((a, b) => b.finalScore - a.finalScore || b.p.id - a.p.id);
    const items = bucket.slice(0, 30).map((r) => r.p);

    /* ---------- people: exact + fuzzy ---------- */
    // Server-side prefilter (PostgREST ILIKE) over the first terms keeps the
    // scoring pool bounded no matter how many weavers join — no full-table hugs.
    const peoplePoolQ = terms.length
      ? supabase
          .from('profiles')
          .select('*')
          .or(
            terms
              .slice(0, 4)
              .flatMap((t) => {
                const s = t.replace(/[%_,()"\\]/g, '');
                if (!s) return [];
                return [`username.ilike.%${s}%`, `full_name.ilike.%${s}%`];
              })
              .join(','),
          )
          .limit(240)
      : db.from('profiles').select('*').order('id', { ascending: false }).limit(60);
    const { data: peopleRows } = await peoplePoolQ;
    const scoredPeople = (peopleRows || [])
      .map((pr) => {
        const un = (pr.username || '').toLowerCase();
        const fn = (pr.full_name || '').toLowerCase();
        const bio = (pr.bio || '').toLowerCase();
        const nameWords = `${un} ${fn} ${bio}`.match(/[\p{L}\p{N}]{2,}/gu) || [];
        let s = 0;
        for (const t of terms) {
          if (un.includes(t)) s += 4;
          if (fn.includes(t)) s += 3;
          if (bio.includes(t)) s += 1;
          if (s === 0) {
            const fz = bestFuzzyInText(t, nameWords);
            if (fz >= 0.74) s += fz * 3;
          }
        }
        if (un.includes(phrase)) s += 4;
        return { pr, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.pr);

    /* ---------- groups: exact + fuzzy ---------- */
    // Same discipline: prefilter by name/description instead of hauling the lot.
    const groupOrQ = terms.length
      ? supabase
          .from('groups')
          .select('*')
          .or(
            terms
              .slice(0, 3)
              .flatMap((t) => {
                const s = t.replace(/[%_,()"\\]/g, '');
                if (!s) return [];
                return [`name.ilike.%${s}%`, `description.ilike.%${s}%`];
              })
              .join(','),
          )
          .limit(120)
      : db.from('groups').select('*').limit(120);
    const { data: groupRows } = await groupOrQ;
    let myGroupIds = new Set();
    if (user) {
      const { data: mem } = await db.from('group_members').select('group_id').eq('user_id', user.id);
      myGroupIds = new Set((mem || []).map((m) => m.group_id));
    }
    const scoredGroups = (groupRows || [])
      .map((g) => {
        const name = (g.name || '').toLowerCase();
        const desc = (g.description || '').toLowerCase();
        const gtags = (g.tags || []).join(' ').toLowerCase();
        const words = `${name} ${desc} ${gtags}`.match(/[\p{L}\p{N}]{2,}/gu) || [];
        let s = 0;
        for (const t of terms) {
          if (name.includes(t)) s += 5;
          if (gtags.includes(t)) s += 4;
          if (desc.includes(t)) s += 1.5;
          if (s === 0) {
            const fz = bestFuzzyInText(t, words);
            if (fz >= 0.74) s += fz * 3;
          }
        }
        if (name.includes(phrase)) s += 6;
        // a small nudge so popular groups surface on ties
        s += Math.log1p(g.member_count || 0) * 0.15;
        return { g: { ...g, is_member: myGroupIds.has(g.id) }, s };
      })
      .filter((x) => x.s > 0.3)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.g);

    /* ---------- "did you mean" suggestion ---------- */
    // if the top query term barely matched, offer the closest known vocabulary word
    let suggestion = null;
    if (matchQuality !== 'exact') {
      const vocab = new Set();
      for (const p of pool) {
        (p.tags || []).forEach((t) => vocab.add(String(t).toLowerCase()));
        (p.title || '').toLowerCase().match(/[\p{L}]{3,}/g)?.forEach((w) => vocab.add(w));
      }
      for (const k of LEXICON.keys()) vocab.add(k);

      let bestWord = null;
      let bestSim = 0;
      const probe = terms[0] || phrase;
      for (const w of vocab) {
        if (w === probe) continue;
        const sim = similarity(probe, w);
        if (sim > bestSim) { bestSim = sim; bestWord = w; }
      }
      if (bestWord && bestSim >= 0.6 && bestWord !== probe) suggestion = bestWord;
    }

    return res.status(200).json({
      posts: items,
      people: scoredPeople,
      groups: scoredGroups,
      meta: {
        terms: terms.length,
        ranked: bucket.length,
        matchQuality, // 'exact' | 'close' | 'suggested'
        suggestion,   // e.g. "ayurveda" when user typed "ayurvediic"
        query: raw,
      },
    });
  } catch (err) {
    console.error('search error:', err);
    res.status(500).json({ error: err.message });
  }
}
