import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';
import { notify } from './notify.js';

async function recount(postId) {
  const { count } = await db.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  await db.from('posts').update({ comments_count: count }).eq('id', postId);
  return count;
}

function computeUserFlair(profile, username) {
  if (profile?.flair) return String(profile.flair).slice(0, 32);
  const bio = String(profile?.bio || '').toLowerCase();
  const name = String(username || '').toLowerCase();
  if (name.includes('vaidya') || bio.includes('vaidya') || bio.includes('doctor') || bio.includes('ayurvedic physician')) {
    return 'Vaidya';
  }
  if (bio.includes('yoga') || bio.includes('asana') || bio.includes('pranayama') || name.includes('yoga')) {
    return 'Yoga Acharya';
  }
  if (bio.includes('herb') || bio.includes('botanical') || bio.includes('apothecary') || bio.includes('plant')) {
    return 'Herbalist';
  }
  if (bio.includes('scholar') || bio.includes('research') || bio.includes('manuscript') || bio.includes('veda')) {
    return 'Scholar';
  }
  if (bio.includes('pitta') || bio.includes('vata') || bio.includes('kapha')) {
    return 'Practitioner';
  }
  return 'Weaver';
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const postId = parseInt(req.query.post_id, 10);
      if (!postId) return res.status(400).json({ error: 'post_id required' });

      // Optional user auth to mark liked comments
      let currentUserId = null;
      try {
        const { data: authData } = await resolveUser(req);
        currentUserId = authData?.user?.id || null;
      } catch {
        /* anonymous view */
      }

      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('id', { ascending: true })
        .limit(200);
      if (error) throw error;

      const comments = (data || []).map((c) => ({
        ...c,
        parent_id: c.parent_id != null ? Number(c.parent_id) : null,
        likes_count: Number(c.likes_count || 0),
        user_flair: c.user_flair || 'Weaver',
        liked: false,
      }));

      if (currentUserId && comments.length) {
        const commentIds = comments.map((c) => c.id);
        const { data: userLikes } = await db
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', currentUserId)
          .in('comment_id', commentIds);
        const likedIds = new Set((userLikes || []).map((l) => l.comment_id));
        comments.forEach((c) => {
          c.liked = likedIds.has(c.id);
        });
      }

      return res.status(200).json(comments);
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to participate in the circle' });
    const { data: { user }, error: authError } = await resolveUser(req);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (req.method === 'POST') {
      // 1. Comment like/upvote action
      if (req.body?.action === 'like' || req.body?.comment_id) {
        const commentId = parseInt(req.body.comment_id, 10);
        if (!commentId) return res.status(400).json({ error: 'comment_id required' });

        const { data: existingLike } = await db
          .from('comment_likes')
          .select('id')
          .eq('comment_id', commentId)
          .eq('user_id', user.id)
          .maybeSingle();

        let liked;
        if (existingLike) {
          await db.from('comment_likes').delete().eq('id', existingLike.id);
          liked = false;
        } else {
          await db.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
          liked = true;
        }

        const { data: cRecord } = await db.from('comments').select('likes_count').eq('id', commentId).maybeSingle();
        const currentLikes = Number(cRecord?.likes_count || 0);
        const nextLikes = Math.max(0, currentLikes + (liked ? 1 : -1));
        await db.from('comments').update({ likes_count: nextLikes }).eq('id', commentId);

        return res.status(200).json({ liked, likes_count: nextLikes });
      }

      // 2. New comment / nested reply creation
      const postId = parseInt(req.body?.post_id, 10);
      const text = String(req.body?.body || '').trim().slice(0, 1200);
      if (!postId || !text) return res.status(400).json({ error: 'post_id and body required' });

      const parentId = req.body?.parent_id ? parseInt(req.body.parent_id, 10) : null;

      const { data: profile } = await db.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      const fallbackName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'weaver');
      const author_name = profile?.full_name || fallbackName;
      const author_username = profile?.username || fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '.');
      const user_flair = computeUserFlair(profile, author_username);

      const row = {
        post_id: postId,
        parent_id: parentId,
        user_id: user.id,
        author_name,
        author_username,
        author_avatar: profile?.avatar_url || user.user_metadata?.avatar_url || null,
        user_flair,
        likes_count: 0,
        body: text,
      };

      const { data, error } = await db.from('comments').insert(row).select().single();
      if (error) throw error;
      data.parent_id = parentId;
      data.likes_count = 0;
      data.liked = false;
      data.user_flair = user_flair;

      const count = await recount(postId);

      // Signal & notification dispatch
      const { data: postMeta } = await db.from('posts').select('tags, kind, author_id, title, caption').eq('id', postId).single();
      await db.from('signals').insert({
        user_id: user.id,
        type: 'comment',
        post_id: postId,
        tags: postMeta?.tags ?? [],
        kind: postMeta?.kind ?? null,
      });

      // If replying to a parent comment, notify parent author
      if (parentId) {
        const { data: parentComment } = await db.from('comments').select('user_id').eq('id', parentId).maybeSingle();
        if (parentComment?.user_id && parentComment.user_id !== user.id) {
          await notify({
            recipientId: parentComment.user_id,
            actor: user,
            type: 'comment_reply',
            postId,
            preview: text,
          });
        }
      }

      // Notify post author if not the commenter
      if (postMeta?.author_id && postMeta.author_id !== user.id) {
        await notify({
          recipientId: postMeta.author_id,
          actor: user,
          type: 'comment',
          postId,
          preview: text,
        });
      }

      return res.status(201).json({ comment: data, comments_count: count });
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: existing } = await db.from('comments').select('*').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Comment not found' });
      if (existing.user_id !== user.id) return res.status(403).json({ error: 'Not your comment' });

      // Delete child comments if any
      await db.from('comments').delete().eq('parent_id', id);
      await db.from('comment_likes').delete().eq('comment_id', id);
      const { error } = await db.from('comments').delete().eq('id', id);
      if (error) throw error;

      const count = await recount(existing.post_id);
      return res.status(200).json({ ok: true, comments_count: count });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('comments error:', err);
    res.status(500).json({ error: err.message });
  }
}
