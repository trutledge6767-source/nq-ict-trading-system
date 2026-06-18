# Validation — v0.6 Retracement Entry (REAL NQ 2022–2025, 210k 5m bars)

The 3-year validation found the at-breakout entry had no edge due to a premium/discount contradiction
(MSS breakout = premium, but fib filter wants discount). v0.6 fixes this with the canonical ICT 2022
**retracement entry**: after a confirmed MSS displacement, arm a limit at the displacement FVG and fill
ONLY if price pulls back INTO it (= discount). Fib is no longer gated at the breakout bar; the pullback
provides the discount structurally. Non-repainting: FVG bounds known at arming bar; fills checked on
later bars' high/low; no lookahead.

## Results on real NQ 5m (3 years)
| Config | Trades | Win% | PF | expR | MaxDD(R) | WF verdict | WF OOS expR (degr) | MC funded-pass |
|---|---|---|---|---|---|---|---|---|
| **RETRACE full ICT + partial/BE** ⭐ | 141 | 64 | **1.82** | **+0.30** | **-4.8** | **ROBUST** | +0.47 (0.082) | **0.85 STRONG** |
| RETRACE full ICT (no partial) | 141 | 44 | 1.53 | +0.30 | -8.3 | ROBUST | +0.89 (-0.144) | 0.64 STRONG |
| RETRACE no-KZ + partial/BE | 453 | 57 | 1.32 | +0.14 | -20.9 | ROBUST | +0.25 (0.002) | 0.53 MODERATE |
| RETRACE no-KZ,no-bias | 646 | 38 | 1.17 | +0.11 | -27.0 | ROBUST | +0.23 (0.092) | 0.38 FRAGILE |

vs the OLD at-breakout baseline: best config was FRAGILE (25% funded-pass), no edge.

## ADOPTED configuration (beats baseline on every axis — OOS expectancy AND funded-pass)
**Retracement entry + FULL ICT stack (killzone + daily bias + fib + sweep + FVG) + partial-profit/BE.**
Engine: `useRetrace:true, usePartial:true` with all filters on (defaults).
- PF 1.82, win 64%, expectancy +0.30R, max DD -4.8R over 3 years (141 trades, ~47/yr — A+ selective).
- Walk-forward ROBUST: OOS expectancy +0.47R, degradation 0.082 (no overfit).
- Monte Carlo STRONG-SURVIVABILITY: 85% funded-pass, 12% ruin.
- The killzone filter ADDS value here (no-KZ variants trade more but degrade to MODERATE/FRAGILE) —
  confirms quality-over-quantity / A+ selectivity.

## Honest caveats (do not over-trust)
- OOS walk-forward sample = 37 trades for the top config — meaningful but moderate; more years would
  raise confidence. Low frequency (~4 trades/month) means slow live statistical accumulation.
- Single instrument (NQ), single 3-yr window spanning a bear (2022) + bull (2023–25). Walk-forward
  across 5 folds mitigates regime dependence but cannot eliminate it.
- Backtest models commission + slippage; live LIMIT fills on retracement may differ (fast moves may
  skip the limit). Forward-test on a sim/funded eval before real capital.
- Re-verify on additional data / other index futures (ES) before scaling.

## Verdict
First VALIDATED A+ edge in the project. The research loop worked exactly as intended: the at-breakout
model was tested, REJECTED on data, the data revealed the cause, and the corrected retracement model was
built and independently validated (walk-forward + Monte Carlo) to a STRONG funded-survivability profile.
Next: port to Pine v0.6 for deployment; forward-test; consider ES confirmation.
