import supabase from './db-client.js';

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

const cleanTags = (t) =>
  (Array.isArray(t) ? t : [])
    .map((x) => String(x).trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9._-]+/g, ''))
    .filter(Boolean)
    .slice(0, 30);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in required' });

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('user_prefs').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return res.status(200).json({
        boosted_tags: data?.boosted_tags ?? [],
        muted_tags: data?.muted_tags ?? [],
      });
    }

    if (req.method === 'PUT') {
      const boosted = cleanTags(req.body?.boosted_tags);
      const muted = cleanTags(req.body?.muted_tags);
      // a tag cannot be both boosted and muted — mute wins
      const mutedSet = new Set(muted);
      const boostedFinal = boosted.filter((t) => !mutedSet.has(t));

      const { data: existing } = await supabase.from('user_prefs').select('id').eq('user_id', user.id).maybeSingle();
      const patch = { boosted_tags: boostedFinal, muted_tags: muted, updated_at: new Date().toISOString() };
      let data, error;
      if (existing) {
        ({ data, error } = await supabase.from('user_prefs').update(patch).eq('user_id', user.id).select().single());
      } else {
        ({ data, error } = await supabase.from('user_prefs').insert({ user_id: user.id, ...patch }).select().single());
      }
      if (error) throw error;
      return res.status(200).json({ boosted_tags: data.boosted_tags, muted_tags: data.muted_tags });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('preferences error:', err);
    res.status(500).json({ error: err.message });
  }
}
