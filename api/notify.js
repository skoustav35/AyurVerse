import supabase, { db, enterScope, applyCors } from './db-client.js';

/*
 * Record a notification for `recipientId` caused by `actor` (a Supabase user).
 * Never notifies a user about their own action. Denormalizes the actor's
 * profile so the bell panel renders without extra joins.
 */
export async function notify({ recipientId, actor, type, postId = null, conversationId = null, preview = null }) {
  try {
    if (!recipientId || !actor || recipientId === actor.id) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('user_id', actor.id)
      .maybeSingle();
    const fallback = actor.user_metadata?.full_name || (actor.email ? actor.email.split('@')[0] : 'weaver');
    await db.from('notifications').insert({
      user_id: recipientId,
      actor_id: actor.id,
      actor_name: profile?.full_name || fallback,
      actor_username: profile?.username || fallback.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
      actor_avatar: profile?.avatar_url || actor.user_metadata?.avatar_url || null,
      type,
      post_id: postId,
      conversation_id: conversationId,
      preview: preview ? String(preview).slice(0, 140) : null,
    });
  } catch (err) {
    // notifications are best-effort — never break the primary action
    console.error('notify error:', err.message);
  }
}

export async function notifyMany(recipientIds, opts) {
  const seen = new Set();
  for (const rid of recipientIds || []) {
    if (seen.has(rid)) continue;
    seen.add(rid);
    // eslint-disable-next-line no-await-in-loop
    await notify({ recipientId: rid, ...opts });
  }
}
