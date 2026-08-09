import supabase from './db-client.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tokens = (q) => (q || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

async function attachFlags(items, user) {
  if (!user || !items.length) return items;
  const ids = items.map((p) => p.id);
  const [{ data: likes }, { data: saves }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', user.id).in('post_id', ids),
    supabase.from('saves').select('post_id').eq('user_id', user.id).in('post_id', ids),
  ]);
  const likedSet = new Set((likes || []).map((l) => l.post_id));
  const savedSet = new Set((saves || []).map((s) => s.post_id));
  items.forEach((p) => {
    p.liked = likedSet.has(p.id);
    p.saved = savedSet.has(p.id);
  });
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await getAuthUser(req);
    const kindFilter = req.query.kind === 'forge' ? 'forge' : null;
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const limit = clamp(parseInt(req.query.limit, 10) || 8, 1, 20);

    /* ---------- Stage 1 · candidate generation (cheap recall) ---------- */
    let cq = supabase.from('posts').select('*').order('id', { ascending: false }).limit(400);
    if (kindFilter) cq = cq.eq('kind', 'forge');
    const { data: posts, error } = await cq;
    if (error) throw error;

    /* ---------- interaction signals (memory of taste) ---------- */
    let signals = [];
    if (user) {
      const { data: s } = await supabase
        .from('signals')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false })
        .limit(500);
      signals = s || [];
    }

    const postById = new Map(posts.map((p) => [p.id, p]));
    const now = Date.now();
    const day = new Date().toISOString().slice(0, 10);
    const tagW = {};
    const authorW = {};
    const kindW = {};
    const termW = {};
    const seen = new Set();

    for (const ev of signals) {
      const ageDays = (now - new Date(ev.created_at).getTime()) / 86400000;
      const decay = Math.exp((-Math.LN2 * ageDays) / 9); // taste half-life ≈ 9 days
      let w = { like: 2.4, save: 2.8, comment: 3.4, view: 1.0, search: 0, dwell: 0 }[ev.type];
      if (w === undefined) w = 1;
      if (ev.type === 'dwell') w = clamp((ev.dwell_ms || 0) / 3000, 0.5, 3); // 3s dwell = 1 unit of attention
      w *= decay;
      (ev.tags || []).forEach((t) => { tagW[t] = (tagW[t] || 0) + w; });
      if (ev.kind) kindW[ev.kind] = (kindW[ev.kind] || 0) + w * 0.6;
      if (ev.query) tokens(ev.query).forEach((t) => { termW[t] = (termW[t] || 0) + 2.4 * decay; });
      if (ev.post_id) {
        seen.add(ev.post_id);
        const p = postById.get(ev.post_id);
        if (p) authorW[p.author_id] = (authorW[p.author_id] || 0) + w;
      }
    }

    // channels you follow get a structural boost (like a subscription rail)
    let followIds = [];
    if (user) {
      const { data: fr } = await supabase.from('follows').select('followee_id').eq('follower_id', user.id);
      followIds = (fr || []).map((r) => r.followee_id);
    }
    const followedSet = new Set(followIds);
    followIds.forEach((f) => { authorW[f] = (authorW[f] || 0) + 3; });

    /* ---------- Stage 2 · ranking: predict → weight → combine ---------- */
    const seed = `${user ? user.id : 'anon'}:${day}`;
    const scored = posts.map((p) => {
      const ageDays = (now - new Date(p.created_at).getTime()) / 86400000;
      const fresh = 3.2 * Math.exp((-Math.LN2 * ageDays) / 6); // freshness half-life ≈ 6 days
      const qual = (1.7 * Math.log1p(p.likes_count || 0)) / 11 + (1.1 * Math.log1p(p.views_count || 0)) / 13;

      let aff = 0;
      (p.tags || []).forEach((t) => { aff += (tagW[t] || 0) * 1.7; });
      aff += (authorW[p.author_id] || 0) * 1.2;
      aff += (kindW[p.kind] || 0) * 1.1;
      const hay = `${p.title || ''} ${p.summary || ''} ${p.caption || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
      for (const t in termW) {
        if (hay.includes(t)) aff += Math.min(termW[t], 6) * 0.8; // your searches reshape the feed
      }

      const explore = hash01(`${seed}:${p.id}`) * 1.35; // epsilon-noise, stable per user per day
      let score = aff + fresh + qual + explore;
      if (seen.has(p.id)) score *= p.kind === 'forge' ? 0.8 : 0.55; // already-read demotion

      let reason = null;
      let topTag = null;
      let best = 0;
      (p.tags || []).forEach((t) => {
        if ((tagW[t] || 0) > best) { best = tagW[t]; topTag = t; }
      });
      if (best > 1.6) reason = `Tuned to your #${topTag} thread`;
      else if (followedSet.has(p.author_id)) reason = `From @${p.author_username} — a channel you follow`;
      else if (ageDays < 1.3) reason = 'Fresh bloom in the garden';
      else if (qual > 1.8) reason = 'Loud in the atelier this week';

      return { p, score, reason };
    }).sort((a, b) => b.score - a.score || b.p.id - a.p.id);

    /* ---------- Stage 3 · business rules: author & media diversity ---------- */
    const byId = new Map(posts.map((p) => [p.id, p]));
    const rankedById = new Map(scored.map((r) => [r.p.id, r]));
    const pool = scored.map((r) => r.p.id);
    const orderedIds = [];
    while (pool.length) {
      const idx = pool.findIndex((id) => {
        const p = byId.get(id);
        const last = orderedIds.length ? byId.get(orderedIds[orderedIds.length - 1]) : null;
        if (!last) return true;
        if (p.author_id === last.author_id) return false; // no author repeats back-to-back
        const lastThree = orderedIds.slice(-3).map((x) => byId.get(x).kind);
        if (lastThree.length === 3 && lastThree.every((k) => k === p.kind)) return false; // media-type diversity
        return true;
      });
      if (idx === -1) orderedIds.push(pool.shift());
      else orderedIds.push(pool.splice(idx, 1)[0]);
    }

    const pageIds = orderedIds.slice(offset, offset + limit);
    const items = pageIds.map((id) => ({
      ...byId.get(id),
      reason: rankedById.get(id).reason,
    }));
    await attachFlags(items, user);

    const taste = Object.entries(tagW)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, weight]) => ({ tag, weight: Math.round(weight * 10) / 10 }));

    return res.status(200).json({
      items,
      nextCursor: null,
      nextOffset: offset + limit < orderedIds.length ? offset + limit : null,
      meta: { personalized: signals.length > 0, taste },
    });
  } catch (err) {
    console.error('feed error:', err);
    res.status(500).json({ error: err.message });
  }
}
