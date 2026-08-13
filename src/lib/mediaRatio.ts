/* Feeds must respect each medium's true frame. Probe once, remember forever. */

const cache = new Map<string, number>();

function loadCache() {
  try {
    const raw = localStorage.getItem('av_ratios');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      Object.entries(parsed).forEach(([k, v]) => cache.set(k, v));
    }
  } catch {
    /* cache is a luxury, not a dependency */
  }
}
loadCache();

function persist() {
  try {
    const obj: Record<string, number> = {};
    cache.forEach((v, k) => (obj[k] = v));
    localStorage.setItem('av_ratios', JSON.stringify(obj));
  } catch {
    /* storage full — in-memory still works for the session */
  }
}

export function cachedRatio(url: string): number | null {
  return cache.get(url) ?? null;
}

/** Returns width/height. e.g. 1.777 for 16:9, 0.562 for 9:16. */
export function probeMediaRatio(url: string, type: 'image' | 'video' | null): Promise<number | null> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);

  return new Promise((resolve) => {
    const failSafe = window.setTimeout(() => resolve(null), 9000);
    const done = (r: number | null) => {
      window.clearTimeout(failSafe);
      if (r && r > 0.1 && r < 10) {
        cache.set(url, r);
        persist();
        resolve(r);
      } else {
        resolve(null);
      }
    };

    if (type === 'video') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => done(v.videoHeight > 0 ? v.videoWidth / v.videoHeight : null);
      v.onerror = () => done(null);
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null);
      img.onerror = () => done(null);
      img.src = url;
    }
  });
}
