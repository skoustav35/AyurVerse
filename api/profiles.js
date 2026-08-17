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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { user_id, limit, q } = req.query;
      if (user_id) {
        const uid = user_id === 'me' ? (await getAuthUser(req))?.id : user_id;
        if (!uid) return res.status(401).json({ error: 'Sign in required' });
        const { data, error } = await db.from('profiles').select('*').eq('user_id', uid).maybeSingle();
        if (error) throw error;
        return res.status(200).json(data);
      }
      const lim = Math.min(parseInt(limit, 10) || 8, 40);
      const needle = String(q || '').trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ');
      let query = db.from('profiles').select('*').order('id', { ascending: true }).limit(lim);
      if (needle) {
        query = supabase
          .from('profiles')
          .select('*')
          .or(`username.ilike.%${needle}%,full_name.ilike.%${needle}%`)
          .order('full_name', { ascending: true })
          .limit(lim);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Sign in required' });
      const body = req.body || {};

      const { data: existing } = await db.from('profiles').select('*').eq('user_id', user.id).maybeSingle();

      const clean = {};
      for (const key of ['username', 'full_name', 'bio', 'avatar_url']) {
        if (body[key] !== undefined && body[key] !== null) {
          const v = String(body[key]).trim();
          clean[key] = key === 'username' ? v.toLowerCase().replace(/[^a-z0-9._]+/g, '.').slice(0, 30) : v.slice(0, 300);
        }
      }

      if (existing) {
        if (!Object.keys(clean).length) return res.status(200).json(existing);
        const { data, error } = await db.from('profiles').update(clean).eq('user_id', user.id).select().single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      const fallbackName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'weaver');
      const row = {
        user_id: user.id,
        username: clean.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.').slice(0, 30),
        full_name: clean.full_name || fallbackName,
        bio: clean.bio ?? 'New weaver in the atelier.',
        avatar_url: clean.avatar_url ?? null,
      };
      const { data, error } = await db.from('profiles').insert(row).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('profiles error:', err);
    res.status(500).json({ error: err.message });
  }
}
