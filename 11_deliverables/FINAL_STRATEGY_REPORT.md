# NQ Strategy — Final Consolidated Report (v1, 2026-06-18)

End-to-end findings from rebuilding the system on 7 years of real 1-minute NQ data
(2019-06-20 → 2026-06-17, 2.44M bars). Supersedes the earlier ICT v0.6 claims.

---

## TL;DR
- The original **ICT retracement strategy was overfit** — it failed walk-forward on 7-year data (OOS −0.09R) despite looking "validated" on a cherry-friendly 3-year window.
- A from-scratch primitive scan found the real edge: **P5 — prior-day RTH high/low breakout** (the testable liquidity core of ICT). Robust 8/8 years, OOS-validated, slippage-insensitive. **This is the deployable core.**
- A second, **negatively-correlated** edge — an intraday **mean-reversion sleeve** — diversifies P5: blending the two raises annualized Sharpe **1.66 → 2.13** and cuts funded median time-to-pass **~5.7mo → ~4.0mo at the same pass/ruin**. It holds out-of-sample (regime-complementary to P5). **It is only viable with LIMIT-order execution** (market orders kill it via slippage).
- Everything else credible **failed** on recent NQ: Market Intraday Momentum, conditional MIM, VWAP reversion, gap-fade. Recent NQ is efficient against simple intraday signals.

## The deployable system
| Component | File | Role |
|---|---|---|
| P5 breakout (base) | `08_pine/NQ_PDHL_breakout_v1_0.pine` | Robust core. 1×ATR stop (0.75 for eval), hold-to-RTH-close, flat overnight. |
| **P5 + CVD (best)** | `08_pine/NQ_PDHL_breakout_v1_1_CVD.pine` | Core + order-flow confirmation. **Use this** — same core, safer (see below). |
| **Reversion sleeve** | `08_pine/NQ_MeanReversion_v1_0.pine` | Diversifier. SMA(20) band-fade, **limit entries**, 0.5×ATR stop, target=mean, flat by close. |

### Order-flow extension (CVD) — investigated, NOT confirmed
TradingView Pine v6 exposes order flow via `ta.requestVolumeDelta()`/CVD. Requiring the breakout to be backed by
**aligned session CVD** looked promising on a crude 5-min close-location delta proxy (P5 expR +0.52→+0.67R). **But a
robustness check with a finer 1-min-aggregated delta proxy (closer to true volume delta) erased most of the gain
(+0.55R, ~+0.03R over baseline — noise) — so the improvement was largely a proxy artifact.** CVD confirmation is
therefore **marginal and UNPROVEN**, not a verified edge; the earlier "Sharpe 2.20 / 4.9% ruin" figure was optimistic.
- **Verified deployable system stays: P5 (no CVD) + limit-reversion sleeve** — ann Sharpe ~2.1 (market-fill) to ~2.6 (limit-fill), ~94% pass, ~5–8% ruin, ~4mo median.

### Allocation (hedge-fund optimization pass, 2026-06-21)
Tested risk parity, tactical regime allocation, Kelly (`04_backtests/engine/regime_alloc.js`):
- **Risk-parity weighting is the one win: size the reversion sleeve at ~0.7× the breakout risk** (equal vol contribution) → Sharpe 2.59→2.65, net +18%. Adopt ~0.7× instead of 0.5×.
- **Regime-timing FAILS** (ER-tilt 2.41, hard switch 1.42 — both below static). Don't time regimes.
- **Kelly informational only** — funded sizing is drawdown-constrained; the $/R sizing already derived is the binding optimization.
- `08_pine/NQ_PDHL_breakout_v1_1_CVD.pine` keeps CVD as a TOGGLE (default on) for live evaluation only: the forward
  logger captures the `cvd` value per trade, so the CVD question can be settled with **true** order-flow data in forward-testing.

## Funded-account economics (50k, Apex-style locking trailing DD)
- **Passing the eval:** P5 0.75/am @ ~$50/R ≈ 1 MNQ → ~93% pass, but median ~5.7 months. The blend → ~4.0 months at the same safety. Sizing up ($75/R) → ~2.3 months at ~82%. Sub-30-day passing is only ~27–31%/attempt (use multiple accounts).
- **Funded phase (risk-matched):** the blend earns ~25% more per account than P5 at equal daily-vol, with a higher downside floor. ~$4–6k realized/account/year at survivable size; ~80% survive the year at conservative sizing.
- **Multi-account income:** scales ~linearly (~$5–6k/account/yr); ~$50–60k/yr needs ~10 accounts. Copy-trading = correlated (no cross-account diversification); decorrelate (stagger starts / split P5 vs reversion across accounts) to smooth the book.
- **Hard truths:** modest per-account income with a hard ceiling (sizing up trades income for account death); frequent down months (1-in-4 to 1-in-3); the 30% consistency rule (payouts) penalizes lumpy P5 — the smoother blend helps.

## Verification status (what's proven vs assumed)
- ✅ P5: robust across params, 8/8 positive years, OOS +0.21R, slippage-insensitive.
- ✅ Reversion sleeve: −0.22 corr with P5, OOS Sharpe rose (regime-complementary), 8/8 years with limit entries.
- ⚠️ Limit-fill model is OPTIMISTIC (fills on touch) → reversion +0.119R is an upper bound; true value between market (+0.056) and limit (+0.119).
- ⚠️ #1 real risk = **alpha decay** — all of this is backtest/simulation. **Forward-test both strategies on a sim/eval account before real capital.**

## Tooling built (all in `04_backtests/engine/`)
`primitive_scan.js` (edge discovery) · `p5_harden.js` (robustness+funded gate) · `p5_optimize.js` (eval-pass optimizer) · `p5_timetopass.js` · `portfolio_sim.js` (blend Sharpe + time-to-pass) · `funded_phase.js` / `funded_multi.js` (post-funding economics) · `blend_oos.js` (OOS validation) · `slippage_stress.js` · `limit_fill_test.js` · `mim_test.js` / `mim_cond.js` / `reversion_test.js` / `vwap_test.js` (candidate tests) · `utc_to_et.js` (DST-correct re-encode). Iteration log: `01_research/FUNDED_SPEED_RESEARCH.md`.

## Recommended next steps (beyond research)
1. Forward-test P5 and the reversion sleeve on a sim/eval account (MNQ, 5m) — confirm live fills match assumptions (esp. reversion limit fills).
2. Run as a decorrelated multi-account book at conservative size if/when forward results hold.
3. Re-verify your prop firm's current rule numbers before any real evaluation.

**Disclaimer:** research/education only; not financial advice. A backtested edge is not a guarantee of future results.
