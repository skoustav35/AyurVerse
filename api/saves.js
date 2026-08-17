import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    const { data: { user }, error: authError } = await resolveUser(req);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (req.method === 'GET') {
      const { data: rows, error } = await supabase
        .from('saves').select('post_id, id').eq('user_id', user.id).order('id', { ascending: false });
      if (error) throw error;
      const ids = (rows || []).map((r) => r.post_id);
      if (req.query.full !== '1') return res.status(200).json({ ids });
      if (!ids.length) return res.status(200).json({ items: [] });
      const { data: posts, error: pErr } = await db.from('posts').select('*').in('id', ids);
      if (pErr) throw pErr;
      const byId = new Map(posts.map((p) => [p.id, p]));
      const items = ids.map((pid) => byId.get(pid)).filter(Boolean).map((p) => ({ ...p, saved: true }));
      return res.status(200).json({ items });
    }

    if (req.method === 'POST') {
      const postId = parseInt(req.body?.post_id, 10);
      if (!postId) return res.status(400).json({ error: 'post_id required' });

      const { data: existing } = await supabase
        .from('saves').select('id').eq('post_id', postId).eq('user_id', user.id).maybeSingle();

      let saved;
      if (existing) {
        const { error } = await db.from('saves').delete().eq('id', existing.id);
        if (error) throw error;
        saved = false;
      } else {
        const { error } = await db.from('saves').insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
        saved = true;
      }

      const { data: post } = await db.from('posts').select('saves_count, tags, kind').eq('id', postId).single();
      const next = Math.max(0, (post?.saves_count ?? 0) + (saved ? 1 : -1));
      await db.from('posts').update({ saves_count: next }).eq('id', postId);
      if (saved) {
        await supabase
          .from('signals')
          .insert({ user_id: user.id, type: 'save', post_id: postId, tags: post?.tags ?? [], kind: post?.kind ?? null });
      }
      return res.status(200).json({ saved, saves_count: next });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('saves error:', err);
    res.status(500).json({ error: err.message });
  }
}
