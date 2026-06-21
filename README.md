# NQ ICT Algorithmic Trading System

A data-driven, non-repainting **ICT trading system for NQ futures** — built and validated through an
autonomous research loop. It trades only objectively-defined A+ setups and is optimized for
**funded-account survivability** (low drawdown, consistency) over raw return.

> **Every claim here is backed by walk-forward + Monte Carlo on 3 years of real NQ 5m data.**
> Nothing is assumed because it's "a popular ICT concept" — concepts were coded, tested, and kept or
> rejected on the data.

## Headline result (revalidated on real NQ, 2019–2026, 2.44M 1m bars)
> **UPDATE (2026-06-18):** Re-tested on 7 years of real data, the **ICT retracement strategy failed
> walk-forward (OVERFIT/FAIL, OOS −0.09R)** — its earlier "85% / ROBUST" was a small-window artifact.
> A from-scratch rebuild found the real, robust edge. See **`11_deliverables/FINAL_STRATEGY_REPORT.md`**
> (full arc) and **`01_research/FUNDED_SPEED_RESEARCH.md`** (iteration log).

| Strategy | Trades (7yr) | Win% | PF | Expectancy | +years | Verdict |
|---|---|---|---|---|---|---|
| ICT retracement (retired) | 261 | 57% | 1.31 | +0.13R | – | **OVERFIT/FAIL (OOS −0.09R)** |
| **P5 — prior-day H/L breakout** | **1519** | 20% | 1.4 | **+0.33R** | **8/8** | **ROBUST (OOS +0.21R), slippage-insensitive** |
| + Mean-reversion sleeve (limit entries) | — | — | — | −0.22 corr w/ P5 | 8/8 | **blend Sharpe 1.66→2.13; OOS-verified** |

Deployable Pine: `08_pine/NQ_PDHL_breakout_v1_0.pine` (core) + `08_pine/NQ_MeanReversion_v1_0.pine` (diversifier).

## What's inside
- **Pine v6 deployment** (`08_pine/`): strategy (killzone + daily bias + liquidity sweep → MSS → FVG
  retracement, news blackout, risk governor, partial-profit/BE, optional ATR-trail, webhook alerts) +
  companion indicator. Non-repainting; all compile clean.
- **Node research engine** (`04_backtests/engine/`): non-repainting backtester, ablation matrix, CSV
  importer + 1m→Nm resampler.
- **Validation** (`09_walkforward/`, `10_risk/`, `07_rankings/`): walk-forward harness, funded-account
  survivability + Monte Carlo simulators, weighted leaderboard.
- **Filters / models** (`02_news/`, `03_algo_rules/`): news blackout, rejected-candidate log.
- **Docs** (`01_research/`, `06_validation/`, `11_deliverables/`): research report, validation reports,
  risk model, robustness audit, alerts/webhook guide, deliverable index.
- **CI**: `node run_all_tests.js` → **14/14 PASS** (logic, not just compile).

## Quick start (validate from scratch)
```bash
node run_all_tests.js                                   # 14/14 green
# import your own NQ data (1-minute CSV is the single source of truth):
node 04_backtests/engine/csv_to_data.js  your_1m.csv  04_backtests/data/NQ_1m_full.json --tf 1 --tz 0
node 04_backtests/engine/resample.js     04_backtests/data/NQ_1m_full.json 04_backtests/data/NQ_5m_full.json 5
node 04_backtests/engine/run_matrix.js   04_backtests/data/NQ_5m_full.json     # ablation
node 09_walkforward/walkforward.js       04_backtests/data/NQ_5m_full.json     # OOS verdict
```
`NQ_5m_full.json` (3-yr validation set) ships in the repo, so results reproduce out of the box.
Full guide: `04_backtests/DATA_IMPORT_GUIDE.md`. Executive overview: `FINAL_SUMMARY.md`.

## ⚠️ Disclaimer
For research and education. Not financial advice. A backtested edge is not a guarantee of future
results — forward-test on a simulator/funded evaluation and re-verify your prop firm's current rules
before risking real capital.
