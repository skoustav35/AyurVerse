import supabase from './db-client.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { type, cursor, limit, author, ids } = req.query;
      const pageSize = Math.min(parseInt(limit || '6', 10) || 6, 40);

      if (ids) {
        const idList = String(ids).split(',').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
        if (!idList.length) return res.status(200).json({ posts: [], nextCursor: null });
        const { data, error } = await supabase.from('posts').select('*').in('id', idList).order('id', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ posts: data, nextCursor: null });
      }

      let q = supabase.from('posts').select('*').order('id', { ascending: false }).limit(pageSize);
      if (type === 'media' || type === 'article') q = q.eq('type', type);
      if (author) q = q.eq('author_username', author);
      if (cursor) q = q.lt('id', parseInt(cursor, 10));
      const { data, error } = await q;
      if (error) throw error;
      const nextCursor = data && data.length === pageSize ? data[data.length - 1].id : null;
      return res.status(200).json({ posts: data || [], nextCursor });
    }

    if (req.method === 'POST') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Sign in to publish' });
      const { type, title, content, excerpt, media_url, media_kind, cover_url, tags } = req.body || {};
      if (type !== 'media' && type !== 'article') return res.status(400).json({ error: 'Invalid type' });
      if (!content || String(content).trim().length < 2) return res.status(400).json({ error: 'Content is required' });
      if (type === 'article' && (!title || String(title).trim().length < 4)) {
        return res.status(400).json({ error: 'A title of at least 4 characters is required' });
      }
      if (type === 'media' && !media_url) return res.status(400).json({ error: 'An image is required for a visual post' });

      const rawName = user.user_metadata?.full_name || user.user_metadata?.name || (user.email ? user.email.split('@')[0] : 'weaver');
      const username = String(rawName).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'weaver';
      const words = String(content).split(/\s+/).length;
      const excerptAuto = String(content).replace(/[##*$`>\[\]()|-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
      const row = {
        type,
        title: type === 'article' ? String(title).trim() : null,
        content: String(content),
        excerpt: excerpt ? String(excerpt).slice(0, 220) : excerptAuto,
        media_url: media_url || null,
        media_kind: media_kind || (media_url ? 'image' : null),
        cover_url: cover_url || null,
        author_id: user.id,
        author_name: String(rawName),
        author_username: username,
        author_avatar: user.user_metadata?.avatar_url || null,
        tags: Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8) : [],
        likes_count: 0,
        saves_count: 0,
        views_count: 0,
        comments_count: 0,
        reading_time: type === 'article' ? Math.max(1, Math.round(words / 180)) : 0,
      };
      const { data, error } = await supabase.from('posts').insert(row).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Sign in required' });
      const id = parseInt(req.query.id || req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: post, error: fetchErr } = await supabase.from('posts').select('author_id').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      if (post.author_id !== user.id) return res.status(403).json({ error: 'You can only unpublish your own weaves' });
      await supabase.from('comments').delete().eq('post_id', id);
      await supabase.from('likes').delete().eq('post_id', id);
      await supabase.from('saves').delete().eq('post_id', id);
      const { error } = await supabase.from('posts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('posts api error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
