import supabase from './db-client.js';

async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  try {
    if (req.method === 'GET') {
      if (req.query.expand === 'saved') {
        const { data: saves, error } = await supabase
          .from('saves')
          .select('post_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!saves || !saves.length) return res.status(200).json({ posts: [] });
        const ids = saves.map((s) => s.post_id);
        const { data: posts, error: pErr } = await supabase.from('posts').select('*').in('id', ids);
        if (pErr) throw pErr;
        const byId = new Map((posts || []).map((p) => [p.id, p]));
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
        return res.status(200).json({ posts: ordered });
      }
      const [{ data: likes }, { data: saves }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', user.id),
        supabase.from('saves').select('post_id').eq('user_id', user.id),
      ]);
      return res.status(200).json({
        likedIds: (likes || []).map((r) => r.post_id),
        savedIds: (saves || []).map((r) => r.post_id),
      });
    }

    if (req.method === 'POST') {
      const { postId, action } = req.body || {};
      const pid = parseInt(postId, 10);
      if (!pid || (action !== 'like' && action !== 'save')) {
        return res.status(400).json({ error: 'postId and action (like|save) required' });
      }
      const table = action === 'like' ? 'likes' : 'saves';
      const { data: existing, error: eErr } = await supabase
        .from(table)
        .select('id')
        .eq('post_id', pid)
        .eq('user_id', user.id)
        .maybeSingle();
      if (eErr) throw eErr;

      let on;
      if (existing) {
        const { error } = await supabase.from(table).delete().eq('id', existing.id);
        if (error) throw error;
        on = false;
      } else {
        const { error } = await supabase.from(table).insert({ post_id: pid, user_id: user.id });
        if (error) throw error;
        on = true;
      }

      const field = action === 'like' ? 'likes_count' : 'saves_count';
      const { data: post } = await supabase.from('posts').select(field).eq('id', pid).single();
      const nextVal = Math.max(0, (post?.[field] || 0) + (on ? 1 : -1));
      await supabase.from('posts').update({ [field]: nextVal }).eq('id', pid);
      const { data: fresh } = await supabase.from('posts').select('likes_count, saves_count').eq('id', pid).single();
      return res.status(200).json({ on, likes_count: fresh?.likes_count ?? 0, saves_count: fresh?.saves_count ?? 0 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('interactions api error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
