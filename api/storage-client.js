import { createClient } from '@supabase/supabase-js';
import supabase from './db-client.js';
import { CENTRAL } from './env.js';

// Legacy shim — media bytes now flow through api/blob-store.js (rotation-proof).
// This stays for posts.js's best-effort media cleanup on delete; it renders inert
// (and never throws at import) when the aux storage service key is absent.
const AUX_URL = process.env.AUX_SUPABASE_URL || CENTRAL.AUX_SUPABASE_URL || '';
const AUX_LEGACY = process.env.AUX_SUPABASE_SERVICE_ROLE_KEY || CENTRAL.AUX_SUPABASE_SERVICE_ROLE_KEY || '';

function makeBucket() {
  if (AUX_URL && AUX_LEGACY) return createClient(AUX_URL, AUX_LEGACY).storage.from('media');
  return supabase.storage.from('media');
}

const real = makeBucket();
const mediaBucket = {
  getPublicUrl: (p) => real.getPublicUrl(p),
  upload: (p, b, o) => real.upload(p, b, o).catch(() => ({ error: { message: 'storage lane retired' } })),
  createSignedUploadUrl: async (p) => ({ data: null, error: { message: 'storage lane retired' } }),
  remove: (paths) => real.remove(paths).catch(() => ({})),
};

export default mediaBucket;
