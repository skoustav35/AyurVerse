import supabase from './db-client.js';
import { notifyMany } from './notify.js';

const TYPES = new Set(['text', 'image', 'voice', 'sticker', 'post']);

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

async function requireMember(convId, userId) {
  const { data } = await supabase
    .from('conversation_members')
    .select('id')
    .eq('conversation_id', convId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

async function attachSharedPosts(messages) {
  const ids = [...new Set(messages.filter((m) => m.type === 'post' && m.post_id).map((m) => m.post_id))];
  if (!ids.length) return messages;
  const { data: posts } = await supabase
    .from('posts')
    .select('id, kind, title, caption, summary, author_username, author_avatar, media_url, media_type')
    .in('id', ids);
  const byId = new Map((posts || []).map((p) => [p.id, p]));
  messages.forEach((m) => {
    if (m.type === 'post' && m.post_id) m.post = byId.get(m.post_id) || null;
  });
  return messages;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in required' });

    if (req.method === 'GET') {
      const convId = parseInt(req.query.conversation_id, 10);
      if (!convId) return res.status(400).json({ error: 'conversation_id required' });
      if (!(await requireMember(convId, user.id))) return res.status(403).json({ error: 'Not your thread' });

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('id', { ascending: false })
        .limit(300);
      if (error) throw error;
      const asc = (data || []).reverse();
      await attachSharedPosts(asc);
      return res.status(200).json(asc);
    }

    if (req.method === 'POST') {
      const convId = parseInt(req.body?.conversation_id, 10);
      const type = TYPES.has(req.body?.type) ? req.body.type : 'text';
      const body = req.body?.body ? String(req.body.body).slice(0, 2200) : null;
      if (!convId) return res.status(400).json({ error: 'conversation_id required' });
      if (type === 'text' && !body) return res.status(400).json({ error: 'body required' });
      if ((type === 'image' || type === 'voice') && !req.body?.media_url) return res.status(400).json({ error: 'media_url required' });
      if (type === 'sticker' && !body) return res.status(400).json({ error: 'sticker body required' });
      if (type === 'post' && !req.body?.post_id) return res.status(400).json({ error: 'post_id required' });
      if (!(await requireMember(convId, user.id))) return res.status(403).json({ error: 'Not your thread' });

      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      const fallbackName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'weaver');

      const row = {
        conversation_id: convId,
        sender_id: user.id,
        sender_name: profile?.full_name || fallbackName,
        sender_avatar: profile?.avatar_url || null,
        type,
        body: body || null,
        media_url: type === 'image' || type === 'voice' ? String(req.body.media_url) : null,
        post_id: type === 'post' ? parseInt(req.body.post_id, 10) : null,
      };
      const { data, error } = await supabase.from('messages').insert(row).select().single();
      if (error) throw error;
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId);

      // notify the other members of the thread
      const { data: members } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', convId);
      const others = (members || []).map((m) => m.user_id).filter((uid) => uid !== user.id);
      const previewText =
        type === 'text' || type === 'sticker'
          ? body
          : type === 'image'
            ? '\uD83D\uDCF7 Photo'
            : type === 'voice'
              ? '\uD83C\uDFA4 Voice note'
              : 'Shared a post';
      await notifyMany(others, { actor: user, type: 'message', conversationId: convId, preview: previewText });

      if (data.type === 'post' && data.post_id) await attachSharedPosts([data]);
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const messageId = parseInt(req.body?.message_id, 10);
      const emoji = String(req.body?.emoji || '').slice(0, 6);
      if (!messageId || !emoji) return res.status(400).json({ error: 'message_id and emoji required' });

      const { data: msg } = await supabase.from('messages').select('*').eq('id', messageId).maybeSingle();
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      if (!(await requireMember(msg.conversation_id, user.id))) return res.status(403).json({ error: 'Not your thread' });

      const reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
      const existingIdx = reactions.findIndex((r) => r.u === user.id && r.e === emoji);
      const next = existingIdx >= 0
        ? reactions.filter((_, i) => i !== existingIdx)
        : [...reactions.filter((r) => r.u !== user.id), { e: emoji, u: user.id }];

      const { data, error } = await supabase
        .from('messages')
        .update({ reactions: next })
        .eq('id', messageId)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: msg } = await supabase.from('messages').select('sender_id, conversation_id').eq('id', id).maybeSingle();
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      if (msg.sender_id !== user.id) return res.status(403).json({ error: 'Only your own words can be unsent' });
      if (!(await requireMember(msg.conversation_id, user.id))) return res.status(403).json({ error: 'Not your thread' });
      const { error } = await supabase.from('messages').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('messages error:', err);
    res.status(500).json({ error: err.message });
  }
}
