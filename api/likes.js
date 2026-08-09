import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to like' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    const postId = parseInt(req.body?.post_id, 10);
    if (!postId) return res.status(400).json({ error: 'post_id required' });

    const { data: existing } = await supabase
      .from('likes').select('id').eq('post_id', postId).eq('user_id', user.id).maybeSingle();

    let liked;
    if (existing) {
      const { error } = await supabase.from('likes').delete().eq('id', existing.id);
      if (error) throw error;
      liked = false;
    } else {
      const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
      if (error) throw error;
      liked = true;
    }

    const { data: post } = await supabase.from('posts').select('likes_count, tags, kind').eq('id', postId).single();
    const next = Math.max(0, (post?.likes_count ?? 0) + (liked ? 1 : -1));
    await supabase.from('posts').update({ likes_count: next }).eq('id', postId);

    if (liked) {
      await supabase
        .from('signals')
        .insert({ user_id: user.id, type: 'like', post_id: postId, tags: post?.tags ?? [], kind: post?.kind ?? null });
    }

    return res.status(200).json({ liked, likes_count: next });
  } catch (err) {
    console.error('likes error:', err);
    res.status(500).json({ error: err.message });
  }
}
