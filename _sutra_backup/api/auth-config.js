export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // These are public, client-side values (they are inlined into the public JS bundle
  // anyway) — serving them at runtime makes OAuth resilient to build-time env issues.
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null;
  const redirectUri = process.env.VITE_GOOGLE_AUTH_PROXY || null;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
  return res.status(200).json({ clientId, redirectUri, supabaseUrl, supabaseAnonKey });
}
