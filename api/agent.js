import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';
import { chat, hasKey } from './opencode.js';

/*
 * Vaidya — the AyurVerse in-account agent.
 * big-pickle drives a JSON tool-calling loop. Every tool is executed
 * server-side and scoped to the signed-in user. The model either replies to
 * the user or requests one tool at a time; we run it, feed back the result,
 * and loop (bounded). A structured transcript of actions is returned so the
 * UI can show receipts.
 */

const MAX_STEPS = 6;

/* ----------------------------- helpers ----------------------------- */
const clampStr = (v, n) => (v == null ? null : String(v).slice(0, n));
const toTags = (t) =>
  (Array.isArray(t) ? t : String(t || '').split(/[,\s]+/))
    .map((x) => String(x).trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 8);

async function loadProfile(userId, user) {
  const { data: profile } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  const fallbackName = user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : 'weaver');
  return {
    profile,
    author_name: profile?.full_name || fallbackName,
    author_username: profile?.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
    author_avatar: profile?.avatar_url || user?.user_metadata?.avatar_url || null,
    fallbackName,
  };
}

async function resolveUserId(idOrHandle) {
  if (!idOrHandle) return null;
  const raw = String(idOrHandle).trim().replace(/^@/, '');
  // looks like a uuid / seed id → trust it
  if (/^[0-9a-f-]{16,}$/i.test(raw) || raw.startsWith('seed_') || raw.startsWith('fan_')) return raw;
  const { data } = await db.from('profiles').select('user_id, username').ilike('username', raw).maybeSingle();
  if (data) return data.user_id;
  const { data: like } = await db.from('profiles').select('user_id').ilike('username', `%${raw}%`).limit(1).maybeSingle();
  return like?.user_id || null;
}

/* ----------------------------- tools ----------------------------- */
/* each returns { result, receipt? } — receipt marks a mutating action */
const TOOLS = {
  async get_my_profile({ userId, user }) {
    const { profile } = await loadProfile(userId, user);
    const { count } = await db.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', userId);
    return { result: { profile: profile || null, followers: count || 0 } };
  },

  async update_profile({ userId, user, args }) {
    const patch = {};
    for (const k of ['full_name', 'bio', 'avatar_url']) if (args[k] != null) patch[k] = clampStr(args[k], 300);
    if (args.username != null) patch.username = String(args.username).trim().toLowerCase().replace(/[^a-z0-9._]+/g, '.').slice(0, 30);
    if (!Object.keys(patch).length) return { result: { error: 'nothing to update' } };

    const { data: existing } = await db.from('profiles').select('user_id').eq('user_id', userId).maybeSingle();
    let data, error;
    if (existing) {
      ({ data, error } = await db.from('profiles').update(patch).eq('user_id', userId).select().single());
    } else {
      const { fallbackName } = await loadProfile(userId, user);
      ({ data, error } = await db.from('profiles').insert({
        user_id: userId,
        username: patch.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.').slice(0, 30),
        full_name: patch.full_name || fallbackName,
        bio: patch.bio ?? 'New weaver in the atelier.',
        avatar_url: patch.avatar_url ?? null,
      }).select().single());
    }
    if (error) return { result: { error: error.message } };
    const changed = Object.keys(patch).join(', ');
    return { result: { ok: true, profile: data }, receipt: `Updated your profile (${changed})` };
  },

  async write_lore_post({ userId, user, args }) {
    const title = clampStr(args.title, 220);
    const manuscript = args.manuscript || args.content_md || args.content || '';
    if (!title || !String(manuscript).trim()) return { result: { error: 'title and manuscript are required' } };
    const meta = await loadProfile(userId, user);
    const content_md = String(manuscript);
    const row = {
      kind: 'forge',
      author_id: userId,
      author_name: meta.author_name,
      author_username: meta.author_username,
      author_avatar: meta.author_avatar,
      title,
      summary: clampStr(args.summary, 400),
      content_md,
      tags: toTags(args.tags),
      read_minutes: Math.max(1, Math.round(content_md.split(/\s+/).length / 190)),
    };
    const { data, error } = await db.from('posts').insert(row).select().single();
    if (error) return { result: { error: error.message } };
    return { result: { ok: true, id: data.id, title: data.title }, receipt: `Published lore \u201c${data.title}\u201d` };
  },

  async edit_post({ userId, args }) {
    const id = parseInt(args.id, 10);
    if (!id) return { result: { error: 'post id required' } };
    const { data: existing } = await db.from('posts').select('author_id, kind, title').eq('id', id).maybeSingle();
    if (!existing) return { result: { error: 'post not found' } };
    if (existing.author_id !== userId) return { result: { error: 'you can only edit your own posts' } };
    const patch = {};
    if (args.caption != null) patch.caption = clampStr(args.caption, 2200);
    if (args.title != null) patch.title = clampStr(args.title, 220);
    if (args.summary != null) patch.summary = clampStr(args.summary, 400);
    if (args.manuscript != null || args.content_md != null) patch.content_md = String(args.manuscript ?? args.content_md);
    if (args.location !== undefined) patch.location = args.location ? clampStr(args.location, 120) : null;
    if (args.tags != null) patch.tags = toTags(args.tags);
    if (!Object.keys(patch).length) return { result: { error: 'nothing to amend' } };
    const { data, error } = await db.from('posts').update(patch).eq('id', id).select().single();
    if (error) return { result: { error: error.message } };
    return { result: { ok: true, id: data.id }, receipt: `Edited ${existing.kind === 'forge' ? 'lore' : 'post'} #${id}${existing.title ? ` \u201c${existing.title}\u201d` : ''}` };
  },

  async list_my_posts({ userId }) {
    const { data } = await supabase
      .from('posts').select('id, kind, title, caption, likes_count, views_count, comments_count, created_at')
      .eq('author_id', userId).order('id', { ascending: false }).limit(30);
    return { result: { posts: (data || []).map((p) => ({ id: p.id, kind: p.kind, title: p.title, caption: p.caption?.slice(0, 80), likes: p.likes_count, views: p.views_count })) } };
  },

  async find_users({ args }) {
    const q = String(args.query || args.q || '').trim().replace(/^@/, '');
    if (!q) return { result: { users: [] } };
    const { data } = await supabase
      .from('profiles').select('user_id, username, full_name, bio, avatar_url')
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%,bio.ilike.%${q}%`)
      .limit(10);
    return { result: { users: (data || []).map((u) => ({ user_id: u.user_id, username: u.username, full_name: u.full_name, bio: u.bio?.slice(0, 100) })) } };
  },

  async list_following({ userId }) {
    const { data: fr } = await db.from('follows').select('followee_id').eq('follower_id', userId).limit(200);
    const ids = (fr || []).map((r) => r.followee_id);
    if (!ids.length) return { result: { following: [] } };
    const { data: profs } = await db.from('profiles').select('user_id, username, full_name').in('user_id', ids);
    const byId = new Map((profs || []).map((p) => [p.user_id, p]));
    return { result: { following: ids.map((id) => ({ user_id: id, username: byId.get(id)?.username || id, full_name: byId.get(id)?.full_name || null })) } };
  },

  async follow_user({ userId, args }) {
    const target = await resolveUserId(args.user_id || args.username || args.handle);
    if (!target) return { result: { error: 'could not find that user' } };
    if (target === userId) return { result: { error: 'you cannot follow yourself' } };
    const { data: existing } = await db.from('follows').select('id').eq('follower_id', userId).eq('followee_id', target).maybeSingle();
    if (existing) return { result: { ok: true, already: true }, receipt: `Already following that channel` };
    const { error } = await db.from('follows').insert({ follower_id: userId, followee_id: target });
    if (error) return { result: { error: error.message } };
    const { data: pr } = await db.from('profiles').select('username').eq('user_id', target).maybeSingle();
    return { result: { ok: true, followed: target }, receipt: `Followed @${pr?.username || target}` };
  },

  async unfollow_user({ userId, args }) {
    const target = await resolveUserId(args.user_id || args.username || args.handle);
    if (!target) return { result: { error: 'could not find that user' } };
    const { error } = await db.from('follows').delete().eq('follower_id', userId).eq('followee_id', target);
    if (error) return { result: { error: error.message } };
    const { data: pr } = await db.from('profiles').select('username').eq('user_id', target).maybeSingle();
    return { result: { ok: true, unfollowed: target }, receipt: `Unfollowed @${pr?.username || target}` };
  },

  async list_my_groups({ userId }) {
    const { data: mem } = await db.from('group_members').select('group_id, role').eq('user_id', userId);
    const ids = (mem || []).map((m) => m.group_id);
    if (!ids.length) return { result: { groups: [] } };
    const { data: groups } = await db.from('groups').select('id, name, kind, member_count').in('id', ids);
    const roleById = new Map((mem || []).map((m) => [m.group_id, m.role]));
    return { result: { groups: (groups || []).map((g) => ({ id: g.id, name: g.name, kind: g.kind, members: g.member_count, role: roleById.get(g.id) })) } };
  },

  async find_groups({ args }) {
    const q = String(args.query || args.q || '').trim();
    let query = db.from('groups').select('id, name, kind, description, member_count').limit(10);
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    const { data } = await query;
    return { result: { groups: (data || []).map((g) => ({ id: g.id, name: g.name, kind: g.kind, members: g.member_count, about: g.description?.slice(0, 100) })) } };
  },

  async create_group({ userId, args }) {
    const kind = ['feed', 'forge', 'thread'].includes(args.kind) ? args.kind : 'feed';
    const name = clampStr(args.name, 80);
    if (!name) return { result: { error: 'a group needs a name' } };
    let conversation_id = null;
    if (kind === 'thread') {
      const { data: conv } = await db.from('conversations').insert({ is_group: true, name, created_by: userId }).select().single();
      conversation_id = conv?.id ?? null;
      if (conversation_id) await db.from('conversation_members').insert({ conversation_id, user_id: userId });
    }
    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: clampStr(args.description, 600), kind, owner_id: userId, tags: toTags(args.tags), conversation_id, member_count: 1 })
      .select()
      .single();
    if (error) return { result: { error: error.message } };
    await db.from('group_members').insert({ group_id: group.id, user_id: userId, role: 'admin' });
    return { result: { ok: true, id: group.id, name: group.name, kind: group.kind }, receipt: `Founded the ${group.kind} circle \u201c${group.name}\u201d` };
  },

  async join_group({ userId, user, args }) {
    let gid = parseInt(args.group_id, 10);
    if (!gid && args.name) {
      const { data: g } = await db.from('groups').select('id').ilike('name', `%${String(args.name)}%`).limit(1).maybeSingle();
      gid = g?.id;
    }
    if (!gid) return { result: { error: 'could not find that group' } };
    const { data: group } = await db.from('groups').select('*').eq('id', gid).maybeSingle();
    if (!group) return { result: { error: 'group not found' } };
    const { data: exists } = await db.from('group_members').select('id').eq('group_id', gid).eq('user_id', userId).maybeSingle();
    if (exists) return { result: { ok: true, already: true }, receipt: `Already in \u201c${group.name}\u201d` };
    await db.from('group_members').insert({ group_id: gid, user_id: userId, role: 'member' });
    if (group.kind === 'thread' && group.conversation_id) {
      const { data: inConv } = await db.from('conversation_members').select('id').eq('conversation_id', group.conversation_id).eq('user_id', userId).maybeSingle();
      if (!inConv) await db.from('conversation_members').insert({ conversation_id: group.conversation_id, user_id: userId });
    }
    const { count } = await db.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', gid);
    await db.from('groups').update({ member_count: count || 0 }).eq('id', gid);
    return { result: { ok: true, id: gid }, receipt: `Joined the circle \u201c${group.name}\u201d` };
  },

  async post_to_group({ userId, user, args }) {
    const gid = parseInt(args.group_id, 10);
    if (!gid) return { result: { error: 'group_id required' } };
    const { data: group } = await db.from('groups').select('*').eq('id', gid).maybeSingle();
    if (!group) return { result: { error: 'group not found' } };
    if (group.kind === 'thread') return { result: { error: 'thread circles take messages, not posts \u2014 use send_thread_message with its conversation' } };
    const { data: mem } = await db.from('group_members').select('role').eq('group_id', gid).eq('user_id', userId).maybeSingle();
    if (!mem) return { result: { error: 'join the group first' } };
    const meta = await loadProfile(userId, user);
    const kind = group.kind === 'forge' ? 'forge' : 'visual';
    if (kind === 'forge' && (!args.title || !(args.manuscript || args.content_md))) return { result: { error: 'a forge-circle post needs a title and manuscript' } };
    if (kind === 'visual' && !args.media_url) return { result: { error: 'a feed-circle post needs media (media_url)' } };
    const content_md = kind === 'forge' ? String(args.manuscript || args.content_md || '') : null;
    const row = {
      kind,
      author_id: userId,
      author_name: meta.author_name,
      author_username: meta.author_username,
      author_avatar: meta.author_avatar,
      caption: kind === 'visual' ? clampStr(args.caption, 2200) : null,
      title: kind === 'forge' ? clampStr(args.title, 220) : null,
      summary: kind === 'forge' ? clampStr(args.summary, 400) : null,
      content_md,
      media_url: args.media_url || null,
      media_type: kind === 'visual' ? (args.media_type === 'video' ? 'video' : 'image') : null,
      tags: toTags(args.tags),
      read_minutes: kind === 'forge' ? Math.max(1, Math.round((content_md || '').split(/\s+/).length / 190)) : null,
    };
    const { data: post, error } = await db.from('posts').insert(row).select().single();
    if (error) return { result: { error: error.message } };
    await db.from('group_posts').insert({ group_id: gid, post_id: post.id, kind });
    return { result: { ok: true, id: post.id }, receipt: `Posted to the circle \u201c${group.name}\u201d` };
  },

  async recent_activity({ userId }) {
    const { data } = await supabase
      .from('notifications')
      .select('type, actor_username, preview, read, created_at')
      .eq('user_id', userId)
      .order('id', { ascending: false })
      .limit(20);
    const rows = data || [];
    const unread = rows.filter((n) => !n.read).length;
    return { result: { unread, recent: rows.map((n) => ({ who: `@${n.actor_username || 'weaver'}`, did: n.type, about: n.preview, when: n.created_at })) } };
  },

  async list_threads({ userId }) {
    const { data: mem } = await db.from('conversation_members').select('conversation_id').eq('user_id', userId);
    const ids = (mem || []).map((m) => m.conversation_id);
    if (!ids.length) return { result: { threads: [] } };
    const { data: convs } = await db.from('conversations').select('id, name, is_group, last_message_at').in('id', ids).order('last_message_at', { ascending: false });
    return { result: { threads: (convs || []).map((c) => ({ id: c.id, name: c.name, is_group: c.is_group })) } };
  },

  async start_thread({ userId, args }) {
    const handles = args.member_ids || args.members || args.usernames || args.with;
    const list = Array.isArray(handles) ? handles : [handles];
    const memberIds = [];
    for (const h of list) {
      const id = await resolveUserId(h);
      if (id && id !== userId) memberIds.push(id);
    }
    const uniq = [...new Set(memberIds)].slice(0, 8);
    if (!uniq.length) return { result: { error: 'could not resolve anyone to message' } };
    const name = args.name ? clampStr(args.name, 60) : null;
    const isGroup = uniq.length > 1 || !!name;

    if (!isGroup) {
      // reuse an existing 1:1
      const { data: mine } = await db.from('conversation_members').select('conversation_id').eq('user_id', userId);
      const myIds = (mine || []).map((m) => m.conversation_id);
      if (myIds.length) {
        const { data: convs } = await db.from('conversations').select('id').in('id', myIds).eq('is_group', false);
        const plist = (convs || []).map((c) => c.id);
        if (plist.length) {
          const { data: theirs } = await db.from('conversation_members').select('conversation_id').eq('user_id', uniq[0]).in('conversation_id', plist);
          if ((theirs || [])[0]) return { result: { ok: true, conversation_id: theirs[0].conversation_id, existing: true } };
        }
      }
    }

    const { data: conv, error } = await db.from('conversations').insert({ is_group: isGroup, name, created_by: userId }).select().single();
    if (error) return { result: { error: error.message } };
    const rows = [userId, ...uniq].map((uid) => ({ conversation_id: conv.id, user_id: uid }));
    const { error: mErr } = await db.from('conversation_members').insert(rows);
    if (mErr) return { result: { error: mErr.message } };
    return { result: { ok: true, conversation_id: conv.id }, receipt: `Started a ${isGroup ? 'group ' : ''}thread${name ? ` \u201c${name}\u201d` : ''}` };
  },

  async send_thread_message({ userId, user, args }) {
    let convId = parseInt(args.conversation_id, 10);
    // allow addressing by username → resolve/create a 1:1 on the fly
    if (!convId && (args.username || args.to || args.user_id)) {
      const made = await TOOLS.start_thread({ userId, user, args: { member_ids: [args.username || args.to || args.user_id] } });
      convId = made.result?.conversation_id;
    }
    const body = clampStr(args.body || args.message || args.text, 2200);
    if (!convId || !body) return { result: { error: 'conversation_id (or username) and body are required' } };
    const { data: isMember } = await db.from('conversation_members').select('id').eq('conversation_id', convId).eq('user_id', userId).maybeSingle();
    if (!isMember) return { result: { error: 'you are not a member of that thread' } };
    const meta = await loadProfile(userId, user);
    const { data, error } = await db.from('messages').insert({
      conversation_id: convId, sender_id: userId, sender_name: meta.author_name, sender_avatar: meta.author_avatar, type: 'text', body,
    }).select().single();
    if (error) return { result: { error: error.message } };
    await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId);
    return { result: { ok: true, message_id: data.id, conversation_id: convId }, receipt: `Sent a message in thread #${convId}` };
  },
};
// alias
TOOLS.reply_in_thread = TOOLS.send_thread_message;

const TOOL_SPEC = `
AVAILABLE TOOLS (call ONE at a time):
- get_my_profile {}                          → your profile + follower count
- update_profile { full_name?, username?, bio?, avatar_url? }
- write_lore_post { title, summary?, tags?, manuscript }   (publishes a public Deep Lore article; manuscript is markdown)
- edit_post { id, caption?, title?, summary?, manuscript?, tags?, location? }   (only your own posts)
- list_my_posts {}
- find_users { query }                       → search public profiles
- list_following {}
- follow_user { username }  |  unfollow_user { username }
- list_threads {}
- start_thread { usernames:[..], name? }      → returns conversation_id
- send_thread_message { conversation_id? , username?, body }   (username auto-opens a 1:1)
- recent_activity {}                          → your recent notifications (likes/follows/comments/messages) — use to summarize "what happened while I was away"
- list_my_groups {}                           → circles you belong to
- find_groups { query }                       → search public circles
- create_group { name, kind:'feed'|'forge'|'thread', description?, tags? }
- join_group { group_id | name }
- post_to_group { group_id, ...post fields }   (feed circle → caption+media_url; forge circle → title+manuscript)
`.trim();

function systemPrompt(meta) {
  return `You are Vaidya, the in-account AI assistant of AyurVerse — an ayurvedic-majestic social "super-app" (feed, code/lore forge, library, reels, threads, studio). You act ON BEHALF OF the signed-in user (@${meta.author_username}). You are warm, precise and a little poetic, but never verbose.

You can take real actions in the user's account using tools. When the user asks you to do something (write & publish lore, edit a post, follow people, message someone, change their bio, look people up, etc.), use the tools to actually do it — do not pretend.

STRICT PROTOCOL — every message you output MUST be a single JSON object and nothing else:
• To use a tool:   {"tool":"<name>","args":{...}}
• To talk to the user (final answer): {"reply":"<message, markdown allowed>"}

Rules:
- Output ONLY the JSON. No prose outside it, no code fences.
- Use ONE tool per step. After a tool runs you will receive a line "TOOL_RESULT <name>: <json>"; then decide the next step.
- When writing lore, craft a real, well-structured markdown manuscript (## headers, a > sutra callout, useful detail) with a distinct title, a one-line summary, and 3-6 relevant tags — then publish with write_lore_post.
- To message or follow someone you only know by name, use find_users first if unsure, then act.
- When the task is done, send a {"reply"} that briefly confirms what you did in the user's warm house voice.
- If a request is impossible or a tool errors, explain gently in a {"reply"}.

${TOOL_SPEC}`;
}

const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

/*
 * Rebuild a valid JSON object string from `raw` starting at index `start`.
 * In one pass it:
 *   • escapes RAW control chars (newlines/tabs) that models emit inside string
 *     values — technically invalid JSON but extremely common in manuscripts,
 *   • closes an unterminated string and any open braces if the output was
 *     TRUNCATED (model hit the token ceiling mid-manuscript),
 *   • stops at the matching top-level '}' when the object is complete.
 * Returns the parsed object, or null.
 */
function rebuildJson(raw, start) {
  let out = '';
  let depth = 0, inStr = false, esc = false, closed = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      if (ch === '\f') { out += '\\f'; continue; }
      if (ch.charCodeAt(0) < 0x20) { continue; } // drop other control chars
      out += ch;
    } else {
      out += ch;
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { closed = true; break; } }
    }
  }
  if (!closed) {
    // truncated → drop a dangling escape, close the string, close braces
    if (esc) out = out.slice(0, -1);
    if (inStr) out += '"';
    while (depth-- > 0) out += '}';
  }
  return tryParse(out);
}

/*
 * Tolerant extraction of a single action object from a model turn. Handles
 * code fences, prose prefixes, nested braces, raw newlines and truncation, so
 * a long "super detailed" manuscript never leaks to the user as raw JSON.
 */
function parseAction(text) {
  if (!text) return { reply: '' };
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = s.indexOf('{');
  if (start === -1) return { reply: s };
  const obj = rebuildJson(s, start);
  if (obj && (typeof obj.tool === 'string' || typeof obj.reply === 'string')) return obj;
  return { reply: s };
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to summon Vaidya' });
    const { data: { user }, error: authError } = await resolveUser(req);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (!hasKey()) {
      return res.status(200).json({
        reply: 'Vaidya is resting — the caretaker has not yet lit the lamp. Add your `OPENCODE_API_KEY` to the project\u2019s `.env` (and vercel.json) and I will awaken with the full run of your account at my fingertips.',
        actions: [],
        disabled: true,
      });
    }

    const userId = user.id;
    const meta = await loadProfile(userId, user);

    // last 10 turns of rolling memory from the client
    const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-10) : [];
    const working = history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!working.length || working[working.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'a user message is required' });
    }

    const system = systemPrompt(meta);
    const actions = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      let turn;
      try {
        // big-pickle is a reasoning model — give it a wide budget so its
        // "thinking" never starves the actual answer / tool call.
        turn = await chat({ system, messages: working, maxTokens: 8000, temperature: 0.3 });
      } catch (err) {
        if (err.code === 'RATE_LIMIT') {
          return res.status(200).json({
            reply:
              'I’ve hit the AI usage limit on the current key (the free-tier quota is spent). Please wait a little and try again, or ask the caretaker to add a key with more headroom — then I’ll be right back with full powers.',
            actions,
            fallback: true,
            rateLimited: true,
          });
        }
        if (err.code === 'GATEWAY_DOWN') {
          return res.status(200).json({
            reply: 'The gateway to my mind is quiet just now — please try once more in a moment.',
            actions,
            fallback: true,
          });
        }
        if (err.code === 'EMPTY') {
          return res.status(200).json({
            reply:
              actions.length > 0
                ? 'I finished the steps above, but got lost in thought before summarising. Ask me to continue and I’ll pick up right here.'
                : 'That request set me thinking so hard I ran out of breath before answering. Try rephrasing it a little more concretely, or ask again.',
            actions,
            fallback: true,
          });
        }
        throw err;
      }

      const action = parseAction(turn.text);

      if (action && typeof action.reply === 'string' && !action.tool) {
        return res.status(200).json({ reply: action.reply, actions, model: turn.model });
      }

      const toolName = action?.tool;
      const fn = toolName && TOOLS[toolName];
      if (!fn) {
        // Unrecognized output. If it merely LOOKS like a tool call the model
        // botched, never dump raw JSON to the user — nudge it to retry cleanly.
        const looksLikeTool = /"tool"\s*:/.test(turn.text) || /^\s*\{/.test(turn.text);
        if (looksLikeTool && step < MAX_STEPS - 1) {
          working.push({ role: 'assistant', content: turn.text.slice(0, 500) });
          working.push({
            role: 'user',
            content:
              'That was not valid. Respond again with EXACTLY one JSON object — either {"tool":"<name>","args":{...}} to act, or {"reply":"<message>"} to talk. No prose, no code fences.',
          });
          continue;
        }
        return res.status(200).json({
          reply:
            action && typeof action.reply === 'string' && !/^\s*\{\s*"tool"/.test(action.reply)
              ? action.reply
              : 'I tripped over my own words there — could you ask me that once more?',
          actions,
          model: turn.model,
        });
      }

      // record the assistant's tool request, execute, feed back
      working.push({ role: 'assistant', content: JSON.stringify({ tool: toolName, args: action.args || {} }) });
      let exec;
      try {
        exec = await fn({ userId, user, args: action.args || {} });
      } catch (err) {
        exec = { result: { error: err.message } };
      }
      if (exec.receipt) actions.push({ tool: toolName, summary: exec.receipt, result: exec.result });
      working.push({ role: 'user', content: `TOOL_RESULT ${toolName}: ${JSON.stringify(exec.result).slice(0, 3000)}` });
    }

    // ran out of steps — ask the model for a closing summary
    working.push({ role: 'user', content: 'You have reached the step limit. Reply now with a {"reply"} summarizing what you accomplished.' });
    try {
      const closing = await chat({ system, messages: working, maxTokens: 500, temperature: 0.3 });
      const action = parseAction(closing.text);
      return res.status(200).json({ reply: action.reply || closing.text, actions, model: closing.model });
    } catch {
      return res.status(200).json({ reply: 'Done — I completed the steps I could.', actions });
    }
  } catch (err) {
    console.error('agent error:', err);
    res.status(502).json({ error: err.message });
  }
}
