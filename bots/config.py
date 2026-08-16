"""Configuration for the AyurVerse society harness.

Everything is overridable with environment variables (or a bots/.env file on
disk — a tiny loader below reads it without extra dependencies). Nothing here
touches Vite or the Vercel build; this folder runs standalone on your machine.
"""
from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, ""))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, ""))
    except (TypeError, ValueError):
        return default


class C:
    # ---- the app ----
    # Public coordinate of the AyurVerse backend project (publishable key only).
    SUPABASE_URL = os.environ.get("SOCIETY_SUPABASE_URL", "https://vcioygsdxmqlmngjpsmo.supabase.co")
    SUPABASE_ANON_KEY = os.environ.get(
        "SOCIETY_SUPABASE_ANON_KEY", "sb_publishable_oxp24Thotldwob3D1e32wA_EBDhLytq"
    )
    # The deployed app (used in "api" mode so actions flow through /api/* pipelines).
    # Paste the URL from your preview panel. If unreachable, "auto" falls back to
    # "direct" mode which writes through PostgREST with the same side effects.
    APP_URL = os.environ.get("SOCIETY_APP_URL", "").rstrip("/")
    MODE = os.environ.get("SOCIETY_MODE", "api")  # api | direct | auto

    # ---- local LLM (OpenAI-compatible: Ollama :11434, LM Studio :1234, vLLM) ----
    LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1")
    LLM_MODEL = os.environ.get("LLM_MODEL", "llama3.1:8b")
    LLM_API_KEY = os.environ.get("LLM_API_KEY", "ollama")
    LLM_CONCURRENCY = _int("LLM_CONCURRENCY", 8)
    LLM_TEMPERATURE = _float("LLM_TEMPERATURE", 0.9)
    LLM_MAX_TOKENS = _int("LLM_MAX_TOKENS", 900)

    # ---- society shape ----
    BOT_COUNT = _int("BOT_COUNT", 500)
    BOT_DOMAIN = os.environ.get("BOT_DOMAIN", "weavers.ayurverse.dev")
    BOT_PASSWORD_SEED = os.environ.get("BOT_PASSWORD_SEED", "monsoon-thread-2026")
    MARK_SIMULATED = os.environ.get("MARK_SIMULATED", "1") == "1"  # suffix "(sim)" in bio

    # ---- pacing ----
    HTTP_CONCURRENCY = _int("HTTP_CONCURRENCY", 24)
    BOT_CONCURRENCY = _int("BOT_CONCURRENCY", 24)   # how many loops run at once
    TICK_MIN_S = _int("TICK_MIN_S", 9 * 60)
    TICK_MAX_S = _int("TICK_MAX_S", 38 * 60)
    GLOBAL_RPS = _float("GLOBAL_RPS", 8.0)          # token bucket, all outbound calls

    # ---- per-bot daily budgets (UTC) ----
    MAX_LIKES = _int("BUDGET_LIKES", 40)
    MAX_COMMENTS = _int("BUDGET_COMMENTS", 12)
    MAX_SAVES = _int("BUDGET_SAVES", 10)
    MAX_FOLLOWS = _int("BUDGET_FOLLOWS", 15)
    MAX_POSTS = _int("BUDGET_POSTS", 2)
    MAX_CIRCLES = _int("BUDGET_CIRCLES", 1)
