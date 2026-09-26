import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    const { data: { user }, error: authError } = await resolveUser(req);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (req.method === 'POST') {
      const postId = parseInt(req.body?.post_id, 10);
      const reason = String(req.body?.reason || 'other').slice(0, 100);
      const details = req.body?.details ? String(req.body.details).slice(0, 500) : null;

      if (!postId) return res.status(400).json({ error: 'post_id required' });

      // Save report in reports collection
      const row = {
        reporter_id: user.id,
        post_id: postId,
        reason,
        details,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await db.from('reports').insert(row).select().single();
      if (error) throw error;

      return res.status(201).json({ ok: true, message: 'Report recorded. The gardeners will review.' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('reports error:', err);
    res.status(500).json({ error: err.message });
  }
}
