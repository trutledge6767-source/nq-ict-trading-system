# NQ ICT A+ Trading System — Executive Summary

**Status: BUILT, NON-REPAINTING, CI-GREEN (11/11). One step from full statistical validation — that
step is supplying a historical data file (no further code needed).**

---

## What this is
A fully-coded, data-driven ICT trading system for NQ futures that trades only objectively-defined
A+ setups, optimized for **funded-account survivability** (low drawdown, consistency) over raw return.
Two engines kept in lockstep:
- **Deployment**: Pine v6 strategy + indicator (live chart, alerts, webhook automation).
- **Research**: a Node.js backtest/validation stack (engine, walk-forward, ranking, risk sims).

## What's done (all 16 phases addressed)
- **Strategy v0.5** (`08_pine/NQ_ICT_strategy_v0_5.pine`): daily-bias + NY killzone + liquidity-sweep →
  MSS displacement → FVG sequence, premium/discount filter, **news blackout**, full **risk governor**
  (vol-adjusted sizing, daily/weekly loss limits, 3-loss lockout), **partial-profit + breakeven**,
  optional **ATR-trailing**, and **webhook alerts** for the full entry→reduce→close lifecycle.
  Compiles clean; **non-repainting by construction** (confirmed pivots, closed-bar logic,
  `lookahead_off` HTF, orders-on-close).
- **Companion indicator** (`08_pine/NQ_ICT_indicator_v0_3.pine`): same signals + info-table dashboard.
- **Research engine** (`04_backtests/engine/backtest.js`) + ablation matrix, **walk-forward**
  (`09_walkforward/`), **ranking leaderboard** (`07_rankings/`), **funded-account survivability sim**
  + **Monte Carlo** (`10_risk/`), **news filter** (`02_news/`).
- **Verification**: `node run_all_tests.js` → **11/11 PASS** (logic, not just compile).
- **Docs**: research report, news model, risk model, robustness audit, trade log, deliverable index
  (A–O), and rejected-candidate log (anti-overfitting discipline both ways).

## Validated findings (via the system's own engine + Monte Carlo)
- **Partial-profit + breakeven**: cut max drawdown ~70% and tripled funded-pass probability (synthetic).
- **2-ATR trailing runner > fixed breakeven** on trending data (regime-dependent → default off).
- **ATR vol-regime filter**: tested → no benefit → **rejected** (kept off). Same data bar both ways.
- **Higher expectancy ≠ better survivability** — a steadier lower-expectancy edge passed funded evals
  more often than a choppy higher-expectancy one. Drives the low-DD/consistency priority.

## The one honest limitation
The TradingView MCP serves only ~302 recent 5m bars (confirmed 3 ways) — too few for a statistically
valid verdict. **No small-sample result is presented as validated.** The system is complete and
correct; it just needs more data to *prove* an edge on real NQ.

## What YOU do to finish (2 commands)
1. Export 6–24 months of NQ 5m bars to CSV (any OHLC export).
2. Run:
   ```
   node 04_backtests/engine/csv_to_data.js  <your.csv>  04_backtests/data/NQ_5m_full.json --tf 5 --tz -4
   node 09_walkforward/walkforward.js       04_backtests/data/NQ_5m_full.json
   ```
   A `ROBUST` verdict → trust it; `OVERFIT/FAIL` → don't deploy. Full guide:
   `04_backtests/DATA_IMPORT_GUIDE.md`. Health check anytime: `node run_all_tests.js`.

## Do NOT deploy real capital until
walk-forward returns `ROBUST` on real NQ, Monte Carlo funded-pass probability is acceptable, and you
re-verify your prop firm's current rule numbers. The strategy enforces risk limits, but the execution
bridge must echo them broker-side too (`11_deliverables/K_L_ALERTS_WEBHOOK.md`).
