import supabase from './db-client.js';

const tokens = (q) => (q || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];

function tfCount(text, term) {
  if (!text) return 0;
  let c = 0;
  let i = 0;
  while ((i = text.indexOf(term, i)) !== -1) {
    c++;
    i += term.length;
  }
  return c;
}

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const raw = String(req.query.q || '').trim();
    const kind = req.query.kind ? String(req.query.kind) : null;
    if (!raw) return res.status(200).json({ posts: [], people: [], meta: { terms: 0, ranked: 0 } });

    const terms = tokens(raw).slice(0, 12);
    const phrase = raw.toLowerCase();
    if (!terms.length) return res.status(200).json({ posts: [], people: [], meta: { terms: 0, ranked: 0 } });

    const user = await getAuthUser(req);

    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .order('id', { ascending: false })
      .limit(600);
    if (error) throw error;

    // light personal re-rank weight from signals
    const tagW = {};
    if (user) {
      const { data: sig } = await supabase
        .from('signals').select('tags, created_at').eq('user_id', user.id)
        .order('id', { ascending: false }).limit(200);
      (sig || []).forEach((s) => (s.tags || []).forEach((t) => { tagW[t] = (tagW[t] || 0) + 1; }));
    }

    const now = Date.now();
    const scored = [];

    for (const p of posts) {
      if (kind === 'forge' && p.kind !== 'forge') continue;
      if (kind === 'video' && p.media_type !== 'video') continue;
      if (kind === 'image' && p.media_type !== 'image') continue;

      const fields = [
        [(p.title || '').toLowerCase(), 6.0],
        [(p.tags || []).join(' ').toLowerCase(), 5.5],
        [(p.summary || '').toLowerCase(), 3.0],
        [(p.caption || '').toLowerCase(), 2.6],
        [`${p.author_name || ''} ${p.author_username || ''}`.toLowerCase(), 2.2],
        [(p.location || '').toLowerCase(), 1.6],
        [(p.content_md || '').slice(0, 6000).toLowerCase(), 1.0],
      ];

      // best_fields + tie_breaker: dominant field leads, other matches still count (Elastic-style)
      let text = 0;
      for (const term of terms) {
        let best = 0;
        let sum = 0;
        for (const [txt, w] of fields) {
          const tf = tfCount(txt, term);
          const contrib = w * (tf / (tf + 1.2)); // k1 saturation — the 50th repeat isn't 50×
          sum += contrib;
          if (contrib > best) best = contrib;
        }
        text += best + 0.35 * (sum - best);
      }

      // exact-phrase bonus
      let bonus = 0;
      if (fields[0][0].includes(phrase)) bonus += 9;
      if (fields[1][0].includes(phrase)) bonus += 6;
      if (fields[2][0].includes(phrase) || fields[3][0].includes(phrase)) bonus += 4;
      if (fields[6][0].includes(phrase)) bonus += 2;

      if (text <= 0 && bonus <= 0) continue; // only real matches surface

      // separated business signals (function_score-style additive rescore)
      const ageDays = (now - new Date(p.created_at).getTime()) / 86400000;
      const engage = (1.3 * Math.log1p(p.views_count || 0)) / 10 + (0.9 * Math.log1p(p.likes_count || 0)) / 9;
      const fresh = 0.9 * Math.exp((-Math.LN2 * ageDays) / 17); // 17-day half-life
      let perso = 0;
      for (const tg of p.tags || []) perso += (tagW[tg] || 0) * 0.5;

      scored.push({ p, score: text * 3 + bonus + engage + fresh + perso });
    }

    scored.sort((a, b) => b.score - a.score || b.p.id - a.p.id);
    const items = scored.slice(0, 30).map((s) => s.p);

    const { data: peopleRows } = await supabase.from('profiles').select('*').limit(120);
    const scoredPeople = (peopleRows || [])
      .map((pr) => {
        const un = (pr.username || '').toLowerCase();
        const fn = (pr.full_name || '').toLowerCase();
        const bio = (pr.bio || '').toLowerCase();
        let s = 0;
        for (const t of terms) {
          if (un.includes(t)) s += 4;
          if (fn.includes(t)) s += 3;
          if (bio.includes(t)) s += 1;
        }
        if (un.includes(phrase)) s += 4;
        return { pr, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((x) => x.pr);

    return res.status(200).json({ posts: items, people: scoredPeople, meta: { terms: terms.length, ranked: scored.length } });
  } catch (err) {
    console.error('search error:', err);
    res.status(500).json({ error: err.message });
  }
}
