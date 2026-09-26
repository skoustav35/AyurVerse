# AyurVerse — Implementation Plan

Status: audited 2026-09-26. Scope: 269 files, 42 API routes, ~14.6k LOC `src/`,
1.1k LOC `api/`, 1.3k LOC Python.

---

## 0. The honest read, in four sentences

You cannot beat YouTube, X, Replit, or Instagram, and no plan will get you
there — they have billions of dollars, thousands of engineers, and 20 years of
network effects. What you *can* do is beat all four **inside one specific
narrow lane** they are structurally bad at, and this codebase is currently
unable to serve even one user honestly.

The three facts that matter most, all verified by reading the code:

1. **The app is not secure.** `api/db-client.js:653-673` decodes a JWT payload
   **without verifying the signature** and returns `payload.sub` as the user id.
   Anyone can impersonate any account on every write endpoint. `api/profiles.js:94`
   additionally lets any user rewrite any other user's profile.
2. **Live production credentials are in the repo** — two Supabase service-role
   keys, a paid LLM key, a cron secret — in `.env`, `vercel.json`, *and* as
   `||` fallbacks pinned in source (`api/env.js:26`, `api/opencode.js:15`,
   `api/vaidya.js:18`, `api/society-tick.js:23`), so rotating the env var does
   not disable them. `society.db` (1.1 MB) sits in the root containing 990
   bot passwords and 990 JWTs, and those passwords are **re-derivable from
   `BOT_PASSWORD_SEED` in the repo** (`bots/personas.py:199`).
3. **The app lies to its users.** With no server credentials, writes succeed
   into a local JSON file and return `200 OK` (`api/db-client.js:516-571`).
   Reads that 403 silently return hardcoded demo profiles
   (`api/db-client.js:251-262`). Your UI reports "posted" and shows fake data.
   Separately, `src/lib/signals.ts:104` POSTs to `/api/ranking-feedback`,
   which **does not exist** — every ranking signal 404s.

So the plan is not "add features." It is **stop lying, then get fast, then
build the one thing they cannot copy.**

---

## Phase 0 — Triage (day 0–1, ~4 hours)

Do this before writing a single feature. Nothing else matters if you skip it.

| # | Action | Why |
|---|---|---|
| 0.1 | **Rotate every credential now.** Supabase service-role ×2, `OPENCODE_API_KEY`, `GATEWAY_API_KEY`, `SOCIETY_CRON_SECRET`, the `gwk-…` key in `ayurverse_society.py:26`. Delete the bot accounts or rotate `BOT_PASSWORD_SEED`. | Assume all are burned. They exist in a downloaded zip. |
| 0.2 | Delete the 4 pinned `\|\|` secret fallbacks in `api/`. | Makes rotation actually work. Without this you'll rotate and stay vulnerable. |
| 0.3 | `git init`, write a correct `.gitignore`, commit a clean baseline. **The repo is currently not under version control at all.** | You cannot safely refactor 269 files with no rollback. `.gitignore:28-29` explicitly negates `.env` — remove that. |
| 0.4 | Purge committed junk (see §5). ~1.5 MB, ~1,500 lines. | Removes the credentials from history and the noise from every future review. |
| 0.5 | Add `"test": "node --test \"tests/**/*.test.mjs\""` and make `npm run lint` pass (currently **71 errors**). | Baseline gate. Right now CI cannot tell you if you broke something. |
| 0.6 | Rewrite `docs/SECURITY.md` and `docs/ACCESS-KEYS.md`. | `SECURITY.md:65` claims keys are "removed from source" — they are not. `ACCESS-KEYS.md` documents a PAT feature that **cannot work** (`api/db-client.js:633-708` never resolves `av_live_` tokens). These files will mislead you and any future reader. |

**Exit criteria:** `git log` has one clean commit, zero secrets reachable via
`git grep`, `npm run lint` exits 0, `npm test` exits 0.

---

## Phase 1 — Security (week 1)

This is the week that decides whether the app is real.

### 1.1 Fix the auth bypass — `api/db-client.js:637-708`

Replace unverified-decode with **JWKS signature verification**. You do not need
Admin credentials to verify a Firebase ID token — Google publishes its certs:

```
fetch https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com
verify RS256 against the kid in the token header, check aud == projectId, iss == securetoken@system.gserviceaccount.com, exp
```

This gives you real authentication with **zero** privileged credentials, which
is the correct architecture: JWKS for identity, Admin SDK only for writes.

Then, non-negotiable:
- **Delete the `demo-vaidya-1` fallback** (`:641`, `:679`). Unauthenticated must
  mean *anonymous*, never *impersonating Meera*.
- **Delete the payload-decode branch** (`:653-673`) entirely.
- One single `resolveUser(req)` used by all 42 routes. Today 16 routes use a
  token-gated variant and 4 use an ungated one (`api/profiles.js:3`,
  `api/threads.js:3`, `api/messages.js:6`) — that inconsistency *is* the bug.

Cache the JWKS in module scope with a TTL. It is one fetch per cold start.

### 1.2 Close the IDORs

| File:line | Bug | Fix |
|---|---|---|
| `api/profiles.js:94` | `targetUserId = body.user_id \|\| user.id`, no equality check | Delete the body override. Own profile only. |
| `api/messages.js` `requireMember` | Correct, but `firestore.rules:82-91` grants **any** signed-in user read on `/messages`, `/conversations`, `/conversation_members` | Membership-scoped rules mirroring the API |
| `api/groups.js:170,176` | `add_member` / `promote` accept any user id, no consent | Require reciprocal consent or an invite |
| `api/threads.js:106-143` | `member_ids` is an arbitrary array — anyone can add anyone, who then gets notified | Consent check |
| `api/follows.js:70` | Any string id, no existence check, no cap | Validate target exists |
| `api/boost-track.js:32` | Unauthenticated; anyone can inflate any boost's CTR | Require auth |
| `firestore.rules:74` | `group_members` `update: if signedIn()` → self-promote to admin | Gate on role |
| `firestore.rules:95-99` | `/statuses` has no `update` → story views and poll votes are denied | Add update rule |
| `firestore.rules` | `/reports`, `/playlists` have **no rules at all** → REST 403 → silent seed fallback | Add rules |
| `api/posts.js:167-179` | Path traversal via client-supplied `media_url` → arbitrary GCS object delete | Host allowlist + reject `..` |
| `api/upload.js:34-36` | `contentType` regex accepts `text/html` → **stored same-origin XSS** | Strict allowlist: `image/jpeg,png,webp,gif,mp4,webm,mov` |
| `api/media.js:19` | `Access-Control-Allow-Origin: *` on user media, contradicts `docs/SECURITY.md:46` | Same-origin only |
| `api/db-client.js:332,735,741` | Error messages leak required env var names | Generic client messages, detail to logs only |
| `api/ai.js:105` | Returns the LLM gateway cascade ladder + auth header names to the browser | Strip `gateway_errors` |

### 1.3 Rate limiting — currently **0 of 42 routes**

Cost-amplifying and DoS-capable today: `POST /api/upload` (60 MB, unbounded
count), `/api/ai`, `/api/agent`, `/api/vaidya` (unlimited paid LLM spend per
authenticated user), `/api/society-tick` (8 concurrent LLM calls), `/api/tokens`
(unbounded key minting).

You already have a transactional datastore. Use it — a Firestore transaction
counter per `(uid|ip, route, window)`. No new dependency, ~40 lines in
`api/lib/rate-limit.js`. Add `Retry-After` and emit `429`.

### 1.4 SSRF — `api/feed.js:27-32`, `api/upload.js:41-43`

Both concatenate client-controlled `x-forwarded-host` into an outbound `fetch`.
`api/upload.js` **persists** the result as `posts.media_url`. Allowlist the
host against `APP_URL` + `*.vercel.app`; ignore the header entirely in prod.

**Exit criteria:** you cannot impersonate a user with a hand-crafted token. You
cannot write to another user's profile. `text/html` upload is rejected.

---

## Phase 2 — Make it tell the truth (week 2)

The app currently deceives its users. This is a trust problem, not a bug list.

### 2.1 Remove fake-success writes — `api/db-client.js:516-571`

When Admin credentials are absent, writes must **fail loudly** with a 503 and a
clear operator message, not mutate a local file and return `200`. This single
change will surface every place in your UI that depends on the illusion.

### 2.2 Remove the silent seed fallback — `api/db-client.js:251-262`

Any 403/429/500/network error currently becomes `200 OK` with fabricated demo
profiles. Make it a real error, and stamp every response with
`X-Data-Source: firestore | cache` so you can see what's real. Keep seeds
behind an explicit `?demo=1` flag that only works when
`NODE_ENV !== 'production'`.

### 2.3 Register the 3 missing collections — `api/db-client.js:192-212`

`comment_likes`, `group_posts`, `payout_requests` are used by the API but absent
from `ALL_COLLECTIONS`. Consequence: comment likes never persist,
`api/groups.js:257` silently no-ops (circle dissolution orphans posts), and
**payout history always reads empty** — so `alreadyRequested` is always 0 and
users can withdraw repeatedly.

### 2.4 Wire up the ranking engine (your biggest unrealized asset)

`api/lib/ranking/**` is 8 files, ~1,900 lines, **85 passing tests**, zero
production imports. The only import is `api/preferences.js:2`
(`normalizePreferences`). Meanwhile the live ranker is an unrelated hand-rolled
scorer in `api/feed.js:184-231`, and the client's feedback loop points at
`/api/ranking-feedback`, **which does not exist**.

This is upside, not debt. The engine is deterministic, bandit-correct
(Sherman–Morrison verified against Gauss-Jordan in `learning.test.mjs:456`),
proto-pollution-hardened, and has proper NDCG/AP/MRR/IPS/SRM offline metrics.

- Create `api/ranking-feedback.js` — the missing endpoint.
- Make `api/feed.js` call `rankPosts` from `engine.js` and return the `ranking`
  object `{ request_id, arm_id, ... }` that `src/lib/signals.ts:84` already
  expects.
- Persist `ranking_stats` + `loggingPropensity` so `metrics.js` has rows.
- Replace `api/feed.js:39` `hash01` and `api/reels.js:47`
  (`p.id * 2654435761` overflows `MAX_SAFE_INTEGER` above id ~3.4M and is a
  *constant per post*, so every user sees an identical deck despite the comment
  claiming otherwise).
- Fix `||` vs `??` at `engine.js:195` and `retrieval.js:358`: `limit=0`
  currently yields 120.
- Inject a seeded RNG into `bandit.js:176` — `Math.random` as the default makes
  ranking non-reproducible.
- Run `scripts/evaluate-ranking.mjs` in CI against `tests/ranking/judgments.json`.

### 2.5 Fix `.single()` error swallowing — `api/likes.js:36`, `saves.js:48`, `comments.js:112`

Liking a nonexistent post returns `200 { liked: true, likes_count: 1 }`
because the `PGRST116` error is discarded. Propagate it.

### 2.6 Delete the duplicate bot harness

Three implementations, one identity namespace: `ayurverse_society.py` (1,474
lines, root), `bots/` (1,248 lines), `api/society-tick.js` (271 lines). The
root file is a 95% superset of `bots/`, and it's the one that runs. Keep
`api/society-tick.js` (the scheduled, authoritative one). Delete the root file
and either fix or delete `bots/`.

`bots/` is **broken as documented**: no `bots/__init__.py` but every module
does `from config import C` (`bots/api.py:26`), so `python -m bots selftest` —
the exact command in `README.md:383` — fails with `ModuleNotFoundError`.

Also: `scripts/run-forever.sh:10` runs `live --hours 0`, which is
`asyncio.wait_for(gather(...), 0)` — an immediate `TimeoutError`. It is a
crash loop, not a forever loop.

**Exit criteria:** the app never shows data it didn't fetch. Every rank request
is scored by tested code. Money can't be withdrawn twice.

---

## Phase 3 — Data layer (weeks 3–4)

`api/db-client.js` is a hand-rolled PostgREST clone where **every query is a
full collection read** followed by in-memory filtering:

- `getAllDocs` (`:321-328`) → `fs.collection(coll).get()` on `.eq()`, `.in()`,
  `.limit()`, and `count: 'exact'`.
- `.limit()` is applied at `:500`, **after** the full scan. Cosmetic.
- Every write does a full collection read (`:591`).
- The 30-minute read cache (`:141`) is only consulted inside `restList`, so on
  the Admin lane — the lane it was written for — **it does nothing**.

This is the hard ceiling on "100k actives" that `docs/SCALING.md:12` claims
does not exist. `db/indexes.sql` and `db/rls-policies.sql` are Supabase-era
dead files; this is Firestore.

Do this in order:

1. **Stop writes reading whole collections.** Use `doc(id)` for single-doc
   updates/deletes. `posts.js:160-163` fires 4 deletes → 4 full reads.
2. **Batch writes.** `db-client.js:577-585` loops `await add()` per row while
   `fs.batch()` sits unused two lines below at `:595`. Also: `:596` commits a
   batch that **exceeds Firestore's 500-op limit** past 500 rows, unhandled.
3. **Push filters to the query.** Every `.eq()`/`.in()`/`.order()`/`.limit()`
   becomes a real Firestore constraint. This alone is a 100× win.
4. **Fix the cache.** Merge order at `:295-311` makes local rows **permanently
   override** remote ones, and `:314` writes the stale result back to disk —
   self-reinforcing forever. Local snapshot must never win over remote.
5. **Stop `writeFileSync` on the read path.** `saveLocalStore()` (`:160`)
   serializes the entire cache synchronously on every mutation.
6. **Hoist the regex.** `likeToTest` (`:345-350`) compiles a `RegExp` **per row
   per query** via `.ilike()`. `profiles.js` search builds 39 `or` clauses
   × 240 profiles. Compile once.
7. **Escape `%` and `_` in `profiles.js:56-62`.** `?q=%` matches every profile
   in the database. `api/search.js:191` already has a `safe()` helper — the fix
   exists in the codebase, it just was never applied to the other 5 sites.
8. **`nextNumericId` degrades to `Date.now()`** (`:579-581`) without Admin creds
   → duplicate ids in the same millisecond → `feed.js:231` `b.p.id - a.p.id`
   on strings → `NaN` → non-deterministic ordering.

**Exit criteria:** no endpoint reads a full collection. Feed p99 under 300 ms
at 50k posts.

---

## Phase 4 — Frontend (weeks 4–6)

### 4.1 There is no router

`react-router-dom@7` is a dependency, aliased in `vite.config.ts:37`, bundled
into `dist/`, and used by **exactly one unused `Link` import**
(`AnalyticsView.tsx:13`). There is no `BrowserRouter`, no `Routes`, no
`useNavigate`. Navigation is 5 strings in `src/store/ui.ts:3`.

You cannot have shareable post URLs, no back button, no deep links, and no SEO
without this. **Every network you want to beat starts here.** Install a real
router; make `?post=` (`AppShell.tsx:42-46`) a real `/post/:id` route.

### 4.2 The entry chunk is 1.96 MB

`dist/assets/index-*.js` = **1,958 KB**, on the critical path for the
unauthenticated landing page. `vite.config.ts` has **no `manualChunks` at
all**. Causes:

- `AuthContext.tsx:6` statically imports `lib/firestore-db` → all of
  `firebase/firestore` — for **one** `getDoc`/`setDoc` in `upsertMyProfile`.
- `main.tsx:4` statically imports `katex/dist/katex.min.css` — ~500 KB of
  KaTeX fonts for users who may never open the Forge.
- `Markdown-*.js` is 595 KB.
- `AuthContext.tsx:73` returns an unmemoized value object, so every auth event
  re-renders every `useAuth()` consumer — **including `PostCard.tsx:65`, once
  per feed item**.

Target: **under 250 KB** initial. Add `manualChunks` for
`firebase`/`katex`/`markdown`/`motion`; lazy-load KaTeX with the Forge route;
memoize the auth context.

### 4.3 Fix the 2 runtime crashes

`src/hooks/queries.ts:388` and `:311` call `setQueryData<ChatMessage[]>` on a
key that actually stores `{ items, has_more }` (`:346`). At runtime
`old.map` is `undefined` → **TypeError**. The explicit generic *suppresses*
the type error that would have caught it. Both mutations have no `onError`, so
it's a silent unhandled rejection.

`src/hooks/queries.ts:82-120` `patchPostInCaches`: for `useToggleLike`,
`patch({likes_count: 0})` yields `+1` **even when un-liking**, so un-liking a
post *increments* the Creator Studio lifetime-likes total. The `as unknown as
Post as Post` double-cast is what hides it.

### 4.4 Realtime is a no-op — and 110 lines of consumer code doesn't know it

`src/lib/supabase.ts:62-72` returns a channel stub whose `subscribe()` fires
`'SUBSCRIBED'` and swallows everything. Consumers that **silently never
fire**: `AppShell.tsx:28-38` (live notifications), `AppShell.tsx:103-116`
(the entire 60-line debounced feed fan-out), `ThreadsOverlay.tsx:495-535`
(40 lines of message handlers), and `usePresence.ts:29-42` — which calls
`.track()`, a method the stub doesn't have, and swallows the throw. The green
"Online now" dots are **permanently dead UI**.

Pick one: implement it (Firestore `onSnapshot` — you already have the SDK
client-side) or delete the consumers. Don't leave three states.

### 4.5 Kill the third data client

- `src/lib/firestore-db.ts` — 219 lines, **1 of 19 exports used**. The other 18
  are parallel client-side reimplementations of domain logic the REST API
  already owns. Delete them; keep `upsertMyProfile`.
- `@supabase/supabase-js` — **zero imports in `src/`**. Remove the dep.
- `src/lib/env.ts` — 0 importers, contains hardcoded values that have
  **drifted** from `.env` (different Supabase project id).
- `src/lib/models.ts` — 0 importers, while `CreatorStudio.tsx:632`
  hardcodes the model name as a string literal.
- `firestore.rules` still governs a live client boundary (`README.md:498`
  advertises it), so rules must be fixed *and* the client trimmed.

### 4.6 Memory and render leaks (all confirmed)

| Where | Leak |
|---|---|
| `ReelsView.tsx:306-317` | Every reel tap schedules a 300 ms timer. **Never cleared.** 80 taps = 80 live timers. |
| `ReelsView.tsx:341-344` | `onTimeUpdate` → `setState` ~4×/sec on the main thread, re-rendering a 430-line card. Use a `MotionValue` or CSS. |
| `ReelsView.tsx:326-350` | **160 `<video>` elements** (foreground + blurred echo) all in the DOM with `src` set. iOS memory ceiling. |
| `ThreadsOverlay.tsx:526` | Typing-broadcast `setTimeout` never cleared → `setState` after unmount. Dormant until realtime wakes. |
| `CreatorStudio.tsx:231` | `localStorage.setItem(JSON.stringify(drafts))` on **every keystroke**, un-debounced, no `try` on read. |
| `ThreadsOverlay.tsx:755` | `let lastDay` **mutated during render** inside `.map`. Unsafe under StrictMode/concurrent rendering. |
| `signals.ts:15` | `sentKeys` module-global `Set`, never cleared on sign-out. |
| `ThreadsOverlay.tsx:854-913` | 200 messages × (`motion.div` with `layout` + 30 waveform spans) in a plain `overflow-y-auto`. Not virtualized. |

### 4.7 Query-key and cache bugs

- `['studio']` has **two different `queryFn`s** (`queries.ts:773` vs
  `CreatorStudio.tsx:189`) — whoever mounts first wins.
- `['me-profile']` likewise (`queries.ts:340` vs `ProfileView.tsx:193`).
- `['taste']` and `['taste', userId]` issue **the same request twice**.
- `['reels', focusId]` keys the whole 80-post deck on focus id → tapping 10
  reels caches 10 identical decks.
- **`queryClient.clear()` is never called on sign-out.** `['saved']`,
  `['me-profile']`, `['comments', id]`, `['threads']` have no userId segment.
  Sign out and back in within 5 minutes → **you see the previous account's
  saved posts and DMs.**
- `Composer.tsx:39` calls `useMyGroups()` unconditionally on a component that's
  **always mounted**, with `refetchOnMount: 'always'` + `staleTime: 0` — a
  request on every app mount and every window focus, for a closed modal.
- `useThreads` polls every 30 s and `useNotifications` every 45 s **forever**,
  armed by the shell, even if never opened.

### 4.8 Accessibility — currently failing on the core surfaces

- Only **2 of ~10** overlays are real dialogs (`FeedTuner`, `NewThreadSheet`).
  `Composer.tsx:377` and the whole `ChatPane` have no `role="dialog"`,
  no `aria-modal`, no focus trap, no focus restore, no Escape.
- `ThreadsOverlay.tsx:247` — the message action toolbar is
  `hidden group-hover:flex`. **Keyboard users cannot reach it.** No
  `group-focus-within:`, and the comment at `:245` promises long-press that
  isn't implemented.
- `ReelsView.tsx:334` — the video itself is the play/pause control. No
  `tabIndex`, no `role="button"`, no keyboard equivalent. No `<track>` captions.
- `Landing.tsx:185-215` — FAQ disclosure has no `aria-expanded`/`aria-controls`.
- `Landing.tsx:268` — no `<main>`, no skip link, 12 unnamed `<section>`s.
- `prefers-reduced-motion` is **completely ignored** on the landing page:
  13 infinitely-rotating mandalas (one at 1240×1240), 56 floating particles, a
  34 s infinite marquee, all `whileInView` reveals. The only guard in the app
  (`index.css:594-607`) covers four classes Landing never uses.
- `ToastHost` has no `aria-live` — toasts are silent to screen readers.
- `ThreadsOverlay.tsx:1051` — the composer textarea has **no label at all**,
  only a placeholder.
- `CreatorStudio.tsx:580` — markdown toolbar buttons have `title` only, and
  Delete has no confirmation (unlike `PostCard.tsx:197`).

### 4.9 The rrweb session recorder must go — today

`index.html:17-38` and `:44-700` are ~29 KB of third-party code — **97% of the
file**. On every page it captures clicks, scroll depth, **up to 10,000 mousemove
points**, and **every keystroke outside an input**, then injects
`rrweb@2.0.0-alpha.4` from jsdelivr, which records **full DOM mutation
snapshots** — every DM, draft, and profile edit — and beacons to
`designarena.ai`. No consent, no disclosure, GDPR/CCPA exposure, and it is not
in `.vercelignore`. It is also a **latent white-screen bomb**: `vercel.json`'s
CSP allows exactly three inline `sha256` hashes, so any edit to those blocks
breaks the entire app with no build-time guard.

Extract to a separate opt-in analytics script loaded only after consent, or
delete it. Also add a build step that fails if the CSP hashes don't match.

### 4.10 CSP hardening

`vercel.json:73` is genuinely strict (`script-src 'self'` + 3 hashes, no
`unsafe-inline`/`unsafe-eval`) — good. But `connect-src` allow-lists
`avs-gateway.vercel.app`, which `api/opencode.js:12` describes as **dead**, and
`font-src` allow-lists `frontend-cdn.perplexity.ai`, an unrelated third party.
Add `frame-ancestors`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`. Replace the hash list with nonces or externalize the
inline scripts.

### 4.11 `AuthContext` has a stale-session race — `AuthContext.tsx:35-69`

`onAuthStateChanged` is `async` and `await`s `getIdToken()` before settling
state, with **no guard against a newer auth event**. Sequence: SIGNED_IN →
`await` → user signs out → SIGNED_OUT sets `session = null` → the SIGNED_IN
continuation resumes and **resurrects the session**. `apiFetch` then attaches a
stale Bearer token to every request. Add a sequence counter or a `cancelled`
flag.

**Exit criteria:** initial JS under 250 KB. Every overlay is a real dialog.
Sign out clears the query cache. Zero unhandled promise rejections in a full
click-through of every route.

---

## Phase 5 — CI, observability, and the honest product (weeks 6+)

### 5.1 CI that can actually stop a regression

`.github/workflows/society.yml` is the **only** workflow and it runs no lint, no
build, no test — it curls a bot endpoint, and it **cannot succeed**:
`society-beat-url.txt:5` is the literal placeholder
`REPLACE_WITH_DEPLOYED_APP_URL`, and `:22`'s `tr -d '[:space:]')` strips
whitespace but not the 4 preceding comment lines, so `curl` gets a 5-line
string. Even fixed, it passes `secrets.SOCIETY_CRON_SECRET` (unset) while
`vercel.json:16` pinned the app-side value — **the two halves can never agree.**
And it passes the secret in a **query string**, into Actions logs.

Replace with:

```
on: [push, pull_request]
jobs:
  verify: lint → typecheck → test → build → bundle-size budget
```

Extend ESLint past `eslint.config.js:11`, which restricts it to
`**/*.{ts,tsx}` — meaning **`api/` (413 KB), `tests/`, and `scripts/` are 0%
linted** despite `README.md:227` claiming "ESLint over the whole repo."

Add a **bundle-size budget** in CI. The 1.96 MB entry shipped silently.

### 5.2 Observability — you are currently blind

`api/db-client.js:251-262` swallows every error into a `console.warn` and
returns fake data. There is no metric, no counter, no `X-Data-Source` header.
You cannot tell a working app from a broken one. Minimum viable:

- `X-Data-Source` on every read response.
- Real error rates per route (the 500s are counted nowhere).
- Ranking funnel: impressions → dwell → like → follow, per arm. You have
  `api/lib/ranking/metrics.js` with NDCG/AP/MRR/IPS/SRM already written and
  never fed data.
- Client error boundary reports instead of a silent `<Catch/>`.

### 5.3 Now — and only now — the product

Everything above is table stakes. It's what makes the app *able* to compete.
Here is the actual wedge, and it's a real one:

**You will not out-distribute them. Out-specialize them.**

All four are horizontal platforms with a critical weakness: **they cannot
verify truth, and they cannot hold a curriculum.** Their engagement models
maximize dwell time, which structurally rewards outrage and conflict. A
knowledge-wellness vertical has the opposite incentive — the user wins when
the content is *true and complete*, not when they stay.

The assets you already have and they do not:

1. **A real ranking engine.** Deterministic, bandit-correct, 85 passing tests,
   proper offline metrics — already written, never wired up (§2.4). Instagram
   and X rank with ad-hoc heuristics and no reproducible eval harness. You can
   A/B test and *prove* it, with `metrics.js` NDCG and SRM detection. That is
   a genuine engineering moat.
2. **`api/ayurvedic-sage.js` (837 lines) of offline domain knowledge.** Free,
   instant, deterministic. Their equivalent is a paywilled LLM call at your
   margin cost.
3. **The `CreatorStudio` → `Sanctum-Playlist` → `CourseSequenceDrawer` spine.**
   A creator publishes a *sequence*, not a post. That is a curriculum, and it's
   the one object type none of the four has. Courses convert followers into
   revenue at a completely different LTV.
4. **Groups/circles with roles** (`firestore.rules:74` notwithstanding) — small
   accountable cohorts beat a 10k-follower feed for actual behavior change.

The positioning, stated plainly: **the first platform where the feed is
optimized for you finishing, not for you scrolling.** Ship the course spine and
the sage. That is a defensible niche. A generic social feed with Ayurveda
sprinkled on it loses on day one, and no amount of ranking engineering fixes it.

---

## Sequencing summary

| Phase | Duration | Gate |
|---|---|---|
| **0** Triage | day 0–1 | Clean git baseline, zero secrets, lint+test green |
| **1** Security | week 1 | Cannot forge a token; cannot IDOR; 429 exists |
| **2** Truth | week 2 | No fake writes, no seed fallback, ranking live |
| **3** Data layer | weeks 3–4 | No full collection reads |
| **4** Frontend | weeks 4–6 | <250 KB, router, a11y, no leaks |
| **5** CI + product | weeks 6+ | CI blocks regressions; course spine ships |

**Phases 0–2 are non-negotiable and total ~2.5 weeks.** Skipping them to get to
features means shipping an app where any visitor can read all DMs, any account
can be impersonated with a hand-written token, and the UI reports success for
data that was never saved.

---

## Appendix A — Deletion list (highest-leverage move for a solo dev)

For a one-person team, **deletion beats optimization**. Roughly 1.5 MB and
~1,500 lines, none of it load-bearing:

```
_sutra_backup/          9 files, 23 KB — stale Supabase routes; db-client.js
                                  there uses the SERVICE key as the anon key
society.db              1.1 MB — 990 passwords + 990 JWTs
api/.local-cache.json   19 KB — live dataset snapshot (user ids, DMs, bios)
dist/                   18.3 MB, 101 files, and 2 days stale
bots/__pycache__/      93 KB — 7 .pyc files
ayurverse_society.py    70 KB — 95% duplicate of bots/, has a hardcoded key
bots/                   either fix the imports or delete
outputs/  -w  society.status.json  .claude/  .workbuddy-ai/
10 × *.log              incl. firebase-debug.log leaking C:\Users\skous\...
vendor/.tmp/            TypeScript build caches
db/*.sql                Supabase-era dead reference material
firebase.seed.rules     wide open: match /{document=**} { allow read,write: if true }
src/lib/env.ts          0 importers, values have drifted from .env
src/lib/models.ts       0 importers
firestore-db.ts         18 of 19 exports dead
package.json            @supabase/supabase-js (0 imports)
```

And ~110 lines of realtime consumer code (`AppShell.tsx:28-38`, `:103-116`,
`ThreadsOverlay.tsx:495-535`, `usePresence.ts`) that is dead because
`src/lib/supabase.ts:62-72` returns a stub — decide once: implement or delete.

## Appendix B — The 85 tests that already exist

`tests/ranking/engine.test.mjs` and `learning.test.mjs` use Node's built-in
runner and **pass**:

```
node --test "tests/ranking/*.test.mjs"
→ 85 pass, 0 fail
```

They are genuinely good — hand-computed NDCG, a Gauss-Jordan inverse verifying
the Sherman-Morrison bandit update, proto-pollution defense, SRM chi-square,
determinism checks. They are also **never run**, because `package.json` has no
`test` script and the only CI workflow curls a bot endpoint.

The tragedy: **they test `api/lib/ranking/**`, which no request ever executes.**
Meanwhile `src/` (86 files, 880 KB) and the live ranker `api/feed.js` have
**zero** coverage. Phase 2.4 makes the tests matter; Phase 5.1 makes them run
on every push.
