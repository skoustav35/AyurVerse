import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await resolveUser(req);
  return user || null;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);

    if (req.method === 'GET') {
      const id = req.query?.id ? parseInt(req.query.id, 10) : null;
      const postId = req.query?.post_id ? parseInt(req.query.post_id, 10) : null;

      if (id) {
        const { data: playlist, error } = await db.from('playlists').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

        const postIds = Array.isArray(playlist.post_ids) ? playlist.post_ids : [];
        let items = [];
        if (postIds.length > 0) {
          const { data: posts } = await db
            .from('posts')
            .select('id, title, caption, summary, media_url, media_type, kind, read_minutes, author_name, author_username')
            .in('id', postIds);
          
          const postMap = new Map((posts || []).map((p) => [p.id, p]));
          items = postIds.map((pid) => postMap.get(pid)).filter(Boolean);
        }

        return res.status(200).json({ ...playlist, items });
      }

      if (postId) {
        const { data: allPlaylists, error } = await db.from('playlists').select('*').order('id', { ascending: false });
        if (error) throw error;

        const matching = (allPlaylists || []).find((p) => Array.isArray(p.post_ids) && p.post_ids.includes(postId));
        if (!matching) return res.status(200).json({ playlist: null });

        const postIds = matching.post_ids || [];
        const { data: posts } = await db
          .from('posts')
          .select('id, title, caption, summary, media_url, media_type, kind, read_minutes, author_name, author_username')
          .in('id', postIds);

        const postMap = new Map((posts || []).map((p) => [p.id, p]));
        const items = postIds.map((pid) => postMap.get(pid)).filter(Boolean);

        return res.status(200).json({
          playlist: {
            ...matching,
            items,
            current_index: postIds.indexOf(postId),
          },
        });
      }

      const { data: playlists, error } = await db.from('playlists').select('*').order('id', { ascending: false });
      if (error) throw error;

      const formatted = (playlists || []).map((p) => ({
        ...p,
        total_lessons: Array.isArray(p.post_ids) ? p.post_ids.length : 0,
      }));

      return res.status(200).json(formatted);
    }

    if (req.method === 'POST') {
      if (!user) return res.status(401).json({ error: 'Sign in to create a sequence' });
      const { title, description, category, post_ids, thumbnail_url } = req.body || {};
      if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

      const { data: profile } = await db.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      const fallbackName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'weaver');

      const cleanPostIds = Array.isArray(post_ids) ? post_ids.map(Number).filter((n) => !isNaN(n)) : [];

      const row = {
        user_id: user.id,
        author_name: profile?.full_name || fallbackName,
        author_username: profile?.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
        title: String(title).trim().slice(0, 120),
        description: description ? String(description).trim().slice(0, 500) : null,
        category: category ? String(category).trim().slice(0, 50) : 'General',
        post_ids: cleanPostIds,
        thumbnail_url: thumbnail_url ? String(thumbnail_url).trim() : null,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await db.from('playlists').insert(row).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      if (!user) return res.status(401).json({ error: 'Sign in required' });
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });

      const { data: existing } = await db.from('playlists').select('*').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Sequence not found' });
      if (existing.user_id !== user.id)
        return res.status(403).json({ error: 'Only the author may re-thread this sequence' });

      const patch = {};
      if (req.body.title) patch.title = String(req.body.title).trim().slice(0, 120);
      if (req.body.description !== undefined) patch.description = req.body.description ? String(req.body.description).trim().slice(0, 500) : null;
      if (req.body.category !== undefined) patch.category = req.body.category ? String(req.body.category).trim().slice(0, 50) : 'General';
      if (req.body.thumbnail_url !== undefined) patch.thumbnail_url = req.body.thumbnail_url ? String(req.body.thumbnail_url).trim() : null;
      if (Array.isArray(req.body.post_ids)) patch.post_ids = req.body.post_ids.map(Number).filter((n) => !isNaN(n));
      if (!Object.keys(patch).length) return res.status(200).json(existing);

      const { data, error } = await db.from('playlists').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!user) return res.status(401).json({ error: 'Sign in required' });
      const id = parseInt(req.body?.id ?? req.query?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });

      const { data: existing } = await db.from('playlists').select('user_id').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Sequence not found' });
      if (existing.user_id !== user.id)
        return res.status(403).json({ error: 'Only the author may unbind this sequence' });

      const { error } = await db.from('playlists').delete().eq('id', id);
      if (error) throw error;
      // the lessons themselves are untouched — only the thread that bound them
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('playlists error:', err);
    res.status(500).json({ error: err.message });
  }
}
