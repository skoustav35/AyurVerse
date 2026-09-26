import supabase, { enterScope, applyCors, resolveUser } from './db-client.js';
import { blobInsert } from './blob-store.js';

/*
 * Uploads media (photos, videos, audio notes).
 * Supports both images and videos up to 60MB, stored in the persistent local blob vault.
 * The public read lane is /api/media?id=… with streaming support.
 */
export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data: { user }, error: authError } = await resolveUser(req);
    if (authError || !user) return res.status(401).json({ error: 'Sign in to upload' });

    // Client asking for direct upload lane fallback
    if (req.body?.direct) {
      return res.status(200).json({ useLegacy: true });
    }

    const { fileName, fileBase64, contentType } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 required' });

    const approxBytes = Math.floor(String(fileBase64).length * 0.75);
    if (approxBytes > 60 * 1024 * 1024) {
      return res.status(413).json({ error: 'Media exceeds the 60MB limit. Trim the clip or compress the image.' });
    }

    const type = /^[a-z0-9-]+\/[a-z0-9.+-]+$/i.test(String(contentType || ''))
      ? String(contentType)
      : 'image/jpeg';

    const { data, error } = await blobInsert(user.id, String(fileBase64), type);
    if (error) throw error;

    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
    const url = host ? `${proto}://${host}/api/media?id=${data.id}` : `/api/media?id=${data.id}`;

    return res.status(200).json({ url, id: data.id });
  } catch (err) {
    console.error('upload error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
