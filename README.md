# BGN Glance Board

Live auction glance board for **Bountygate Nation** (Nick).

- **Site:** GitHub Pages (this repo)
- **Static tiers:** `data/board.json`
- **Live state:** `live.json` (polled every 5s — no site rebuild needed for sales)

## Draft-night workflow

1. Laptop browser → Pages URL (glance + local “I won / Sold” buttons).
2. Phone → text Ball: `Gibbs 63 won` / `Chase 51 lost`.
3. Ball runs `scripts/record_sale.py` and pushes `live.json`; laptop updates within ~5s.

## Record a sale (Ball / Mac)

```bash
cd ~/Desktop/bgn-glance-board
python3 scripts/record_sale.py --player "Jahmyr Gibbs" --price 63 --winner nick --pos RB
python3 scripts/record_sale.py --player "Ja'Marr Chase" --price 51 --winner other
python3 scripts/record_sale.py --tip "Still need QB2 — Herbert under 30 is a buy"
```

Default commits + pushes `live.json`. Use `--no-push` to edit only.

## Local test

```bash
cd ~/Desktop/bgn-glance-board
python3 -m http.server 8765
# open http://127.0.0.1:8765
```
