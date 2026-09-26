import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';
import { notifyMany } from './notify.js';

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await resolveUser(req);
  return user || null;
}

const KINDS = new Set(['feed', 'forge', 'thread']);
const clampStr = (v, n) => (v == null ? null : String(v).slice(0, n));
const toTags = (t) =>
  (Array.isArray(t) ? t : String(t || '').split(/[,\s]+/))
    .map((x) => String(x).trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 8);
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

async function loadMeta(userId, user) {
  const { data: profile } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  const fallbackName = user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : 'weaver');
  return {
    author_name: profile?.full_name || fallbackName,
    author_username: profile?.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
    author_avatar: profile?.avatar_url || user?.user_metadata?.avatar_url || null,
  };
}

async function memberInfo(groupIds, userId) {
  if (!userId || !groupIds.length) return new Map();
  const { data } = await supabase
    .from('group_members')
    .select('group_id, role')
    .eq('user_id', userId)
    .in('group_id', groupIds);
  return new Map((data || []).map((m) => [m.group_id, m.role]));
}

async function refreshCount(groupId) {
  const { count } = await db.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', groupId);
  await db.from('groups').update({ member_count: count || 0 }).eq('id', groupId);
  return count || 0;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);

    /* ---------------- GET ---------------- */
    if (req.method === 'GET') {
      const { id, mine, kind, discover } = req.query;

      // one group's full detail
      if (id) {
        const gid = parseInt(id, 10);
        const { data: group, error } = await db.from('groups').select('*').eq('id', gid).maybeSingle();
        if (error) throw error;
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const { data: members } = await supabase
          .from('group_members')
          .select('user_id, role, joined_at')
          .eq('group_id', gid)
          .order('role', { ascending: true })
          .limit(200);
        const ids = (members || []).map((m) => m.user_id);
        const { data: profs } = ids.length
          ? await db.from('profiles').select('user_id, username, full_name, avatar_url').in('user_id', ids)
          : { data: [] };
        const byId = new Map((profs || []).map((p) => [p.user_id, p]));
        const roster = (members || []).map((m) => ({
          user_id: m.user_id,
          role: m.role,
          username: byId.get(m.user_id)?.username || (m.user_id.startsWith('seed_') ? m.user_id.replace('seed_', '') : m.user_id.slice(0, 8)),
          full_name: byId.get(m.user_id)?.full_name || 'Weaver',
          avatar_url: byId.get(m.user_id)?.avatar_url || null,
        }));
        const myRole = user ? roster.find((r) => r.user_id === user.id)?.role || null : null;

        return res.status(200).json({
          group,
          members: roster,
          admins: roster.filter((r) => r.role === 'admin'),
          my_role: myRole,
          is_member: !!myRole,
        });
      }

      // my groups
      if (mine === '1') {
        if (!user) return res.status(401).json({ error: 'Sign in required' });
        const { data: mem } = await db.from('group_members').select('group_id, role').eq('user_id', user.id);
        const ids = (mem || []).map((m) => m.group_id);
        if (!ids.length) return res.status(200).json({ groups: [] });
        let q = db.from('groups').select('*').in('id', ids).order('member_count', { ascending: false });
        if (kind && KINDS.has(kind)) q = q.eq('kind', kind);
        const { data: groups } = await q;
        const roleById = new Map((mem || []).map((m) => [m.group_id, m.role]));
        return res.status(200).json({ groups: (groups || []).map((g) => ({ ...g, my_role: roleById.get(g.id) || 'member', is_member: true })) });
      }

      // discovery list (popular)
      let q = db.from('groups').select('*').order('member_count', { ascending: false }).limit(discover ? 24 : 60);
      if (kind && KINDS.has(kind)) q = q.eq('kind', kind);
      const { data: groups } = await q;
      const mineMap = await memberInfo((groups || []).map((g) => g.id), user?.id);
      return res.status(200).json({
        groups: (groups || []).map((g) => ({ ...g, my_role: mineMap.get(g.id) || null, is_member: mineMap.has(g.id) })),
      });
    }

    if (!user) return res.status(401).json({ error: 'Sign in required' });

    /* ---------------- POST ---------------- */
    if (req.method === 'POST') {
      const action = req.body?.action;

      // join
      if (action === 'join') {
        const gid = parseInt(req.body?.group_id, 10);
        if (!gid) return res.status(400).json({ error: 'group_id required' });
        const { data: group } = await db.from('groups').select('*').eq('id', gid).maybeSingle();
        if (!group) return res.status(404).json({ error: 'Group not found' });
        const { data: existing } = await db.from('group_members').select('id').eq('group_id', gid).eq('user_id', user.id).maybeSingle();
        if (existing) return res.status(200).json({ ok: true, already: true });
        const { error } = await db.from('group_members').insert({ group_id: gid, user_id: user.id, role: 'member' });
        if (error) throw error;
        // thread-groups: also add to the backing conversation
        if (group.kind === 'thread' && group.conversation_id) {
          const { data: inConv } = await db.from('conversation_members').select('id').eq('conversation_id', group.conversation_id).eq('user_id', user.id).maybeSingle();
          if (!inConv) await db.from('conversation_members').insert({ conversation_id: group.conversation_id, user_id: user.id });
        }
        const count = await refreshCount(gid);
        await notifyMany([group.owner_id], { actor: user, type: 'group_join', preview: `joined ${group.name}` });
        return res.status(201).json({ ok: true, member_count: count });
      }

      // leave
      if (action === 'leave') {
        const gid = parseInt(req.body?.group_id, 10);
        if (!gid) return res.status(400).json({ error: 'group_id required' });
        const { data: group } = await db.from('groups').select('*').eq('id', gid).maybeSingle();
        if (group && group.owner_id === user.id) return res.status(400).json({ error: 'The owner cannot leave — transfer or delete the group instead' });
        await db.from('group_members').delete().eq('group_id', gid).eq('user_id', user.id);
        if (group?.kind === 'thread' && group.conversation_id) {
          await db.from('conversation_members').delete().eq('conversation_id', group.conversation_id).eq('user_id', user.id);
        }
        const count = await refreshCount(gid);
        return res.status(200).json({ ok: true, member_count: count });
      }

      // add member (admin only)
      if (action === 'add_member' || action === 'promote' || action === 'remove_member') {
        const gid = parseInt(req.body?.group_id, 10);
        const targetId = String(req.body?.user_id || '');
        if (!gid || !targetId) return res.status(400).json({ error: 'group_id and user_id required' });
        const { data: me } = await db.from('group_members').select('role').eq('group_id', gid).eq('user_id', user.id).maybeSingle();
        if (me?.role !== 'admin') return res.status(403).json({ error: 'Only admins may manage members' });
        const { data: group } = await db.from('groups').select('*').eq('id', gid).maybeSingle();

        if (action === 'add_member') {
          const { data: exists } = await db.from('group_members').select('id').eq('group_id', gid).eq('user_id', targetId).maybeSingle();
          if (!exists) await db.from('group_members').insert({ group_id: gid, user_id: targetId, role: 'member' });
          if (group?.kind === 'thread' && group.conversation_id) {
            const { data: inConv } = await db.from('conversation_members').select('id').eq('conversation_id', group.conversation_id).eq('user_id', targetId).maybeSingle();
            if (!inConv) await db.from('conversation_members').insert({ conversation_id: group.conversation_id, user_id: targetId });
          }
        } else if (action === 'promote') {
          await db.from('group_members').update({ role: 'admin' }).eq('group_id', gid).eq('user_id', targetId);
        } else if (action === 'remove_member') {
          if (group?.owner_id === targetId) return res.status(400).json({ error: 'Cannot remove the owner' });
          await db.from('group_members').delete().eq('group_id', gid).eq('user_id', targetId);
          if (group?.kind === 'thread' && group.conversation_id) {
            await db.from('conversation_members').delete().eq('conversation_id', group.conversation_id).eq('user_id', targetId);
          }
        }
        const count = await refreshCount(gid);
        return res.status(200).json({ ok: true, member_count: count });
      }

      // create group (default action)
      const kind = KINDS.has(req.body?.kind) ? req.body.kind : 'feed';
      const name = clampStr(req.body?.name, 80);
      if (!name || !name.trim()) return res.status(400).json({ error: 'A group needs a name' });
      const description = clampStr(req.body?.description, 600);
      const tags = toTags(req.body?.tags);
      const avatar_url = req.body?.avatar_url || null;
      const cover_url = req.body?.cover_url || null;

      let conversation_id = null;
      if (kind === 'thread') {
        const { data: conv, error: cErr } = await supabase
          .from('conversations')
          .insert({ is_group: true, name, created_by: user.id })
          .select()
          .single();
        if (cErr) throw cErr;
        conversation_id = conv.id;
        await db.from('conversation_members').insert({ conversation_id, user_id: user.id });
      }

      const { data: group, error } = await supabase
        .from('groups')
        .insert({
          name: name.trim(),
          slug: slugify(name),
          description,
          kind,
          owner_id: user.id,
          avatar_url,
          cover_url,
          tags,
          conversation_id,
          member_count: 1,
        })
        .select()
        .single();
      if (error) throw error;

      await db.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'admin' });
      return res.status(201).json({ group });
    }

    /* ---------------- PUT (update, admin only) ---------------- */
    if (req.method === 'PUT') {
      const gid = parseInt(req.body?.id, 10);
      if (!gid) return res.status(400).json({ error: 'id required' });
      const { data: me } = await db.from('group_members').select('role').eq('group_id', gid).eq('user_id', user.id).maybeSingle();
      if (me?.role !== 'admin') return res.status(403).json({ error: 'Only admins may edit the group' });
      const patch = {};
      if (req.body.name != null) { patch.name = clampStr(req.body.name, 80); patch.slug = slugify(req.body.name); }
      if (req.body.description !== undefined) patch.description = req.body.description ? clampStr(req.body.description, 600) : null;
      if (req.body.avatar_url !== undefined) patch.avatar_url = req.body.avatar_url || null;
      if (req.body.cover_url !== undefined) patch.cover_url = req.body.cover_url || null;
      if (Array.isArray(req.body.tags)) patch.tags = toTags(req.body.tags);
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
      const { data, error } = await db.from('groups').update(patch).eq('id', gid).select().single();
      if (error) throw error;
      return res.status(200).json({ group: data });
    }

    /* ---------------- DELETE (owner only) ---------------- */
    if (req.method === 'DELETE') {
      const gid = parseInt(req.body?.id, 10);
      if (!gid) return res.status(400).json({ error: 'id required' });
      const { data: group } = await db.from('groups').select('owner_id, conversation_id').eq('id', gid).maybeSingle();
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (group.owner_id !== user.id) return res.status(403).json({ error: 'Only the owner may dissolve the group' });
      await db.from('group_members').delete().eq('group_id', gid);
      await db.from('group_posts').delete().eq('group_id', gid);
      await db.from('groups').delete().eq('id', gid);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('groups error:', err);
    res.status(500).json({ error: err.message });
  }
}

export { loadMeta };
