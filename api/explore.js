import supabase, { db, enterScope, applyCors } from './db-client.js';

/*
 * Explore — the discovery engine behind the Library tab.
 * Surfaces a curated, freshness-decayed mix: trending reels, trending media,
 * rising lore, rising circles, suggested people, and trending hashtags.
 * Personalized lightly when a signed-in user is present.
 */

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

const now = () => Date.now();
const freshness = (createdAt, halfLifeDays) =>
  Math.exp((-Math.LN2 * ((now() - new Date(createdAt).getTime()) / 86400000)) / halfLifeDays);

// heat = engagement × freshness (a light "trending" score)
function heat(p, halfLife = 12) {
  const eng = 1.4 * Math.log1p(p.likes_count || 0) + 1.0 * Math.log1p(p.views_count || 0) + 0.8 * Math.log1p(p.comments_count || 0);
  return eng * (0.5 + freshness(p.created_at, halfLife));
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
    const user = await getAuthUser(req);

    // candidate pool
    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .order('id', { ascending: false })
      .limit(500);
    if (error) throw error;
    const pool = posts || [];

    // light personal tag weighting
    const tagW = {};
    if (user) {
      const { data: sig } = await supabase
        .from('signals').select('tags').eq('user_id', user.id).order('id', { ascending: false }).limit(200);
      (sig || []).forEach((s) => (s.tags || []).forEach((t) => { tagW[t] = (tagW[t] || 0) + 1; }));
    }
    const personal = (p) => (p.tags || []).reduce((a, t) => a + (tagW[t] || 0) * 0.4, 0);
    const score = (p, hl) => heat(p, hl) + personal(p);

    const reels = pool
      .filter((p) => p.media_type === 'video' && p.media_url)
      .map((p) => ({ p, s: score(p, 10) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.p);

    const media = pool
      .filter((p) => p.kind === 'visual' && p.media_url)
      .map((p) => ({ p, s: score(p, 14) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 18)
      .map((x) => x.p);

    const lore = pool
      .filter((p) => p.kind === 'forge')
      .map((p) => ({ p, s: score(p, 20) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.p);

    // trending hashtags (weighted by post heat)
    const tagHeat = {};
    for (const p of pool) {
      const h = heat(p, 16);
      for (const t of p.tags || []) tagHeat[t] = (tagHeat[t] || 0) + h;
    }
    const hashtags = Object.entries(tagHeat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([tag, weight]) => ({ tag, weight: Math.round(weight) }));

    // rising circles (member_count + recency)
    const { data: groupRows } = await db.from('groups').select('*').limit(100);
    let myGroups = new Set();
    if (user) {
      const { data: mem } = await db.from('group_members').select('group_id').eq('user_id', user.id);
      myGroups = new Set((mem || []).map((m) => m.group_id));
    }
    const circles = (groupRows || [])
      .map((g) => ({ g, s: Math.log1p(g.member_count || 0) * 2 + freshness(g.created_at, 30) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => ({ ...x.g, is_member: myGroups.has(x.g.id) }));

    // suggested people — most-followed authors you don't already follow
    const authorLikes = {};
    for (const p of pool) authorLikes[p.author_id] = (authorLikes[p.author_id] || 0) + (p.likes_count || 0);
    let followingSet = new Set();
    if (user) {
      const { data: fr } = await db.from('follows').select('followee_id').eq('follower_id', user.id);
      followingSet = new Set((fr || []).map((r) => r.followee_id));
    }
    const { data: peopleRows } = await db.from('profiles').select('*').limit(60);
    const people = (peopleRows || [])
      .filter((pr) => pr.user_id !== user?.id && !followingSet.has(pr.user_id))
      .map((pr) => ({ pr, s: (authorLikes[pr.user_id] || 0) + 1 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.pr);

    // attach liked/saved flags to media the user sees
    if (user) {
      const shown = [...reels, ...media, ...lore];
      const ids = shown.map((p) => p.id);
      if (ids.length) {
        const [{ data: likes }, { data: saves }] = await Promise.all([
          db.from('likes').select('post_id').eq('user_id', user.id).in('post_id', ids),
          db.from('saves').select('post_id').eq('user_id', user.id).in('post_id', ids),
        ]);
        const likedSet = new Set((likes || []).map((l) => l.post_id));
        const savedSet = new Set((saves || []).map((s) => s.post_id));
        shown.forEach((p) => { p.liked = likedSet.has(p.id); p.saved = savedSet.has(p.id); });
      }
    }

    return res.status(200).json({ reels, media, lore, hashtags, circles, people });
  } catch (err) {
    console.error('explore error:', err);
    res.status(500).json({ error: err.message });
  }
}
