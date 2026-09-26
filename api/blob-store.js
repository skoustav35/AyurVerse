import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CENTRAL } from './env.js';

/*
 * Media blob storage — resilient local store with optional Supabase mirror.
 * Stores photo/video/audio uploads reliably on disk (node_modules/.cache/ayurverse-blobs/)
 * with fast in-memory caching, serving them through /api/media?id=...
 */

const CACHE_DIR = path.resolve(process.cwd(), 'node_modules/.cache/ayurverse-blobs');
const MEM_CACHE = new Map(); // id -> { content_base64, content_type, buffer }

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[blob-store] could not create cache dir:', err.message);
  }
}

ensureCacheDir();

const BLOB_URL = process.env.AUX_SUPABASE_URL || CENTRAL.AUX_SUPABASE_URL;
const BLOB_KEY =
  process.env.AUX_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_u-WSJ6oD_EabXjdWwi5S_g_iH0y9yqO';

export const blobDb = (BLOB_URL && !BLOB_URL.includes('ducnapzbjqmhjxpmsqez'))
  ? createClient(BLOB_URL, BLOB_KEY, { auth: { persistSession: false } })
  : null;

/**
 * Save an uploaded photo, video, or audio file into the blob store.
 * Returns { data: { id: string }, error: null }.
 */
export async function blobInsert(ownerId, base64, contentType) {
  try {
    const id = crypto.randomUUID();
    const type = contentType || 'image/jpeg';
    const cleanBase64 = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    // 1. Store in memory for instant retrieval
    MEM_CACHE.set(id, { content_base64: cleanBase64, content_type: type, buffer });

    // 2. Persist to disk
    ensureCacheDir();
    const metaPath = path.join(CACHE_DIR, `${id}.json`);
    const binPath = path.join(CACHE_DIR, `${id}.bin`);
    
    fs.writeFileSync(metaPath, JSON.stringify({
      id,
      owner_id: String(ownerId || 'weaver'),
      content_type: type,
      size: buffer.length,
      created_at: new Date().toISOString(),
    }), 'utf8');

    fs.writeFileSync(binPath, buffer);

    // 3. Background mirror to Supabase if configured and live
    if (blobDb) {
      blobDb
        .from('media_blobs')
        .insert({ id, owner_id: String(ownerId), content_base64: cleanBase64, content_type: type })
        .catch(() => {});
    }

    return { data: { id }, error: null };
  } catch (err) {
    console.error('[blob-store] blobInsert error:', err);
    return { data: null, error: { message: err.message || 'Failed to save media' } };
  }
}

/**
 * Fetch encoded media record by ID.
 * Returns { content_base64, content_type } or null.
 */
export async function blobFetchEncoded(id) {
  if (!id || typeof id !== 'string') return null;
  const cleanId = id.trim();
  if (!/^[0-9a-fA-F-]{16,40}$/.test(cleanId)) return null;

  // 1. Check memory cache
  const mem = MEM_CACHE.get(cleanId);
  if (mem) {
    return { content_base64: mem.content_base64, content_type: mem.content_type };
  }

  // 2. Check disk cache
  try {
    const binPath = path.join(CACHE_DIR, `${cleanId}.bin`);
    const metaPath = path.join(CACHE_DIR, `${cleanId}.json`);
    if (fs.existsSync(binPath)) {
      const buffer = fs.readFileSync(binPath);
      let type = 'image/jpeg';
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          type = meta.content_type || type;
        } catch {}
      }
      const b64 = buffer.toString('base64');
      MEM_CACHE.set(cleanId, { content_base64: b64, content_type: type, buffer });
      return { content_base64: b64, content_type: type };
    }
  } catch (err) {
    console.warn('[blob-store] disk read error:', err.message);
  }

  // 3. Fallback to Supabase if configured
  if (blobDb) {
    try {
      const { data } = await blobDb
        .from('media_blobs')
        .select('content_base64, content_type')
        .eq('id', cleanId)
        .maybeSingle();
      if (data) {
        const buffer = Buffer.from(data.content_base64, 'base64');
        MEM_CACHE.set(cleanId, { content_base64: data.content_base64, content_type: data.content_type, buffer });
        return data;
      }
    } catch {}
  }

  return null;
}

/**
 * Fetch raw binary buffer for streaming audio/video/images directly.
 */
export async function blobFetchBinary(id) {
  if (!id || typeof id !== 'string') return null;
  const cleanId = id.trim();
  if (!/^[0-9a-fA-F-]{16,40}$/.test(cleanId)) return null;

  const mem = MEM_CACHE.get(cleanId);
  if (mem && mem.buffer) {
    return { buffer: mem.buffer, content_type: mem.content_type };
  }

  const encoded = await blobFetchEncoded(cleanId);
  if (!encoded) return null;
  const buffer = Buffer.from(encoded.content_base64, 'base64');
  return { buffer, content_type: encoded.content_type };
}
