#!/usr/bin/env python3
# ==============================================================================
#
#   A Y U R V E R S E   S O C I E T Y   —   one-file edition
#
#   A director that seats up to 500 AI-persona weavers inside AyurVerse and lets
#   them live there: they browse the feed, stroll the Library with curiosity
#   searches, judge posts in their own persona voice through YOUR local model,
#   like, save, comment, follow, publish Forge scrolls, and found / join circles
#   — through the app's real pipelines (or a faithful direct lane, see below).
#
#   Only dependency: httpx            (pip install httpx)
#   Run:            python ayurverse_society.py selftest
#                   python ayurverse_society.py provision --count 500
#                   python ayurverse_society.py live --hours 48
#                   python ayurverse_society.py report
#
# ==============================================================================
#   ████████╗  SLOTS — EDIT THESE THREE AND NOTHING ELSE NEEDS TOUCHING
# ==============================================================================

from __future__ import annotations  # language pragma — must precede the slots

LLM_BASE_URL = "https://avs-gateway.vercel.app/v1"  # <-- SLOT 1: AVS gateway (OpenAI-compatible)
LLM_MODEL    = "mimo-v2.5-free"                     # <-- SLOT 2: the model driving every weaver
LLM_API_KEY  = "gwk-80a9b02c56929571805bb636a0ed7e1f65e09b17a71ad765"  # <-- SLOT 3: gateway key

# Optional slots (sensible defaults are provisioned already):

APP_URL = ""                                  # the deployed app URL (from your preview
                                              # panel). Empty => "direct" lane straight at
                                              # the database with identical side effects.
SUPABASE_URL      = "https://vcioygsdxmqlmngjpsmo.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_oxp24Thotldwob3D1e32wA_EBDhLytq"   # publishable, in-repo

BOT_COUNT     = 500                           # how many weavers to provision / run
MARK_SIMULATED = True                         # appends "· (sim)" to each persona bio
BOT_DOMAIN    = "weavers.ayurverse.dev"       # synthetic email domain for accounts

# ==============================================================================

import argparse
import asyncio
import hashlib
import json
import os
import random
import re
import sqlite3
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import httpx
except ImportError:
    sys.exit("Please `pip install httpx` — the only dependency this file needs.")

# ============================================================================
#  CONFIG
# ============================================================================

def _env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return v if v else default

class C:
    """Runtime config — slots above are the base; env vars may override."""
    SUPABASE_URL = _env("SOCIETY_SUPABASE_URL", SUPABASE_URL)
    SUPABASE_ANON_KEY = _env("SOCIETY_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY)
    APP_URL = _env("SOCIETY_APP_URL", APP_URL).rstrip("/")
    MODE = _env("SOCIETY_MODE", "api" if (APP_URL or _env("SOCIETY_APP_URL", "")) else "direct")

    LLM_BASE_URL = _env("LLM_BASE_URL", LLM_BASE_URL)
    LLM_MODEL = _env("LLM_MODEL", LLM_MODEL)
    LLM_API_KEY = _env("LLM_API_KEY", LLM_API_KEY)
    LLM_CONCURRENCY = int(_env("LLM_CONCURRENCY", "8"))
    LLM_TEMPERATURE = float(_env("LLM_TEMPERATURE", "0.9"))
    LLM_MAX_TOKENS = int(_env("LLM_MAX_TOKENS", "900"))

    BOT_COUNT = int(_env("BOT_COUNT", str(BOT_COUNT)))
    BOT_DOMAIN = _env("BOT_DOMAIN", BOT_DOMAIN)
    BOT_PASSWORD_SEED = _env("BOT_PASSWORD_SEED", "monsoon-thread-2026")
    MARK_SIMULATED = _env("MARK_SIMULATED", "1" if MARK_SIMULATED else "0") == "1"

    HTTP_CONCURRENCY = int(_env("HTTP_CONCURRENCY", "24"))
    BOT_CONCURRENCY = int(_env("BOT_CONCURRENCY", "24"))
    TICK_MIN_S = int(_env("TICK_MIN_S", str(9 * 60)))
    TICK_MAX_S = int(_env("TICK_MAX_S", str(38 * 60)))
    GLOBAL_RPS = float(_env("GLOBAL_RPS", "8"))

    MAX_LIKES = int(_env("BUDGET_LIKES", "40"))
    MAX_COMMENTS = int(_env("BUDGET_COMMENTS", "12"))
    MAX_SAVES = int(_env("BUDGET_SAVES", "10"))
    MAX_FOLLOWS = int(_env("BUDGET_FOLLOWS", "15"))
    MAX_POSTS = int(_env("BUDGET_POSTS", "2"))
    MAX_CIRCLES = int(_env("BUDGET_CIRCLES", "1"))
    MAX_THREAD_MSGS = int(_env("BUDGET_THREAD_MSGS", "14"))
    MAX_CIRCLE_POSTS = int(_env("BUDGET_CIRCLE_POSTS", "3"))
    # a human account the society may open warm threads with (demo seat by default)
    HUMAN_ID = _env("SOCIETY_HUMAN_ID", "c59b99b3-bf3e-43c2-a300-eee4b062028d")

# ============================================================================
#  PERSONAS — 500 deterministic weavers, tuned to the corpus
# ============================================================================

FIRST = [
    "Aarav", "Anaya", "Arjun", "Bhavna", "Chandan", "Charu", "Devika", "Dhruv", "Esha", "Farid",
    "Gauri", "Harsha", "Ila", "Irfan", "Jagan", "Jyoti", "Kabir", "Kalindi", "Keshav", "Lata",
    "Madhav", "Malini", "Mihir", "Nadia", "Nakul", "Ojas", "Padma", "Parth", "Qamar", "Radhika",
    "Raghav", "Sahej", "Samar", "Tara", "Tej", "Uma", "Veda", "Vidya", "Waseem", "Yamini",
    "Zara", "Aditi", "Biren", "Chitra", "Damodar", "Ekta", "Feroz", "Gitanjali", "Hriday", "Indu",
    "Jairam", "Kalyani", "Lokesh", "Meera", "Nandini", "Om", "Piya", "Rukmini", "Soham", "Trisha",
    "Uday", "Vani", "Yash", "Zubin", "Amrita", "Bodhi", "Chethan", "Dipali", "Eknath", "Fulati",
]
LAST = [
    "Acharya", "Bandopadhyay", "Chakrabarti", "Desai", "Ettiyadi", "Fernandes", "Ghosh", "Hegde",
    "Iyer", "Joshi", "Kamat", "Lahiri", "Mukherjee", "Naidu", "Oommen", "Pandit", "Qureshi",
    "Raghunathan", "Sengupta", "Trivedi", "Upadhyay", "Venkataraman", "Wankhede", "Xavier",
    "Yagnik", "Zacharia", "Anand", "Biswas", "Chawla", "Dhar", "Easwaran", "Fatima", "Guha",
    "Handa", "Inamdar", "Jayaram", "Kidwai", "Luthra", "Menon", "Nagarkar", "Oberoi", "Pradhan",
]
VOICES = [
    "spare and precise, one telling detail per sentence",
    "warm and conversational, generous with praise, allergic to hype",
    "lyrical, prone to one quiet metaphor per paragraph",
    "analytical; states assumptions before conclusions",
    "dry wit, short sentences, never a wasted word",
    "teacherly — builds from first principles to the payoff",
    "field-note style: place, time, texture, then thought",
    "devotional cadence; reads like it was written by lamplight",
]

# archetype -> tag affinities + forge topic seeds + craft line
ARCHETYPES: dict[str, dict[str, list[str] | str]] = {
    "ml_monk": {
        "tags": ["transformers", "attention", "deep-learning", "pytorch", "embeddings", "vectors", "search"],
        "topics": [
            "a gentle derivation of scaled dot-product attention",
            "why cosine similarity is a temple-bell curve of meaning",
            "hand-rolling a tiny embedding index over poetry titles",
            "kv-cache arithmetic for small laptops",
            "reading layernorm as pranayama for activations",
        ],
        "craft": "machine learning, slowly and by hand",
    },
    "versekeeper": {
        "tags": ["bengali", "poetry", "recitation", "tagore", "prosody", "monsoon", "reading"],
        "topics": [
            "counting matras in a rainstorm: payar chhanda for beginners",
            "why Tagore reads better at 0.8x speed",
            "the caesura as a doorway: 8 matras, then 6",
            "annotating one Gitanjali line for reciters",
            "a field note on vowel length in Bengali and Sanskrit",
        ],
        "craft": "prosody and the spoken line",
    },
    "loomkeeper": {
        "tags": ["weaving", "handloom", "kanchipuram", "textile", "craft", "generative", "cellular-automata"],
        "topics": [
            "reading a weaving draft like sheet music",
            "rule 90 pallus: temple triangles from three bits",
            "why every warp thread deserves a name",
            "zari math: counting gold per inch of silk",
            "a summer notebook from the pit looms",
        ],
        "craft": "handloom drafts and pattern grammar",
    },
    "rasa_cook": {
        "tags": ["chai", "recipe", "streetfood", "dosa", "spices", "monsoon", "davanagere"],
        "topics": [
            "the three risings of monsoon chai",
            "seasoning a griddle for a decade: marginal notes",
            "ginger first — a small manifesto on sequence",
            "davanagere benne dosa as an ideology",
            "weighing cardamom like a pharmacist",
        ],
        "craft": "kitchen craft and spice logic",
    },
    "raag_ear": {
        "tags": ["tabla", "sitar", "surbahar", "music", "riyaz", "rhythm", "dance", "bharatanatyam"],
        "topics": [
            "teentaal for programmers: sixteen beats, no frameworks",
            "the bayan is weather: notes from an 11pm riyaz",
            "korvai arithmetic — landing on sam every time",
            "surbahar vs sitar: an argument in timbre",
            "counting jati in 7 while the heart keeps 8",
        ],
        "craft": "rhythm, riyaz and instruments",
    },
    "nyaya_logician": {
        "tags": ["logic", "nyaya", "philosophy", "reasoning", "kalman-filter", "estimation", "control-theory"],
        "topics": [
            "the hetu must be visible: notes on udaharana",
            "five limbs and one ladder: persuasion as process",
            "hetvabhasa — the original red-team taxonomy",
            "kalman gain as trust, chai as evidence",
            "a tiny proof checker and what it taught my readings",
        ],
        "craft": "old logic for new arguments",
    },
    "ui_gardener": {
        "tags": ["design", "css", "ayurveda", "ui", "motion", "photography"],
        "topics": [
            "parchment, not paper-white: a color token rant",
            "golden-ratio gutters in practice",
            "springs, not tweens: motion with a pulse",
            "why my skeletons shimmer warm",
            "restraint is the ninth color",
        ],
        "craft": "warm interfaces and disciplined motion",
    },
    "ghat_walker": {
        "tags": ["varanasi", "dawn", "ganga", "travel", "photography", "holi", "festival"],
        "topics": [
            "fog over kedar ghat: water practicing to be sky",
            "portra diplomacy — getting close without taking",
            "shooting holi at f/1.8 and living",
            "a boat index of dawn light",
            "the etiquette of the burning ghat",
        ],
        "craft": "travel notes and light discipline",
    },
    "retrieval_sufi": {
        "tags": ["search", "information-retrieval", "vectors", "bm25", "embeddings", "library"],
        "topics": [
            "bm25 as ritual counting: saturation and brevity",
            "reciprocal rank fusion in one honest stanza",
            "hybrid retrieval is compassion engineering",
            "measuring a library by what it refuses to rank",
            "inverted indexes, palm leaves, and you",
        ],
        "craft": "the science of finding",
    },
    "asana_dawn": {
        "tags": ["yoga", "suryanamaskar", "morning", "dance", "monsoon", "cozy", "reading"],
        "topics": [
            "twelve rounds at 5:55 — notes on rhythm and breath",
            "the terrace as a studio: monsoon edition",
            "what surya namaskar borrows from prosody",
            "stillness is a rep too",
            "counting breath like matras",
        ],
        "craft": "morning practice and slow strength",
    },
}

TIERS = [  # (tier, population weight, tick-interval multiplier)
    ("lurker", 0.50, 1.9),
    ("regular", 0.34, 1.0),
    ("creator", 0.13, 0.7),
    ("keeper", 0.03, 0.8),
]


@dataclass
class Persona:
    idx: int
    archetype: str
    full_name: str
    username: str
    email: str
    password: str
    bio: str
    interests: list[str]
    voice: str
    tier: str
    temp: float
    tick_scale: float
    forge_topics: list[str] = field(default_factory=list)

    @property
    def is_keeper(self) -> bool:
        return self.tier == "keeper"

    @property
    def is_creator(self) -> bool:
        return self.tier in ("creator", "keeper", "regular")

    def system_prompt(self) -> str:
        return (
            f"You are {self.full_name} (@{self.username}), a real person using AyurVerse — a calm, "
            f"Ayurvedic-themed social app with a visual feed, a long-form 'Forge', circles and a search library. "
            f"Your craft: {ARCHETYPES[self.archetype]['craft']}. Your interests: {', '.join(self.interests)}. "
            f"You write in a {self.voice} voice. You never mention being an AI or a simulation. "
            f"You never use emojis. You keep comments to one or two sincere sentences. "
            f"Output ONLY the JSON requested — no prose around it."
        )


def _password(seed: str, idx: int) -> str:
    return "wvr_" + hashlib.sha256(f"{seed}:{idx}".encode()).hexdigest()[:18]


def make_persona(idx: int, domain: str, seed: str) -> Persona:
    rng = random.Random(idx * 7919 + 17)
    first = FIRST[rng.randrange(len(FIRST))]
    last = LAST[rng.randrange(len(LAST))]
    arch = rng.choices(
        list(ARCHETYPES), weights=[2, 2, 2, 2, 1, 2, 2, 2, 2, 2]
    )[0]
    arch_data = ARCHETYPES[arch]
    tier = rng.choices([t[0] for t in TIERS], weights=[t[1] for t in TIERS])[0]
    tick_scale = next(t[2] for t in TIERS if t[0] == tier)

    interests = list(dict.fromkeys(arch_data["tags"][:5]))
    other = rng.choice(list(ARCHETYPES))
    interests += [t for t in rng.sample(ARCHETYPES[other]["tags"], 2) if t not in interests]

    username = f"{first.lower()}.{last.lower()[:10]}.{idx}"
    bio = " · ".join([
        str(arch_data["craft"]),
        rng.choice(["learning out loud", "slow internet, fast tea", "notes from the bench", "here for the long reads"]),
    ])
    return Persona(
        idx=idx, archetype=arch, full_name=f"{first} {last}", username=username,
        email=f"{username}@{domain}", password=_password(seed, idx), bio=bio,
        interests=interests[:7], voice=rng.choice(VOICES), tier=tier,
        temp=min(1.1, 0.7 + rng.random() * 0.4), tick_scale=tick_scale,
        forge_topics=list(arch_data["topics"]),
    )


def cohort(count: int, domain: str, seed: str) -> list[Persona]:
    return [make_persona(i, domain, seed) for i in range(count)]

# ============================================================================
#  LOCAL LLM — OpenAI-compatible chat, strict-JSON extraction, hard fallback
# ============================================================================

_llm_sem = asyncio.Semaphore(C.LLM_CONCURRENCY)
_JSON_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.S)
_JSON_GREEDY = re.compile(r"(\{.*\}|\[.*\])", re.S)


def extract_json(text: str) -> Any | None:
    text = (text or "").strip()
    if not text:
        return None
    for pattern in (_JSON_FENCE, _JSON_GREEDY):
        m = pattern.search(text)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                continue
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


async def chat(system: str, user: str, *, temperature: float | None = None,
               max_tokens: int | None = None, retries: int = 3) -> str | None:
    payload = {
        "model": C.LLM_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": C.LLM_TEMPERATURE if temperature is None else temperature,
        "max_tokens": max_tokens or C.LLM_MAX_TOKENS,
        "stream": False,
    }
    headers = {"Authorization": f"Bearer {C.LLM_API_KEY}"}
    async with _llm_sem:
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(180.0)) as cli:
                    r = await cli.post(f"{C.LLM_BASE_URL}/chat/completions", json=payload, headers=headers)
                if r.status_code == 200:
                    return r.json()["choices"][0]["message"]["content"]
                if r.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(2 ** attempt + 0.4)
                    continue
                return None
            except (httpx.HTTPError, asyncio.TimeoutError, KeyError, json.JSONDecodeError):
                await asyncio.sleep(2 ** attempt + 0.4)
    return None


async def chat_json(system: str, user: str, *, temperature: float | None = None,
                    max_tokens: int | None = None) -> Any | None:
    parsed = extract_json(await chat(system, user, temperature=temperature, max_tokens=max_tokens) or "")
    if parsed is not None:
        return parsed
    raw2 = await chat(system + " Reply with raw JSON only. No fences, no commentary.",
                      user, temperature=0.3, max_tokens=max_tokens)
    return extract_json(raw2 or "")


async def llm_probe() -> bool:
    try:
        async with httpx.AsyncClient(timeout=6.0) as cli:
            r = await cli.get(f"{C.LLM_BASE_URL}/models", headers={"Authorization": f"Bearer {C.LLM_API_KEY}"})
            return r.status_code == 200
    except Exception:
        return False

# ============================================================================
#  STATE — sqlite: accounts, seen-set, action ledger (resumable society)
# ============================================================================

DB_PATH = Path(__file__).resolve().parent / "society.db"
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def state_init() -> None:
    with _lock, _conn() as c:
        try:
            c.execute("ALTER TABLE accounts ADD COLUMN refresh_token TEXT")
        except sqlite3.OperationalError:
            pass  # column already there
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts(
              idx INTEGER PRIMARY KEY, email TEXT UNIQUE, password TEXT, persona TEXT,
              user_id TEXT, token TEXT, refresh_token TEXT, profiled INTEGER DEFAULT 0, created_at REAL);
            CREATE TABLE IF NOT EXISTS ledger(
              id INTEGER PRIMARY KEY AUTOINCREMENT, bot_idx INTEGER, action TEXT,
              target TEXT, day TEXT, at REAL);
            CREATE TABLE IF NOT EXISTS seen(
              bot_idx INTEGER, post_id INTEGER, PRIMARY KEY (bot_idx, post_id));
            CREATE INDEX IF NOT EXISTS idx_ledger ON ledger(bot_idx, action, day);
            """
        )


def upsert_account(idx: int, email: str, password: str, persona_json: dict,
                   user_id: str | None, token: str | None, profiled: bool,
                   refresh: str | None = None) -> None:
    with _lock, _conn() as c:
        c.execute(
            """INSERT INTO accounts(idx,email,password,persona,user_id,token,profiled,created_at,refresh_token)
               VALUES(?,?,?,?,?,?,?,?,?)
               ON CONFLICT(idx) DO UPDATE SET user_id=excluded.user_id,
                 token=COALESCE(excluded.token, accounts.token),
                 refresh_token=COALESCE(excluded.refresh_token, accounts.refresh_token),
                 profiled=excluded.profiled""",
            (idx, email, password, json.dumps(persona_json), user_id, token, int(profiled), time.time(), refresh),
        )


def set_token(idx: int, token: str) -> None:
    with _lock, _conn() as c:
        c.execute("UPDATE accounts SET token=? WHERE idx=?", (token, idx))


def set_tokens(idx: int, token: str, refresh: str) -> None:
    with _lock, _conn() as c:
        c.execute("UPDATE accounts SET token=?, refresh_token=? WHERE idx=?", (token, refresh, idx))


def all_accounts() -> list[dict[str, Any]]:
    with _lock, _conn() as c:
        rows = c.execute("SELECT * FROM accounts ORDER BY idx").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["persona"] = json.loads(d["persona"])
        out.append(d)
    return out


def remember_seen(bot_idx: int, post_ids: list[int]) -> None:
    if post_ids:
        with _lock, _conn() as c:
            c.executemany("INSERT OR IGNORE INTO seen(bot_idx, post_id) VALUES(?,?)",
                          [(bot_idx, p) for p in post_ids])


def unseen(bot_idx: int, post_ids: list[int]) -> list[int]:
    if not post_ids:
        return []
    q = ",".join("?" for _ in post_ids)
    with _lock, _conn() as c:
        rows = c.execute(f"SELECT post_id FROM seen WHERE bot_idx=? AND post_id IN ({q})",
                         [bot_idx, *post_ids]).fetchall()
    have = {r[0] for r in rows}
    return [p for p in post_ids if p not in have]


def log_action(bot_idx: int, action: str, target: str) -> None:
    day = time.strftime("%Y-%m-%d", time.gmtime())
    with _lock, _conn() as c:
        c.execute("INSERT INTO ledger(bot_idx, action, target, day, at) VALUES(?,?,?,?,?)",
                  (bot_idx, action, target, day, time.time()))


def action_count_today(bot_idx: int, action: str) -> int:
    day = time.strftime("%Y-%m-%d", time.gmtime())
    with _lock, _conn() as c:
        row = c.execute("SELECT COUNT(*) FROM ledger WHERE bot_idx=? AND action=? AND day=?",
                        (bot_idx, action, day)).fetchone()
    return int(row[0]) if row else 0


def recent_targets(bot_idx: int, action: str, limit: int) -> list[str]:
    with _lock, _conn() as c:
        rows = c.execute(
            "SELECT target FROM ledger WHERE bot_idx=? AND action=? ORDER BY id DESC LIMIT ?",
            (bot_idx, action, limit)).fetchall()
    out = []
    for (target,) in rows:
        out.append(target.split(":", 1)[1] if (action == "post" and ":" in target) else target)
    return out


def totals() -> dict[str, int]:
    with _lock, _conn() as c:
        rows = c.execute("SELECT action, COUNT(*) AS n FROM ledger GROUP BY action").fetchall()
        acc = c.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
    out = {r[0]: r[1] for r in rows}
    out["accounts"] = acc
    return out

# ============================================================================
#  LOOM CLIENT — api lane (real /api/* pipelines) | direct lane (PostgREST
#  with replicated side effects: counts, taste signals, author notifications)
# ============================================================================

_http_sem = asyncio.Semaphore(C.HTTP_CONCURRENCY)
_pace_lock = asyncio.Lock()
_bucket_ts = 0.0


def slugify(name: str) -> str:
    return (re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "circle")[:60]


async def _pace() -> None:
    global _bucket_ts
    async with _pace_lock:
        now = time.monotonic()
        wait = max(0.0, _bucket_ts - now)
        if wait:
            await asyncio.sleep(wait)
        _bucket_ts = max(now, _bucket_ts) + (1.0 / C.GLOBAL_RPS)


class Loom:
    def __init__(self, token: str = ""):
        self.token = token
        self.refresh_token = ""
        self.user_id = ""
        self.mode = C.MODE
        self._me: dict | None = None
        self._creds: tuple[str, str] | None = None  # (email, password) for relogin

    # ---------- auth (signup returns a live session — auto-confirmed) ----------
    async def _auth_call(self, path: str, email: str, password: str) -> dict | None:
        url = f"{C.SUPABASE_URL}/auth/v1/{path}"
        body = {"email": email, "password": password}
        for attempt in range(6):
            try:
                async with _http_sem:
                    async with httpx.AsyncClient(timeout=30) as cli:
                        r = await cli.post(url, json=body, headers={"apikey": C.SUPABASE_ANON_KEY})
                if r.status_code == 200:
                    data = r.json()
                    if data.get("access_token"):
                        return data
                if r.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(min(90, 2 ** attempt * 3) + random.random() * 3)
                    continue
                return None
            except httpx.HTTPError:
                await asyncio.sleep(min(60, 2 ** attempt * 2) + random.random() * 2)
        return None

    async def ensure_session(self, email: str, password: str) -> bool:
        self._creds = (email, password)
        if self.token:
            me = await self._auth_user()
            if me and me.get("id"):
                self.user_id = me["id"]
                return True
        for path in ("token?grant_type=password", "signup"):
            lane = await self._auth_call(path, email, password)
            if lane and lane.get("access_token"):
                self.token = lane["access_token"]
                self.refresh_token = lane.get("refresh_token", "")
                self.user_id = (lane.get("user") or {}).get("id", "")
                return True
        return False

    async def _refresh(self) -> bool:
        """Access tokens live ~1h; refresh silently so long runs never dry up."""
        if self.refresh_token:
            try:
                async with _http_sem:
                    async with httpx.AsyncClient(timeout=30) as cli:
                        r = await cli.post(
                            f"{C.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
                            json={"refresh_token": self.refresh_token},
                            headers={"apikey": C.SUPABASE_ANON_KEY})
                if r.status_code == 200:
                    data = r.json()
                    self.token = data["access_token"]
                    self.refresh_token = data.get("refresh_token", self.refresh_token)
                    self._me = None
                    return True
            except httpx.HTTPError:
                pass
        if self._creds:
            lane = await self._auth_call("token?grant_type=password", *self._creds)
            if lane and lane.get("access_token"):
                self.token = lane["access_token"]
                self.refresh_token = lane.get("refresh_token", self.refresh_token)
                self.user_id = (lane.get("user") or {}).get("id", self.user_id)
                self._me = None
                return True
        return False

    async def _auth_user(self) -> dict | None:
        try:
            async with _http_sem:
                async with httpx.AsyncClient(timeout=20) as cli:
                    r = await cli.get(
                        f"{C.SUPABASE_URL}/auth/v1/user",
                        headers={"apikey": C.SUPABASE_ANON_KEY, "Authorization": f"Bearer {self.token}"})
            return r.json() if r.status_code == 200 else None
        except httpx.HTTPError:
            return None

    # ---------- transports ----------
    async def _api(self, method: str, path: str, body: Any = None) -> Any:
        await _pace()
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        refreshed = False
        for attempt in range(4):
            try:
                async with _http_sem:
                    async with httpx.AsyncClient(timeout=45) as cli:
                        r = await cli.request(method, f"{C.APP_URL}/api/{path}", json=body, headers=headers)
                if r.status_code == 401 and not refreshed:
                    refreshed = True
                    if await self._refresh():
                        headers["Authorization"] = f"Bearer {self.token}"
                        continue
                if r.status_code in (200, 201):
                    return r.json()
                if r.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(2 ** attempt + random.random())
                    continue
                return {"__error__": r.text[:200], "__status__": r.status_code}
            except httpx.HTTPError:
                await asyncio.sleep(2 ** attempt + random.random())
        return {"__error__": "unreachable"}

    async def _rest(self, method: str, table: str, *, query: str = "", body: Any = None,
                    params: dict | None = None, prefer: str = "return=representation") -> Any:
        await _pace()
        url = f"{C.SUPABASE_URL}/rest/v1/{table}" + (f"?{query}" if query else "")
        headers = {
            "apikey": C.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        }
        refreshed = False
        for attempt in range(4):
            try:
                async with _http_sem:
                    async with httpx.AsyncClient(timeout=45) as cli:
                        r = await cli.request(method, url, json=body, headers=headers, params=params)
                if r.status_code == 401 and not refreshed:
                    refreshed = True
                    if await self._refresh():
                        headers["Authorization"] = f"Bearer {self.token}"
                        continue
                if r.status_code in (200, 201, 204):
                    return True if r.status_code == 204 or not r.text else r.json()
                if r.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(2 ** attempt + random.random())
                    continue
                return {"__error__": r.text[:220], "__status__": r.status_code}
            except (httpx.HTTPError, json.JSONDecodeError):
                await asyncio.sleep(2 ** attempt + random.random())
        return {"__error__": "unreachable"}

    # ---------- reads ----------
    async def feed(self, kind: str | None = None, offset: int = 0, limit: int = 8) -> list[dict]:
        if self.mode == "api":
            qs = f"offset={offset}&limit={limit}" + (f"&kind={kind}" if kind else "")
            data = await self._api("GET", f"feed?{qs}")
            return data.get("items", []) if isinstance(data, dict) else []
        q = f"select=*&order=id.desc&limit={limit}&offset={offset}"
        if kind:
            q = f"kind=eq.{kind}&" + q
        data = await self._rest("GET", "posts", query=q)
        return data if isinstance(data, list) else []

    async def search(self, q: str, kind: str | None = None) -> list[dict]:
        if self.mode == "api":
            data = await self._api("GET", f"search?q={httpx.QueryParams({'q': q})['q']}")
            items = data.get("posts", []) if isinstance(data, dict) else []
        else:
            data = await self._rest("GET", "posts", params={
                "or": "(title.ilike.*{0}*,caption.ilike.*{0}*,content_md.ilike.*{0}*,summary.ilike.*{0}*)".format(q),
                "order": "likes_count.desc", "limit": "12"})
            items = data if isinstance(data, list) else []
        return [p for p in items if p.get("kind") == kind] if kind else items

    async def groups_all(self) -> list[dict]:
        data = await self._rest("GET", "groups", query="select=*&order=member_count.desc&limit=60")
        return data if isinstance(data, list) else []

    # ---------- side effects ----------
    async def _me_profile(self) -> dict:
        if self._me is None:
            rows = await self._rest("GET", "profiles", query=f"user_id=eq.{self.user_id}&limit=1")
            self._me = rows[0] if isinstance(rows, list) and rows else {}
        return self._me

    async def _notify(self, recipient: str, type_: str, post_id: int | None = None, preview: str | None = None) -> None:
        if not recipient or recipient == self.user_id:
            return
        me = await self._me_profile()
        await self._rest("POST", "notifications", body={
            "user_id": recipient, "actor_id": self.user_id,
            "actor_name": me.get("full_name") or "weaver",
            "actor_username": me.get("username") or "weaver",
            "actor_avatar": me.get("avatar_url"),
            "type": type_, "post_id": post_id, "preview": (preview or "")[:140] or None,
        }, prefer="return=minimal")

    async def _signal(self, type_: str, post: dict) -> None:
        await self._rest("POST", "signals", body={
            "user_id": self.user_id, "type": type_, "post_id": post["id"],
            "tags": post.get("tags") or [], "kind": post.get("kind"),
        }, prefer="return=minimal")

    async def _bump(self, post_id: int, column: str, delta: int) -> None:
        rows = await self._rest("GET", "posts", query=f"id=eq.{post_id}&select={column}")
        if isinstance(rows, list) and rows:
            await self._rest("PATCH", "posts", query=f"id=eq.{post_id}",
                             body={column: max(0, (rows[0].get(column) or 0) + delta)},
                             prefer="return=minimal")

    async def liked_before(self, post_id: int) -> bool:
        rows = await self._rest("GET", "likes",
                                query=f"post_id=eq.{post_id}&user_id=eq.{self.user_id}&select=id")
        return isinstance(rows, list) and bool(rows)

    async def like(self, post: dict) -> bool:
        pid = post["id"]
        if self.mode == "api":
            res = await self._api("POST", "likes", {"post_id": pid})
            return not (isinstance(res, dict) and res.get("__error__"))
        if await self.liked_before(pid):
            return False
        res = await self._rest("POST", "likes", body={"post_id": pid, "user_id": self.user_id},
                               prefer="return=minimal")
        if isinstance(res, dict) and res.get("__error__"):
            return False
        await self._bump(pid, "likes_count", 1)
        await self._signal("like", post)
        await self._notify(post.get("author_id", ""), "like", pid)
        return True

    async def save(self, post: dict) -> bool:
        pid = post["id"]
        if self.mode == "api":
            res = await self._api("POST", "saves", {"post_id": pid})
            return not (isinstance(res, dict) and res.get("__error__"))
        rows = await self._rest("GET", "saves",
                                query=f"post_id=eq.{pid}&user_id=eq.{self.user_id}&select=id")
        if isinstance(rows, list) and rows:
            return False
        res = await self._rest("POST", "saves", body={"post_id": pid, "user_id": self.user_id},
                               prefer="return=minimal")
        if isinstance(res, dict) and res.get("__error__"):
            return False
        await self._bump(pid, "saves_count", 1)
        await self._signal("save", post)
        return True

    async def comment(self, post: dict, body: str) -> bool:
        pid = post["id"]
        text = body.strip()[:600]
        if not text:
            return False
        if self.mode == "api":
            res = await self._api("POST", "comments", {"post_id": pid, "body": text})
            return not (isinstance(res, dict) and res.get("__error__"))
        me = await self._me_profile()
        res = await self._rest("POST", "comments", body={
            "post_id": pid, "user_id": self.user_id,
            "author_name": me.get("full_name") or "weaver",
            "author_username": me.get("username") or "weaver",
            "author_avatar": me.get("avatar_url"), "body": text,
        }, prefer="return=minimal")
        if isinstance(res, dict) and res.get("__error__"):
            return False
        await self._bump(pid, "comments_count", 1)
        await self._signal("comment", post)
        await self._notify(post.get("author_id", ""), "comment", pid, preview=text)
        return True

    async def follow(self, followee_id: str) -> bool:
        if not followee_id or followee_id == self.user_id:
            return False
        if self.mode == "api":
            res = await self._api("POST", "follows", {"followee_id": followee_id})
            return not (isinstance(res, dict) and res.get("__error__")) and bool(res.get("following", True))
        rows = await self._rest("GET", "follows",
                                query=f"follower_id=eq.{self.user_id}&followee_id=eq.{followee_id}&select=id")
        if isinstance(rows, list) and rows:
            return False
        res = await self._rest("POST", "follows",
                               body={"follower_id": self.user_id, "followee_id": followee_id},
                               prefer="return=minimal")
        if isinstance(res, dict) and res.get("__error__"):
            return False
        await self._notify(followee_id, "follow")
        return True

    async def publish_forge(self, *, title: str, summary: str, content_md: str, tags: list[str]) -> int | None:
        if self.mode == "api":
            res = await self._api("POST", "posts",
                                  {"kind": "forge", "title": title, "summary": summary,
                                   "content_md": content_md, "tags": tags})
            return res.get("id") if isinstance(res, dict) and not res.get("__error__") else None
        me = await self._me_profile()
        res = await self._rest("POST", "posts", body={
            "kind": "forge", "author_id": self.user_id,
            "author_name": me.get("full_name") or "weaver",
            "author_username": me.get("username") or "weaver",
            "author_avatar": me.get("avatar_url"),
            "title": title[:220], "summary": summary[:400], "content_md": content_md,
            "tags": [t.lower().lstrip("#") for t in tags][:8],
            "read_minutes": max(1, round(len(content_md.split()) / 190)),
        })
        return res[0].get("id") if isinstance(res, list) and res else None

    async def create_circle(self, *, name: str, description: str, tags: list[str], kind: str = "forge") -> int | None:
        if self.mode == "api":
            res = await self._api("POST", "groups",
                                  {"name": name, "description": description, "tags": tags, "kind": kind})
            grp = res.get("group") if isinstance(res, dict) else None
            return grp.get("id") if isinstance(grp, dict) else None
        res = await self._rest("POST", "groups", body={
            "name": name.strip()[:80], "slug": slugify(name), "description": description[:600],
            "kind": kind, "owner_id": self.user_id,
            "tags": [t.lower() for t in tags][:8], "member_count": 1,
        })
        group = res[0] if isinstance(res, list) and res else None
        if not group:
            return None
        await self._rest("POST", "group_members",
                         body={"group_id": group["id"], "user_id": self.user_id, "role": "admin"},
                         prefer="return=minimal")
        return group["id"]

    async def join_circle(self, group: dict) -> bool:
        gid = group["id"]
        if self.mode == "api":
            res = await self._api("POST", "groups", {"action": "join", "group_id": gid})
            return not (isinstance(res, dict) and res.get("__error__"))
        rows = await self._rest("GET", "group_members",
                                query=f"group_id=eq.{gid}&user_id=eq.{self.user_id}&select=id")
        if isinstance(rows, list) and rows:
            return False
        res = await self._rest("POST", "group_members",
                               body={"group_id": gid, "user_id": self.user_id, "role": "member"},
                               prefer="return=minimal")
        if isinstance(res, dict) and res.get("__error__"):
            return False
        members = await self._rest("GET", "group_members", query=f"group_id=eq.{gid}&select=id")
        if isinstance(members, list):
            await self._rest("PATCH", "groups", query=f"id=eq.{gid}",
                             body={"member_count": len(members)}, prefer="return=minimal")
        await self._notify(group.get("owner_id", ""), "group_join", preview=f"joined {group.get('name', '')}")
        return True

    # ---------- threads (golden threads: DMs & replies) ----------
    async def my_threads(self, limit: int = 16) -> list[dict]:
        rows = await self._rest("GET", "conversation_members",
                                query=f"user_id=eq.{self.user_id}&select=conversation_id&limit=40")
        if not isinstance(rows, list) or not rows:
            return []
        ids = ",".join(str(r["conversation_id"]) for r in rows)
        convs = await self._rest("GET", "conversations",
                                 query=f"id=in.({ids})&order=last_message_at.desc&limit={limit}")
        return convs if isinstance(convs, list) else []

    async def unread_threads(self) -> list[dict]:
        out = []
        for c in (await self.my_threads())[:6]:
            msgs = await self._rest("GET", "messages",
                                    query=f"conversation_id=eq.{c['id']}&order=id.desc&limit=1")
            if isinstance(msgs, list) and msgs and msgs[0].get("sender_id") != self.user_id:
                out.append({"conv": c, "last": msgs[0]})
        return out

    async def ensure_dm(self, other_user_id: str) -> int | None:
        if not other_user_id or other_user_id == self.user_id:
            return None
        if self.mode == "api":
            res = await self._api("POST", "threads", {"member_ids": [other_user_id]})
            return res.get("id") if isinstance(res, dict) else None
        mine = await self._rest("GET", "conversation_members",
                                query=f"user_id=eq.{self.user_id}&select=conversation_id")
        if isinstance(mine, list) and mine:
            ids = ",".join(str(r["conversation_id"]) for r in mine)
            shared = await self._rest("GET", "conversation_members",
                                      query=f"conversation_id=in.({ids})&user_id=eq.{other_user_id}&select=conversation_id")
            if isinstance(shared, list):
                for srow in shared:
                    conv = await self._rest("GET", "conversations",
                                            query=f"id=eq.{srow['conversation_id']}&is_group=eq.false&select=id")
                    if isinstance(conv, list) and conv:
                        return conv[0]["id"]
        conv = await self._rest("POST", "conversations",
                                body={"is_group": False, "created_by": self.user_id,
                                      "last_message_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        cid = conv[0]["id"] if isinstance(conv, list) and conv else None
        if cid:
            await self._rest("POST", "conversation_members",
                             body={"conversation_id": cid, "user_id": self.user_id}, prefer="return=minimal")
            await self._rest("POST", "conversation_members",
                             body={"conversation_id": cid, "user_id": other_user_id}, prefer="return=minimal")
        return cid

    async def say(self, conv_id: int, body: str) -> bool:
        text = body.strip()[:1800]
        if not text:
            return False
        if self.mode == "api":
            res = await self._api("POST", "messages", {"conversation_id": conv_id, "type": "text", "body": text})
            return not (isinstance(res, dict) and res.get("__error__"))
        me = await self._me_profile()
        res = await self._rest("POST", "messages", body={
            "conversation_id": conv_id, "sender_id": self.user_id,
            "sender_name": me.get("full_name") or "weaver",
            "sender_avatar": me.get("avatar_url"),
            "type": "text", "body": text}, prefer="return=minimal")
        if isinstance(res, dict) and res.get("__error__"):
            return False
        await self._rest("PATCH", "conversations", query=f"id=eq.{conv_id}",
                         body={"last_message_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                         prefer="return=minimal")
        return True

    async def my_forge_circles(self) -> list[dict]:
        """Circles I belong to (member or founder), forge-kind only — lore welcomed there."""
        rows = await self._rest("GET", "group_members",
                                query=f"user_id=eq.{self.user_id}&select=group_id&limit=40")
        if not isinstance(rows, list) or not rows:
            return []
        ids = ",".join(str(r["group_id"]) for r in rows)
        gs = await self._rest("GET", "groups", query=f"id=in.({ids})&kind=eq.forge&select=id,name,tags")
        return gs if isinstance(gs, list) else []

    async def post_to_circle(self, group: dict, scroll: dict) -> int | None:
        if self.mode == "api":
            res = await self._api("POST", "group-content", body={
                "group_id": group["id"], "title": scroll["title"], "summary": scroll["summary"],
                "content_md": scroll["content_md"], "tags": scroll["tags"],
            })
            post = res.get("post") if isinstance(res, dict) else None
            return post.get("id") if isinstance(post, dict) else None
        pid = await self.publish_forge(**scroll)
        if not pid:
            return None
        await self._rest("POST", "group_posts",
                         body={"group_id": group["id"], "post_id": pid, "kind": "forge"},
                         prefer="return=minimal")
        return pid

    async def ensure_profile(self, *, username: str, full_name: str, bio: str) -> bool:
        if self.mode == "api":
            res = await self._api("POST", "profiles",
                                  {"username": username, "full_name": full_name, "bio": bio})
            if isinstance(res, dict) and not res.get("__error__"):
                self._me = res
                return True
        rows = await self._rest("GET", "profiles", query=f"user_id=eq.{self.user_id}&select=id")
        if isinstance(rows, list) and rows:
            self._me = rows[0]
            return True
        res = await self._rest("POST", "profiles", body={
            "user_id": self.user_id, "username": username, "full_name": full_name, "bio": bio})
        if isinstance(res, list) and res:
            self._me = res[0]
            return True
        return False

# ============================================================================
#  THE DIRECTOR — one beat of a life: browse → judge → act → create
# ============================================================================

STOP = asyncio.Event()


def overlap(bot: Persona, tags: list[str] | None) -> int:
    return len(set(bot.interests) & {str(t).lower() for t in (tags or [])})


def post_card(p: dict) -> str:
    title = p.get("title") or (p.get("caption") or "")[:90]
    body = (p.get("summary") or p.get("content_md") or p.get("caption") or "")[:320].replace("\n", " ")
    tags = ",".join((p.get("tags") or [])[:6])
    return (f"id={p['id']} [{p.get('kind', 'visual')}] by {p.get('author_name', 'someone')} | "
            f"likes={p.get('likes_count', 0)} | tags={tags}\n  {title}\n  {body}")


async def decide(bot: Persona, posts: list[dict]) -> dict[int, dict]:
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
        "Guidance: you like what matches your interests or genuinely moves you; you save only "
        "things worth returning to; you comment sparingly and never generically; "
        "follow_author true at most sometimes, only for lanes overlapping yours."
    )
    out = await chat_json(bot.system_prompt(), user, temperature=bot.temp, max_tokens=700)
    verdicts: dict[int, dict] = {}
    if isinstance(out, dict) and isinstance(out.get("items"), list):
        for item in out["items"]:
            try:
                pid = int(item["id"])
                v = str(item.get("verdict", "skip")).lower()
                if v not in ("skip", "like", "save", "comment"):
                    v = "skip"
                verdicts[pid] = {"verdict": v, "comment": str(item.get("comment") or ""),
                                 "follow": bool(item.get("follow_author"))}
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
    avoid = "\n".join(f"- {t}" for t in recent_titles[-6:]) or "(nothing yet)"
    user = (
        "Write a Forge scroll (long-form post) for AyurVerse:\n"
        f"Topic: {topic}\n"
        f"Your recent titles (do NOT repeat or rephrase these):\n{avoid}\n\n"
        "Requirements: 150-340 words of markdown; an opening line that earns the click; "
        "at most two '##' sections; if your craft is technical you may include one small code "
        "fence or one math line, otherwise lean on story and craft detail; end with one memorable line.\n"
        'Reply with JSON only: {"title":"<max 90 chars>","summary":"<max 240 chars>",'
        '"tags":["<2-5 lowercase tags>"],"content_md":"<markdown body>"}'
    )
    out = await chat_json(bot.system_prompt(), user, temperature=bot.temp + 0.05, max_tokens=1100)
    if not isinstance(out, dict):
        return None
    title = str(out.get("title") or "").strip()
    body = str(out.get("content_md") or "").strip()
    if len(title) < 8 or len(body) < 300:
        return None
    return {"title": title[:220], "summary": str(out.get("summary") or body[:220])[:400],
            "tags": [str(t).lower().lstrip("#") for t in (out.get("tags") or bot.interests[:3])][:5],
            "content_md": body}


async def dm_reply(bot: Persona, partner: str, last_body: str, history: str) -> str | None:
    user = (
        f"You are in a one-on-one conversation on AyurVerse. {partner} just wrote to you:\n\n"
        f"“{last_body[:500]}”\n\nRecent thread for tone:\n{(history or '(it began just now)')[:600]}\n\n"
        'Reply in your voice — warm, brief, human (one to three sentences, no greeting repetition). '
        'Reply with JSON only: {"reply":"..."}'
    )
    out = await chat_json(bot.system_prompt(), user, temperature=bot.temp, max_tokens=220)
    if isinstance(out, dict) and str(out.get("reply") or "").strip():
        return str(out["reply"]).strip()
    return None


async def dm_opener(bot: Persona, to_name: str) -> str | None:
    user = (
        f"You are starting a warm, unforced private thread with {to_name}, a fellow weaver on AyurVerse "
        "whose orbit touches yours. Reference a shared interest or something they might have woven lately. "
        "One to two sentences, no pleasantries stack. "
        'Reply with JSON only: {"reply":"..."}'
    )
    out = await chat_json(bot.system_prompt(), user, temperature=min(1.1, bot.temp + 0.05), max_tokens=160)
    if isinstance(out, dict) and str(out.get("reply") or "").strip():
        return str(out["reply"]).strip()
    return None


async def circle_scroll(bot: Persona, circle_name: str, circle_tags: list[str]) -> dict | None:
    user = (
        f'You are sharing a short Forge scroll with the circle “{circle_name}” '
        f"(its tags: {', '.join(circle_tags or bot.interests[:3])}). "
        "The circle cares about its theme deeply — write to them, not the public square. "
        "120-220 words of markdown, one vivid image or one small lived fact, warm and specific.\n"
        'Reply with JSON only: {"title":"<max 80 chars>","summary":"<max 200 chars>",'
        '"tags":["<2-4 tags>"],"content_md":"<markdown body>"}'
    )
    out = await chat_json(bot.system_prompt(), user, temperature=bot.temp, max_tokens=900)
    if not isinstance(out, dict):
        return None
    title = str(out.get("title") or "").strip()
    body = str(out.get("content_md") or "").strip()
    if len(title) < 6 or len(body) < 260:
        return None
    return {"title": title[:200], "summary": str(out.get("summary") or body[:180])[:400],
            "tags": [str(t).lower().lstrip("#") for t in (out.get("tags") or bot.interests[:3])][:5],
            "content_md": body}


async def circle_seed(bot: Persona) -> dict | None:
    user = (
        "Invent a community circle (group) you would genuinely start on AyurVerse, rooted in your "
        'craft. Reply with JSON only: {"name":"<3-6 words, evocative>",'
        '"description":"<1-2 sentences>","tags":["<2-4 tags>"]}'
    )
    out = await chat_json(bot.system_prompt(), user, temperature=bot.temp, max_tokens=220)
    if not isinstance(out, dict) or not str(out.get("name") or "").strip():
        return None
    return {"name": str(out["name"]).strip()[:80],
            "description": str(out.get("description") or "").strip()[:600],
            "tags": [str(t).lower().lstrip("#") for t in (out.get("tags") or bot.interests[:3])][:5]}


class Bot:
    def __init__(self, row: dict):
        self.idx = row["idx"]
        self.persona = Persona(**row["persona"])
        self.email = row["email"]
        self.password = row["password"]
        self.loom = Loom(token=row.get("token") or "")
        self.loom.user_id = row.get("user_id") or ""
        self._row_refresh = row.get("refresh_token") or ""
        self.rng = random.Random(self.idx * 104729 + 7)

    def budget_ok(self, action: str, cap: int) -> bool:
        return action_count_today(self.idx, action) < cap

    async def tick(self) -> None:
        # browse: mostly the feed, forge for the patient, curiosity-search sometimes
        if self.rng.random() < 0.22:
            posts = await self.loom.search(self.rng.choice(self.persona.interests))
        else:
            kind = "forge" if self.rng.random() < 0.35 else None
            posts = await self.loom.feed(kind=kind, limit=8, offset=self.rng.randrange(0, 24, 8))
        if not posts:
            return

        fresh_ids = unseen(self.idx, [p["id"] for p in posts])
        remember_seen(self.idx, [p["id"] for p in posts])
        cands = [p for p in posts if p["id"] in fresh_ids]
        cands.sort(key=lambda p: overlap(self.persona, p.get("tags")), reverse=True)
        cands = cands[:3]
        if not cands:
            return

        verdicts = await decide(self.persona, cands)
        for post in cands:
            dec = verdicts.get(post["id"], {"verdict": "skip", "comment": "", "follow": False})
            v = dec["verdict"]
            if v in ("like", "comment") and self.budget_ok("like", C.MAX_LIKES):
                if await self.loom.like(post):
                    log_action(self.idx, "like", str(post["id"]))
            if v == "save" and self.budget_ok("save", C.MAX_SAVES):
                if await self.loom.save(post):
                    log_action(self.idx, "save", str(post["id"]))
            if v == "comment" and dec["comment"] and self.budget_ok("comment", C.MAX_COMMENTS):
                if await self.loom.comment(post, dec["comment"]):
                    log_action(self.idx, "comment", str(post["id"]))
            if dec["follow"] and self.budget_ok("follow", C.MAX_FOLLOWS):
                if await self.loom.follow(post.get("author_id", "")):
                    log_action(self.idx, "follow", post.get("author_id", ""))

        if self.persona.is_creator and self.rng.random() < 0.16 and self.budget_ok("post", C.MAX_POSTS):
            scroll = await forge_scroll(self.persona, recent_targets(self.idx, "post", 6))
            if scroll:
                pid = await self.loom.publish_forge(**scroll)
                if pid:
                    log_action(self.idx, "post", f"{pid}:{scroll['title']}")

        if self.persona.is_keeper and self.rng.random() < 0.30 and self.budget_ok("circle", C.MAX_CIRCLES):
            seed = await circle_seed(self.persona)
            if seed:
                existing = {g.get("name", "").lower() for g in await self.loom.groups_all()}
                if seed["name"].lower() not in existing:
                    gid = await self.loom.create_circle(**seed)
                    if gid:
                        log_action(self.idx, "circle", f"{gid}:{seed['name']}")
        elif self.rng.random() < 0.10:
            groups = [g for g in await self.loom.groups_all() if overlap(self.persona, g.get("tags")) >= 1]
            if groups and await self.loom.join_circle(self.rng.choice(groups)):
                log_action(self.idx, "join", "circle")

        # golden threads — answer whoever wrote me, occasionally open a new one
        if self.rng.random() < 0.16 and self.budget_ok("dm", C.MAX_THREAD_MSGS):
            await self.thread_beat()

        # write into a circle I belong to (lore in forge circles, warm notes in kin)
        if self.persona.is_creator and self.rng.random() < 0.18 and self.budget_ok("circle_post", C.MAX_CIRCLE_POSTS):
            await self.circle_write_beat()

    async def thread_beat(self) -> None:
        unread = await self.loom.unread_threads()
        if unread:
            pick = self.rng.choice(unread)
            partner = pick["last"].get("sender_name", "a weaver")
            reply = await dm_reply(self.persona, partner, pick["last"].get("body") or "", pick["last"].get("sender_name", ""))
            if reply and await self.loom.say(pick["conv"]["id"], reply):
                log_action(self.idx, "dm", str(pick["conv"]["id"]))
            return
        if self.rng.random() < 0.45:
            pool = await self.loom._rest("GET", "profiles",
                                         query="select=user_id,full_name&order=id.desc&limit=80")
            if not isinstance(pool, list) or not pool:
                return
            souls = [p for p in pool if p.get("user_id") and p["user_id"] != self.loom.user_id]
            if not souls:
                return
            target = self.rng.choice(souls + ([{"user_id": C.HUMAN_ID, "full_name": "the caretaker"}] if self.rng.random() < 0.12 else []))
            cid = await self.loom.ensure_dm(target["user_id"])
            if not cid:
                return
            opener = await dm_opener(self.persona, target.get("full_name", "weaver"))
            if opener and await self.loom.say(cid, opener):
                log_action(self.idx, "dm_open", str(cid))

    async def circle_write_beat(self) -> None:
        circles = await self.loom.my_forge_circles()
        if not circles:
            return
        g = self.rng.choice(circles)
        scroll = await circle_scroll(self.persona, g.get("name", "the circle"), g.get("tags") or [])
        if scroll:
            pid = await self.loom.post_to_circle(g, scroll)
            if pid:
                log_action(self.idx, "circle_post", f"{g['id']}:{scroll['title']}")

    async def run(self) -> None:
        self.loom.refresh_token = self._row_refresh
        if not await self.loom.ensure_session(self.email, self.password):
            return
        if self.loom.token:
            set_tokens(self.idx, self.loom.token, self.loom.refresh_token)
        while not STOP.is_set():
            try:
                await self.tick()
            except Exception as e:  # one bot must never sink the society
                print(f"[bot {self.idx}] tick error: {e}")
            await asyncio.sleep(self.rng.uniform(C.TICK_MIN_S * self.persona.tick_scale,
                                                 C.TICK_MAX_S * self.persona.tick_scale))

# ============================================================================
#  COMMANDS
# ============================================================================

async def provision(count: int, domain: str, seed: str) -> None:
    state_init()
    known = {a["email"] for a in all_accounts()}
    people = [p for p in cohort(count, domain, seed) if p.email not in known]
    print(f"[provision] {count} requested · {len(people)} new · {len(known)} already seated")

    done = 0
    lock = asyncio.Lock()
    sem = asyncio.Semaphore(6)  # auth-gateway politeness

    async def one(p: Persona) -> None:
        nonlocal done
        loom = Loom()
        if not await loom.ensure_session(p.email, p.password):
            print(f"[provision] sign-in blocked for {p.email} (rate limit? rerun to resume)")
            await asyncio.sleep(5)
            return
        bio = p.bio + (" · (sim)" if C.MARK_SIMULATED else "")
        profiled = await loom.ensure_profile(username=p.username, full_name=p.full_name, bio=bio)
        upsert_account(p.idx, p.email, p.password, p.__dict__, loom.user_id, loom.token, profiled,
                       loom.refresh_token)
        async with lock:
            done += 1
            if done % 20 == 0:
                print(f"[provision] {done}/{len(people)} weavers seated")

    async def guarded(p: Persona) -> None:
        async with sem:
            await one(p)

    await asyncio.gather(*(guarded(p) for p in people))
    print(f"[provision] seated {done} new weavers · society size = {len(all_accounts())}")


async def live(duration_hours: float, bots_limit: int) -> None:
    state_init()
    rows = [r for r in all_accounts() if r.get("user_id")][:bots_limit]
    if not rows:
        print("[live] no weavers seated — run `provision` first")
        return
    llm_ok = await llm_probe()
    forever = duration_hours <= 0
    print(f"[live] {len(rows)} weavers · llm "
          f"{'online at ' + C.LLM_BASE_URL + ' (' + C.LLM_MODEL + ')' if llm_ok else 'NOT reachable — heuristic fallback active'}")
    print(f"[live] mode={C.MODE} app={C.APP_URL or '(direct lane)'} db={C.SUPABASE_URL} · "
          + ("running until interrupted" if forever else f"for {duration_hours}h"))

    gate = asyncio.Semaphore(C.BOT_CONCURRENCY)

    async def supervised(row: dict) -> None:
        """A weaver who stumbles gets up quietly and returns to the loom."""
        backoff = 5
        while not STOP.is_set():
            async with gate:
                try:
                    await Bot(row).run()
                    return  # only a clean STOP exits normally
                except asyncio.CancelledError:
                    return
                except Exception as e:
                    print(f"[supervisor] weaver {row['idx']} fell ({e}); re-seating in {backoff}s")
                    await asyncio.sleep(backoff)
                    backoff = min(180, backoff * 2)

    async def heartbeat() -> None:
        status_path = Path(__file__).resolve().parent / "society.status.json"
        while not STOP.is_set():
            await asyncio.sleep(60)
            t = totals()
            print("[heartbeat] " + " · ".join(f"{k}={v}" for k, v in sorted(t.items())))
            try:
                status_path.write_text(json.dumps({
                    "alive_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "llm_online": llm_ok,
                    "weavers": len(rows),
                    "mode": C.MODE,
                    "ledger": t,
                }, indent=2))
            except OSError:
                pass

    tasks = [asyncio.create_task(supervised(r)) for r in rows]
    hb = asyncio.create_task(heartbeat())
    try:
        bundle = asyncio.gather(*tasks, return_exceptions=True)
        if forever:
            await bundle
        else:
            await asyncio.wait_for(bundle, duration_hours * 3600)
    except asyncio.TimeoutError:
        pass
    finally:
        STOP.set()
        hb.cancel()
        print("[live] society resting. lifetime ledger:", json.dumps(totals()))
async def selftest() -> bool:
    checks: list[tuple[str, bool]] = []

    def note(name: str, ok: bool) -> None:
        checks.append((name, ok))
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")

    print(f"[selftest] mode={C.MODE} db={C.SUPABASE_URL} app={C.APP_URL or '(direct lane)'}")
    state_init()
    p = make_persona(900001, C.BOT_DOMAIN, C.BOT_PASSWORD_SEED)
    loom = Loom()

    ok = await loom.ensure_session(p.email, p.password)
    note("signup/login → live session", ok)
    if not ok:
        return False
    note("profile upsert", await loom.ensure_profile(
        username=p.username, full_name="Probe Weaver", bio="harness self-test · (sim)"))

    feed = await loom.feed(limit=6)
    note("feed browse", bool(feed))
    note("forge browse", isinstance(await loom.feed(kind="forge", limit=5), list))
    note("search stroll 'chai'", bool(await loom.search("chai")))

    if feed:
        target = feed[0]
        pid0, author = target["id"], target.get("author_id", "")
        await loom.like(target)
        note(f"like post #{pid0}", await loom.liked_before(pid0))
        await loom.comment(target, "Self-test braid — the loom holds. (unweaving in a breath)")
        crow = await loom._rest("GET", "comments",
                                query=f"post_id=eq.{pid0}&user_id=eq.{loom.user_id}&select=id")
        note("comment with persona body", isinstance(crow, list) and bool(crow))
        await loom.save(target)
        srow = await loom._rest("GET", "saves",
                                query=f"post_id=eq.{pid0}&user_id=eq.{loom.user_id}&select=id")
        note("save to satchel", isinstance(srow, list) and bool(srow))
        await loom.follow(author)
        frow = await loom._rest("GET", "follows",
                                query=f"follower_id=eq.{loom.user_id}&followee_id=eq.{author}&select=id")
        note(f"follow author {target.get('author_username', '?')}", isinstance(frow, list) and bool(frow))

    pid = await loom.publish_forge(
        title="Harness Self-Check — A Scroll That Unweaves Itself",
        summary="Automated pipeline verification; disappears when you sweep.",
        content_md=("## A probe at dawn\n\nThis scroll exists only to prove that a weaver can sit, "
                    "think in markdown, and publish through the forge pipeline.\n\n"
                    "- like\n- comment\n- save\n- follow\n- publish\n\n"
                    "It will be deleted by the same harness that wrote it."),
        tags=["selftest", "loom"])
    note("forge publish", pid is not None)

    gid = await loom.create_circle(name="Harness Proving Ground",
                                   description="A circle raised by the self-test; swept before the gong.",
                                   tags=["selftest"])
    note("circle create", gid is not None)

    # ---- sweep up: the probe leaves no footprints ----
    if feed:
        await loom._rest("DELETE", "comments", query=f"post_id=eq.{pid0}&user_id=eq.{loom.user_id}", prefer="return=minimal")
        await loom._bump(pid0, "comments_count", -1)
        await loom._rest("DELETE", "likes", query=f"post_id=eq.{pid0}&user_id=eq.{loom.user_id}", prefer="return=minimal")
        await loom._bump(pid0, "likes_count", -1)
        await loom._rest("DELETE", "saves", query=f"post_id=eq.{pid0}&user_id=eq.{loom.user_id}", prefer="return=minimal")
        await loom._bump(pid0, "saves_count", -1)
        await loom._rest("DELETE", "follows", query=f"follower_id=eq.{loom.user_id}&followee_id=eq.{author}", prefer="return=minimal")
        await loom._rest("DELETE", "signals", query=f"user_id=eq.{loom.user_id}&post_id=eq.{pid0}", prefer="return=minimal")
        await loom._rest("DELETE", "notifications", query=f"actor_id=eq.{loom.user_id}", prefer="return=minimal")
        print("  — probe footprints swept (likes/saves/comments/follows undone, counts restored)")
    if pid:
        note("forge scroll unwoven (deleted)",
             await loom._rest("DELETE", "posts", query=f"id=eq.{pid}", prefer="return=minimal") is True)
    if gid:
        await loom._rest("DELETE", "group_members", query=f"group_id=eq.{gid}", prefer="return=minimal")
        note("circle dissolved (deleted)",
             await loom._rest("DELETE", "groups", query=f"id=eq.{gid}", prefer="return=minimal") is True)

    failed = [n for n, ok in checks if not ok]
    print(f"\n[selftest] {len(checks) - len(failed)}/{len(checks)} passed"
          + (f" — failing: {failed}" if failed else ""))
    return not failed

# ============================================================================
#  ENTRY
# ============================================================================

def main() -> None:
    ap = argparse.ArgumentParser(prog="ayurverse_society", description="AyurVerse society harness")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_prov = sub.add_parser("provision", help="create bot accounts (+profiles), resumable")
    p_prov.add_argument("--count", type=int, default=None)
    p_live = sub.add_parser("live", help="run the society")
    p_live.add_argument("--hours", type=float, default=24.0)
    p_live.add_argument("--bots", type=int, default=None)
    sub.add_parser("report", help="lifetime ledger")
    sub.add_parser("selftest", help="one bot walks every pipeline, then unweaves itself")
    args = ap.parse_args()

    if args.cmd == "provision":
        asyncio.run(provision(args.count or C.BOT_COUNT, C.BOT_DOMAIN, C.BOT_PASSWORD_SEED))
    elif args.cmd == "live":
        asyncio.run(live(args.hours, args.bots or C.BOT_COUNT))
    elif args.cmd == "report":
        state_init()
        print(json.dumps(totals(), indent=2))
    elif args.cmd == "selftest":
        sys.exit(0 if asyncio.run(selftest()) else 1)


if __name__ == "__main__":
    main()
