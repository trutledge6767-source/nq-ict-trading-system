# Validation Report — Real NQ Data (2022-12-26 → 2025-12-11)

Data: `Dataset_NQ_1min_2022_2025.csv` (Eastern time) → 1,048,575 1m bars → 210,516 5m bars (~3 yrs).
Engine: non-repainting offline backtest. Timezone handled as ET wall-clock (DST-robust, tz_offset=0).
This is the FIRST statistically meaningful validation. All numbers below are out-of-sample where stated.

## Headline finding (honest)
**As objectively coded, the ICT confluence does NOT show a tradeable edge on NQ 5m.** No configuration
combines a real edge with acceptable funded-account survivability. Details:

### 1. The full A+ filter stack is untradeable (3 trades in 3 years)
| Config | Trades (3yr) | PF | expR | maxDD(R) |
|---|---|---|---|---|
| baseline (all filters on) | **3** | 0.99 | -0.01 | -2.0 |
| no-fib | 250 | 1.00 | 0.00 | -14.4 |
| raw-MSS-only | 1690 | 0.94 | -0.04 | -105 |
| sweep+fvg (no KZ/bias/fib) | 877 | 1.07 | +0.05 | -27.9 |

Root cause (real-data discovery): the strategy enters at the **MSS breakout close**, which sits at the
**premium** end of the dealing range — but the fib filter requires **discount** for longs. The two
conditions are near-contradictory, so the full stack almost never fires. Removing fib: 3 → 250 trades.
=> The entry MODEL is mis-timed: ICT intends entry on the **retracement into the FVG** (a discount pullback
after the MSS), not at the breakout itself. The current at-breakout entry cannot use the fib filter.

### 2. Walk-forward (out-of-sample) on the only configs that trade enough
| Config | WF verdict | OOS trades | IS expR | OOS expR | degradation | MC funded-pass | MC verdict |
|---|---|---|---|---|---|---|---|
| sweep+fvg (raw) | **OVERFIT/FAIL** | 286 | 0.176 | -0.006 | 0.182 | 0.24 | FRAGILE |
| sweep+fvg + partial/BE | ROBUST* | 301 | 0.102 | 0.050 | 0.052 | 0.25 | FRAGILE |

*The partial-profit+BE risk layer (validated earlier) DOES stabilize the curve enough to pass the
walk-forward degradation gate — but the underlying signal edge is too thin (PF ~1.05, OOS expR +0.05R)
for it to matter: Monte Carlo rates funded survivability **FRAGILE (25% pass, 65% ruin)**.

## Conclusion (per mission: data over popularity)
- The popular ICT "sweep → MSS → FVG → discount" confluence, coded literally as an at-breakout entry,
  has **no exploitable edge** on 3 years of NQ 5m. This is a valid, data-backed REJECTION — exactly the
  outcome the mission demanded testing for, rather than assuming the concept works.
- The partial-profit + breakeven RISK management is genuinely robust (it survived walk-forward), but
  risk management cannot manufacture an edge that isn't in the signal.

## Highest-value next hypothesis (to test next, not assumed)
**Retracement entry model (v0.6):** after a confirmed MSS displacement, do NOT enter at the breakout.
Instead arm a limit entry at the FVG created by the displacement; fill only if price retraces into it
(which places entry in discount, making the fib filter consistent). This is the canonical ICT 2022
model and directly addresses the premium/discount contradiction found above. Test it the same way:
ablation → walk-forward → Monte Carlo; adopt only if OOS expectancy and funded-pass beat the baseline.

## Reproduce
```
node 04_backtests/engine/csv_to_data.js  <csv>  04_backtests/data/NQ_1m_full.json --tf 1 --tz 0
node 04_backtests/engine/resample.js     04_backtests/data/NQ_1m_full.json 04_backtests/data/NQ_5m_full.json 5
node 04_backtests/engine/run_matrix.js   04_backtests/data/NQ_5m_full.json
```
