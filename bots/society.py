"""The Director — drives 500 personas through believable daily behavior.

Per tick a bot will: browse (feed / explore / a curiosity-search), judge 1-3
unseen posts with the local LLM in its persona voice, act (like / save /
comment / follow), and occasionally create (forge scroll, circle) — all through
the app's real pipelines, with per-day budgets and global politeness limits.
"""
from __future__ import annotations

import asyncio
import json
import random
import time
from typing import Any

from config import C
import llm
import state
from api import Loom
from personas import Persona

STOP = asyncio.Event()


def overlap(bot: Persona, tags: list[str] | None) -> int:
    mine = set(bot.interests)
    return len(mine & set(t.lower() for t in (tags or [])))


def post_card(p: dict) -> str:
    title = p.get("title") or (p.get("caption") or "")[:90]
    kind = p.get("kind", "visual")
    author = p.get("author_name", "someone")
    tags = ",".join((p.get("tags") or [])[:6])
    likes = p.get("likes_count", 0)
    body = (p.get("summary") or p.get("content_md") or p.get("caption") or "")[:320].replace("\n", " ")
    return f"id={p['id']} [{kind}] by {author} | likes={likes} | tags={tags}\n  {title}\n  {body}"


async def decide(bot: Persona, posts: list[dict]) -> dict[int, dict]:
    """LLM call covering a small batch; heuristic fallback keeps the society alive."""
    if not posts:
        return {}
    cards = "\n\n".join(post_card(p) for p in posts)
    user = (
        "You opened AyurVerse and this is what is in front of you right now:\n\n"
        f"{cards}\n\n"
        "For EACH post decide like a real person with your tastes. Reply with JSON only:\n"
        '{"items":[{"id": <id>, "verdict": "skip"|"like"|"save"|"comment", '
        '"comment": "<1-2 sentences, your voice, only when verdict=comment>", '
        '"follow_author": true|false}]}\n'
        "Guidance: you like what matches your interests or genuinely moves you; "
        "you save only things worth returning to; you comment sparingly and never generically; "
        "you follow authors whose lane overlaps yours (follow_author true at most sometimes)."
    )
    out = await llm.chat_json(bot.system_prompt(), user, temperature=bot.temp, max_tokens=700)
    verdicts: dict[int, dict] = {}
    if isinstance(out, dict) and isinstance(out.get("items"), list):
        for item in out["items"]:
            try:
                pid = int(item["id"])
                v = str(item.get("verdict", "skip")).lower()
                if v not in ("skip", "like", "save", "comment"):
                    v = "skip"
                verdicts[pid] = {
                    "verdict": v,
                    "comment": str(item.get("comment") or ""),
                    "follow": bool(item.get("follow_author")),
                }
            except (KeyError, TypeError, ValueError):
                continue
    else:
        rng = random.Random(time.time() + bot.idx)
        for p in posts:
            ov = overlap(bot, p.get("tags"))
            v = "like" if ov >= 1 and rng.random() < 0.35 + ov * 0.12 else "skip"
            verdicts[p["id"]] = {"verdict": v, "comment": "", "follow": False}
    return verdicts


async def forge_scroll(bot: Persona, recent_titles: list[str]) -> dict | None:
    topic = random.choice(bot.forge_topics)
    avoid = "\n".join(f"- {t}" for t in recent_titles[-6:]) if recent_titles else "(nothing yet)"
    user = (
        "Write a Forge scroll (long-form post) for AyurVerse as this assignment:\n"
        f"Topic: {topic}\n"
        f"Your recent titles (do NOT repeat or rephrase these):\n{avoid}\n\n"
        "Requirements: 150-340 words of markdown; an opening line that earns the click; "
        "at most two '##' sections; if your craft is technical you may include one small code fence "
        "or one math line, otherwise lean on story and craft detail; end with one memorable line.\n"
        'Reply with JSON only: {"title":"<max 90 chars>","summary":"<max 240 chars>",'
        '"tags":["<2-5 lowercase tags>"],"content_md":"<markdown body>"}'
    )
    out = await llm.chat_json(bot.system_prompt(), user, temperature=bot.temp + 0.05, max_tokens=1100)
    if not isinstance(out, dict):
        return None
    title = str(out.get("title") or "").strip()
    body = str(out.get("content_md") or "").strip()
    if len(title) < 8 or len(body) < 300:
        return None
    return {
        "title": title[:220],
        "summary": str(out.get("summary") or body[:220])[:400],
        "tags": [str(t).lower().lstrip("#") for t in (out.get("tags") or bot.interests[:3])][:5],
        "content_md": body,
    }


async def circle_seed(bot: Persona) -> dict | None:
    user = (
        "Invent a community circle (group) you would genuinely start on AyurVerse, "
        "rooted in your craft. Reply with JSON only: "
        '{"name":"<3-6 words, evocative>","description":"<1-2 sentences>","tags":["<2-4 tags>"]}'
    )
    out = await llm.chat_json(bot.system_prompt(), user, temperature=bot.temp, max_tokens=220)
    if not isinstance(out, dict) or not str(out.get("name") or "").strip():
        return None
    return {
        "name": str(out["name"]).strip()[:80],
        "description": str(out.get("description") or "").strip()[:600],
        "tags": [str(t).lower().lstrip("#") for t in (out.get("tags") or bot.interests[:3])][:5],
    }


class Bot:
    def __init__(self, row: dict):
        self.idx: int = row["idx"]
        self.persona = Persona(**row["persona"])
        self.email: str = row["email"]
        self.password: str = row["password"]
        self.loom = Loom(token=row.get("token") or "")
        self.loom.user_id = row.get("user_id") or ""
        self.rng = random.Random(self.idx * 104729 + 7)
        self.stats = {"likes": 0, "comments": 0, "saves": 0, "follows": 0, "posts": 0, "circles": 0, "joins": 0, "reads": 0}

    async def budget_ok(self, action: str, cap: int) -> bool:
        return action_count_today_sync(self.idx, action) < cap

    # ---------- one beat of a life ----------
    async def tick(self) -> None:
        # browse: feed for most, forge for the patient, search stroll for the curious
        stroll = self.rng.random() < 0.22
        posts: list[dict] = []
        if stroll:
            q = self.rng.choice(self.persona.interests)
            posts = await self.loom.search(q)
            self.stats["reads"] += 1
        else:
            kind = "forge" if self.rng.random() < 0.35 else None
            posts = await self.loom.feed(kind=kind, limit=8, offset=self.rng.randrange(0, 24, 8))
            self.stats["reads"] += 1

        if not posts:
            return
        fresh_ids = state.unseen(self.idx, [p["id"] for p in posts])
        state.remember_seen(self.idx, [p["id"] for p in posts])
        cands = [p for p in posts if p["id"] in fresh_ids]
        cands.sort(key=lambda p: overlap(self.persona, p.get("tags")), reverse=True)
        cands = cands[:3]
        if not cands:
            return

        verdicts = await decide(self.persona, cands)
        for post in cands:
            dec = verdicts.get(post["id"], {"verdict": "skip", "comment": "", "follow": False})
            v = dec["verdict"]
            if v in ("like", "save", "comment"):
                if v in ("like", "comment") and await self.budget_ok("like", C.MAX_LIKES):
                    if await self.loom.like(post):
                        state.log_action(self.idx, "like", str(post["id"]))
                        self.stats["likes"] += 1
                if v == "save" and await self.budget_ok("save", C.MAX_SAVES):
                    if await self.loom.save(post):
                        state.log_action(self.idx, "save", str(post["id"]))
                        self.stats["saves"] += 1
                if v == "comment" and dec["comment"] and await self.budget_ok("comment", C.MAX_COMMENTS):
                    if await self.loom.comment(post, dec["comment"]):
                        state.log_action(self.idx, "comment", str(post["id"]))
                        self.stats["comments"] += 1
            if dec["follow"] and await self.budget_ok("follow", C.MAX_FOLLOWS):
                if await self.loom.follow(post.get("author_id", "")):
                    state.log_action(self.idx, "follow", post.get("author_id", ""))
                    self.stats["follows"] += 1

        # create a forge scroll when cadence allows
        if (self.persona.is_creator and self.rng.random() < 0.16
                and await self.budget_ok("post", C.MAX_POSTS)):
            recent = [t for (_a, t) in recent_targets_sync(self.idx, "post", 6)]
            scroll = await forge_scroll(self.persona, recent)
            if scroll:
                pid = await self.loom.publish_forge(**scroll)
                if pid:
                    state.log_action(self.idx, "post", f"{pid}:{scroll['title']}")
                    self.stats["posts"] += 1

        # circles: keepers found them, everybody wanders into them
        if self.persona.is_keeper and self.rng.random() < 0.30 and await self.budget_ok("circle", C.MAX_CIRCLES):
            seed = await circle_seed(self.persona)
            if seed:
                existing = {g.get("name", "").lower() for g in await self.loom.groups_all()}
                if seed["name"].lower() not in existing:
                    gid = await self.loom.create_circle(**seed)
                    if gid:
                        state.log_action(self.idx, "circle", f"{gid}:{seed['name']}")
                        self.stats["circles"] += 1
        elif self.rng.random() < 0.10:
            groups = await self.loom.groups_all()
            mine = [g for g in groups if overlap(self.persona, g.get("tags")) >= 1]
            if mine:
                gid_pick = self.rng.choice(mine)
                if await self.loom.join_circle(gid_pick):
                    state.log_action(self.idx, "join", str(gid_pick["id"]))
                    self.stats["joins"] += 1

    async def run(self) -> None:
        if not await self.loom.ensure_session(self.email, self.password):
            return
        if self.loom.token:
            state.set_token(self.idx, self.loom.token)
        while not STOP.is_set():
            try:
                await self.tick()
            except Exception as e:  # a single bot must never sink the society
                print(f"[bot {self.idx}] tick error: {e}")
            low = C.TICK_MIN_S * self.persona.tick_scale
            high = C.TICK_MAX_S * self.persona.tick_scale
            await asyncio.sleep(self.rng.uniform(low, high))


# --- sync helpers (sqlite is fast; called rarely) ---
def action_count_today_sync(bot_idx: int, action: str) -> int:
    return state.action_count_today(bot_idx, action)


def recent_targets_sync(bot_idx: int, action: str, limit: int) -> list[tuple[float, str]]:
    import sqlite3
    conn = sqlite3.connect(state.DB_PATH)
    try:
        rows = conn.execute(
            "SELECT at, target FROM ledger WHERE bot_idx=? AND action=? ORDER BY id DESC LIMIT ?",
            (bot_idx, action, limit),
        ).fetchall()
        out = []
        for at, target in rows:
            if ":" in target and action == "post":
                out.append((float(at), target.split(":", 1)[1]))
            else:
                out.append((float(at), target))
        return out
    finally:
        conn.close()


async def provision(count: int, domain: str, seed: str) -> None:
    """Create accounts + profiles, resumable by email."""
    from personas import cohort

    state.init()
    known = {a["email"] for a in state.all_accounts()}
    people = [p for p in cohort(count, domain, seed) if p.email not in known]
    print(f"[provision] {count} requested · {len(people)} new · {len(known)} already known")

    done = 0
    lock = asyncio.Lock()

    async def one(p: Persona) -> None:
        nonlocal done
        loom = Loom()
        ok = await loom.ensure_session(p.email, p.password)
        if not ok:
            print(f"[provision] signup blocked for {p.email} (rate limit? rerun to resume)")
            await asyncio.sleep(5)
            return
        bio = p.bio + (" · (sim)" if C.MARK_SIMULATED else "")
        profiled = await loom.ensure_profile(username=p.username, full_name=p.full_name, bio=bio)
        state.upsert_account(p.idx, p.email, p.password, p.__dict__, loom.user_id, loom.token, profiled)
        async with lock:
            done += 1
            if done % 20 == 0:
                print(f"[provision] {done}/{len(people)} weavers seated")

    sem = asyncio.Semaphore(6)  # auth gateway politeness; raise if your tier tolerates more

    async def guarded(p: Persona) -> None:
        async with sem:
            await one(p)

    await asyncio.gather(*(guarded(p) for p in people))
    print(f"[provision] seated {done} new weavers; society size = {len(state.all_accounts())}")


async def live(duration_hours: float, bots_limit: int) -> None:
    state.init()
    rows = [r for r in state.all_accounts() if r.get("user_id")][:bots_limit]
    if not rows:
        print("[live] no provisioned weavers — run `python -m bots provision` first")
        return
    llm_ok = await llm.probe()
    print(f"[live] {len(rows)} weavers · llm {'online at ' + C.LLM_BASE_URL if llm_ok else 'NOT reachable — heuristic fallback active'}")
    print(f"[live] mode={C.MODE} app={C.APP_URL or '(direct lane)'} db={C.SUPABASE_URL}")

    gate = asyncio.Semaphore(C.BOT_CONCURRENCY)

    async def gated(row: dict) -> None:
        async with gate:
            await Bot(row).run()

    async def heartbeat() -> None:
        while not STOP.is_set():
            await asyncio.sleep(120)
            t = state.totals()
            print("[heartbeat] " + " · ".join(f"{k}={v}" for k, v in sorted(t.items())))

    tasks = [asyncio.create_task(gated(r)) for r in rows]
    hb = asyncio.create_task(heartbeat())
    try:
        await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), duration_hours * 3600)
    except asyncio.TimeoutError:
        pass
    finally:
        STOP.set()
        hb.cancel()
        print("[live] society resting. lifetime ledger:", json.dumps(state.totals()))
