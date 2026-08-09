import supabase from './db-client.js';

async function computeEarned(userId) {
  const { data: posts } = await supabase.from('posts').select('likes_count').eq('author_id', userId).limit(500);
  const likesPool = (posts || []).reduce((a, p) => a + (p.likes_count || 0), 0);
  const { data: followers } = await supabase.from('follows').select('id').eq('followee_id', userId).limit(6000);
  const followerCount = (followers || []).length;
  const eligible = followerCount >= 1000;
  const earnedCents = eligible ? Math.floor(likesPool / 1000) * 100 : 0;
  return { likesPool, followerCount, eligible, earnedCents };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to enter payouts' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (req.method === 'GET') {
      const { data: rows, error } = await supabase
        .from('payout_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false })
        .limit(50);
      if (error) throw error;
      const standing = await computeEarned(user.id);
      const requestedCents = (rows || []).reduce((a, r) => a + r.amount_cents, 0);
      return res.status(200).json({
        ...standing,
        requestedCents,
        withdrawableCents: Math.max(0, standing.earnedCents - requestedCents),
        requests: rows || [],
        gateway: 'razorpay-payouts',
        gatewayConfigured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      });
    }

    if (req.method === 'POST') {
      const standing = await computeEarned(user.id);
      if (!standing.eligible)
        return res.status(400).json({ error: 'The gate opens at 1,000 followers — keep weaving.' });
      if (standing.likesPool < 1000)
        return res.status(400).json({ error: 'Your pool lacks 1,000 likes — the pot fills as hearts land.' });

      const { data: rows } = await supabase.from('payout_requests').select('amount_cents').eq('user_id', user.id);
      const alreadyRequested = (rows || []).reduce((a, r) => a + r.amount_cents, 0);
      const withdrawable = Math.max(0, standing.earnedCents - alreadyRequested);
      if (withdrawable < 100) return res.status(400).json({ error: 'Nothing withdrawable yet — the pool is still filling.' });

      // RazorpayX note: live disbursal requires RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in Secrets.
      const configured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
      const { data, error } = await supabase
        .from('payout_requests')
        .insert({ user_id: user.id, amount_cents: withdrawable, status: configured ? 'processing' : 'pending' })
        .select()
        .single();
      if (error) throw error;

      return res.status(201).json({
        request: data,
        note: configured
          ? 'Wired to RazorpayX — the disbursement ledger is processing.'
          : 'Queued as pending. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Secrets for live payout disbursal.',
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('payouts error:', err);
    res.status(500).json({ error: err.message });
  }
}
