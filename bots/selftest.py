"""End-to-end harness check: one probe bot walks every pipeline and then
unweaves its test artifacts, so the corpus stays clean.

Run:  python -m bots selftest
"""
from __future__ import annotations

import time

import state
from api import Loom
from personas import make_persona
from config import C

CHECKS: list[tuple[str, bool]] = []


def note(name: str, ok: bool) -> None:
    CHECKS.append((name, ok))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")


async def run() -> bool:
    print(f"[selftest] mode={C.MODE} db={C.SUPABASE_URL} app={C.APP_URL or '(direct lane)'}")
    state.init()
    p = make_persona(900001, C.BOT_DOMAIN, C.BOT_PASSWORD_SEED)  # fixed probe persona
    loom = Loom()

    ok = await loom.ensure_session(p.email, p.password)
    note("signup/login → live session", ok)
    if not ok:
        return False

    profiled = await loom.ensure_profile(
        username=p.username, full_name="Probe Weaver", bio="harness self-test · (sim)")
    note("profile upsert", profiled)

    feed = await loom.feed(limit=6)
    note("feed browse", len(feed) > 0)

    forge = await loom.feed(kind="forge", limit=5)
    note("forge browse", isinstance(forge, list))

    hits = await loom.search("chai")
    note("search stroll 'chai'", len(hits) > 0)

    if feed:
        target = feed[0]
        pid0 = target["id"]
        author = target.get("author_id", "")
        await loom.like(target)
        note(f"like post #{pid0}", await loom.liked_before(pid0))
        await loom.comment(target, "Self-test braid — the loom holds. (unweaving in a breath)")
        crow = await loom._rest("GET", "comments",
                                query=f"post_id=eq.{pid0}&user_id=eq.{loom.user_id}&select=id")
        comment_ok = isinstance(crow, list) and bool(crow)
        note("comment with persona body", comment_ok)
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
        content_md=(
            "## A probe at dawn\n\n"
            "This scroll exists only to prove that a weaver can sit, think in markdown, "
            "and publish through the forge pipeline.\\n\\n"
            "- like\n- comment\n- save\n- follow\n- publish\n\n"
            "It will be deleted by the same harness that wrote it."
        ),
        tags=["selftest", "loom"],
    )
    note("forge publish", pid is not None)

    gid = await loom.create_circle(
        name="Harness Proving Ground",
        description="A circle raised by the self-test; swept away before the gong.",
        tags=["selftest"],
    )
    note("circle create", gid is not None)

    # ---- sweep up (the probe leaves no footprints) ----
    if feed:
        target = feed[0]
        pid0, author = target["id"], target.get("author_id", "")
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
        res = await loom._rest("DELETE", "posts", query=f"id=eq.{pid}", prefer="return=minimal")
        note("forge scroll unwoven (deleted)", res is True)
    if gid:
        await loom._rest("DELETE", "group_members", query=f"group_id=eq.{gid}", prefer="return=minimal")
        res = await loom._rest("DELETE", "groups", query=f"id=eq.{gid}", prefer="return=minimal")
        note("circle dissolved (deleted)", res is True)

    print()
    failed = [n for n, ok in CHECKS if not ok]
    print(f"[selftest] {len(CHECKS) - len(failed)}/{len(CHECKS)} passed"
          + (f" — failing: {failed}" if failed else ""))
    return not failed
