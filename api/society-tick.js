import supabase, { db, enterScope, applyCors } from './db-client.js';

/*
 * Society tick — one bounded turn of the weave, callable by a scheduler
 * (GitHub Actions, cron-job.org, Vercel cron on paid tiers) every few minutes.
 *
 * Each beat: a small ensemble of persona weavers act inside AyurVerse exactly
 * as they did under the local harness — likes, voices, forge scrolls, follows,
 * circle writes, golden threads — with the same taste signals, count bumps and
 * bell notifications. Identity comes from the profiles roster (the society
 * owns its personas server-side; no passwords cross this wire).
 *
 * Guarded by SOCIETY_CRON_SECRET (Secrets tab / env). Without it: 204.
 */

const GATEWAY_BASE = process.env.GATEWAY_BASE_URL || 'https://avs-gateway.vercel.app/v1';
const GATEWAY_KEY =
  process.env.GATEWAY_API_KEY ||
  process.env.OPENCODE_API_KEY ||
  'gwk-80a9b02c56929571805bb636a0ed7e1f65e09b17a71ad765';
const GATEWAY_MODEL = process.env.SOCIETY_MODEL || 'mimo-v2.5-free';

const VOICES = [
  'spare and precise',
  'warm, generous with praise, allergic to hype',
  'lyrical, one quiet metaphor per paragraph',
  'analytical; assumptions before conclusions',
  'teacherly — first principles to payoff',
  'field-note style: place, time, texture',
];

function isoDay() {
  return new Date().toISOString().slice(0, 10);
}

async function llmJson(system, user, maxTokens = 700) {
  try {
    const r = await fetch(`${GATEWAY_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GATEWAY_KEY}` },
      body: JSON.stringify({
        model: GATEWAY_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.95,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const txt = data?.choices?.[0]?.message?.content || '';
    const m = txt.match(/(\{[\s\S]*\})/);
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

function pick(arr, n = 1) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const secret = String(req.query.secret || req.headers['x-society-secret'] || '');
  const expected = process.env.SOCIETY_CRON_SECRET || '';
  if (expected && secret !== expected) return res.status(404).json({ error: 'not found' });
  if (!expected) return res.status(404).json({ error: 'not configured' });

  try {
    const beat = Math.min(8, Math.max(3, parseInt(req.query.beat || req.body?.beat, 10) || 6));
    const startedAt = Date.now();

    const [{ data: bots }, { data: posts }, { data: groups }] = await Promise.all([
      db.from('profiles').select('user_id, full_name, username, bio').ilike('bio', '%(sim)%').limit(600),
      db.from('posts').select('*').order('id', { ascending: false }).limit(26),
      db.from('groups').select('id, name, kind, owner_id, member_count, tags').order('member_count', { ascending: false }).limit(40),
    ]);
    const weavers = bots || [];
    if (!weavers.length) return res.status(200).json({ ok: false, error: 'no society roster (profiles with the (sim) mark)' });
    const roster = new Map(weavers.map((w) => [w.user_id, w]));

    const ensemble = pick(weavers, beat);
    const log = [];

    await Promise.all(ensemble.map(async (w) => {
      const craft = String(w.bio || '').split('·')[0].trim() || 'weaving';
      const voice = pick(VOICES)[0];
      const sys = `You are ${w.full_name}, a real weaver inside AyurVerse (an ayurvedic social atelier: visual feed, Forge scrolls, circles, threads). Craft: ${craft}. Voice: ${voice}. Never mention being simulated. No emojis. Strict JSON only.`;

      const roll = Math.random();
      try {
        if (roll < 0.34) {
          // like a fresh post
          const fresh = (posts || []).filter((p) => p.author_id !== w.user_id);
          if (!fresh.length) return;
          const target = pick(fresh)[0];
          const cands = await db.from('likes').select('id').eq('post_id', target.id).eq('user_id', w.user_id).maybeSingle();
          if (!cands) {
            await db.from('likes').insert({ post_id: target.id, user_id: w.user_id });
            const { data: cur } = await db.from('posts').select('likes_count, tags, kind, author_id').eq('id', target.id).single();
            await db.from('posts').update({ likes_count: (cur?.likes_count || 0) + 1 }).eq('id', target.id);
            await db.from('signals').insert({ user_id: w.user_id, type: 'like', post_id: target.id, tags: cur?.tags || [], kind: cur?.kind || null });
            if (cur?.author_id && cur.author_id !== w.user_id) {
              await db.from('notifications').insert({
                user_id: cur.author_id, actor_id: w.user_id, actor_name: w.full_name, actor_username: w.username,
                type: 'like', post_id: target.id, preview: null,
              });
            }
            log.push({ weaver: w.username, act: 'like', on: target.id });
          }
        } else if (roll < 0.55) {
          // voice (comment)
          const fresh = (posts || []).filter((p) => p.author_id !== w.user_id);
          if (!fresh.length) return;
          const target = pick(fresh)[0];
          const bodySrc = (target.title || target.caption || '').slice(0, 240);
          const out = await llmJson(sys, `Below is a post in the app:\n"${bodySrc}"\nRespond with ONE sincere ${craft}-color comment (1-2 sentences). JSON: {"reply":"..."}`, 220);
          const text = out && String(out.reply || '').trim();
          if (text) {
            await db.from('comments').insert({
              post_id: target.id, user_id: w.user_id, author_name: w.full_name,
              author_username: w.username, author_avatar: null, body: text.slice(0, 400),
            });
            const { data: cur } = await db.from('posts').select('comments_count, author_id, tags, kind').eq('id', target.id).single();
            await db.from('posts').update({ comments_count: (cur?.comments_count || 0) + 1 }).eq('id', target.id);
            if (cur?.author_id && cur.author_id !== w.user_id) {
              await db.from('notifications').insert({
                user_id: cur.author_id, actor_id: w.user_id, actor_name: w.full_name, actor_username: w.username,
                type: 'comment', post_id: target.id, preview: text.slice(0, 140),
              });
            }
            log.push({ weaver: w.username, act: 'comment', on: target.id });
          }
        } else if (roll < 0.68) {
          // forge a scroll
          const topic = pick([craft, 'monsoon', 'the archive', 'a lesson learned by hand', 'one quiet ritual'])[0];
          const out = await llmJson(
            sys,
            `Write a Forge scroll about "${topic}". 130-300 words of markdown, one vivid detail, warm close. JSON: {"title":"≤80c","summary":"≤200c","tags":["2-4"],"content_md":"…"}`,
            1100,
          );
          if (out && String(out.title || '').trim().length > 7 && String(out.content_md || '').trim().length > 240) {
            const { data: ins } = await db
              .from('posts')
              .insert({
                kind: 'forge',
                author_id: w.user_id,
                author_name: w.full_name,
                author_username: w.username,
                author_avatar: null,
                title: String(out.title).slice(0, 220),
                summary: String(out.summary || out.content_md).slice(0, 400),
                content_md: String(out.content_md),
                tags: (Array.isArray(out.tags) ? out.tags : ['society']).map((t) => String(t).toLowerCase().replace(/^#/, '')).slice(0, 6),
                read_minutes: Math.max(1, Math.round(String(out.content_md).split(/\s+/).length / 190)),
              })
              .select('id')
              .single();
            if (ins?.id) log.push({ weaver: w.username, act: 'forge', on: ins.id, title: out.title });
          }
        } else if (roll < 0.77) {
          // follow another weaver
          const others = weavers.filter((x) => x.user_id !== w.user_id);
          const target = pick(others)[0];
          const ex = await db.from('follows').select('id').eq('follower_id', w.user_id).eq('followee_id', target.user_id).maybeSingle();
          if (!ex) {
            await db.from('follows').insert({ follower_id: w.user_id, followee_id: target.user_id });
            log.push({ weaver: w.username, act: 'follow', on: target.username });
          }
        } else if (roll < 0.85) {
          // circle: join one (or share lore into an owned forge circle)
          const forgeCircles = (groups || []).filter((g) => g.kind === 'forge');
          if (forgeCircles.length && Math.random() < 0.5) {
            const g = pick(forgeCircles)[0];
            const mem = await db.from('group_members').select('id').eq('group_id', g.id).eq('user_id', w.user_id).maybeSingle();
            if (!mem.data) {
              await db.from('group_members').insert({ group_id: g.id, user_id: w.user_id, role: 'member' });
              const { data: cnt } = await db.from('group_members').select('id').eq('group_id', g.id);
              await db.from('groups').update({ member_count: (cnt || []).length }).eq('id', g.id);
              if (g.owner_id) {
                await db.from('notifications').insert({
                  user_id: g.owner_id, actor_id: w.user_id, actor_name: w.full_name, actor_username: w.username,
                  type: 'group_join', preview: `joined ${g.name}`,
                });
              }
              log.push({ weaver: w.username, act: 'circle_join', on: g.name });
            }
          } else if (forgeCircles.length) {
            const g = pick(forgeCircles)[0];
            const out = await llmJson(
              sys,
              `Share a short Forge scroll with the circle “${g.name}” (${(g.tags || []).join(', ')}). 120-220 words. JSON: {"title":"…","summary":"…","tags":["…"],"content_md":"…"}`,
              900,
            );
            if (out && String(out.title || '').length > 6 && String(out.content_md || '').length > 240) {
              const { data: ins } = await db
                .from('posts')
                .insert({
                  kind: 'forge', author_id: w.user_id, author_name: w.full_name, author_username: w.username, author_avatar: null,
                  title: String(out.title).slice(0, 220), summary: String(out.summary || '').slice(0, 400),
                  content_md: String(out.content_md),
                  tags: (Array.isArray(out.tags) ? out.tags : []).map((t) => String(t).toLowerCase()).slice(0, 6),
                  read_minutes: 2,
                })
                .select('id')
                .single();
              if (ins?.id) {
                await db.from('group_posts').insert({ group_id: g.id, post_id: ins.id, kind: 'forge' });
                log.push({ weaver: w.username, act: 'circle_write', on: g.name, title: out.title });
              }
            }
          }
        } else if (roll < 0.94) {
          // save to satchel
          const fresh = (posts || []).filter((p) => p.author_id !== w.user_id);
          if (fresh.length) {
            const target = pick(fresh)[0];
            const ex = await db.from('saves').select('id').eq('post_id', target.id).eq('user_id', w.user_id).maybeSingle();
            if (!ex) {
              await db.from('saves').insert({ post_id: target.id, user_id: w.user_id });
              const { data: cur } = await db.from('posts').select('saves_count').eq('id', target.id).single();
              await db.from('posts').update({ saves_count: (cur?.saves_count || 0) + 1 }).eq('id', target.id);
              log.push({ weaver: w.username, act: 'save', on: target.id });
            }
          }
        } else {
          // golden thread: open or answer a DM with a peer
          const others = weavers.filter((x) => x.user_id !== w.user_id);
          const target = pick(others)[0];
          const text = (await llmJson(
            sys,
            `Open a warm 1-2 sentence private thread with ${target.full_name}. No stacked pleasantries. JSON: {"reply":"…"}`,
            200,
          ))?.reply;
          if (text) {
            const { data: conv } = await db
              .from('conversations')
              .insert({ is_group: false, created_by: w.user_id, last_message_at: new Date().toISOString() })
              .select('id')
              .single();
            if (conv?.id) {
              await db.from('conversation_members').insert({ conversation_id: conv.id, user_id: w.user_id });
              await db.from('conversation_members').insert({ conversation_id: conv.id, user_id: target.user_id });
              await db.from('messages').insert({
                conversation_id: conv.id, sender_id: w.user_id, sender_name: w.full_name, sender_avatar: null,
                type: 'text', body: String(text).slice(0, 600),
              });
              log.push({ weaver: w.username, act: 'thread_open', on: target.username });
            }
          }
        }
      } catch (e) {
        log.push({ weaver: w.username, act: 'error', error: e.message?.slice(0, 120) });
      }
    }));

    return res.status(200).json({
      ok: true,
      day: isoDay(),
      ensemble: ensemble.length,
      acts: log,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('society-tick error:', err);
    return res.status(500).json({ error: err.message });
  }
}
