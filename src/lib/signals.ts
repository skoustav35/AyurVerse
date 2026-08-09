import { useEffect, useRef } from 'react';
import { apiFetch } from './api';
import type { Post } from './types';

interface SignalPayload {
  type: 'view' | 'dwell' | 'search';
  post_id?: number;
  tags?: string[];
  kind?: string;
  query?: string;
  dwell_ms?: number;
}

const sentKeys = new Set<string>();

/** Fire-and-forget interaction signal. Must never break or block UI. */
export async function sendSignal(payload: SignalPayload): Promise<void> {
  const key = `${payload.type}:${payload.post_id ?? ''}:${(payload.query ?? '').toLowerCase()}`;
  if (sentKeys.has(key)) return;
  sentKeys.add(key);
  try {
    await apiFetch('/api/events', { method: 'POST', body: JSON.stringify(payload) });
  } catch {
    /* signals are silent by design */
  }
}

/**
 * Instagram-style dwell tracking: accumulates time a card spends ≥60% visible.
 * Fires once (per session, per card) at 2+ seconds of real attention.
 */
export function useDwellSignal(post: Post) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let accumulated = 0;
    let since: number | null = null;
    let fired = false;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          since = performance.now();
        } else if (since !== null) {
          accumulated += performance.now() - since;
          since = null;
          if (!fired && accumulated >= 2000) {
            fired = true;
            sendSignal({
              type: 'dwell',
              post_id: post.id,
              dwell_ms: Math.round(accumulated),
              tags: post.tags ?? [],
              kind: post.kind,
            });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  return ref;
}
