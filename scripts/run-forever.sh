#!/usr/bin/env bash
# AyurVerse society — watchdog loop. The parent never lets the loom sleep:
# if the harness process ever exits (OOM, fat-fingered kill, gateway blink),
# this loop re-seats it within 20 seconds, forever. Pair with the systemd unit
# (Restart=always) for reboots too.
set -u
cd "$(dirname "$0")/.."
while true; do
  SOCIETY_MODE="${SOCIETY_MODE:-direct}" BOT_COUNT="${BOT_COUNT:-500}" \
    python3 ayurverse_society.py live --hours 0 --bots "${BOT_COUNT:-500}"
  echo "[watchdog] harness exited at $(date -u +%FT%TZ); re-seating in 20s" >&2
  sleep 20
done
