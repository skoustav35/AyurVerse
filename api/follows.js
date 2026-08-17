import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';
import { notify } from './notify.js';

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    const { data: { user }, error: authError } = await resolveUser(req);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('follows')
        .select('followee_id')
        .eq('follower_id', user.id)
        .order('id', { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json({ ids: (data || []).map((r) => r.followee_id) });
    }

    if (req.method === 'POST') {
      const followee = String(req.body?.followee_id || '');
      if (!followee) return res.status(400).json({ error: 'followee_id required' });
      if (followee === user.id) return res.status(400).json({ error: 'You cannot follow yourself' });

      const { data: existing } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('followee_id', followee)
        .maybeSingle();

      let following;
      if (existing) {
        const { error } = await db.from('follows').delete().eq('id', existing.id);
        if (error) throw error;
        following = false;
      } else {
        const { error } = await db.from('follows').insert({ follower_id: user.id, followee_id: followee });
        if (error) throw error;
        following = true;
        await notify({ recipientId: followee, actor: user, type: 'follow' });
      }
      return res.status(200).json({ following });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('follows error:', err);
    res.status(500).json({ error: err.message });
  }
}
