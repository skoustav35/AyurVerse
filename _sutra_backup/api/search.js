import supabase from './db-client.js';

function topTagsFrom(posts, limit = 14) {
  const counts = new Map();
  for (const p of posts || []) {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t]) => t);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const q = String(req.query.q || '').trim();

    if (!q) {
      const { data: popular, error } = await supabase
        .from('posts')
        .select('*')
        .order('views_count', { ascending: false })
        .limit(6);
      if (error) throw error;
      const { data: recent } = await supabase.from('posts').select('tags').limit(200);
      return res.status(200).json({ results: popular || [], tags: topTagsFrom(recent) });
    }

    const safe = q.replace(/[%_,]/g, ' ').replace(/\s+/g, ' ').trim();
    const like = `%${safe}%`;
    const { data: textHits, error } = await supabase
      .from('posts')
      .select('*')
      .or(`title.ilike.${like},excerpt.ilike.${like},content.ilike.${like},author_name.ilike.${like},author_username.ilike.${like}`)
      .order('views_count', { ascending: false })
      .limit(24);
    if (error) throw error;

    const { data: tagHits } = await supabase
      .from('posts')
      .select('*')
      .contains('tags', JSON.stringify([safe.toLowerCase()]))
      .limit(12);

    const byId = new Map();
    for (const p of [...(tagHits || []), ...(textHits || [])]) byId.set(p.id, p);
    const results = [...byId.values()].sort((a, b) => {
      const aTitle = (a.title || '').toLowerCase().includes(safe.toLowerCase()) ? 1 : 0;
      const bTitle = (b.title || '').toLowerCase().includes(safe.toLowerCase()) ? 1 : 0;
      if (aTitle !== bTitle) return bTitle - aTitle;
      return (b.views_count + b.likes_count) - (a.views_count + a.likes_count);
    });

    return res.status(200).json({ results, tags: topTagsFrom(results, 8) });
  } catch (err) {
    console.error('search api error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
