import supabase, { db, enterScope, applyCors } from './db-client.js';
import mediaBucket from './storage-client.js';

const DEFAULT_PAGE = 8;

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

async function attachFlags(items, user) {
  if (!user || !items.length) return items;
  const ids = items.map((p) => p.id);
  const [{ data: likes }, { data: saves }] = await Promise.all([
    db.from('likes').select('post_id').eq('user_id', user.id).in('post_id', ids),
    db.from('saves').select('post_id').eq('user_id', user.id).in('post_id', ids),
  ]);
  const likedSet = new Set((likes || []).map((l) => l.post_id));
  const savedSet = new Set((saves || []).map((s) => s.post_id));
  items.forEach((p) => {
    p.liked = likedSet.has(p.id);
    p.saved = savedSet.has(p.id);
  });
  return items;
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
      const { id, kind, author, cursor, sort, limit } = req.query;
      const lim = Math.min(parseInt(limit, 10) || DEFAULT_PAGE, 30);

      if (id) {
        const { data, error } = await db.from('posts').select('*').eq('id', parseInt(id, 10)).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Post not found' });
        await attachFlags([data], user);
        return res.status(200).json(data);
      }

      let q = db.from('posts').select('*');
      if (kind) q = q.eq('kind', kind);
      if (author) q = q.eq('author_id', author);
      if (sort === 'top') {
        q = q.order('likes_count', { ascending: false });
      } else {
        q = q.order('id', { ascending: false });
        if (cursor) q = q.lt('id', parseInt(cursor, 10));
      }
      q = q.limit(lim + 1);

      const { data, error } = await q;
      if (error) throw error;
      const hasMore = data.length > lim;
      const items = data.slice(0, lim);
      await attachFlags(items, user);
      return res.status(200).json({ items, nextCursor: hasMore && sort !== 'top' ? items[items.length - 1].id : null });
    }

    if (req.method === 'POST') {
      if (!user) return res.status(401).json({ error: 'Sign in to publish' });
      const body = req.body || {};
      const kind = body.kind === 'forge' ? 'forge' : 'visual';

      if (kind === 'visual' && !body.media_url) return res.status(400).json({ error: 'A visual post needs media' });
      if (kind === 'forge' && (!body.title || !body.content_md)) return res.status(400).json({ error: 'An article needs a title and body' });

      const { data: profile } = await db.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      const fallbackName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'weaver');
      const author_name = profile?.full_name || fallbackName;
      const author_username = profile?.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.');
      const author_avatar = profile?.avatar_url || user.user_metadata?.avatar_url || null;

      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 8)
        : [];

      const row = {
        kind,
        author_id: user.id,
        author_name,
        author_username,
        author_avatar,
        caption: kind === 'visual' ? String(body.caption || '').slice(0, 2200) : null,
        title: kind === 'forge' ? String(body.title || '').slice(0, 220) : null,
        summary: kind === 'forge' ? String(body.summary || '').slice(0, 400) : null,
        content_md: kind === 'forge' ? String(body.content_md || '') : null,
        media_url: body.media_url || null,
        media_type: body.media_type === 'video' ? 'video' : body.media_url ? 'image' : null,
        media_duration: body.media_duration ? parseInt(body.media_duration, 10) : null,
        location: body.location ? String(body.location).slice(0, 120) : null,
        tags,
        read_minutes: kind === 'forge' ? Math.max(1, Math.round(String(body.content_md || '').split(/\s+/).length / 190)) : null,
      };

      const { data, error } = await db.from('posts').insert(row).select().single();
      if (error) throw error;
      data.liked = false;
      data.saved = false;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      if (!user) return res.status(401).json({ error: 'Sign in to edit' });
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: existing } = await db.from('posts').select('author_id').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Post not found' });
      if (existing.author_id !== user.id) return res.status(403).json({ error: 'Only the weaver may amend this' });

      const patch = {};
      if (req.body.caption !== undefined && req.body.caption !== null) patch.caption = String(req.body.caption).slice(0, 2200);
      if (req.body.title !== undefined && req.body.title !== null) patch.title = String(req.body.title).slice(0, 220);
      if (req.body.summary !== undefined && req.body.summary !== null) patch.summary = String(req.body.summary).slice(0, 400);
      if (req.body.location !== undefined) patch.location = req.body.location ? String(req.body.location).slice(0, 120) : null;
      if (Array.isArray(req.body.tags))
        patch.tags = req.body.tags.map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 8);
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to amend' });

      const { data, error } = await db.from('posts').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!user) return res.status(401).json({ error: 'Sign in to delete' });
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: existing } = await db.from('posts').select('author_id, media_url').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Post not found' });
      if (existing.author_id !== user.id) return res.status(403).json({ error: 'Only the weaver may burn this' });

      await db.from('comments').delete().eq('post_id', id);
      await db.from('likes').delete().eq('post_id', id);
      await db.from('saves').delete().eq('post_id', id);
      const { error } = await db.from('posts').delete().eq('id', id);
      if (error) throw error;

      if (existing.media_url) {
        const m = String(existing.media_url).match(/\/object\/public\/media\/(.+)$/);
        if (m) mediaBucket.remove([decodeURIComponent(m[1])]).then(() => {}).catch(() => {});
      }
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('posts error:', err);
    res.status(500).json({ error: err.message });
  }
}
