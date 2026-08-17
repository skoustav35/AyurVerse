import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';

const ALLOWED_TYPES = new Set(['view', 'dwell', 'search']);

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in required' });
    const { data: { user }, error: authError } = await resolveUser(req);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    const body = req.body || {};
    if (!ALLOWED_TYPES.has(body.type)) return res.status(400).json({ error: 'invalid signal type' });

    const tags = Array.isArray(body.tags)
      ? body.tags.slice(0, 8).map((t) => String(t).toLowerCase().replace(/^#/, '').slice(0, 40))
      : [];

    const row = {
      user_id: user.id,
      type: body.type,
      post_id: body.post_id ? parseInt(body.post_id, 10) : null,
      tags,
      query: typeof body.query === 'string' ? body.query.slice(0, 160) : null,
      dwell_ms: body.dwell_ms ? Math.min(parseInt(body.dwell_ms, 10) || 0, 120000) : null,
      kind: body.kind === 'forge' ? 'forge' : body.kind === 'visual' ? 'visual' : null,
    };

    // interaction signals power personalization only — no public view counter
    const { error } = await db.from('signals').insert(row);
    if (error) throw error;
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('events error:', err);
    res.status(500).json({ error: err.message });
  }
}
