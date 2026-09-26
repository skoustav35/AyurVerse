import { createContext, useContext } from 'react';

/*
 * Chapter timestamps ("02:15 — Preparing the Ghee") live in markdown and in
 * captions, far away from the <video> they address. They talk to each other
 * over one DOM CustomEvent — but a feed can hold a dozen mounted players at
 * once, so every seek carries a *scope*: the id of the surface that owns both
 * the prose and the player. A player only answers to its own scope.
 */

export const SEEK_EVENT = 'ayur:seek-video';

export interface VideoSeekDetail {
  /** Absolute position to seek to, in seconds. */
  time: number;
  /** Which player should answer — see VideoScopeContext. */
  scope: string;
}

declare global {
  interface WindowEventMap {
    [SEEK_EVENT]: CustomEvent<VideoSeekDetail>;
  }
}

/**
 * The surface a timestamp belongs to. Every reader/card that pairs prose with
 * a player provides a stable id (`post-42`, `reel-7`); anything rendered
 * outside such a surface stays on `'none'` and can never move a player.
 */
export const VideoScopeContext = createContext<string>('none');

export function useVideoScope(): string {
  return useContext(VideoScopeContext);
}

/** Build the scope id for a post's reader/card surface. */
export function postScope(postId: number | string): string {
  return `post-${postId}`;
}

/*
 * A timestamp tapped in the feed has to survive the reader opening: the player
 * it addresses does not exist yet. So every seek is both announced (for players
 * already listening) and parked here (for the one about to mount).
 */
const pendingSeeks = new Map<string, { time: number; at: number }>();
const PENDING_TTL_MS = 12_000;

/** Ask the player owning `scope` to jump to `time` (seconds) and play. */
export function dispatchSeek(time: number, scope: string): void {
  if (!Number.isFinite(time) || scope === 'none') return;
  const safe = Math.max(0, time);
  pendingSeeks.set(scope, { time: safe, at: Date.now() });
  window.dispatchEvent(
    new CustomEvent<VideoSeekDetail>(SEEK_EVENT, { detail: { time: safe, scope } }),
  );
}

/**
 * Claim a seek parked for `scope` moments ago — called by a player as it mounts.
 * Each parked seek is handed out exactly once.
 */
export function consumePendingSeek(scope: string): number | null {
  const parked = pendingSeeks.get(scope);
  if (!parked) return null;
  pendingSeeks.delete(scope);
  return Date.now() - parked.at <= PENDING_TTL_MS ? parked.time : null;
}

/**
 * Parse `mm:ss` / `h:mm:ss` into seconds. Returns null for anything that is
 * not a plausible timestamp (a stray "1:2", a bare number, minutes over 59 in
 * an hour-bearing stamp).
 */
export function parseTimestamp(raw: string): number | null {
  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  if (parts.slice(1).some((p) => p.length !== 2)) return null;
  if (parts.length === 2) {
    const [m, s] = nums;
    if (s > 59) return null;
    return m * 60 + s;
  }
  const [h, m, s] = nums;
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

/** Matches `mm:ss` and `h:mm:ss` runs inside prose. */
export const TIMESTAMP_RE = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;
