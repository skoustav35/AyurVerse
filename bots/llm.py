"""Local-LLM adapter — OpenAI-compatible chat with strict-JSON extraction.

Works unchanged against Ollama (/v1), LM Studio, vLLM, llama.cpp server, or any
OpenAI-compatible endpoint. Failures return None so callers can fall back to
deterministic heuristics — the society keeps moving even if the model box hiccups.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx

from config import C

_llm_sem = asyncio.Semaphore(C.LLM_CONCURRENCY)

_JSON_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.S)
_JSON_GREEDY = re.compile(r"(\{.*\}|\[.*\])", re.S)


def extract_json(text: str) -> Any | None:
    if not text:
        return None
    text = text.strip()
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


async def chat(
    system: str,
    user: str,
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    retries: int = 3,
) -> str | None:
    payload = {
        "model": C.LLM_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
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
                        data = r.json()
                        return data["choices"][0]["message"]["content"]
                    if r.status_code in (429, 500, 502, 503):
                        await asyncio.sleep(2**attempt + 0.4)
                        continue
                    return None
            except (httpx.HTTPError, asyncio.TimeoutError, KeyError, json.JSONDecodeError):
                await asyncio.sleep(2**attempt + 0.4)
        return None


async def chat_json(
    system: str,
    user: str,
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> Any | None:
    """One attempt of chat + JSON carve, then a single stricter retry."""
    raw = await chat(system, user, temperature=temperature, max_tokens=max_tokens)
    parsed = extract_json(raw or "")
    if parsed is not None:
        return parsed
    raw2 = await chat(
        system + " Reply with raw JSON only. No markdown fences, no commentary.",
        user,
        temperature=0.3,
        max_tokens=max_tokens,
    )
    return extract_json(raw2 or "")


async def probe() -> bool:
    """Cheap availability check used at startup."""
    try:
        async with httpx.AsyncClient(timeout=6.0) as cli:
            r = await cli.get(f"{C.LLM_BASE_URL}/models", headers={"Authorization": f"Bearer {C.LLM_API_KEY}"})
            return r.status_code == 200
    except Exception:
        return False
