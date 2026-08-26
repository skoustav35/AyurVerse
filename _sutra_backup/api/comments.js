import supabase from './db-client.js';

async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

async function bumpCount(postId, delta) {
  const { data: post } = await supabase.from('posts').select('comments_count').eq('id', postId).single();
  const next = Math.max(0, (post?.comments_count || 0) + delta);
  await supabase.from('posts').update({ comments_count: next }).eq('id', postId);
  return next;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  try {
    if (req.method === 'POST') {
      const { postId, content } = req.body || {};
      const pid = parseInt(postId, 10);
      const text = String(content || '').trim();
      if (!pid || text.length < 2) return res.status(400).json({ error: 'A comment needs at least 2 characters' });
      if (text.length > 600) return res.status(400).json({ error: 'Keep it under 600 characters' });
      const rawName = user.user_metadata?.full_name || user.user_metadata?.name || (user.email ? user.email.split('@')[0] : 'weaver');
      const row = {
        post_id: pid,
        user_id: user.id,
        author_name: String(rawName),
        author_avatar: user.user_metadata?.avatar_url || null,
        content: text,
      };
      const { data: comment, error } = await supabase.from('comments').insert(row).select().single();
      if (error) throw error;
      const comments_count = await bumpCount(pid, 1);
      return res.status(201).json({ comment, comments_count });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      const cid = parseInt(id, 10);
      if (!cid) return res.status(400).json({ error: 'id required' });
      const { data: comment, error: fErr } = await supabase.from('comments').select('user_id, post_id').eq('id', cid).single();
      if (fErr) throw fErr;
      if (comment.user_id !== user.id) return res.status(403).json({ error: 'You can only remove your own words' });
      const { error } = await supabase.from('comments').delete().eq('id', cid);
      if (error) throw error;
      const comments_count = await bumpCount(comment.post_id, -1);
      return res.status(200).json({ ok: true, comments_count });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('comments api error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
