import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';

async function getAuthUser(req) {
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
        const caller = await getAuthUser(req);
        const uid = user_id === 'me' ? caller?.id : user_id;
        if (!uid) return res.status(401).json({ error: 'Sign in required' });
        const { data, error } = await db.from('profiles').select('*').eq('user_id', uid).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(200).json(null);

        const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
          db.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', uid),
          db.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
        ]);

        let isFollowing = false;
        if (caller && caller.id !== uid) {
          const { data: edge } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', caller.id)
            .eq('followee_id', uid)
            .maybeSingle();
          isFollowing = !!edge;
        }

        data.followers_count = followersCount || 0;
        data.following_count = followingCount || 0;
        data.is_following = isFollowing;

        return res.status(200).json(data);
      }
      const lim = Math.min(parseInt(limit, 10) || 40, 100);
      const needle = String(q || '').trim();
      const cleanNeedle = needle.replace(/^@/, '').trim().toLowerCase();

      let query = db.from('profiles').select('*').order('id', { ascending: false }).limit(lim);
      if (cleanNeedle) {
        const tokens = cleanNeedle.split(/\s+/).filter(Boolean);
        const orConditions = [
          `username.ilike.%${cleanNeedle}%`,
          `full_name.ilike.%${cleanNeedle}%`,
          `bio.ilike.%${cleanNeedle}%`,
          ...tokens.flatMap((t) => [
            `username.ilike.%${t}%`,
            `full_name.ilike.%${t}%`,
            `bio.ilike.%${t}%`,
          ]),
        ];
        query = db
          .from('profiles')
          .select('*')
          .or(orConditions.join(','))
          .order('id', { ascending: false })
          .limit(lim);
      }
      const { data, error } = await query;
      if (error) throw error;

      if (cleanNeedle && Array.isArray(data)) {
        data.sort((a, b) => {
          const aUn = (a.username || '').toLowerCase();
          const aFn = (a.full_name || '').toLowerCase();
          const bUn = (b.username || '').toLowerCase();
          const bFn = (b.full_name || '').toLowerCase();
          const aExact = aUn === cleanNeedle || aFn === cleanNeedle ? 10 : 0;
          const bExact = bUn === cleanNeedle || bFn === cleanNeedle ? 10 : 0;
          const aStart = aUn.startsWith(cleanNeedle) || aFn.startsWith(cleanNeedle) ? 5 : 0;
          const bStart = bUn.startsWith(cleanNeedle) || bFn.startsWith(cleanNeedle) ? 5 : 0;
          return (bExact + bStart) - (aExact + aStart) || (b.id - a.id);
        });
      }
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = req.body || {};
      const targetUserId = body.user_id || user?.id;
      if (!targetUserId) return res.status(401).json({ error: 'Sign in required' });

      const { data: existing } = await db.from('profiles').select('*').eq('user_id', targetUserId).maybeSingle();

      const clean = {};
      for (const key of ['username', 'full_name', 'bio', 'avatar_url']) {
        if (body[key] !== undefined && body[key] !== null) {
          const v = String(body[key]).trim();
          clean[key] = key === 'username' ? v.toLowerCase().replace(/[^a-z0-9._]+/g, '.').slice(0, 30) : v.slice(0, 300);
        }
      }

      if (existing) {
        if (!Object.keys(clean).length) return res.status(200).json(existing);
        const { data, error } = await db.from('profiles').update(clean).eq('user_id', targetUserId).select().single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      const fallbackName = user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : body.username || 'weaver');
      const row = {
        user_id: targetUserId,
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
