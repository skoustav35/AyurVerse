import { createClient } from '@supabase/supabase-js';
import supabase from './db-client.js';
import { CENTRAL } from './env.js';

// Media objects live on the auxiliary (healthy) Supabase project — the primary
// project's gateway rotated the service key that storage needs for signed URLs
// and bucket writes. Public object URLs are absolute, so the primary database
// never notices the difference.
const mediaBucket = CENTRAL.AUX_SUPABASE_URL
  ? createClient(CENTRAL.AUX_SUPABASE_URL, CENTRAL.AUX_SUPABASE_SERVICE_ROLE_KEY).storage.from('media')
  : supabase.storage.from('media');

export default mediaBucket;
