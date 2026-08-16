"""AyurVerse client — one weave, two lanes.

mode="api":    every action flows through the deployed app's /api/* pipelines
               (counts, signals, notifications, group bookkeeping all happen
               server-side, exactly like a human session).

mode="direct": when the app URL isn't reachable from this machine (preview
               protection etc.), actions go straight to PostgREST with the
               bot's own session token and replicate the same side effects:
               row insert + denormalized count bump + taste signal + author
               notification.

All outbound calls share a global token-bucket rate limiter and retry 429/5xx
with exponential backoff — the harness is a polite citizen by default.
"""
from __future__ import annotations

import asyncio
import random
import re
import time
from typing import Any

import httpx

from config import C

_http_sem = asyncio.Semaphore(C.HTTP_CONCURRENCY)
_bucket_ts = 0.0


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:60] or "circle"


async def _pace() -> None:
    global _bucket_ts
    async with _pace_lock:
        now = time.monotonic()
        wait = max(0.0, _bucket_ts - now)
        if wait:
            await asyncio.sleep(wait)
        _bucket_ts = max(now, _bucket_ts) + (1.0 / C.GLOBAL_RPS)


_pace_lock = asyncio.Lock()


class Loom:
    def __init__(self, token: str = ""):
        self.token = token
        self.user_id: str = ""
        self.mode = C.MODE
        self._profiles_me: dict | None = None

    # ---------------- auth ----------------
    async def signup(self, email: str, password: str) -> dict | None:
        return await self._auth_call("signup", email, password)

    async def login(self, email: str, password: str) -> dict | None:
        return await self._auth_call("token?grant_type=password", email, password)

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
                # 4xx here: already-registered email, weak password, rate limit
                if r.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(min(90, 2**attempt * 3) + random.random() * 3)
                    continue
                return None
            except httpx.HTTPError:
                await asyncio.sleep(min(60, 2**attempt * 2) + random.random() * 2)
        return None

    async def ensure_session(self, email: str, password: str) -> bool:
        if self.token:
            me = await self._auth_user()
            if me:
                self.user_id = me.get("id", "")
                return True
        for w in ("token?grant_type=password", None):  # login first, then signup
            lane = await self._auth_call(w or "signup", email, password)
            if lane and lane.get("access_token"):
                self.token = lane["access_token"]
                self.user_id = (lane.get("user") or {}).get("id", "")
                return True
        return False

    async def _auth_user(self) -> dict | None:
        try:
            async with _http_sem:
                async with httpx.AsyncClient(timeout=20) as cli:
                    r = await cli.get(
                        f"{C.SUPABASE_URL}/auth/v1/user",
                        headers={"apikey": C.SUPABASE_ANON_KEY, "Authorization": f"Bearer {self.token}"},
                    )
            return r.json() if r.status_code == 200 else None
        except httpx.HTTPError:
            return None

    # ---------------- transport ----------------
    async def _api(self, method: str, path: str, body: Any = None) -> Any:
        """App pipeline lane."""
        await _pace()
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        for attempt in range(4):
            try:
                async with _http_sem:
                    async with httpx.AsyncClient(timeout=45) as cli:
                        r = await cli.request(method, f"{C.APP_URL}/api/{path}", json=body, headers=headers)
                if r.status_code in (200, 201):
                    return r.json()
                if r.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(2**attempt + random.random())
                    continue
                return {"__error__": r.text[:200], "__status__": r.status_code}
            except httpx.HTTPError:
                await asyncio.sleep(2**attempt + random.random())
        return {"__error__": "unreachable"}

    async def _rest(self, method: str, table: str, *, query: str = "", body: Any = None,
                    params: dict | None = None, prefer: str = "return=representation") -> Any:
        """Direct-lane PostgREST on the bot's own token."""
        await _pace()
        url = f"{C.SUPABASE_URL}/rest/v1/{table}" + (f"?{query}" if query else "")
        headers = {
            "apikey": C.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        }
        for attempt in range(4):
            try:
                async with _http_sem:
                    async with httpx.AsyncClient(timeout=45) as cli:
                        r = await cli.request(method, url, json=body, headers=headers, params=params)
                if r.status_code in (200, 201, 204):
                    if r.status_code == 204 or not r.text:
                        return True
                    return r.json()
                if r.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(2**attempt + random.random())
                    continue
                return {"__error__": r.text[:220], "__status__": r.status_code}
            except (httpx.HTTPError, json.JSONDecodeError):
                await asyncio.sleep(2**attempt + random.random())
        return {"__error__": "unreachable"}

    # ---------------- discovery ----------------
    async def feed(self, kind: str | None = None, offset: int = 0, limit: int = 8) -> list[dict]:
        if self.mode == "api":
            qs = f"?offset={offset}&limit={limit}" + (f"&kind={kind}" if kind else "")
            data = await self._api("GET", f"feed{qs}")
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
                "order": "likes_count.desc",
                "limit": "12",
            })
            items = data if isinstance(data, list) else []
        if kind:
            items = [p for p in items if p.get("kind") == kind]
        return items

    async def groups_all(self) -> list[dict]:
        data = await self._rest("GET", "groups", query="select=*&order=member_count.desc&limit=60")
        return data if isinstance(data, list) else []

    # ---------------- side effects ----------------
    async def _me_profile(self) -> dict:
        if self._profiles_me:
            return self._profiles_me
        rows = await self._rest("GET", "profiles", query=f"user_id=eq.{self.user_id}&limit=1")
        self._profiles_me = rows[0] if isinstance(rows, list) and rows else {}
        return self._profiles_me

    async def _notify(self, recipient: str, type_: str, post_id: int | None = None, preview: str | None = None) -> None:
        if not recipient or recipient == self.user_id:
            return
        me = await self._me_profile()
        await self._rest("POST", "notifications", body={
            "user_id": recipient, "actor_id": self.user_id,
            "actor_name": me.get("full_name") or "weaver",
            "actor_username": me.get("username") or "weaver",
            "actor_avatar": me.get("avatar_url"),
            "type": type_, "post_id": post_id,
            "preview": (preview or "")[:140] or None,
        }, prefer="return=minimal")

    async def _signal(self, type_: str, post: dict) -> None:
        await self._rest("POST", "signals", body={
            "user_id": self.user_id, "type": type_, "post_id": post["id"],
            "tags": post.get("tags") or [], "kind": post.get("kind"),
        }, prefer="return=minimal")

    async def _bump(self, post_id: int, column: str, delta: int) -> None:
        rows = await self._rest("GET", "posts", query=f"id=eq.{post_id}&select={column}")
        if isinstance(rows, list) and rows:
            current = rows[0].get(column) or 0
            await self._rest("PATCH", "posts", query=f"id=eq.{post_id}",
                             body={column: max(0, current + delta)}, prefer="return=minimal")

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
        words = len(content_md.split())
        res = await self._rest("POST", "posts", body={
            "kind": "forge", "author_id": self.user_id,
            "author_name": me.get("full_name") or "weaver",
            "author_username": me.get("username") or "weaver",
            "author_avatar": me.get("avatar_url"),
            "title": title[:220], "summary": summary[:400], "content_md": content_md,
            "tags": [t.lower().lstrip("#") for t in tags][:8],
            "read_minutes": max(1, round(words / 190)),
        })
        if isinstance(res, list) and res:
            return res[0].get("id")
        return None

    async def create_circle(self, *, name: str, description: str, tags: list[str]) -> int | None:
        if self.mode == "api":
            res = await self._api("POST", "groups",
                                  {"name": name, "description": description, "tags": tags, "kind": "feed"})
            grp = res.get("group") if isinstance(res, dict) else None
            return grp.get("id") if isinstance(grp, dict) else None
        res = await self._rest("POST", "groups", body={
            "name": name.strip()[:80], "slug": slugify(name),
            "description": description[:600], "kind": "feed", "owner_id": self.user_id,
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
        count_rows = await self._rest("GET", "group_members", query=f"group_id=eq.{gid}&select=id")
        if isinstance(count_rows, list):
            await self._rest("PATCH", "groups", query=f"id=eq.{gid}",
                             body={"member_count": len(count_rows)}, prefer="return=minimal")
        await self._notify(group.get("owner_id", ""), "group_join", preview=f"joined {group.get('name', '')}")
        return True

    async def ensure_profile(self, *, username: str, full_name: str, bio: str) -> bool:
        if self.mode == "api":
            res = await self._api("POST", "profiles",
                                  {"username": username, "full_name": full_name, "bio": bio})
            if isinstance(res, dict) and not res.get("__error__"):
                self._profiles_me = res
                return True
            # fall through to direct
        rows = await self._rest("GET", "profiles", query=f"user_id=eq.{self.user_id}&select=id")
        if isinstance(rows, list) and rows:
            self._profiles_me = rows[0]
            return True
        res = await self._rest("POST", "profiles", body={
            "user_id": self.user_id, "username": username, "full_name": full_name, "bio": bio,
        })
        ok = isinstance(res, list) and bool(res)
        if ok:
            self._profiles_me = res[0]
        return ok
