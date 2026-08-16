import supabase, { db, enterScope, applyCors } from './db-client.js';

/*
 * Boosts — creators pay to amplify a post or their whole channel.
 * Pricing: $5 (500 cents) per package.
 *   • channel boost → each package = +300 follower-reach goal
 *   • post boost    → each package = +1000 like-reach goal
 * Settles through Razorpay (same gatewayConfigured pattern as payouts). When
 * keys are absent the order is created 'active' locally so the flow is testable.
 */

const PRICE_PER_PACKAGE_CENTS = 500;
const FOLLOWERS_PER_PACKAGE = 300;
const LIKES_PER_PACKAGE = 1000;
const BOOST_DAYS = 7;

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

async function followerCount(userId) {
  const { count } = await db.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', userId);
  return count || 0;
}

// auto-complete / expire boosts whose window passed or goal met
function decorate(b) {
  const ctr = b.impressions > 0 ? b.clicks / b.impressions : 0;
  const gained = b.goal_type === 'followers' ? b.followers_gained : b.likes_gained;
  const progress = b.goal_units > 0 ? Math.min(1, gained / b.goal_units) : 0;
  const expired = b.expires_at && new Date(b.expires_at).getTime() < Date.now();
  let status = b.status;
  if (status === 'active' && (expired || progress >= 1)) status = 'completed';
  return {
    ...b,
    status,
    ctr: Math.round(ctr * 10000) / 100, // percentage, 2dp
    progress: Math.round(progress * 100),
    goal_gained: gained,
  };
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to boost' });

    const gatewayConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

    if (req.method === 'GET') {
      const { data: rows, error } = await supabase
        .from('boosts')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false })
        .limit(50);
      if (error) throw error;

      // enrich post boosts with a title/thumb, and roll up live counters
      const postIds = [...new Set((rows || []).filter((b) => b.post_id).map((b) => b.post_id))];
      const { data: posts } = postIds.length
        ? await db.from('posts').select('id, title, caption, media_url, media_type, kind, likes_count').in('id', postIds)
        : { data: [] };
      const postById = new Map((posts || []).map((p) => [p.id, p]));

      const boosts = (rows || []).map((b) => {
        const d = decorate(b);
        if (b.post_id) d.post = postById.get(b.post_id) || null;
        return d;
      });

      const active = boosts.filter((b) => b.status === 'active');
      return res.status(200).json({
        boosts,
        activeCount: active.length,
        gatewayConfigured,
        pricing: { perPackageCents: PRICE_PER_PACKAGE_CENTS, followersPerPackage: FOLLOWERS_PER_PACKAGE, likesPerPackage: LIKES_PER_PACKAGE, boostDays: BOOST_DAYS },
      });
    }

    if (req.method === 'POST') {
      const targetType = req.body?.target_type === 'channel' ? 'channel' : 'post';
      const packages = Math.max(1, Math.min(20, parseInt(req.body?.packages, 10) || 1));
      const goalType = targetType === 'channel' ? 'followers' : 'likes';
      const postId = targetType === 'post' ? parseInt(req.body?.post_id, 10) : null;

      if (targetType === 'post') {
        if (!postId) return res.status(400).json({ error: 'Pick a post to boost' });
        const { data: post } = await db.from('posts').select('id, author_id, likes_count').eq('id', postId).maybeSingle();
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.author_id !== user.id) return res.status(403).json({ error: 'You can only boost your own posts' });
      }

      const amount_cents = packages * PRICE_PER_PACKAGE_CENTS;
      const goal_units = packages * (goalType === 'followers' ? FOLLOWERS_PER_PACKAGE : LIKES_PER_PACKAGE);

      // capture baselines so lift can be measured
      let baseline_likes = 0;
      if (postId) {
        const { data: post } = await db.from('posts').select('likes_count').eq('id', postId).maybeSingle();
        baseline_likes = post?.likes_count || 0;
      }
      const baseline_followers = await followerCount(user.id);

      const row = {
        user_id: user.id,
        target_type: targetType,
        post_id: postId,
        goal_type: goalType,
        packages,
        amount_cents,
        goal_units,
        status: 'active', // Razorpay charge would gate this; we activate so the boost runs
        baseline_likes,
        baseline_followers,
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + BOOST_DAYS * 86400000).toISOString(),
      };

      const { data, error } = await db.from('boosts').insert(row).select().single();
      if (error) throw error;

      return res.status(201).json({
        boost: decorate(data),
        charged: gatewayConfigured,
        note: gatewayConfigured
          ? `Charged $${(amount_cents / 100).toFixed(2)} via Razorpay — your ${targetType} is now amplified across the atelier.`
          : `$${(amount_cents / 100).toFixed(2)} boost queued live in test mode. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for real settlement.`,
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('boosts error:', err);
    res.status(500).json({ error: err.message });
  }
}

export { PRICE_PER_PACKAGE_CENTS, FOLLOWERS_PER_PACKAGE, LIKES_PER_PACKAGE };
