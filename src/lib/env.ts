// Canonical client-side coordinates for AyurVerse.
// Firebase (project ananta-ayurverse) is now the primary database + auth.
// Legacy Supabase values remain as fallback for unmigrated lanes.
export const ENV = {
  SUPABASE_URL: 'https://vcioygsdxmqlmngjpsmo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_oxp24Thotldwob3D1e32wA_EBDhLytq',
  GOOGLE_CLIENT_ID: '1065078894672-rmp5kp8vfjns5rn9kp5psfp16g691043.apps.googleusercontent.com',
  GOOGLE_AUTH_PROXY: 'https://designarena.ai/auth/google/callback',
  FIREBASE_API_KEY: 'AIzaSyDRbknm1v80CQ9YNH6jgVMs2OAYyXLK35I',
  FIREBASE_AUTH_DOMAIN: 'ananta-ayurverse.firebaseapp.com',
  FIREBASE_PROJECT_ID: 'ananta-ayurverse',
  FIREBASE_STORAGE_BUCKET: 'ananta-ayurverse.firebasestorage.app',
  FIREBASE_MESSAGING_SENDER_ID: '521076795359',
  FIREBASE_APP_ID: '1:521076795359:web:9e32be00956dafe2aa466a',
} as const;
