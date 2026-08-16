import supabase, { db, enterScope, applyCors } from './db-client.js';
import mediaBucket from './storage-client.js';

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to upload' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (req.body?.direct) {
      const fileName0 = String(req.body.fileName || 'file');
      const safeName0 = fileName0.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
      const path0 = `${user.id}/${Date.now()}-${safeName0}`;
      const { data: signed, error: sErr } = await mediaBucket.createSignedUploadUrl(path0);
      if (sErr) throw sErr;
      const { data: pub } = mediaBucket.getPublicUrl(path0);
      const signedUrl = (signed.signedUrl || '').replace(
        /^https:\/\/([^.]+)\.supabase\.(co|in|red)\/storage\/v1/,
        'https://$1.storage.supabase.$2/storage/v1',
      );
      return res.status(200).json({ path: path0, token: signed.token, signedUrl: signedUrl || signed.signedUrl, publicUrl: pub.publicUrl });
    }

    const { fileName, fileBase64, contentType } = req.body || {};
    if (!fileName || !fileBase64) return res.status(400).json({ error: 'fileName and fileBase64 required' });

    const approxBytes = Math.floor(fileBase64.length * 0.75);
    if (approxBytes > 14 * 1024 * 1024) return res.status(413).json({ error: 'File too large (max 14MB)' });

    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
    const path = `${user.id}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(fileBase64, 'base64');

    const { error } = await mediaBucket.upload(path, buffer, { contentType: contentType || 'application/octet-stream', upsert: true });
    if (error) throw error;

    const { data: urlData } = mediaBucket.getPublicUrl(path);
    return res.status(200).json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('upload error:', err);
    res.status(500).json({ error: err.message });
  }
}
