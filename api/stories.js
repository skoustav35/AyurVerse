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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);

    if (req.method === 'GET') {
      const { data: rows, error } = await supabase
        .from('statuses')
        .select('*')
        .order('id', { ascending: false })
        .limit(80);
      if (error) throw error;

      let followeeIds = [];
      if (user) {
        const { data: fr } = await db.from('follows').select('followee_id, id').eq('follower_id', user.id).order('id', { ascending: false });
        followeeIds = (fr || []).map((r) => r.followee_id);
      }
      const followSet = new Set(followeeIds);

      const groups = new Map();
      for (const s of rows || []) {
        if (!groups.has(s.user_id)) groups.set(s.user_id, []);
        
        let poll = null;
        if (s.poll && s.poll.question) {
          const opts = Array.isArray(s.poll.options) ? s.poll.options : [];
          const cleanOptions = opts.map((opt) => ({
            text: opt.text || '',
            votes: Number(opt.votes || 0),
          }));
          const total_votes = cleanOptions.reduce((sum, opt) => sum + opt.votes, 0);
          let user_voted_idx = null;
          if (user) {
            const foundIdx = opts.findIndex((opt) => Array.isArray(opt.voter_ids) && opt.voter_ids.includes(user.id));
            if (foundIdx !== -1) user_voted_idx = foundIdx;
          }
          poll = {
            question: s.poll.question,
            options: cleanOptions,
            total_votes,
            user_voted_idx,
          };
        }

        groups.get(s.user_id).push({
          ...s,
          views_count: Number(s.views_count || 0),
          is_following: followSet.has(s.user_id),
          is_own: user ? s.user_id === user.id : false,
          muhurta: s.muhurta || null,
          poll,
        });
      }

      const { data: profs } = followeeIds.length
        ? await db.from('profiles').select('user_id, username, full_name, avatar_url').in('user_id', followeeIds)
        : { data: [] };
      const profileById = new Map((profs || []).map((p) => [p.user_id, p]));

      const channels = [];

      if (user && groups.has(user.id)) {
        channels.push({
          user_id: user.id,
          author_name: 'You',
          author_username: profileById.get(user.id)?.username || 'you',
          author_avatar: profileById.get(user.id)?.avatar_url || user.user_metadata?.avatar_url || null,
          stories: groups.get(user.id),
          has_story: true,
          is_own: true,
          is_following: false,
        });
      }

      const withStories = [];
      const withoutStories = [];
      for (const fid of followeeIds) {
        if (user && fid === user.id) continue;
        const pr = profileById.get(fid);
        const st = groups.get(fid) || [];
        const entry = {
          user_id: fid,
          author_name: pr?.full_name || st[0]?.author_name || 'Weaver',
          author_username: pr?.username || st[0]?.author_username || 'weaver',
          author_avatar: pr?.avatar_url || st[0]?.author_avatar || null,
          stories: st,
          has_story: st.length > 0,
          is_own: false,
          is_following: true,
        };
        (entry.has_story ? withStories : withoutStories).push(entry);
      }
      withStories.sort((a, b) => (b.stories[0]?.id ?? 0) - (a.stories[0]?.id ?? 0));
      channels.push(...withStories, ...withoutStories);

      return res.status(200).json(channels);
    }

    if (req.method === 'POST') {
      if (!user) return res.status(401).json({ error: 'Sign in to share a status' });
      const mediaUrl = String(req.body?.media_url || '');
      if (!mediaUrl) return res.status(400).json({ error: 'media_url required' });

      const { data: profile } = await db.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      const fallbackName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'weaver');

      let poll = null;
      if (req.body?.poll?.question) {
        const rawOpts = Array.isArray(req.body.poll.options) ? req.body.poll.options : [];
        const validOpts = rawOpts
          .map((o) => (typeof o === 'string' ? o.trim() : String(o?.text || '').trim()))
          .filter(Boolean);
        if (validOpts.length >= 2) {
          poll = {
            question: String(req.body.poll.question).trim().slice(0, 140),
            options: validOpts.slice(0, 4).map((text) => ({
              text,
              votes: 0,
              voter_ids: [],
            })),
          };
        }
      }

      const row = {
        user_id: user.id,
        author_name: profile?.full_name || fallbackName,
        author_username: profile?.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
        author_avatar: profile?.avatar_url || null,
        media_url: mediaUrl,
        media_type: req.body?.media_type === 'video' ? 'video' : 'image',
        caption: req.body?.caption ? String(req.body.caption).slice(0, 160) : null,
        views_count: 0,
        muhurta: req.body?.muhurta ? String(req.body.muhurta).slice(0, 60) : null,
        poll,
      };
      const { data, error } = await db.from('statuses').insert(row).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });

      if (req.body?.action === 'vote') {
        if (!user) return res.status(401).json({ error: 'Sign in to participate in the poll' });
        const optionIdx = parseInt(req.body?.option_idx, 10);
        if (isNaN(optionIdx)) return res.status(400).json({ error: 'option_idx required' });

        const { data: existing } = await db.from('statuses').select('*').eq('id', id).maybeSingle();
        if (!existing) return res.status(404).json({ error: 'Status not found' });
        if (!existing.poll || !Array.isArray(existing.poll.options) || !existing.poll.options[optionIdx]) {
          return res.status(400).json({ error: 'Invalid poll option' });
        }

        const poll = {
          ...existing.poll,
          options: existing.poll.options.map((o) => ({
            ...o,
            voter_ids: [...(o.voter_ids || [])],
          })),
        };

        // If previously voted, remove previous vote
        for (let i = 0; i < poll.options.length; i++) {
          const vIdx = poll.options[i].voter_ids.indexOf(user.id);
          if (vIdx !== -1) {
            poll.options[i].voter_ids.splice(vIdx, 1);
            poll.options[i].votes = Math.max(0, (poll.options[i].votes || 1) - 1);
          }
        }

        // Add new vote
        poll.options[optionIdx].voter_ids.push(user.id);
        poll.options[optionIdx].votes = (Number(poll.options[optionIdx].votes) || 0) + 1;

        const { error } = await db.from('statuses').update({ poll }).eq('id', id);
        if (error) throw error;

        const cleanOptions = poll.options.map((o) => ({ text: o.text, votes: Number(o.votes || 0) }));
        const total_votes = cleanOptions.reduce((s, o) => s + o.votes, 0);

        return res.status(200).json({
          ok: true,
          poll: {
            question: poll.question,
            options: cleanOptions,
            total_votes,
            user_voted_idx: optionIdx,
          },
        });
      }

      const { data: existing } = await db.from('statuses').select('id, views_count').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Status not found' });

      const count = (Number(existing.views_count) || 0) + 1;
      const { data: updated, error } = await db
        .from('statuses')
        .update({ views_count: count })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, views_count: updated?.views_count ?? count });
    }

    if (req.method === 'DELETE') {
      if (!user) return res.status(401).json({ error: 'Sign in required' });
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: existing } = await db.from('statuses').select('user_id').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Status not found' });
      if (existing.user_id !== user.id) return res.status(403).json({ error: 'Not your status' });
      const { error } = await db.from('statuses').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('stories error:', err);
    res.status(500).json({ error: err.message });
  }
}
