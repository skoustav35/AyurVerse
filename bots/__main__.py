"""CLI — python -m bots <command>

  provision  create N bot accounts (+ profiles), resumable
  live       run the society for N hours (default 24)
  report     lifetime ledger from the local state DB
  selftest   one bot across every pipeline; cleans up after itself
"""
from __future__ import annotations

import argparse
import asyncio
import sys


def main() -> None:
    ap = argparse.ArgumentParser(prog="bots", description="AyurVerse society harness")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_prov = sub.add_parser("provision", help="create bot accounts")
    p_prov.add_argument("--count", type=int, default=None)

    p_live = sub.add_parser("live", help="run the society")
    p_live.add_argument("--hours", type=float, default=24.0)
    p_live.add_argument("--bots", type=int, default=None)

    sub.add_parser("report", help="lifetime ledger")
    sub.add_parser("selftest", help="one bot, every pipeline, cleaned up")

    args = ap.parse_args()

    if args.cmd == "provision":
        from config import C
        import society

        asyncio.run(society.provision(args.count or C.BOT_COUNT, C.BOT_DOMAIN, C.BOT_PASSWORD_SEED))
    elif args.cmd == "live":
        from config import C
        import society

        asyncio.run(society.live(args.hours, args.bots or C.BOT_COUNT))
    elif args.cmd == "report":
        import state
        import json

        state.init()
        print(json.dumps(state.totals(), indent=2))
    elif args.cmd == "selftest":
        from selftest import run

        ok = asyncio.run(run())
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
