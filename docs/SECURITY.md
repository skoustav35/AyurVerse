# AyurVerse · Security model

Defense in depth, arranged in honest layers. Where each wall lives, what it
blocks, and the one switch only the owner can flip.

## Layer 0 — what is public by design

The **publishable** Supabase key ships inside the client bundle — that is its
purpose. It is not a secret. Everything it can do alone is governed by the
RLS suite in `db/rls-policies.sql`.

## Layer 1 — the lockdown (one dashboard step)

Run `db/rls-policies.sql` in Supabase → SQL Editor.

- RLS enabled on all 18 tables.
- Public read on: posts, comments, follows, profiles, groups, group_members,
  group_posts, statuses, boosts. Private everything else.
- Writes: strictly `user_id = auth.uid()` (or `author_id` / `sender_id` /
  `follower_id` per table).
- Threads/messages: membership-scoped `EXISTS` policies — non-members read
  exactly zero rows.
- Cross-user counters (`likes_count` etc.) are not policy-gated open; they are
  **column-granted**: attackers would gain, at most, the ability to bump a
  number that recount/engagement logic can always rewrite.
- Verify afterwards with the probes at the bottom of the file.

## Layer 2 — the API carries identity, not privilege

Every route begins with `enterScope(req)` (`api/db-client.js`). From that
moment every query — even from helpers deep in the call stack — runs against
PostgREST **as the caller**: RLS applies as them. There is no ambient
service-role client doing unsupervised writes. If the pinned service key is
dead or absent, the client degrades to the publishable key rather than dying.

## Layer 3 — transport & browser

`vercel.json` enforces HSTS (2y, preload), `nosniff`, COOP
`same-origin-allow-popups` (required for Google SSO popups), a scoped
Permissions-Policy (microphone only, self), and a tight CSP — self scripts,
self+fonts styles, allow-listed connect origins (Supabase wss/https, Google
auth endpoints, the AI gateway), `object-src 'none'`, `frame-ancestors` limited
to self + the preview shell. Anonymous GET reads are CDN-cacheable; anything
authenticated is `private, no-store`.

CORS reflects loopback and the deployment hosts only — no `*`.

## Layer 4 — app-level hygiene

- Auth client runs **PKCE** with persisted sessions (`src/lib/supabase.ts`).
- Input is validated at the route boundary (types, sizes, content-type
  allowlists for uploads); PostgREST operator strings are sanitized before
  interpolation.
- React escapes all rendered text; markdown renders without raw HTML; chat
  rich-text allows four intrinsics only and forces `http(s)`.
- Uploads: size caps, MIME allowlists, canvas normalization; storage signed
  URLs never live longer than the request that minted them.
- USim harness: bots are marked `(sim)`, action-capped daily, rate-bucketed.

## Secrets doctrine (what to rotate / move)

| Key | Status | Action |
| --- | --- | --- |
| `VITE_*` publishable | public by design | — |
| `SUPABASE_SERVICE_ROLE_KEY` (app project) | dead/rotated | removed from source |
| `OPENCODE_API_KEY` | was committed | **add via Secrets tab**, rotate it |
| `AUX_SUPABASE_SERVICE_ROLE_KEY` | was committed | **add via Secrets tab**, rotate it |

Secrets are runtime-injected on the next deploy; the AI scribe degrades to its
honest offline polish until `OPENCODE_API_KEY` is present, and uploads wait for
the AUX key — no code change required either way.

## Standing rules

1. Every new route starts with `enterScope(req)`; never a bare `*`.
2. Every new table gets RLS + least-privilege policies in the same PR.
3. Never invent ambient elevated clients; identity flows from the request.
4. Any new secret goes to the Secrets tab, never to a file — even in private repos.
5. If in doubt, the answer is: public read, owner write, members see members.
