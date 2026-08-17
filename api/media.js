import { blobFetchEncoded } from './blob-store.js';

/*
 * Serves media bytes minted by /api/upload — one public, cacheable read lane
 * that cannot be killed by storage-key rotation. `GET /api/media?id=<uuid>`.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const row = await blobFetchEncoded(req.query.id);
    if (!row) return res.status(404).json({ error: 'No such artifact' });
    const bytes = Buffer.from(row.content_base64, 'base64');
    res.setHeader('Content-Type', row.content_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end(bytes);
  } catch (err) {
    console.error('media error:', err);
    return res.status(500).json({ error: err.message || 'media read failed' });
  }
}
