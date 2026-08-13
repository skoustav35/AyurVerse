# AyurVerse — an Ayurvedic-majestic super-app

A "super-app" merging the visual engagement of Instagram, the deep reading / writing environment of Replit, and the search mechanics of YouTube, with a real messaging platform and a Studio (Analytics · Payouts · Developer) baked in.

## Stack
- **Vite + React 19 + TypeScript** (Vercel serverless API at `/api/*`)
- **Tailwind v4**, custom "Ayurvedic Majestic" design tokens
- **Framer Motion** for fluid physics, **GSAP-ready** hooks
- **Zustand** for client state, **TanStack Query** for server state
- **Supabase** (Postgres + Auth + Storage + Realtime)
- **OpenCode Zen · big-pickle** for AI caption / summary / manuscript polishing
- **Razorpay payouts** for the $1-per-1k-likes channel program

## Features
- Adaptive Desktop 3-pane / Mobile bottom-tab shell
- Instagram-style visual feed with double-tap heart, golden-burst like, story rings
- Replit-style deep reading Forge with markdown + KaTeX + code + day dividers
- YouTube-style ranked Library search (multi-field boosted, BM25-style, recency decay)
- Taste-adaptive three-stage ranking with personal taste spectrum
- Statuses rail (Your channels) built from your follow graph
- Full DM platform (1:1 + group, voice notes, stickers, shared posts, reactions, seen receipts, typing presence)
- Native aspect-ratio media (probed + cached, Reels filtered to 9:16 only)
- Studio: Analytics (KPIs, sparklines, monthly bars) · Payouts ($1/1k likes via Razorpay) · Developer (copy-able curl, realtime snippets, secrets catalog)
- AI Scribe (caption / summary / manuscript polish) with resilient 6-endpoint cascade and honest offline fallback

## Quick start

```bash
npm install
npm run build
npm run dev
```

### Environment variables (Secrets)

| Key                              | What it unlocks                                                        |
| -------------------------------- | ---------------------------------------------------------------------- |
| `OPENCODE_API_KEY`               | AI scribe (big-pickle polishing)                                       |
| `RAZORPAY_KEY_ID`                | Razorpay payouts live disbursal                                       |
| `RAZORPAY_KEY_SECRET`            | Razorpay partner signature                                            |
| `NEXT_PUBLIC_SUPABASE_URL`       | Supabase gateway (managed by platform)                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Public client key (managed)                                           |
| `SUPABASE_SERVICE_ROLE_KEY`      | Server-side admin role (managed)                                      |
| `VITE_GOOGLE_CLIENT_ID`          | Google OAuth (managed)                                                |

Without Razorpay keys, payout requests queue as `pending` locally. Without OpenCode, the scribe polishes by hand with a clear toast.

## Pushing to GitHub

```bash
git add -A
git commit -m "AyurVerse · initial commit"
git branch -M main
git remote add origin https://github.com/skoustav35/AyurVerse.git
git push -u origin main
```

If you sign in with a browser, replace the last line with `gh auth login` then `git push -u origin main`.

## Demo account

```
demo@ayurverse.app / password123
```

(Pre-seeded posts, channels, statuses, threads, follows and likes so the feed isn't empty on first run.)
