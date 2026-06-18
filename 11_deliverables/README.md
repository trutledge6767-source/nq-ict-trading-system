# NQ ICT A+ Trading System — Master Deliverable Index

A data-driven, non-repainting ICT system for NQ futures. Built and tested through an autonomous
research loop. Philosophy: **robustness, expectancy, low drawdown, and funded-account survivability
over historical returns.** Every claim is labeled with its sample size; nothing small-sample is
presented as validated.

## Deliverables map (A–O)
| # | Deliverable | Location | Status |
|---|---|---|---|
| A | Research Report (ICT concepts → objective defs) | `01_research/PHASE1_ICT_RESEARCH.md` | ✅ |
| B | ICT Concept Rankings (objectivity shortlist + hypotheses) | `01_research/PHASE1_ICT_RESEARCH.md` §6–7 | ✅ |
| C | News Impact Analysis | `02_news/NEWS_MODEL.md` | ✅ |
| D | Backtest Results | `04_backtests/results/`, `READING_NOTES.md` | ◐ data-ceiling limited |
| E | Validation Report | `09_walkforward/WALKFORWARD_NOTES.md` | ✅ (harness validated; awaits sample) |
| F | Trade Logs | `05_session_logs/SESSION_LOG_2026-06-17.md` | ✅ |
| G | Risk Analysis | `10_risk/RISK_MODEL.md` + `funded_eval.js` | ✅ |
| H | Final Strategy Rules | this file §"Strategy rules" + Pine source | ✅ |
| I | Pine Script Strategy | `08_pine/NQ_ICT_strategy_v0_5.pine` (current; v0.3/v0.4 retained) | ✅ compiles clean |
| J | Pine Script Indicator | `08_pine/NQ_ICT_indicator_v0_3.pine` | ✅ compiles clean |
| K | Alert Instructions | `11_deliverables/K_L_ALERTS_WEBHOOK.md` | ✅ |
| L | Webhook Automation | `11_deliverables/K_L_ALERTS_WEBHOOK.md` | ✅ |
| M | Funded-Account Optimization | `10_risk/RISK_MODEL.md` §3–5 | ✅ |
| N | Walk-Forward Results / Robustness | `11_deliverables/N_ROBUSTNESS_AUDIT.md`, `09_walkforward/` | ✅ |
| O | Improvement Recommendations | this file §"Next steps" | ✅ |

## Engine & tooling (the research stack)
- `04_backtests/engine/backtest.js` — non-repainting bar-by-bar backtest engine (mirrors Pine logic).
- `04_backtests/engine/run_matrix.js` — filter-ablation matrix runner.
- `09_walkforward/walkforward.js` — anti-overfitting train/test harness.
- `07_rankings/rank.js` — weighted leaderboard (40% PF / 25% DD / 20% win / 15% consistency).
- `02_news/news_filter.js` — event-blackout filter (now wired into the engine: useNews toggle).
- `10_risk/funded_eval.js` — funded survivability simulator. `10_risk/montecarlo.js` — bootstrap
  trade-sequence simulator (drawdown distribution + funded pass-probability).
- All have passing self-tests. Runtime: Node.js.

## Risk/optimization studies (engine + Monte Carlo validated)
- `10_risk/PARTIAL_PROFIT_STUDY.md` — partial-profit+BE cut DD ~70% & tripled funded-pass (synthetic);
  2-ATR trailing runner beat fixed BE on trending synthetic (regime-dependent, default OFF).
- `03_algo_rules/REJECTED_CANDIDATES.md` — ATR vol-regime filter TESTED and REJECTED (no benefit).
  Discipline: adopt only what data supports; reject what it doesn't.

## Strategy rules (final, v0.3 — A+ only)
ENTRY (long; short symmetric): in NY-AM killzone, HTF daily bias up, NOT in news blackout,
an MSS displacement EVENT (close crosses last confirmed swing high) occurs with a recent liquidity
sweep of lows AND a recent bullish FVG, while price is in discount (<50% of dealing range).
STOP: below the swing/sweep low − ATR buffer. TARGET: fixed R multiple (default 2R).
SIZING: fixed-fractional, volatility-adjusted, capped. GOVERNORS: ≤3 trades/day, daily 2R / weekly
4R loss limits, 3-consecutive-loss lockout. AUTOMATION: `alert()` JSON webhook on entry.

## How to run (research)
```
node 04_backtests/engine/run_matrix.js  04_backtests/data/NQ_5m.json     # ablation
node 09_walkforward/walkforward.js      04_backtests/data/NQ_5m.json     # walk-forward
node 10_risk/funded_eval.js             --selftest                       # survivability
node 07_rankings/rank.js                --selftest                       # leaderboard
```
Pine: open `08_pine/*.pine` in TradingView, add to chart, create a bar-close alert with webhook.

## Honest status (the one thing not yet done)
The SYSTEM is complete, non-repainting, and its anti-overfitting controls are demonstrated to work.
What remains is a **large enough real-NQ sample to earn a ROBUST walk-forward verdict** — blocked by
the MCP data ceiling (~302 bars 5m; `chart_scroll_to_date` is broken in this build). To finish
validation: supply deeper history (export NQ 1m/5m CSV for 6–24 months into `04_backtests/data/` in
the `[t,o,h,l,c]` format), then re-run the matrix + walk-forward; the leaderboard and H1–H4 verdicts
populate automatically.

## Next steps (O — improvement recommendations, priority order)
1. **Get data**: 6–24 months of NQ 5m (and 1m) bars → unlock real validation.
2. Validate H1–H4 (FVG edge, sweep-before-MSS, discount/premium filter, news blackout) via ablation
   + walk-forward; KEEP only filters with positive incremental OOS expectancy.
3. Add SMT divergence (NQ vs ES) and Silver-Bullet time-window variants as candidate modules; test
   each for incremental expectancy vs the v0.3 baseline — adopt only if they beat it OOS.
4. Tune RR / partial-profit policy against the funded trailing-DD simulator (reduce give-back).
5. Re-verify funded-firm rule numbers before any live evaluation.
