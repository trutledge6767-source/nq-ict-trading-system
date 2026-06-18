# Data Import Guide — Unlock Full Validation

The ONLY thing blocking statistical validation (real walk-forward verdict, leaderboard, H1–H4
accept/reject) is sample size. The TradingView MCP serves only ~302 recent 5m bars. Supplying a
deeper NQ history file unlocks every validation step automatically. This is turnkey.

## Step 1 — get NQ bars as CSV  (1-MINUTE ONLY — single source of truth)
Export continuous NQ futures (or CME_MINI:NQ1!) **1-minute** bars to CSV. ONE 1m file is all you need
— the resampler builds 5m/15m/1H from it deterministically. Good sources:
- TradingView: chart → right-click → Export chart data (Pro plans export more history).
- Barchart / Firstrate Data / NinjaTrader / your broker — any OHLC CSV works.
Recommended: 6–24 months of **1m** bars. More history = stronger verdict.

### One-file workflow (1m source → all timeframes)
```
node 04_backtests/engine/csv_to_data.js  <your_1m.csv>  04_backtests/data/NQ_1m_full.json --tf 1 --tz -4
node 04_backtests/engine/resample.js     04_backtests/data/NQ_1m_full.json  04_backtests/data/NQ_5m_full.json  5
node 04_backtests/engine/resample.js     04_backtests/data/NQ_1m_full.json  04_backtests/data/NQ_15m_full.json 15
```
Then validate on whichever timeframe (5m is the strategy's native TF; see Step 3).

CSV just needs columns (any order, case/spacing-insensitive):
`time, open, high, low, close` (volume optional, ignored). `time` may be unix seconds/ms or a
datetime like `2025-12-01 13:30:00`.

## Step 2 — convert to engine format (one command)
```
node 04_backtests/engine/csv_to_data.js  <your.csv>  04_backtests/data/NQ_5m_full.json  --tf 5 --tz -4
```
- `--tz -4` = ET offset used for session/killzone/news logic (use -5 for EST/winter, -4 for EDT/summer;
  if your CSV times are exchange-local already this is just the label the engine reasons with).
- `--tzcsv N` only if your CSV datetimes are in a LOCAL zone N hours from UTC and lack an offset.
The converter auto-detects columns, sorts oldest→newest, dedupes timestamps, and reports bar count + span.

## Step 3 — run the full validation suite
```
node 04_backtests/engine/run_matrix.js   04_backtests/data/NQ_5m_full.json     # ablation: which filters add edge
node 09_walkforward/walkforward.js       04_backtests/data/NQ_5m_full.json     # out-of-sample verdict (ROBUST/OVERFIT)
```
Then feed the per-config results into `07_rankings/rank.js` to populate the leaderboard, and pull the
chosen config's R-list into `10_risk/montecarlo.js` for the funded-account pass probability.

## Step 4 — interpret
- Walk-forward verdict must be `ROBUST` (OOS expectancy>0, IS→OOS degradation<0.3, ≥20 OOS trades)
  before trusting any config live. `OVERFIT/FAIL` => reject; do NOT deploy.
- Only filters with positive INCREMENTAL out-of-sample expectancy should stay enabled (H1–H4).
- Confirm the funded-account pass probability (montecarlo.js) and trailing-DD survival (funded_eval.js)
  before any live evaluation.

## Sanity check anytime
```
node run_all_tests.js      # 9/9 PASS = whole stack healthy
```

That's it — drop a CSV, run two commands, and the system goes from "built & non-repainting" to
"statistically validated on real NQ."
