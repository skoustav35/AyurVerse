import supabase, { enterScope, applyCors, resolveUser } from './db-client.js';
import { blobInsert } from './blob-store.js';

/*
 * Uploads, the rotation-proof way. No storage service-key stands in the path:
 * images (canvas-flattened by the client to friendly JPEGs) and short media are
 * written to the aux vault table; the public read lane is /api/media?id=…
 * with immutable caching. The signed-URL lane is retired on this deployment —
 * the client falls through to this lane automatically, preserving its progress
 * callbacks.
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

    // legacy/large lane off-ramp: tell the client to use base64 directly
    if (req.body?.direct) {
      return res.status(200).json({ useLegacy: true });
    }

    const { fileName, fileBase64, contentType } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 required' });

    const approxBytes = Math.floor(String(fileBase64).length * 0.75);
    if (approxBytes > 3.8 * 1024 * 1024) {
      return res.status(413).json({ error: 'Keep artifacts under ~3.5MB for now — the vault is careful porcelain, not a freight yard.' });
    }
    const type = /^[a-z0-9-]+\/[a-z0-9.+-]+$/i.test(String(contentType || ''))
      ? String(contentType)
      : 'image/jpeg';

    const { data, error } = await blobInsert(user.id, String(fileBase64), type);
    if (error) throw error;

    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    return res.status(200).json({ url: `${proto}://${host}/api/media?id=${data.id}` });
  } catch (err) {
    console.error('upload error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
