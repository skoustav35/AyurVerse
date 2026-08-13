import supabase from './db-client.js';

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to read threads' });

    if (req.method === 'GET') {
      const { data: myMemberships, error } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);
      if (error) throw error;
      const myMap = new Map((myMemberships || []).map((m) => [m.conversation_id, m.last_read_at]));
      const convIds = [...myMap.keys()];
      if (!convIds.length) return res.status(200).json([]);

      const [{ data: convs }, { data: allMembers }, { data: msgs }] = await Promise.all([
        supabase.from('conversations').select('*').in('id', convIds).order('last_message_at', { ascending: false }),
        supabase.from('conversation_members').select('conversation_id, user_id, last_read_at').in('conversation_id', convIds),
        supabase
          .from('messages')
          .select('id, conversation_id, sender_id, sender_name, body, type, created_at')
          .in('conversation_id', convIds)
          .order('id', { ascending: false })
          .limit(600),
      ]);

      const memberUserIds = [...new Set((allMembers || []).map((m) => m.user_id))];
      const { data: profiles } = memberUserIds.length
        ? await supabase.from('profiles').select('user_id, username, full_name, avatar_url').in('user_id', memberUserIds)
        : { data: [] };
      const profileById = new Map((profiles || []).map((p) => [p.user_id, p]));

      const membersByConv = new Map();
      const readAtByConvUser = new Map();
      for (const m of allMembers || []) {
        if (!membersByConv.has(m.conversation_id)) membersByConv.set(m.conversation_id, []);
        membersByConv.get(m.conversation_id).push(m.user_id);
        readAtByConvUser.set(`${m.conversation_id}:${m.user_id}`, m.last_read_at);
      }

      const lastByConv = new Map();
      const unreadByConv = new Map();
      for (const m of msgs || []) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
        const readAt = new Date(myMap.get(m.conversation_id) || 0).getTime();
        if (m.sender_id !== user.id && new Date(m.created_at).getTime() > readAt) {
          unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) || 0) + 1);
        }
      }

      const threads = (convs || []).map((c) => {
        const memberIds = membersByConv.get(c.id) || [];
        const others = memberIds.filter((id) => id !== user.id);
        const members = memberIds.map((id) => {
          const pr = profileById.get(id);
          return {
            user_id: id,
            name: pr?.full_name || (id.startsWith('seed_') ? id.replace('seed_', '') : id.slice(0, 8)),
            username: pr?.username || '',
            avatar_url: pr?.avatar_url || null,
            last_read_at: readAtByConvUser.get(`${c.id}:${id}`) || null,
          };
        });
        const firstOther = profileById.get(others[0]);
        const title =
          c.name ||
          (c.is_group
            ? others
                .slice(0, 3)
                .map((id) => (profileById.get(id)?.full_name || 'weaver').split(' ')[0])
                .join(', ')
            : firstOther?.full_name || 'A quiet thread');
        const lm = lastByConv.get(c.id) || null;
        return {
          id: c.id,
          is_group: c.is_group,
          name: c.name,
          title,
          avatar_url: c.name || c.is_group ? null : firstOther?.avatar_url || null,
          members,
          last_message: lm
            ? { body: lm.body, type: lm.type, sender_name: lm.sender_name, created_at: lm.created_at }
            : null,
          last_message_at: c.last_message_at,
          unread_count: unreadByConv.get(c.id) || 0,
        };
      });

      return res.status(200).json(threads);
    }

    if (req.method === 'POST') {
      const memberIds = Array.isArray(req.body?.member_ids)
        ? [...new Set(req.body.member_ids.map(String).filter((id) => id && id !== user.id))].slice(0, 8)
        : [];
      if (!memberIds.length) return res.status(400).json({ error: 'Pick at least one weaver' });
      const name = req.body?.name ? String(req.body.name).slice(0, 60) : null;
      const isGroup = memberIds.length > 1 || !!name;

      if (!isGroup) {
        const other = memberIds[0];
        const { data: mine } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', user.id);
        const ids = (mine || []).map((m) => m.conversation_id);
        if (ids.length) {
          const { data: convs } = await supabase.from('conversations').select('id').in('id', ids).eq('is_group', false);
          const plist = (convs || []).map((c) => c.id);
          if (plist.length) {
            const { data: theirs } = await supabase
              .from('conversation_members')
              .select('conversation_id')
              .eq('user_id', other)
              .in('conversation_id', plist);
            const existing = (theirs || [])[0];
            if (existing) return res.status(200).json({ id: existing.conversation_id, existing: true });
          }
        }
      }

      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ is_group: isGroup, name, created_by: user.id })
        .select()
        .single();
      if (error) throw error;

      const rows = [user.id, ...memberIds].map((uid) => ({ conversation_id: conv.id, user_id: uid }));
      const { error: mErr } = await supabase.from('conversation_members').insert(rows);
      if (mErr) throw mErr;

      return res.status(201).json({ id: conv.id, existing: false });
    }

    if (req.method === 'PUT') {
      const convId = parseInt(req.body?.conversation_id, 10);
      if (!convId) return res.status(400).json({ error: 'conversation_id required' });
      const { error } = await supabase
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', convId)
        .eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('threads error:', err);
    res.status(500).json({ error: err.message });
  }
}
