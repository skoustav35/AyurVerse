import { CENTRAL } from './env.js';

// Public, client-side OAuth + Supabase config — these values are inlined into
// the public JS bundle anyway; serving them at runtime makes Google sign-in
// resilient to bundle-time env drift.
export default function handler(req, res) {
  const origin = req.headers.origin || '';
  try {
    const { hostname } = new URL(origin || 'https://x.invalid');
    if (origin && (hostname === 'localhost' || hostname.endsWith('.vercel.app') || hostname.endsWith('.designarena.ai'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  } catch { /* no grant */ }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  return res.status(200).json({
    clientId: CENTRAL.GOOGLE_CLIENT_ID,
    redirectUri: CENTRAL.GOOGLE_AUTH_PROXY,
    supabaseUrl: CENTRAL.SUPABASE_URL,
    supabaseAnonKey: CENTRAL.SUPABASE_ANON_KEY,
  });
}
