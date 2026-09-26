import { useEffect, useRef } from 'react';
import { apiFetch } from './api';
import { useAuth } from '../contexts/AuthContext';
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

/* ------------------------------------------------------------------ *
 * Ranking feedback — the server-bound contract behind the tuned feed  *
 * ------------------------------------------------------------------ */

export type RankingFeedbackType = 'impression' | 'click' | 'dwell' | 'like' | 'save' | 'hide' | 'report';

export interface RankingFeedbackOptions {
  /** Actual visible time in ms; capped server-side at 120s. */
  dwell_ms?: number;
  /** Actual ≥50%-visible time in ms at the moment an impression is logged. */
  visible_ms?: number;
}

const RANKING_DEDUPE_MAX = 500;
const rankingSent = new Map<string, number>();
let rankingViewer: string | null = null;

/**
 * Reset the de-duplication ledger whenever the signed-in viewer changes, so one
 * account's threshold signals can never suppress another account's.
 */
export function setRankingFeedbackViewer(userId: string | null): void {
  if (rankingViewer !== userId) {
    rankingViewer = userId;
    rankingSent.clear();
  }
}

function rememberRankingKey(key: string): void {
  rankingSent.set(key, Date.now());
  if (rankingSent.size > RANKING_DEDUPE_MAX) {
    // Map preserves insertion order — drop the oldest entry to stay bounded.
    const oldest = rankingSent.keys().next().value;
    if (oldest !== undefined) rankingSent.delete(oldest);
  }
}

/**
 * Send one feedback event for a ranked post. This is a no-op when the post has
 * no server-issued ranking metadata (signed out, opted out, or read-only), and
 * it never fabricates visibility or client-side tags/rewards.
 *
 * Implicit threshold signals (`impression`, `dwell`) are de-duplicated and the
 * key is released on failure so a later attempt can retry. Explicit gestures
 * (like/save/hide/report/click) are always sent.
 *
 * Rejects on transport failure — callers decide whether an error is silent
 * (background signals) or surfaced (explicit hide).
 */
export async function sendRankingFeedback(
  post: Pick<Post, 'id' | 'ranking'>,
  type: RankingFeedbackType,
  opts: RankingFeedbackOptions = {},
): Promise<void> {
  const ranking = post.ranking;
  if (!ranking?.request_id) return;

  const body: Record<string, unknown> = {
    type,
    request_id: ranking.request_id,
    post_id: post.id,
  };
  if (opts.dwell_ms !== undefined) {
    body.dwell_ms = Math.max(0, Math.min(Math.round(opts.dwell_ms), 120_000));
  }
  if (opts.visible_ms !== undefined) {
    body.visible_ms = Math.max(0, Math.round(opts.visible_ms));
  }

  const dedupe = type === 'impression' || type === 'dwell';
  const key = `${ranking.request_id}:${post.id}:${type}`;
  if (dedupe && rankingSent.has(key)) return;
  if (dedupe) rememberRankingKey(key);

  try {
    await apiFetch('/api/ranking-feedback', { method: 'POST', body: JSON.stringify(body) });
  } catch (err) {
    if (dedupe) rankingSent.delete(key);
    throw err;
  }
}

/** Ask the server to clear the learned profile and invalidate ranking sessions. */
export async function sendRankingReset(): Promise<void> {
  await apiFetch('/api/ranking-feedback', { method: 'POST', body: JSON.stringify({ type: 'reset' }) });
}

/* ------------------------------------------------------------------ *
 * Dwell / impression tracking                                          *
 * ------------------------------------------------------------------ */

const IMPRESSION_MS = 1000;
const DWELL_MS = 2000;
const DWELL_CAP_MS = 120_000;
const TICK_MS = 250;
const VISIBILITY_RATIO = 0.5;

interface DwellOptions {
  /** When true (default) unranked cards still emit the legacy dwell signal. */
  legacy?: boolean;
}

/**
 * Attention tracking for a card:
 *  - an `impression` fires once the card has actually been ≥50% visible for
 *    ≥1000ms while the tab is active;
 *  - a `dwell` fires once real visible time crosses 2s (capped at 120s), and
 *    again on flush if it was never crossed;
 *  - time only accrues while the card is ≥50% visible in an active tab, and is
 *    flushed on `visibilitychange`, `pagehide` and unmount.
 *
 * Ranked posts report through `sendRankingFeedback`; unranked posts keep the
 * legacy `sendSignal` dwell path (unless `legacy: false`).
 */
export function useDwellSignal<T extends HTMLElement = HTMLElement>(post: Post, options: DwellOptions = {}) {
  const ref = useRef<T | null>(null);
  const postRef = useRef(post);
  const { user } = useAuth();
  const legacy = options.legacy ?? true;

  useEffect(() => {
    postRef.current = post;
  }, [post]);

  useEffect(() => {
    setRankingFeedbackViewer(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const requestId = post.ranking?.request_id ?? null;
    let accumulated = 0;
    let activeSince: number | null = null;
    let intersecting = false;
    let impressionSent = false;
    let dwellSent = false;
    let disposed = false;

    const now = () => performance.now();
    const qualifies = () => intersecting && document.visibilityState === 'visible';

    const fold = () => {
      if (activeSince !== null) {
        accumulated += now() - activeSince;
        activeSince = null;
      }
    };
    const sync = () => {
      if (qualifies()) {
        if (activeSince === null) activeSince = now();
      } else {
        fold();
      }
    };
    const elapsed = () => accumulated + (activeSince !== null ? now() - activeSince : 0);

    const emitImpression = (visible: number) => {
      const p = postRef.current;
      if (!requestId || !p.ranking) return; // never fabricate visibility for an unranked card
      void sendRankingFeedback(p, 'impression', { visible_ms: visible }).catch(() => undefined);
    };
    const emitDwell = (visible: number) => {
      const p = postRef.current;
      const ms = Math.min(Math.round(visible), DWELL_CAP_MS);
      if (p.ranking) {
        void sendRankingFeedback(p, 'dwell', { dwell_ms: ms }).catch(() => undefined);
      } else if (legacy) {
        void sendSignal({ type: 'dwell', post_id: p.id, dwell_ms: ms, tags: p.tags ?? [], kind: p.kind });
      }
    };

    // Cross thresholds as they happen — not only when the card scrolls away.
    const tick = () => {
      if (disposed) return;
      sync();
      const total = elapsed();
      if (!impressionSent && requestId && total >= IMPRESSION_MS) {
        impressionSent = true;
        emitImpression(Math.round(total));
      }
      if (!dwellSent && total >= DWELL_MS) {
        dwellSent = true;
        emitDwell(total);
      }
    };

    const flush = () => {
      sync();
      const total = elapsed();
      if (!impressionSent && requestId && total >= IMPRESSION_MS) {
        impressionSent = true;
        emitImpression(Math.round(total));
      }
      if (!dwellSent && total >= DWELL_MS) {
        dwellSent = true;
        emitDwell(total);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
      else sync();
    };
    const onPageHide = () => flush();

    const obs = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting;
        if (intersecting) sync();
        else fold();
        tick();
      },
      { threshold: VISIBILITY_RATIO },
    );
    obs.observe(el);

    const timer = window.setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      disposed = true;
      flush();
      window.clearInterval(timer);
      obs.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
    // The tracking session is keyed by post identity + request id; the live
    // post object is read through postRef so cache patches never reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, post.ranking?.request_id, legacy]);

  return ref;
}
