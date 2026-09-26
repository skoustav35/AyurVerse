# Access Keys (personal access tokens)

Every weaver's account can mint `av_live_…` keys from **You → Studio → API Keys**.
A key authorizes any `api/*` pipeline as the owning account — threads, circles,
posts of every kind, saves, follows, profile edits, uploads.

## Rules of the ring

- The full key is shown **once** at mint; only its SHA-256 rests in the vault.
- Revocation is one tap; dead keys answer `401` within a minute.
- Keys **cannot** manage keys, and never touch billing.
- The vault and media blobs live in digest-only, publishable-key-only tables —
  nothing in this stack depends on a long-lived service key anymore.

## Use

```bash
curl https://<your-app>/api/threads -H "Authorization: Bearer av_live_…"
curl https://<your-app>/api/posts -X POST \
  -H "Authorization: Bearer av_live_…" -H "Content-Type: application/json" \
  -d '{"kind":"forge","title":"Keyed Lore","content_md":"written from afar"}'
```

## Verified contract (run against production before shipping)

mint/list/revoke, feed, profile, like/unlike, comment roundtrip, forge
publish/unpublish, thread create/write/read, circle create/write, blob upload,
observatory read, key-management refusal, post-revoke 401 — all green.
