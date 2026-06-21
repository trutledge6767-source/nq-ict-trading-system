# Funded-Speed Research Log

**Problem:** P5 (prior-day H/L breakout) passes 50k funded evals ~93% but takes ~5.7mo (median) at safe $50/R sizing; speeding up (size ↑) trades pass-probability + blow-up risk. Goal: raise the strategy's **Sharpe/consistency** (true driver of fast *and* safe target-before-DD passing) via verified, data-confirmed methods. Don't accept a method until it's tested on `NQ_5m_7y_ET.json` and holds.

Key framing (from prop-eval + first-passage literature): passing a target-before-trailing-DD eval is a first-passage problem; P(pass) and speed are governed by the equity curve's **Sharpe (drift/vol)**, not raw expectancy. P5 per-trade Sharpe ≈ 0.12 — low. Levers: (a) add uncorrelated positive edges, (b) volatility-target sizing (Moreira-Muir 2017; Harvey et al. 2018 — Sharpe +0.08–0.11 on equities), (c) regime filters.

## Iteration 1 (2026-06-18)
**Tested: Market Intraday Momentum** (Gao, Han, Li, Zhou, JFE 2018 — first 30-min return predicts last 30-min; SPY 1993-2013, 11 markets).
- NQ 2019-2026, last-30min trade in dir of first-30min, 1xATR stop: **expR −0.053, 3/8 yrs, PF 0.92 → FAIL.** Reversion variant also negative (−0.011, 4/8).
- **Verdict: classic MIM does NOT survive on recent NQ.** Honest negative.
- **Useful:** MIM daily-R correlation with P5 = **−0.014** (uncorrelated). Diversification framework valid; need an uncorrelated *positive* edge.

### Queued for next iterations
1. ~~Conditional MIM~~ DONE (iter 2) — directionally real but too weak.
2. Volatility-targeted sizing on P5 → measure effect on time-to-pass distribution. **[TOP PRIORITY — improves existing P5 Sharpe without a 2nd strategy]**
3. Re-import `NQ_1min_7y.csv` WITH volume (currently dropped) → unlock VWAP-reversion & volume-confirmed edges.
4. Lit: intraday VWAP reversion, futures intraday time-series momentum, Kelly/optimal-f under drawdown constraint, e-mini NQ intraday seasonality.

## Iteration 2 (2026-06-18) — Conditional MIM
Tested conditioning MIM on first-move magnitude + high-vol regime (paper says edge concentrates there).
- Best: **|r1|>1.0ATR & vol-top30%** → expR +0.029, PF 1.05, 6/8 yrs, but only 427 trades, Sharpe 0.018, 2021=−23R.
- **Mechanism directionally CONFIRMED** (filtering flipped −0.053R → +0.029R) but **too weak/fragile to deploy**; filtering also raised P5 correlation to 0.05. NOT a keeper.
- Takeaway: simple intraday-timing momentum is largely arbitraged out of recent NQ. Pivot effort to (a) vol-targeted sizing on P5, (b) volume-based edges (VWAP).

## Iteration 3 (2026-06-18) — Intraday ATR-band mean reversion
Loop redirected: "run through every viable strategy from credited resources." Tested intraday band-fade (SMA20, fade >k*ATR, stop 0.5/1.0 ATR, target=mean, maxBars15, flat-by-close).
- Best: **fade>2.0ATR, stop0.5ATR** → expR +0.056, PF 1.064, 6/8 yrs, Sharpe 0.024, 10.5k trades.
- **Tight 0.5ATR stop is mandatory** — 1.0ATR stop → negative every year (0/8) (trend-day tail risk).
- **Standalone marginal/weak** (not a keeper alone), BUT **daily-R correlation with P5 = −0.25 (negative!)** — the first genuine diversifier found.
- **NEXT (decisive): P5 + reversion portfolio sim** — does the negative correlation raise combined Sharpe & cut time-to-pass vs P5 alone? This is the real test of the diversification thesis.
- Source: practitioner/Bollinger-MR recipe (DayTrading.com; FMZ) — "high win rate, smoother equity than trend; tail risk on trend days." Confirmed the tail-risk warning empirically.

## Iteration 4 (2026-06-18) — P5 + Reversion PORTFOLIO sim  ✅ FIRST VERIFIED WIN
`04_backtests/engine/portfolio_sim.js`. Daily-R streams: P5 Sharpe/day 0.104 (ann 1.66), Rev 0.059 (ann 0.94), **corr −0.223**.
- **Sharpe-optimal blend = P5 + 0.5×Reversion → ann Sharpe 2.13 (+28% vs P5 alone).**
- **Funded time-to-pass (50k, $3000/$2500/$1100):**
  - P5 alone @ $50/R: 92.4% pass, 7.6% ruin, median **124 td (~5.7mo)**.
  - **Blend @ $50/R: 92.6% pass, 7.4% ruin, median 88 td (~4.0mo)** — same safety, ~30% FASTER.
  - Blend @ $75/R: 82.3% pass, 17.7% ruin, median **50 td (~2.3mo)** (vs P5-alone ~3.2mo at same pass%).
- **Verdict: diversification VERIFIED.** Negatively-correlated sleeve cuts time-to-pass at equal risk. Weight robust (w=0.25–0.75 all improve).
- Caveats before real capital: (1) reversion sleeve needs P5-grade OOS/walk-forward; (2) ~6 trades/day on thin +0.056R edge → slippage stress test + volume re-import needed; (3) still ~4mo at safe sizing (not <30d unless sized up).
- **Path forward: stack MORE uncorrelated sleeves to keep raising Sharpe → faster passing. Next: validate reversion OOS; hunt a 3rd low-corr edge.**

## Iteration 5 (2026-06-18) — Session-VWAP reversion (volume re-imported)
Added volume to the pipeline (csv_to_data/utc_to_et/resample now carry a 6th element; new `*_vol.json` files). Tested volume-weighted session-VWAP band-fade.
- **FAILS: every variant net-negative** (expR −0.03..−0.10, PF<1, ≤3/8 yrs), negative 2019-23, positive only 2024-26 (regime-unstable).
- corr 0.45 vs SMA-reversion (same family, NOT distinct) and −0.30 vs P5.
- **Verdict: VWAP-reversion is worse than plain SMA(20) band-fade and net-negative. NOT a keeper.** Volume-weighting did not help.
- Infra gain: volume now flows through the pipeline for any future use.

## Iteration 6 (2026-06-18) — OOS validation of reversion sleeve + blend  ✅ VERIFIED OOS
`04_backtests/engine/blend_oos.js`. Split IS 2019-2023 / OOS 2024-2026, fixed params.
- P5 ann Sharpe: 1.81 IS → 1.36 OOS (mild decay, expected).
- Reversion ann Sharpe: 0.50 IS → **1.76 OOS** (sleeve is recent-regime-strong; weak yrs were 2019/2021).
- **BLEND ann Sharpe: 1.95 IS → 2.52 OOS** — beats P5 in BOTH windows (+0.14 IS, +1.16 OOS). corr −0.20 IS / −0.28 OOS.
- **Diversification is REGIME-COMPLEMENTARY**: when P5 decayed OOS, reversion strengthened → blend MORE robust OOS than IS. Opposite of overfitting.
- Caveat: reversion 6/8 positive yrs (vs P5 8/8), recent-favorable; but the −corr is stable throughout (what the blend relies on).
- **CONCLUSION: P5 + 0.5×reversion blend is VERIFIED in- and out-of-sample. This is the aligned solution.**

## Iteration 7 (2026-06-18) — Slippage stress  ⚠️ TEMPERS THE BLEND
`04_backtests/engine/slippage_stress.js`. Swept round-trip slippage (pts).
- **P5 robust:** expR +0.56→+0.36 across 0.5-3.0pt slip; Sharpe ~1.66 stable. Deployable as-is.
- **Reversion FRAGILE:** expR +0.109 (0.5pt) → +0.056 (1.0) → **+0.002 (1.5, breakeven)** → −0.052 (2.0, dead).
- **Blend Sharpe: 2.85(0.5pt) → 2.13(1.0) → 1.41(1.5) → 0.69(2.0).** At ≥1.5pt slip the blend is WORSE than P5-alone (1.66).
- Reversion fades sharp moves = worst-fill conditions, so realized slippage skews HIGH → sleeve likely near/below breakeven live with market orders.
- **Revised verdict: P5 alone is the robust deployable core. The blend advantage is CONDITIONAL on ≤~1pt execution.** The reversion sleeve is only viable with LIMIT-order entries (natural for a fade — could improve fills) but that adds adverse-selection/non-fill risk → must model + forward-test, not assume.

## Iteration 8 (2026-06-18) — Limit-order fills rescue the reversion sleeve  ✅
`04_backtests/engine/limit_fill_test.js`. A fade is a natural passive/limit entry; placing a limit at signal-close +offset*ATR.
- Market @1.0pt: +0.056R (6/8). Market @1.5pt: +0.002R (dead).
- **Limit @0.25ATR offset (82% fill): +0.119R, 8/8 yrs** (≈2x market expR AND more robust). Limit @0: +0.106 (7/8). corr P5 still −0.20.
- **Slippage fragility was a MARKET-ORDER problem.** With limit entries the sleeve is viable + stronger.
- Caveat: fill model is OPTIMISTIC (fills on any touch high>=L, no queue/touched-not-filled modeling) → +0.119 is an UPPER bound; true value between +0.056 and +0.119. **Use limit entries; forward-test fill quality.**
- Net: blend's diversification is execution-feasible via limits. Reversion sleeve now ~as year-robust as P5 (8/8).

## Iteration 9 (2026-06-18) — Reversion sleeve built in Pine v6  ✅ IMPLEMENTED
`08_pine/NQ_MeanReversion_v1_0.pine` — SMA(20) band-fade with NATIVE LIMIT entries (strategy.entry limit=...),
dynamic mean target, 0.5ATR stop, time-stop, flat-by-RTH-close, governor, webhook alerts. Compiles clean in TV (0 errors).
Companion to `NQ_PDHL_breakout_v1_0.pine` (P5). Both halves of the verified blend now exist as deployable Pine strategies.
Remaining = forward-test (needs live time) + consolidated write-up. Strategy SEARCH is exhausted/converged.

## Iteration 11 (2026-06-18) — Volatility-targeted sizing (Moreira-Muir)  ❌ REJECTED
`04_backtests/engine/vol_target.js`. Causal vol-scaling (clamp 0.33-3x), L=20/40.
- P5 1.66→1.64/1.68; Rev 0.94→0.88/0.86; Blend 2.13→2.08/2.17 — Sharpe ~flat, but **maxDD ~doubled** (blend −57→−92/−101).
- Reason: M-M benefit needs vol-spikes ↔ negative returns; P5 does BETTER in high vol (breakout runners), so scaling down in high vol hurts + levering up in calm deepens DDs.
- **Verdict: REJECT vol-targeting. Constant ATR-based per-trade sizing is already optimal.**
- Last untested lever: trend-day filter for reversion sleeve (next), then research exhausted → stop loop.

## Iteration 12 (2026-06-18) — Trend-day filter (Kaufman ER)  ❌ REJECTED  → LOOP COMPLETE
`04_backtests/engine/trend_filter_test.js`. ER(10) filter on limit-entry reversion.
- No filter: +0.119R, 8617 trades, netR 1028, **8/8 yrs**. ER≤0.5: +0.151R but only 4285 trades, netR 645, **6/8 yrs** (less robust).
- Filter raises per-trade expR + trims DD but halves trades, lowers net, DEGRADES year-consistency. **REJECT — keep unfiltered sleeve.**
- Recurring lesson confirmed: simple/unfiltered = most robust; added filters overfit.

## ORDER-FLOW EXTENSION (new loop, 2026-06-18)
TradingView/Pine v6 exposes real order flow via `ta.requestVolumeDelta()` (up/down vol delta from lower TF) + CVD (cumulative, session-anchored). Backtested a PROXY (close-location delta = vol*((c-l)-(h-c))/(h-l); session CVD).

### OF-Iteration 1 — delta/CVD confirmation (`04_backtests/engine/cvd_test.js`)
- **P5 + CVD-aligned (require session CVD same sign as breakout): expR 0.523→0.672 (+28%), Sharpe 0.12→0.147 (+22%), maxDD −34→−31, STAYS 8/8 yrs**, but trades 1342→965 (net R ~flat). **First filter in the project that improves an edge WITHOUT hurting robustness** — economically sound (volume-backed breaks follow through).
- P5 + delta-confirm (breakout-bar delta): expR 0.604, Sharpe 0.136, 8/8. Also helps, less than CVD.
- **Reversion + delta-exhaustion: FAILS** (+0.056→−0.017, 6/8→3/8). Order flow does NOT help the sleeve.
- Caveat: close-location delta ≈ proxy, not true tick delta; magnitudes indicative. Real Pine = ta.requestVolumeDelta.
- NEXT: quantify funded time-to-pass for CVD-confirmed P5 (higher Sharpe but fewer trades — net effect?); then build real-CVD P5 in Pine.

### OF-Iteration 2 — funded impact + Pine build (`04_backtests/engine/cvd_funded.js`, `08_pine/NQ_PDHL_breakout_v1_1_CVD.pine`)
Funded first-passage, risk-matched ($189/day vol):
- P5: 92.4% pass / 7.6% ruin / 124td.  **P5+CVD: 95.1% pass / 4.9% ruin / 127td** (safety boost; time ~flat from fewer trades).
- Blend base: 94.5% / 5.5% / 100td.  **Blend+CVD: 94.8% / 5.2% / 97td (~4.5mo), ann Sharpe 2.20 (best yet).**
- **CVD confirmation = quality/SAFETY boost (ruin 7.6→4.9%), not speed. Best model = Blend+CVD.**
- **Pine v1.1 built (P5 + session CVD proxy confirmation) — COMPILES CLEAN, 0 errors.** Uses close-location delta proxy (matches backtest); optional upgrade to ta.requestVolumeDelta noted (re-validate first).
- Reversion sleeve unchanged (`NQ_MeanReversion_v1_0.pine`); CVD doesn't help it.

### OF-Iteration 3 — CVD variant scan (`04_backtests/engine/cvd_variants.js`)
Compared CVD level / slope / level+slope / delta+level / no-divergence on P5.
- **CVD-level (sign) is OPTIMAL: expR 0.672, Sharpe 0.147, maxDD −31, 8/8 yrs** (highest expR + Sharpe, lowest DD).
- slope / level+slope / no-divergence all drop to 7/8 (worse robustness); delta+level ties but no better.
- **Confirms v1.1 (CVD-level) is the best config — added complexity doesn't help (recurring project lesson).**
- Final report updated (`11_deliverables/FINAL_STRATEGY_REPORT.md`). Order-flow model FINALIZED + compile-clean + best-confirmed.
- Remaining: forward-test (live time); optional true-delta upgrade + re-validate.

### OF-Iteration 4 — FINER delta proxy robustness  ⚠️ WALKS BACK THE CVD CLAIM
`04_backtests/engine/cvd_finer.js`. Rebuilt 5m bars from 1m and computed delta two ways: crude (5m close-loc) vs finer (sum of per-1min close-loc*vol ≈ ta.requestVolumeDelta). crude-vs-finer corr only 0.78.
- P5 baseline: expR 0.523, netR 701, 8/8.  +crude CVD: 0.672, netR 649.  **+FINER CVD: 0.553, netR 504, 8/8.**
- **The CVD gain was largely a CRUDE-PROXY ARTIFACT.** With a realistic finer delta, CVD adds only +0.03R over baseline (noise) and LOWER net R (cuts trades w/o quality gain).
- **CORRECTION: "Blend+CVD Sharpe 2.20 / ruin 4.9%" was optimistic — walk it back.** Robust verified core = **P5 (no CVD) + limit-reversion sleeve**. CVD = marginal, UNPROVEN, proxy-sensitive; settle only with TRUE volume-delta in live forward-test (logger captures `cvd` field for this).
- Order-flow exploration: honest conclusion reached — not a robust edge on available data.

## HEDGE-FUND OPTIMIZATION (new loop, 2026-06-21)
`04_backtests/engine/regime_alloc.js`. Tested risk parity, tactical regime allocation, Kelly on the P5+limit-reversion blend.
- Baseline static 50/50 (limit-reversion blend): ann Sharpe 2.59, netR 1215.
- **Risk parity (reversion weight ~0.71x = inverse-vol): Sharpe 2.65, netR 1435 (+18%), maxDD −55. Small robust WIN — adopt ~0.7x reversion weight.**
- Tactical regime (ER tilt): 2.41 — WORSE. Hard trend/chop switch: 1.42 — much worse. **Regime-timing FAILS** (dynamic switching adds noise).
- Kelly: full-Kelly ~0.04 R/day, informational only — funded sizing is DRAWDOWN-constrained, not growth-constrained (the $/R sizing already derived is the binding optimization).
- Note: limit-reversion blend Sharpe (2.59) > earlier market-reversion figure (2.13); true value between, pending live fill confirmation.
- Net optimization: weight reversion ~0.7x (risk parity); do NOT time regimes. Recurring lesson: static diversified blend beats added complexity.

## PRE-LIVE OPTIMIZATION PASS (2026-06-21, `12_forward_test/final_prelive.js`)
Before live demo forward-test. Searched Apex intraday-DD mechanics + news avoidance.
- **News blackout (skip 10:00/14:00 ET): REJECTED.** Blend Sharpe 2.65→2.45, net 1421→1280, DD −55→−60 (worse). P5 marginally cleaner, reversion worse. Breakouts like news expansion; Apex allows news trading. No news filter.
- **Intraday trailing DD (Apex-accurate: ratchets off intraday peak incl. UNREALIZED P&L, via per-trade MFE) vs EOD model:** 50k blend survival $25/R 98.6%→98.3%, $35/R 90.3%→89.0%, $50/R 65.1%→62.1%. **Only ~1-3pt stricter at safe sizing — model is ROBUST to the real Apex rule; no re-sizing needed.** Use intraday column for live.
- Conclusion: no further model changes; safe-sizing survival numbers hold under accurate rules.

## HEDGE-FUND PASS 2 + LAST-3MO SCENARIO (2026-06-21)
`hf_optimize2.js`: optimal blend weight grid-max at w=0.75 (Sharpe 2.655) ≈ risk-parity 0.70 (2.654) — confirms ~0.7x. Drawdown de-risking (cut size in DD): lowers Sharpe 2.66→2.56-2.61, reduces maxDD — risk tool, NOT a return improver (rejected). Hedge-fund toolkit exhausted; complexity doesn't help.
`last3m_150k.js`: ACTUAL last 63 td (2026-03-19→06-17), 3x Apex 150k, two-step. Eval $200/R would pass day 35 (~1.7mo). Funded 3x: safe $50/R = $18,039/3mo (per-acct $6013, maxDD −$663, survived); balanced $70/R = $25,254/3mo. ⚠️ FAVORABLE regime (P5 >> 7yr avg) — best-case sample; realistic 3-acct baseline ~$30-41k/yr, not the ~$72-101k annualized here.
Loop STOPPED — terminal condition (flawless run) met, toolkit exhausted.

## FLAWLESS-RUN VERIFICATION (2026-06-21)
Full error-free check: **CI `run_all_tests.js` 14/14 PASS**; 5 module self-tests (resample, utc_to_et, walkforward, funded_eval, montecarlo) OK; **all 28 analysis/engine scripts run clean (exit 0)**; Pine reversion strategy recompiles clean (0 errors); breakout v1.0/v1.1 unchanged + previously clean. Applied risk-parity weighting (~0.7× reversion) to deliverables + reversion Pine default (riskPct 0.07). **The model runs flawlessly with no errors.**

## FINAL STATE — research loop complete (12 iterations)
Both remaining levers (vol-target, trend-filter) rejected. **Final system = P5 breakout (core) + unfiltered limit-entry
reversion sleeve (diversifier), constant ATR sizing.** Verified IS+OOS, execution-de-risked, implemented in Pine, documented
(`11_deliverables/FINAL_STRATEGY_REPORT.md`). Loop stopped. Remaining work = forward-test on sim/eval (needs live time).

### Emerging conclusion (after 5 iters)
Of simple credible intraday strategies, only TWO survive on recent NQ: P5 breakout (robust 8/8) + SMA-band reversion (weak +0.056R but −0.22 corr). MIM, cond-MIM, VWAP-rev, gap-fade all fail/marginal. Recent NQ is efficient vs simple signals. **Verified answer = P5 + 0.5×reversion blend.** Remaining high-value work: OOS-validate the reversion sleeve; vol-target the blend; then likely converge.

## Sources
- Gao, Han, Li, Zhou (2018) "Market Intraday Momentum", JFE 129(2):394-414. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2440866
- Moreira & Muir (2017) "Volatility-Managed Portfolios", J. Finance.
- Harvey et al. (2018) "The Impact of Volatility Targeting", JPM. https://quantpedia.com/the-impact-of-volatility-targeting-on-equities-bonds-commodities-and-currencies/
- TORB / opening-range breakout on index futures (IEEE 2019). https://ieeexplore.ieee.org/document/8641124/
