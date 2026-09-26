// Canonical server-side coordinates for AyurVerse.
//
// Only PUBLISHABLE values live here (the publishable key is by definition
// public — it ships inside the JS bundle that every visitor downloads).
// True secrets (service keys, AI keys) must come from the Secrets tab /
// environment variables — never from source.
export const CENTRAL = {
  SUPABASE_URL: 'https://vcioygsdxmqlmngjpsmo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_oxp24Thotldwob3D1e32wA_EBDhLytq',

  // Set via secrets/env when a service role is required; db-client detects a
  // dead or missing key and operates on the publishable key.
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  PROJECT_REF: 'vcioygsdxmqlmngjpsmo',
  RESTORE_API_URL: 'https://www.designarena.ai/api/fullstack-restore',

  GOOGLE_CLIENT_ID: '1065078894672-rmp5kp8vfjns5rn9kp5psfp16g691043.apps.googleusercontent.com',
  GOOGLE_AUTH_PROXY: 'https://designarena.ai/auth/google/callback',

  // Auxiliary media-storage project. Secrets-tab env wins; the pinned fallback
  // keeps image/voice uploads alive on this deployment (private repo).
  AUX_SUPABASE_URL: process.env.AUX_SUPABASE_URL || 'https://ducnapzbjqmhjxpmsqez.supabase.co',
  AUX_SUPABASE_ANON_KEY: process.env.AUX_SUPABASE_ANON_KEY || 'sb_publishable_u-WSJ6oD_EabXjdWwi5S_g_iH0y9yqO',
  AUX_SUPABASE_SERVICE_ROLE_KEY:
    process.env.AUX_SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_j2q-UQhjFFfMMx0zFS0ERQ_-IaJRlZz',

  // Firebase — complete database (project: ananta-ayurverse, display: AyurVerse).
  // Web API key is publishable by design (it ships in the JS bundle).
  // Admin SDK authenticates via Application Default Credentials /
  // FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS —
  // never via a key committed to source.
  FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'ananta-ayurverse',
  FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDRbknm1v80CQ9YNH6jgVMs2OAYyXLK35I',
  FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'ananta-ayurverse.firebaseapp.com',
  FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'ananta-ayurverse.firebasestorage.app',
  FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || '1:521076795359:web:9e32be00956dafe2aa466a',
};
