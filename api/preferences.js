import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';
import { normalizePreferences } from './lib/ranking/config.js';

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await resolveUser(req);
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
      const { data, error } = await db.from('user_prefs').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return res.status(200).json(normalizePreferences(data || {}));
    }

    if (req.method === 'PUT') {
      const { data: existing, error: readError } = await db.from('user_prefs').select('*').eq('user_id', user.id).maybeSingle();
      if (readError) throw readError;

      // Ranking owns these settings. Keep this narrow endpoint compatible while
      // accepting the full partial preference contract used by FeedTuner.
      const next = normalizePreferences(req.body || {}, existing || {});
      const patch = { ...next, updated_at: new Date().toISOString() };
      let data, error;
      if (existing) {
        ({ data, error } = await db.from('user_prefs').update(patch).eq('user_id', user.id).select().single());
      } else {
        ({ data, error } = await db.from('user_prefs').insert({ user_id: user.id, ...patch }).select().single());
      }
      if (error) throw error;
      return res.status(200).json(normalizePreferences(data || patch));
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('preferences error:', err);
    res.status(500).json({ error: err.message });
  }
}
