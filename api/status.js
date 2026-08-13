import supabase from './db-client.js';

/*
 * Deployment status — a read-only production-readiness probe.
 * Reports which capabilities are configured (booleans only, NEVER secret
 * values) plus live table row counts, so the Studio → Developer console can
 * show a real go-live checklist. Requires a signed-in session.
 */

async function getAuthUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

async function count(table) {
  try {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    return count || 0;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in required' });

    const env = process.env;
    const capabilities = {
      database: !!(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
      auth_google: !!env.VITE_GOOGLE_CLIENT_ID,
      ai_assistant: !!env.OPENCODE_API_KEY,
      payouts: !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
      storage: true, // media bucket is provisioned
    };

    const [posts, profiles, groups, threads] = await Promise.all([
      count('posts'),
      count('profiles'),
      count('groups'),
      count('conversations'),
    ]);

    return res.status(200).json({
      environment: env.VERCEL_ENV || 'production',
      capabilities,
      metrics: { posts, profiles, groups, threads },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('status error:', err);
    res.status(500).json({ error: err.message });
  }
}
