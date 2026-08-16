import supabase, { db, enterScope, applyCors } from './db-client.js';

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in required' });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false })
        .limit(60);
      if (error) throw error;
      const items = data || [];
      const unread = items.filter((n) => !n.read).length;
      return res.status(200).json({ items, unread });
    }

    if (req.method === 'PUT') {
      // mark one read, or all read
      const id = req.body?.id ? parseInt(req.body.id, 10) : null;
      if (id) {
        const { error } = await db.from('notifications').update({ read: true }).eq('id', id).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
        if (error) throw error;
      }
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('notifications error:', err);
    res.status(500).json({ error: err.message });
  }
}
