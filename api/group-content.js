import supabase from './db-client.js';

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
    supabase.from('likes').select('post_id').eq('user_id', user.id).in('post_id', ids),
    supabase.from('saves').select('post_id').eq('user_id', user.id).in('post_id', ids),
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);

    /* ---- GET: list a group's posts ---- */
    if (req.method === 'GET') {
      const gid = parseInt(req.query.group_id, 10);
      if (!gid) return res.status(400).json({ error: 'group_id required' });
      const { data: links } = await supabase
        .from('group_posts')
        .select('post_id')
        .eq('group_id', gid)
        .order('id', { ascending: false })
        .limit(60);
      const ids = (links || []).map((l) => l.post_id);
      if (!ids.length) return res.status(200).json({ items: [] });
      const { data: posts } = await supabase.from('posts').select('*').in('id', ids).order('id', { ascending: false });
      const items = posts || [];
      await attachFlags(items, user);
      return res.status(200).json({ items });
    }

    /* ---- POST: publish into a group (members only, kind must match) ---- */
    if (req.method === 'POST') {
      if (!user) return res.status(401).json({ error: 'Sign in to post' });
      const gid = parseInt(req.body?.group_id, 10);
      if (!gid) return res.status(400).json({ error: 'group_id required' });

      const { data: group } = await supabase.from('groups').select('*').eq('id', gid).maybeSingle();
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const { data: mem } = await supabase.from('group_members').select('role').eq('group_id', gid).eq('user_id', user.id).maybeSingle();
      if (!mem) return res.status(403).json({ error: 'Join the group to post in it' });
      if (group.kind === 'thread') return res.status(400).json({ error: 'This is a thread group — send messages in its chat instead' });

      const body = req.body || {};
      const kind = group.kind === 'forge' ? 'forge' : 'visual';
      if (kind === 'visual' && !body.media_url) return res.status(400).json({ error: 'A visual post needs media' });
      if (kind === 'forge' && (!body.title || !body.content_md)) return res.status(400).json({ error: 'A lore post needs a title and body' });

      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      const fallbackName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'weaver');
      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 8)
        : [];

      const row = {
        kind,
        author_id: user.id,
        author_name: profile?.full_name || fallbackName,
        author_username: profile?.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
        author_avatar: profile?.avatar_url || user.user_metadata?.avatar_url || null,
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

      const { data: post, error } = await supabase.from('posts').insert(row).select().single();
      if (error) throw error;
      await supabase.from('group_posts').insert({ group_id: gid, post_id: post.id, kind });
      post.liked = false;
      post.saved = false;
      return res.status(201).json({ post });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('group-content error:', err);
    res.status(500).json({ error: err.message });
  }
}
