import { blobFetchBinary } from './blob-store.js';

/*
 * Serves media bytes minted by /api/upload — supporting images, audio and
 * video streaming with HTTP Range requests (crucial for smooth Reels video playback).
 * `GET /api/media?id=<uuid>`.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const media = await blobFetchBinary(req.query.id);
    if (!media || !media.buffer) return res.status(404).json({ error: 'No such artifact' });

    const totalLength = media.buffer.length;
    const contentType = media.content_type || 'application/octet-stream';

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const range = req.headers.range;
    if (range && range.startsWith('bytes=')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

      if (start >= totalLength || end >= totalLength || start > end) {
        res.setHeader('Content-Range', `bytes */${totalLength}`);
        return res.status(416).end();
      }

      const chunk = media.buffer.subarray(start, end + 1);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
      res.setHeader('Content-Length', String(chunk.length));
      res.setHeader('Content-Type', contentType);
      return res.status(206).end(chunk);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(totalLength));
    return res.status(200).end(media.buffer);
  } catch (err) {
    console.error('media error:', err);
    return res.status(500).json({ error: err.message || 'media read failed' });
  }
}
