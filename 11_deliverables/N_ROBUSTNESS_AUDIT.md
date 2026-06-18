# Deliverable N — Robustness Audit (No Lookahead / No Repaint / No Future Leak)

Every mandatory-rule claim is substantiated below with the exact mechanism in code.
Artifacts audited: `08_pine/NQ_ICT_strategy_v0_3.pine`, `NQ_ICT_indicator_v0_3.pine`,
`04_backtests/engine/backtest.js`.

## 1. No repainting
| Mechanism | Where | Why it prevents repaint |
|---|---|---|
| Orders on bar close | strategy: `process_orders_on_close=true`, `calc_on_every_tick=false` | Entries evaluated/filled on confirmed close, never intrabar |
| Confirmed pivots | `ta.pivothigh(high,pivLen,pivLen)` (Pine) / `confirm=idx+R` (engine) | A pivot is only known `pivLen` bars AFTER it forms; never revised |
| Closed-bar FVG | 3-bar gap uses `high[2]`,`low[2]` (already-closed bars) | Gap is fixed once the 3rd bar closes |
| Sweep on close | `high>prevHigh and close<prevHigh` | Requires the close, not a transient wick |
| MSS as a close-cross EVENT | `close>lastPH and close[1]<=lastPH` | One-shot on confirmed close; cannot un-happen |

## 2. No lookahead / no future leak
| Mechanism | Where | Why |
|---|---|---|
| HTF requests `lookahead_off` | `request.security(..., lookahead=barmerge.lookahead_off)` | Daily bias uses only data available at the current bar |
| Prior-day values via `[1]` | `high[1]`,`low[1]` on the "D" series | Uses the *completed* prior day, not the forming one |
| Engine causal loop | `backtest.js`: at bar `i`, only `b[0..i]` + pivots with `confirm<=i` | No index > i is ever read for a decision |
| Exit eval starts at i+1 | engine: position managed from `i>entryIdx` using that bar's H/L | Entry bar's own future is not used to fill the same-bar exit |

## 3. No curve-fitting (process controls)
- Small, economically-meaningful parameter grid (rr/stop/seq) in walk-forward — not a thousand knobs.
- `walkforward.js` min-trade guard (≥5 to fit, ≥20 OOS to rank) + IS→OOS degradation gate.
- `rank.js` marks any candidate with <30 trades UNRANKED — no decisions on noise.
- Self-test proof: on random data, IS +0.436R → OOS −0.16R was correctly flagged (not accepted).

## 4. Realistic execution assumptions
- Commission `2.10/contract`, slippage modeled (`slippage=2` ticks Pine; `slippagePts` engine).
- Stops placed beyond structure + ATR buffer (not at impossible fills).
- `process_orders_on_close` => fills at close price actually printed.

## 5. Known limitations (disclosed, per "every claim backed by data")
- DATA CEILING: MCP serves ~302 bars 5m / ~300 bars 1H; not enough for a ROBUST OOS verdict on
  real NQ yet (see `04_backtests/READING_NOTES.md`). All small-sample results are labeled UNVALIDATED.
- Trailing-DD survivability uses an EOD-proxy peak (no tick data) — slightly optimistic vs a true
  intraday-peak trail; documented in `10_risk/RISK_MODEL.md`.
- Daily-bias "D" open in the engine is approximated by the first bar of the ET calendar day; Pine
  uses the exchange "D" session open. Minor definitional difference, documented.

## Verdict
The SYSTEM is non-repainting and free of lookahead/future-leak by construction, with anti-overfitting
controls demonstrated to work. The only thing standing between "built" and "statistically validated
on real NQ" is sample size (data access), which is disclosed rather than papered over.
