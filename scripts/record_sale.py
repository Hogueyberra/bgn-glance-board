#!/usr/bin/env python3
"""Update live.json after a sale, then commit+push for GitHub Pages pollers.

Usage:
  python3 scripts/record_sale.py --player "Jahmyr Gibbs" --price 63 --winner nick
  python3 scripts/record_sale.py --player "Ja'Marr Chase" --price 51 --winner other
  python3 scripts/record_sale.py --tip "Room is soft on Maye — fight to 45"
  python3 scripts/record_sale.py --message "QB1 locked. Hunt RB1."
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "live.json"


def load() -> dict:
    return json.loads(LIVE.read_text(encoding="utf-8"))


def save(data: dict) -> None:
    data["updated_at"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    LIVE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def max_bid(cash: int, open_spots: int) -> int:
    return max(0, cash - (open_spots - 1))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--player")
    p.add_argument("--price", type=int)
    p.add_argument("--winner", choices=["nick", "other"], default="other")
    p.add_argument("--pos", default="")
    p.add_argument("--tip")
    p.add_argument("--message")
    p.add_argument("--push", action="store_true", help="git commit + push live.json")
    p.add_argument("--no-push", action="store_true")
    args = p.parse_args()

    data = load()
    nick = data.setdefault("nick", {"cash": 200, "spent": 0, "open_spots": 13, "roster": []})

    if args.tip:
        data.setdefault("tips", []).append(args.tip)
    if args.message:
        data["message"] = args.message

    if args.player is not None:
        if args.price is None:
            raise SystemExit("--price required with --player")
        sale = {
            "player": args.player,
            "price": args.price,
            "winner": args.winner,
            "mine": args.winner == "nick",
            "pos": args.pos,
            "at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        data.setdefault("sold", []).append(sale)
        if args.winner == "nick":
            nick["roster"] = list(nick.get("roster") or [])
            nick["roster"].append({"player": args.player, "pos": args.pos, "price": args.price})
            nick["spent"] = int(nick.get("spent") or 0) + args.price
            nick["cash"] = int(nick.get("cash") or 200) - args.price
            nick["open_spots"] = max(0, int(nick.get("open_spots") or 13) - 1)
        nick["max_bid"] = max_bid(int(nick["cash"]), int(nick["open_spots"]))
        data["nick"] = nick

    save(data)
    print(json.dumps(data["nick"], indent=2))
    print(f"wrote {LIVE}")

    do_push = args.push or (not args.no_push and args.player)
    if do_push and not args.no_push:
        subprocess.check_call(["git", "add", "live.json"], cwd=ROOT)
        msg = f"live: {args.player or 'update'} {args.price if args.price is not None else ''}".strip()
        subprocess.check_call(["git", "commit", "-m", msg], cwd=ROOT)
        subprocess.check_call(["git", "push"], cwd=ROOT)
        print("pushed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
