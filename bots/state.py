"""SQLite-backed society state: bot accounts, seen posts, action ledger.

Resumable by construction — provision skips accounts already recorded, and the
dedupe ledger means a restarted society never double-likes a post.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent / "society.db"
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    with _lock, _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts(
              idx INTEGER PRIMARY KEY,
              email TEXT UNIQUE,
              password TEXT,
              persona TEXT,
              user_id TEXT,
              token TEXT,
              profiled INTEGER DEFAULT 0,
              created_at REAL
            );
            CREATE TABLE IF NOT EXISTS ledger(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              bot_idx INTEGER,
              action TEXT,
              target TEXT,
              day TEXT,
              at REAL
            );
            CREATE TABLE IF NOT EXISTS seen(
              bot_idx INTEGER,
              post_id INTEGER,
              PRIMARY KEY (bot_idx, post_id)
            );
            CREATE INDEX IF NOT EXISTS idx_ledger ON ledger(bot_idx, action, day);
            """
        )


def upsert_account(idx: int, email: str, password: str, persona_json: dict, user_id: str | None,
                    token: str | None, profiled: bool) -> None:
    with _lock, _conn() as c:
        c.execute(
            """INSERT INTO accounts(idx,email,password,persona,user_id,token,profiled,created_at)
               VALUES(?,?,?,?,?,?,?,?)
               ON CONFLICT(idx) DO UPDATE SET user_id=excluded.user_id,
                 token=COALESCE(excluded.token, accounts.token), profiled=excluded.profiled""",
            (idx, email, password, json.dumps(persona_json), user_id, token, int(profiled), time.time()),
        )


def set_token(idx: int, token: str) -> None:
    with _lock, _conn() as c:
        c.execute("UPDATE accounts SET token=? WHERE idx=?", (token, idx))


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
    if not post_ids:
        return
    with _lock, _conn() as c:
        c.executemany("INSERT OR IGNORE INTO seen(bot_idx, post_id) VALUES(?,?)",
                      [(bot_idx, p) for p in post_ids])


def unseen(bot_idx: int, post_ids: list[int]) -> list[int]:
    if not post_ids:
        return []
    q = ",".join("?" for _ in post_ids)
    with _lock, _conn() as c:
        rows = c.execute(
            f"SELECT post_id FROM seen WHERE bot_idx=? AND post_id IN ({q})", [bot_idx, *post_ids]
        ).fetchall()
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
        row = c.execute(
            "SELECT COUNT(*) FROM ledger WHERE bot_idx=? AND action=? AND day=?",
            (bot_idx, action, day),
        ).fetchone()
    return int(row[0]) if row else 0


def totals() -> dict[str, int]:
    with _lock, _conn() as c:
        rows = c.execute("SELECT action, COUNT(*) AS n FROM ledger GROUP BY action").fetchall()
        acc = c.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
    out = {r[0]: r[1] for r in rows}
    out["accounts"] = acc
    return out
