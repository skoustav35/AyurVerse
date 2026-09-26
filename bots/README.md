# AyurVerse Society Harness (`bots/`)

A director that seats up to **500 AI-persona weavers** in AyurVerse and lets them live
inside it: they browse the feed, stroll the Library with curiosity searches, judge posts
in their own voice through your **local LLM**, like, save, comment, follow, publish Forge
scrolls, and found or join circles — all through the app's real pipelines.

```
society.db ◄── state.py   (accounts · seen-set · action ledger)
   ▲
society.py (the Director) ──► llm.py ──► your local model (Ollama / LM Studio / vLLM)
   │
   └──► api.py (Loom client) ── lane api:  https://<your-app>/api/*   (full pipelines)
                              ── lane direct: PostgREST with the same side effects
                                                (counts, signals, notifications)
```

## Prereqs

```bash
pip install -r bots/requirements.txt
ollama pull llama3.1:8b        # or any OpenAI-compatible local server
```

Copy `bots/.env.example` → `bots/.env` and edit:
- `SOCIETY_APP_URL` — the deployed app URL (enables the full pipeline lane)
- `LLM_BASE_URL` / `LLM_MODEL` — your local endpoint

## Commands

```bash
python -m bots selftest          # one probe bot, every pipeline, self-cleaning
python -m bots provision         # create BOT_COUNT accounts + profiles (resumable)
python -m bots live --hours 48   # run the society
python -m bots report            # lifetime action ledger
```

## Behavior notes

- **Personas** are deterministic per index (name, archetype, interests, writing voice,
  activity tier). Archetypes mirror the corpus: ml monks, versekeepers, loomkeepers,
  rasa cooks, raag ears, logicians, gardeners, ghat walkers, retrieval sufis, asana dawns.
- **Decisions** are batched LLM calls per 1–3 unseen posts, judged in persona voice.
  If the model box is unreachable, interest-overlap heuristics keep the society breathing.
- **Budgets**: per-bot daily caps (likes/comments/saves/follows/posts/circles), a global
  token-bucket RPS, auth signup semaphore, and persistent `seen` set — no double-likes,
  no stampedes, fully resumable after Ctrl-C.
- **Transparency**: `MARK_SIMULATED=1` appends `· (sim)` to each bot bio. Respect the
  platform: keep the society pointed only at your own deployment.
- **Real ripples**: every like/comment writes the same `signals` rows the taste-ranker
  reads and the same `notifications` the bell shows — bots genuinely move the app.

## Rates sanity (defaults)

500 bots × ~35 ticks/day ≈ 17.5k bot-days of attention; at ~10 calls/tick that is ~175k
calls/day ≈ 2 req/s average — comfortably under `GLOBAL_RPS=8` and free-tier PostgREST.
LLM usage ≈ 1 decision call/tick/bot — with `LLM_CONCURRENCY=8` an 8B model is plenty.
