# Forward-Test Setup — Apex 150k Account

Rules assumed (Apex 150k): **profit target $9,000, trailing DD $5,000** (locks at +$5,100 → static +$100 floor).
Instrument: **MNQ (micro NQ, $2/point)** — required, so the per-R sizing is precise (1 full NQ is too coarse).
Strategy = deployable blend: **P5 breakout** (`NQ_PDHL_breakout_v1_1_CVD.pine`, CVD toggle optional) +
**limit-reversion sleeve** (`NQ_MeanReversion_v1_0.pine`). Run BOTH on a 5-minute MNQ chart.

## Two-phase sizing (size UP for eval, DOWN once funded)
| Phase | $ risk/R | Pine `riskPct` (=$/R ÷ equity) | ≈ MNQ contracts* | Expected |
|---|---|---|---|---|
| **EVAL** | **$150/R** | **0.10 %** | ~3–4 MNQ | 85% pass, ~3.4mo |
| (faster eval) | $200/R | 0.13 % | ~4–5 MNQ | 76% pass, ~2.2mo |
| **FUNDED – survival** | **$70/R** | **0.05 %** | ~1–2 MNQ | 96% survive, ~$11.9k/yr |
| FUNDED – balanced | $100/R | 0.07 % | ~2–3 MNQ | 80% survive, ~$16k/yr |
\*Auto-computed by the strategy from `riskPct × equity ÷ stopDist`; counts are approximate (depend on live ATR).

**Recommended plan:** Eval at **$150/R (riskPct 0.10%)** → on pass, switch the funded account to **$70/R (riskPct 0.05%)**
for ~96% annual survival (~$11.9k/yr), or 0.07% for ~$16k/yr if you'll accept a 1-in-5 annual breach.

## Pine inputs to set (per strategy, on the MNQ 5m chart)
P5 (`NQ_PDHL_breakout_v1_1_CVD`):
- `$ per point` = **2** (MNQ) · `Stop distance (xATR)` = **0.75** (eval) / 1.0 (funded payout phase)
- `Risk % equity / trade` = **0.10** (eval) → **0.05** (funded) · `useCVD` = on (logged for live validation; unproven)
- `Max trades per day` = 1 · session/cutoff = defaults (RTH, no entries after 12:00 ET)

Reversion (`NQ_MeanReversion_v1_0`):
- `$ per point` = **2** · `Risk % equity / trade` = **0.07** (eval) → **0.035** (funded)
  *(risk-parity weight ≈ 0.7× the P5 risk — each sleeve contributes equal volatility; best blend Sharpe)*
- keep limit entries (default), `Stop (xATR)` = 0.5, flat-by-close on

## Run the forward test
1. `node forward_logger.js` (in `12_forward_test/`), expose via tunnel (see README.md).
2. Add both strategies to the MNQ 5m chart → create alerts ("alert() calls only") → webhooks `…/p5` and `…/rev`.
3. Trade on a **150k sim/eval account** (or paper) at the eval sizing above.
4. `node forward_report.js` to track live expR/win%/Sharpe vs baselines.

## Pass / fail criteria (vs backtest)
- **Reversion (fast, ~30 trades/wk):** within 2–4 weeks confirm live **limit fill-rate** and **slippage** match assumptions (edge needs ≤~1pt RT). expR should be ~+0.10R.
- **P5 (slow, ~40/yr):** judge over months; expR should be **+0.3 to +0.7R** (not the recent +1.5–2R outlier regime).
- **CVD:** the logger captures the `cvd` field per trade — after ~50+ P5 trades, compare CVD-aligned vs CVD-against outcomes to finally settle whether order flow helps (it was UNPROVEN in backtest).
- **Account behavior:** confirm EOD-flat (no overnight), trailing-DD never breached at eval sizing, and the size-down on funding.

## Honest expectations
~85% chance of passing the 150k eval in ~3–4 months at $150/R, then ~96% survival at $70/R for **~$11.9k/yr gross** per
account (or ~$16k at $100/R, 80% survival). Multiple decorrelated 150k accounts scale this. All figures are backtest/sim
GROSS — net of Apex fees and subject to payout/consistency caps. **Alpha decay is the #1 risk; this live test is the real proof.**
