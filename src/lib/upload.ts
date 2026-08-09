import { apiFetch } from './api';

export const VIDEO_STONE_BYTES = 48 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1800;
const IMAGE_QUALITY = 0.82;
const CANVAS_GUARD_BYTES = 2 * 1024 * 1024;

export type ProgressFn = (pct: number) => void;

function translateUploadError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('exceeded the maximum allowed') || m.includes('payload too large') || m.includes('entity too large'))
    return 'That file is heavier than the loom’s stone — trim the clip or export it at 1080p.';
  if (m.includes('mime type') || m.includes('content type'))
    return 'That file type is not forged here — export it as JPG, PNG, MP4 or WebM.';
  if (m.includes('signature') || m.includes('token')) return 'The upload seal faded — tap once more.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed'))
    return 'The wind broke the journey — check your connection and try once more.';
  return message;
}

/** Heavy camera photos get canvas-compressed to a universally viewable JPEG. */
export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const mustFlatten =
    file.size > CANVAS_GUARD_BYTES || /heic|heif|tiff?|bmp/i.test(file.type) || /heic|heif$/i.test(file.name);
  if (!mustFlatten && file.size < CANVAS_GUARD_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
    if (!blob) return file;
    if (!mustFlatten && blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[a-zA-Z0-9]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    throw new Error('This photo format is not readable by your browser — convert it to JPG/PNG and it will weave in.');
  }
}

/** XHR PUT to the streaming storage gateway, with live progress events. */
function xhrPutWithProgress(url: string, file: File, onProgress?: ProgressFn): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    const fd = new FormData();
    fd.append('cacheControl', '3600');
    fd.append('', file);
    let last = -1;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100);
        if (pct !== last) {
          last = pct;
          onProgress(pct);
        }
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let msg = `HTTP ${xhr.status}`;
      try {
        const j = JSON.parse(xhr.responseText);
        msg = j.message || j.error || msg;
      } catch {
        /* keep status message */
      }
      reject(new Error(translateUploadError(msg)));
    };
    xhr.onerror = () => reject(new Error('network failure'));
    xhr.ontimeout = () => reject(new Error('the wind broke the journey'));
    xhr.timeout = 0; // cellular uploads must never be timed out by us
    if (onProgress) onProgress(0);
    xhr.send(fd);
  });
}

async function signedLane(file: File, onProgress?: ProgressFn): Promise<string> {
  const lane = await apiFetch<{ signedUrl: string; publicUrl: string }>('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ direct: true, fileName: file.name, contentType: file.type }),
  });
  await xhrPutWithProgress(lane.signedUrl, file, onProgress);
  return lane.publicUrl;
}

async function legacyLane(file: File): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const up = await apiFetch<{ url: string }>('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, fileBase64: base64, contentType: file.type }),
  });
  return up.url;
}

export async function uploadMedia(rawFile: File, onProgress?: ProgressFn): Promise<string> {
  const isVideo = rawFile.type.startsWith('video/');
  if (isVideo && rawFile.size > VIDEO_STONE_BYTES)
    throw new Error('That video is heavier than the loom’s stone — trim it, or export at 1080p.');
  if (rawFile.size > MAX_UPLOAD_BYTES) throw new Error('That file is heavier than the loom allows (60MB max).');

  const file = isVideo ? rawFile : await prepareImage(rawFile);

  // streaming lane, one fresh-token retry, then legacy base64 for small files
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await signedLane(file, onProgress);
    } catch (err) {
      const msg = (err as Error).message;
      if (/stone|heavier|large/i.test(msg)) throw new Error(msg); // size verdicts are final
      if (attempt === 0) {
        onProgress?.(0);
        await new Promise((r) => setTimeout(r, 900));
        continue;
      }
      if (file.size > 4.2 * 1024 * 1024) throw new Error(msg);
      try {
        return await legacyLane(file);
      } catch (err2) {
        throw new Error(translateUploadError((err2 as Error).message));
      }
    }
  }
  throw new Error('The journey never landed — try again');
}
