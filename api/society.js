import supabase, { db, enterScope, applyCors } from './db-client.js';

/*
 * Society Observatory — live, read-only telemetry for the simulated weavers
 * (personas whose bio carries the "· (sim)" marker). Aggregates counts,
 * a 24h pulse, the latest moves, and most-active weavers straight from the
 * same tables the app itself reads: likes, comments, saves, follows, posts,
 * groups, group_members, notifications.
 *
 * GET → requires any signed-in session.
 */

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// PostgREST `in.(...)` URLs get long fast — batch id lists to stay well under limits.
async function countIn(table, column, ids, extraFilter) {
  if (!ids.length) return 0;
  const parts = chunk(ids, 150);
  const counts = await Promise.all(
    parts.map(async (part) => {
      let q = db.from(table).select('id', { count: 'exact', head: true }).in(column, part);
      if (extraFilter?.eq) q = q.eq(extraFilter.eq[0], extraFilter.eq[1]);
      const { count, error } = await q;
      if (error) {
        console.error(`society count ${table}:`, error.message);
        return 0;
      }
      return count || 0;
    })
  );
  return counts.reduce((a, b) => a + b, 0);
}

async function fetchIn(table, ids, column, select, limitPerChunk = 300, orderBy = 'id') {
  if (!ids.length) return [];
  const parts = chunk(ids, 150);
  const pages = await Promise.all(
    parts.map((part) =>
      db.from(table).select(select).in(column, part).order(orderBy, { ascending: false }).limit(limitPerChunk)
    )
  );
  const rows = [];
  for (const p of pages) if (Array.isArray(p.data)) rows.push(...p.data);
  return rows;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in required' });

    const { data: botProfiles, error } = await db
      .from('profiles')
      .select('user_id, full_name, username, created_at')
      .ilike('bio', '%(sim)%')
      .limit(1200);
    if (error) throw error;

    const ids = (botProfiles || []).map((p) => p.user_id);
    const nameOf = new Map((botProfiles || []).map((p) => [p.user_id, p.full_name || p.username]));

    if (!ids.length) {
      return res.status(200).json({
        weavers: 0,
        kpis: { likes: 0, comments: 0, saves: 0, follows: 0, posts: 0, circles: 0, joins: 0 },
        timeline: [],
        recent: [],
        top: [],
        generated_at: new Date().toISOString(),
      });
    }

    const [likes, comments, saves, follows, posts, circles, joins] = await Promise.all([
      countIn('likes', 'user_id', ids),
      countIn('comments', 'user_id', ids),
      countIn('saves', 'user_id', ids),
      countIn('follows', 'follower_id', ids),
      countIn('posts', 'author_id', ids),
      countIn('groups', 'owner_id', ids),
      countIn('group_members', 'user_id', ids, { eq: ['role', 'member'] }),
    ]);

    // -------- 24h pulse: likes + comments bucketed by hour --------
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [likeRows, commentRows] = await Promise.all([
      fetchIn('likes', ids, 'user_id', 'created_at', 400),
      fetchIn('comments', ids, 'user_id', 'created_at', 300),
    ]);
    const buckets = new Map();
    for (let i = 23; i >= 0; i--) {
      const t = new Date(Date.now() - i * 3600 * 1000);
      buckets.set(hourKey(t), { h: `${String(t.getHours()).padStart(2, '0')}:00`, likes: 0, comments: 0 });
    }
    for (const r of likeRows) {
      if (r.created_at >= since) bump(buckets, r.created_at, 'likes');
    }
    for (const r of commentRows) {
      if (r.created_at >= since) bump(buckets, r.created_at, 'comments');
    }
    const timeline = [...buckets.values()];

    // -------- latest moves (via the notification fan-out) --------
    const notifs = await fetchIn('notifications', ids, 'actor_id', 'actor_name, type, preview, post_id, created_at', 25);
    notifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const recent = notifs.slice(0, 14);

    // -------- most active weavers (by recorded likes) --------
    const perUser = new Map();
    for (const r of likeRows) perUser.set(r.user_id, (perUser.get(r.user_id) || 0) + 1);
    const top = [...perUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([uid, n]) => ({ user_id: uid, name: nameOf.get(uid) || 'weaver', likes: n }));

    return res.status(200).json({
      weavers: ids.length,
      kpis: { likes, comments, saves, follows, posts, circles, joins },
      timeline,
      recent,
      top,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('society error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

function hourKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
}

function bump(buckets, iso, field) {
  const k = hourKey(new Date(iso));
  const b = buckets.get(k);
  if (b) b[field] += 1;
}
