import supabase from './db-client.js';

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const monthKey = (d) => new Date(d).toISOString().slice(0, 7);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to enter the Studio' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const ids = (posts || []).map((p) => p.id);

    const [{ data: likeRows }, { data: commentRows }, { data: followerRows }] = await Promise.all([
      ids.length
        ? supabase.from('likes').select('post_id, created_at').in('post_id', ids).limit(5000)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from('comments').select('post_id, created_at').in('post_id', ids).limit(5000)
        : Promise.resolve({ data: [] }),
      supabase.from('follows').select('created_at, follower_id').eq('followee_id', user.id).limit(5000),
    ]);

    const now = Date.now();

    // last-14-day like activity windows (per post + totals)
    const fourteenDays = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now - (13 - i) * 86400000);
      return dayKey(d);
    });
    const byDay = new Map(fourteenDays.map((d) => [d, 0]));
    const perPostSpark = new Map();
    for (const l of likeRows || []) {
      const k = dayKey(l.created_at);
      if (byDay.has(k)) byDay.set(k, byDay.get(k) + 1);
      if (!perPostSpark.has(l.post_id)) perPostSpark.set(l.post_id, new Map(fourteenDays.map((d) => [d, 0])));
      const m = perPostSpark.get(l.post_id);
      if (m.has(k)) m.set(k, m.get(k) + 1);
    }

    // monthly ladders
    const likesByMonth = new Map();
    for (const l of likeRows || []) {
      const k = monthKey(l.created_at);
      likesByMonth.set(k, (likesByMonth.get(k) || 0) + 1);
    }
    const followersByMonth = new Map();
    for (const f of followerRows || []) {
      const k = monthKey(f.created_at);
      followersByMonth.set(k, (followersByMonth.get(k) || 0) + 1);
    }

    const followers = (followerRows || []).length;
    const totalLikesPool = (posts || []).reduce((acc, p) => acc + (p.likes_count || 0), 0);
    const eligible = followers >= 1000;
    const poolDollars = eligible ? Math.floor(totalLikesPool / 1000) : 0;

    const perPost = (posts || []).map((p) => {
      const ageDays = Math.max(0.5, (now - new Date(p.created_at).getTime()) / 86400000);
      const spark = fourteenDays.map((d) => perPostSpark.get(p.id)?.get(d) || 0);
      return {
        id: p.id,
        kind: p.kind,
        media_type: p.media_type,
        media_url: p.media_url,
        title: p.title,
        caption: p.caption,
        summary: p.summary,
        location: p.location,
        tags: p.tags || [],
        created_at: p.created_at,
        likes_count: p.likes_count || 0,
        views_count: p.views_count || 0,
        comments_count: p.comments_count || 0,
        saves_count: p.saves_count || 0,
        like_rate_per_day: Math.round((p.likes_count || 0) / ageDays * 100) / 100,
        likes_last_14d: spark.reduce((a, b) => a + b, 0),
        spark,
      };
    });

    res.status(200).json({
      totals: {
        posts: (posts || []).length,
        likes: totalLikesPool,
        views: (posts || []).reduce((a, p) => a + (p.views_count || 0), 0),
        comments: (comments || []).length,
        saves: (posts || []).reduce((a, p) => a + (p.saves_count || 0), 0),
        followers,
      },
      eligible,
      poolDollars,
      likeSeries14d: fourteenDays.map((d) => ({ day: d, count: byDay.get(d) || 0 })),
      likesByMonth: [...likesByMonth.entries()].sort().map(([month, count]) => ({ month, count })),
      followersByMonth: [...followersByMonth.entries()].sort().map(([month, count]) => ({ month, count })),
      posts: perPost,
    });
  } catch (err) {
    console.error('analytics error:', err);
    res.status(500).json({ error: err.message });
  }
}
