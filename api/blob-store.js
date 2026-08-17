import { createClient } from '@supabase/supabase-js';
import { CENTRAL } from './env.js';
import { triggerRestore } from './db-wake.js';

// Media bytes live in a plain table on the healthy AUX project, readable with
// the publishable key — storage service keys proved mortal in this stack.
const BLOB_URL = process.env.AUX_SUPABASE_URL || CENTRAL.AUX_SUPABASE_URL;
const BLOB_KEY =
  process.env.AUX_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_u-WSJ6oD_EabXjdWwi5S_g_iH0y9yqO';
const AUX_REF = 'ducnapzbjqmhjxpmsqez';

export const blobDb = BLOB_URL ? createClient(BLOB_URL, BLOB_KEY, { auth: { persistSession: false } }) : null;

export async function blobInsert(ownerId, base64, contentType) {
  if (!blobDb) return { error: 'media vault offline' };
  const { data, error } = await blobDb
    .from('media_blobs')
    .insert({ owner_id: String(ownerId), content_base64: base64, content_type: contentType })
    .select('id')
    .single();
  if (error && /Unregistered|Invalid API key/i.test(error.message || '')) triggerRestore(AUX_REF);
  return { data, error };
}

export async function blobFetchEncoded(id) {
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(id))) return null;
  const { data, error } = await blobDb
    .from('media_blobs')
    .select('content_base64, content_type')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return data;
}
