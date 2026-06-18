# Partial-Profit + Breakeven Study (Phase 9/12 — risk optimization)

Question: does banking 50% at +1R and moving the remainder to breakeven improve funded-account
survivability vs running the full position to a 2R target?

Method: engine (`backtest.js`, usePartial flag) on a synthetic zigzag series (6000 bars, raw-MSS,
filters off) to get a large trade sample, then Monte Carlo (`montecarlo.js`, 20k paths, 60 trades,
ruin=6R, target=9R). Synthetic data => MECHANISM test, not an NQ performance claim.

## Result
| Metric | Full-target 2R | Partial 50%@1R + BE |
|---|---|---|
| Trades | 147 | 150 |
| Win rate | 28.6% | **52.0%** |
| Expectancy (R) | -0.15 | **+0.05** |
| Max drawdown (R) | -32.1 | **-9.2** |
| Max losing streak | 9 | **4** |
| MC prob ruin-before-target | 0.91 | **0.60** |
| MC prob pass-funded | 0.09 | **0.30** |

## Conclusion
Partial-profit + breakeven cut max drawdown ~70%, halved the worst losing streak, and TRIPLED
funded-pass probability — even on a NO-EDGE random series. The improvement is STRUCTURAL (less
give-back, faster risk-off), not data-mined. It does NOT create edge (both remain FRAGILE on noise),
but it materially improves SURVIVABILITY of whatever edge exists.

## Runner exit: fixed-BE vs ATR-trailing (follow-up, same synthetic series)
| Runner exit (after 50% partial @ +1R) | expR | MaxDD R | MC pass-funded | verdict |
|---|---|---|---|---|
| fixed breakeven + 2R target | 0.05 | -9.2 | 0.30 | FRAGILE |
| **ATR trail 2.0x (no fixed target)** | **0.14** | **-8.5** | **0.51** | **MODERATE** |
| ATR trail 3.0x | 0.05 | -9.8 | 0.32 | FRAGILE |

Finding: a 2-ATR trailing runner beats fixed BE (~3x expectancy, pass 30%->51%); 3-ATR is too
loose. The OPTIMUM at 2x (non-monotonic) argues against overfitting. CAVEAT: synthetic data here is
TRENDING (zigzag legs) which favors trailing; on choppy/mean-reverting real NQ a fixed BE+target may
do better. => trailing is a PROMISING CANDIDATE, NOT an automatic default. Confirm on real-NQ
walk-forward (engine: useTrail=true, trailAtrMlt=2.0) before adopting.

## Decision
- Adopt partial-profit + breakeven as the DEFAULT risk preset (engine: usePartial=true,
  partialFrac=0.5, partialAtR=1.0). This is the production-recommended config -> Pine v0.4.
- Caveat: validate on REAL NQ once deep data exists; the survivability mechanism is robust but the
  exact partialFrac/partialAtR should be re-tuned (Phase 9) against real trade distribution + the
  trailing-DD simulator, avoiding overfitting (test on walk-forward OOS).
