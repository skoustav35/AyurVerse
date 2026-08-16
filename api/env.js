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

  // Auxiliary media-storage project. Secrets-tab env wins; keep the raw
  // service key OUT of source (GitHub push protection refuses it, proudly).
  AUX_SUPABASE_URL: process.env.AUX_SUPABASE_URL || 'https://ducnapzbjqmhjxpmsqez.supabase.co',
  AUX_SUPABASE_SERVICE_ROLE_KEY: process.env.AUX_SUPABASE_SERVICE_ROLE_KEY || '',
};
