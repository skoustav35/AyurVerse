import supabase, { db, enterScope, applyCors } from './db-client.js';

/*
 * Reels deck — server-side video feed.
 * Returns visual VIDEO posts ranked by engagement + freshness, so the Reels
 * tab always has content regardless of how many image posts exist. (The old
 * approach fetched the newest 120 visual posts client-side and filtered for
 * videos — which broke once thousands of image posts buried the videos.)
 */

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const user = await getAuthUser(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 120);

    // pull a healthy pool of the most-recent videos, then rank by engagement
    const { data: pool, error } = await supabase
      .from('posts')
      .select('*')
      .eq('media_type', 'video')
      .not('media_url', 'is', null)
      .order('id', { ascending: false })
      .limit(400);
    if (error) throw error;

    const now = Date.now();
    const scored = (pool || [])
      .map((p) => {
        const ageDays = (now - new Date(p.created_at).getTime()) / 86400000;
        const fresh = Math.exp((-Math.LN2 * ageDays) / 30);
        const eng = Math.log1p(p.likes_count || 0) * 1.4 + Math.log1p(p.comments_count || 0) * 0.9;
        // stable per-post jitter so the deck feels shuffled, not identical each load
        const jitter = ((p.id * 2654435761) % 1000) / 1000;
        return { p, s: eng + fresh * 2 + jitter * 1.2 };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.p);

    // attach liked/saved flags
    if (user && scored.length) {
      const ids = scored.map((p) => p.id);
      const [{ data: likes }, { data: saves }] = await Promise.all([
        db.from('likes').select('post_id').eq('user_id', user.id).in('post_id', ids),
        db.from('saves').select('post_id').eq('user_id', user.id).in('post_id', ids),
      ]);
      const likedSet = new Set((likes || []).map((l) => l.post_id));
      const savedSet = new Set((saves || []).map((s) => s.post_id));
      scored.forEach((p) => { p.liked = likedSet.has(p.id); p.saved = savedSet.has(p.id); });
    }

    return res.status(200).json({ items: scored });
  } catch (err) {
    console.error('reels error:', err);
    res.status(500).json({ error: err.message });
  }
}
