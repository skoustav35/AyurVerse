// Canonical client-side coordinates for AyurVerse.
// Hosting tooling is free to rewrite `.env` between builds (it does — which is
// why env-fallback chains kept baking the wrong project into the bundle).
// These publishable values are the single source of truth; edit here to move
// projects. (This repo intentionally commits env — keep it private.)
export const ENV = {
  SUPABASE_URL: 'https://vcioygsdxmqlmngjpsmo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_oxp24Thotldwob3D1e32wA_EBDhLytq',
  GOOGLE_CLIENT_ID: '1065078894672-rmp5kp8vfjns5rn9kp5psfp16g691043.apps.googleusercontent.com',
  GOOGLE_AUTH_PROXY: 'https://designarena.ai/auth/google/callback',
} as const;
