# Scaling AyurVerse — the honest ladder

AyurVerse is engineered to stay comfortable from **one weaver to millions**. "Billions"
is not a config flag — no single-platform stack does that — it is a sequence of
architectural moves. This document records what is already done, and exactly what
to do at each magnitude gate.

## Already in the codebase (done in the "scale pass")

- **Bounded hot reads.** Messages paginate (`?before=<id>`, 40–60/page, `has_more`),
  thread previews stop hauling full histories, search pre-filters server-side
  (`ilike` over term tokens) before any fuzzy scoring. No endpoint returns an
  unbounded table scan by design.
- **Edge caching.** Anonymous GETs on `/api/feed`, `/api/explore`, `/api/search`
  carry `s-maxage=15, stale-while-revalidate=30` — one fetch per region per tick
  serves everyone browsing anonymously. Authenticated reads stay `private, no-store`
  because they carry your `liked`/`saved` flags.
- **Realtime micro-batching.** The global `posts` like/save/comment channel is
  buffered and flushed into the React Query caches at most once per 220 ms per
  client — ten bursts of fifty likes rerender exactly as often as one.
- **Client split-weight.** Reels, Search, Threads, Profile, and the AI chat load
  on demand; first paint is feed+shell only. Media is pre-compressed client-side
  (`lib/upload.ts` canvas flattens camera photos to ≤1800px JPEG).
- **Self-healing data plane.** `api/db-client.js` rides out gateway-level events
  (paused projects, rotated keys) without deploys.

## Gates

### ~1k–10k daily actives (today's stack handles this)
- Keep everything as is. Watch Vercel function concurrency + Supabase free-tier
  connections (use the **session pooler** URL for the service role if you self-host).

### ~100k actives
- **Run `db/indexes.sql`** (in this folder) — covering indexes for every hot filter:
  `messages(conversation_id, id desc)`, `likes(user_id, post_id)`, `posts(kind, id desc)`,
  `notifications(user_id, id desc)`, `signals(user_id, created_at)`,
  `profiles(lower(username))`, `follows(follower_id)`.
- Move media to a dedicated CDN bucket; keep the aux storage project pattern.
- Turn on Supabase **pgBouncer transaction pooling**.

### ~1M actives
- Read replicas for feed/search; writes on primary.
- Partition `messages` and `signals` by month; archive cold partitions to cheap storage.
- Notification fan-out via a queue (Trigger.dev / QStash) rather than inline inserts.
- Realtime: shard channels per conversation (already done), add a presence pool.

### 100M+ (the "billions" neighborhood)
- Multi-region Postgres (or a distributed store like CockroachDB), edge-first API
  runtimes, feed materialization into per-user inbox tables (write-time fan-out),
  media on a global CDN with per-region origins, dedicated realtime fleet.
- At this tier you hire the SREs; the app layer here is already stateless and
  horizontally safe for it.

## Operational hygiene
- `api/status.js` reports capability + row counts to the Studio Developer console.
- The society harness (`ayurverse_society.py`) doubles as a load generator:
  `GLOBAL_RPS=... BOT_CONCURRENCY=... python ayurverse_society.py live` is a
  controlled storm you can point at staging before any launch.

## Rules that keep the gates open
1. Never return unbounded rows — every list takes limit + cursor.
2. Authenticated responses never carry shared `s-maxage`.
3. Anything heavier than a row write goes through a queue, not a request handler.
4. Feed ranking reads `signals` only, computed at write time — never recompute per read.
