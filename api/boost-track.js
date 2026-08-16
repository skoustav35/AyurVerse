import supabase, { db, enterScope, applyCors } from './db-client.js';

/*
 * Boost CTR engine. The feed fires impressions when a boosted card is seen,
 * and clicks/conversions when it is opened, liked, or its author followed.
 * We increment the counters on the boost row atomically-ish (read-modify-write;
 * fine for this scale) and let /api/boosts compute CTR + lift from them.
 *
 * event: 'impression' | 'click' | 'like' | 'follow'
 * body:  { boost_id, event }
 */

const EVENTS = new Set(['impression', 'click', 'like', 'follow']);

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    // viewer may be anon for impressions; that's fine — tracking is best-effort
    const user = await getAuthUser(req);

    const boostId = parseInt(req.body?.boost_id, 10);
    const event = req.body?.event;
    if (!boostId || !EVENTS.has(event)) return res.status(400).json({ error: 'boost_id and a valid event required' });

    const { data: boost } = await supabase
      .from('boosts')
      .select('id, user_id, status, impressions, clicks, likes_gained, followers_gained')
      .eq('id', boostId)
      .maybeSingle();
    if (!boost || boost.status !== 'active') return res.status(200).json({ ok: true, skipped: true });

    // don't let the owner inflate their own metrics
    if (user && user.id === boost.user_id) return res.status(200).json({ ok: true, skipped: 'owner' });

    const patch = {};
    if (event === 'impression') patch.impressions = (boost.impressions || 0) + 1;
    else if (event === 'click') patch.clicks = (boost.clicks || 0) + 1;
    else if (event === 'like') {
      patch.clicks = (boost.clicks || 0) + 1;
      patch.likes_gained = (boost.likes_gained || 0) + 1;
    } else if (event === 'follow') {
      patch.clicks = (boost.clicks || 0) + 1;
      patch.followers_gained = (boost.followers_gained || 0) + 1;
    }

    const { error } = await db.from('boosts').update(patch).eq('id', boostId);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('boost-track error:', err);
    res.status(500).json({ error: err.message });
  }
}
