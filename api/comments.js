import supabase from './db-client.js';
import { notify } from './notify.js';

async function recount(postId) {
  const { count } = await supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  await supabase.from('posts').update({ comments_count: count }).eq('id', postId);
  return count;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const postId = parseInt(req.query.post_id, 10);
      if (!postId) return res.status(400).json({ error: 'post_id required' });
      const { data, error } = await supabase
        .from('comments').select('*').eq('post_id', postId).order('id', { ascending: true }).limit(120);
      if (error) throw error;
      return res.status(200).json(data);
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to comment' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (req.method === 'POST') {
      const postId = parseInt(req.body?.post_id, 10);
      const text = String(req.body?.body || '').trim().slice(0, 600);
      if (!postId || !text) return res.status(400).json({ error: 'post_id and body required' });

      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      const fallbackName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'weaver');

      const row = {
        post_id: postId,
        user_id: user.id,
        author_name: profile?.full_name || fallbackName,
        author_username: profile?.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
        author_avatar: profile?.avatar_url || null,
        body: text,
      };
      const { data, error } = await supabase.from('comments').insert(row).select().single();
      if (error) throw error;
      const count = await recount(postId);
      const { data: postMeta } = await supabase.from('posts').select('tags, kind, author_id, title, caption').eq('id', postId).single();
      await supabase.from('signals').insert({
        user_id: user.id,
        type: 'comment',
        post_id: postId,
        tags: postMeta?.tags ?? [],
        kind: postMeta?.kind ?? null,
      });
      if (postMeta?.author_id) {
        await notify({
          recipientId: postMeta.author_id,
          actor: user,
          type: 'comment',
          postId,
          preview: text,
        });
      }
      return res.status(201).json({ comment: data, comments_count: count });
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: existing } = await supabase.from('comments').select('*').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Comment not found' });
      if (existing.user_id !== user.id) return res.status(403).json({ error: 'Not your comment' });
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
      const count = await recount(existing.post_id);
      return res.status(200).json({ ok: true, comments_count: count });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('comments error:', err);
    res.status(500).json({ error: err.message });
  }
}
