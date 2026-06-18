# NQ ICT Algorithmic Trading System

A data-driven, non-repainting **ICT trading system for NQ futures** — built and validated through an
autonomous research loop. It trades only objectively-defined A+ setups and is optimized for
**funded-account survivability** (low drawdown, consistency) over raw return.

> **Every claim here is backed by walk-forward + Monte Carlo on 3 years of real NQ 5m data.**
> Nothing is assumed because it's "a popular ICT concept" — concepts were coded, tested, and kept or
> rejected on the data.

## Headline result (validated on real NQ, 2022–2025, 210k 5m bars)
The original **at-breakout** entry had **no edge** (3 trades in 3 years; best variant 25% funded-pass).
Backtesting revealed why — and the fix (canonical ICT **retracement entry into the displacement FVG**)
produced the project's first validated edge:

| Configuration | Trades (3yr) | Win% | PF | Expectancy | MaxDD | Walk-forward | Monte Carlo funded-pass |
|---|---|---|---|---|---|---|---|
| At-breakout (rejected) | 3 | – | ~1.0 | ~0 | – | OVERFIT/FAIL | 25% (FRAGILE) |
| **Retracement + full ICT + partial/BE** | **141** | **64%** | **1.82** | **+0.30R** | **−4.8R** | **ROBUST** (OOS +0.47R, degr 0.082) | **85% (STRONG)** |

See `06_validation/VALIDATION_v0_6_RETRACEMENT.md` for the full write-up and honest caveats.

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
