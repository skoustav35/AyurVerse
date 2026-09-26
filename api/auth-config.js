import { CENTRAL } from './env.js';

// Public, client-side Firebase + OAuth config — these values are inlined into
// the public JS bundle anyway; serving them at runtime makes sign-in
// resilient to bundle-time env drift.
export default function handler(req, res) {
  const origin = req.headers.origin || '';
  try {
    const { hostname } = new URL(origin || 'https://x.invalid');
    if (origin && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.vercel.app') || hostname.endsWith('.designarena.ai'))) {
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
    // Firebase (primary database + auth — project ananta-ayurverse)
    firebaseApiKey: CENTRAL.FIREBASE_API_KEY,
    firebaseAuthDomain: CENTRAL.FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: CENTRAL.FIREBASE_PROJECT_ID,
    firebaseStorageBucket: CENTRAL.FIREBASE_STORAGE_BUCKET,
    firebaseAppId: CENTRAL.FIREBASE_APP_ID,
    // Legacy Supabase coordinates (kept for unmigrated lanes)
    supabaseUrl: CENTRAL.SUPABASE_URL,
    supabaseAnonKey: CENTRAL.SUPABASE_ANON_KEY,
  });
}
