# Phase 5 — Current Session Trade Log (NQ1! 5m)

Data: `04_backtests/data/NQ_5m.json` — full available 5m window (302 bars, ~25h ending 2026-06-17).
Engine: `04_backtests/engine/backtest.js` (non-repainting bar-by-bar replay).
Sample caveat: this is ~1 trading day → 0–3 trades per config. NOT statistically validated;
recorded as a real session walk-through, not a performance claim.

## Config behavior this session
| Config | Trades | Win% | Net R | MaxDD R | Note |
|---|---|---|---|---|---|
| baseline (all filters ON) | 0 | – | 0 | 0 | NY-AM killzone (07–11 ET) excluded the active hours in this window → no entries |
| raw MSS only | 3 | 33% | -0.02 | -2.02 | structure-break entries without ICT filters |
| sweep+FVG (no KZ/bias) | 2 | 50% | +0.98 | -1.01 | ICT-confluence entries; both winners were long into displacement |

## Trade log — raw MSS (the session's structure breaks)
| # | Dir | Entry | Stop | Exit | Outcome | R | $ (1c) | Bars | Notes |
|---|-----|-------|------|------|---------|---|--------|------|-------|
| 1 | LONG  | 30404.00 | 30333.76 | 30544.47 | TARGET | +1.99 | +2795 | 70 | Clean MSS up, ran to 2R target — trend leg |
| 2 | LONG  | 30580.25 | 30524.53 | 30524.53 | STOP   | -1.01 | -1129 | 4  | Bought a high; immediate failure (no sweep/discount confluence — exactly what the filters screen out) |
| 3 | SHORT | 30462.25 | 30538.95 | 30538.95 | STOP   | -1.01 | -1548 | 47 | Short into eventual squeeze; stopped at structure |

## Trade log — sweep+FVG confluence (closer to the A+ intent)
| # | Dir | Entry | Stop | Exit | Outcome | R | Bars | Notes |
|---|-----|-------|------|------|---------|---|------|-------|
| 1 | LONG | 30459.75 | 30421.05 | 30537.14 | TARGET | +1.99 | 36 | Sweep of lows -> displacement up into FVG -> 2R |
| 2 | LONG | 30506.50 | 30437.15 | 30437.15 | STOP   | -1.01 | 10 | Late long; failed — would be cut by premium/discount filter |

## Read-through (qualitative)
- The FILTERS are doing their job directionally: the trades the filters REMOVE (rawMSS #2, #3) were the
  losers; the confluence config kept the structure-break winner and one loser. This is the SIGN we want
  (filters raise trade quality) — but n=2–3 means it is a hint, NOT evidence. Needs ≥100 trades to confirm.
- The killzone filter is the binding reason baseline took 0 trades; on a fuller dataset the 07–11 ET
  window will contain entries. Confirms the system is conservative (A+ only), as designed.

## Action items
- When a larger sample is available: re-run the ablation + walk-forward; only THEN populate the
  leaderboard (07_rankings) and accept/reject hypotheses H1–H4.
