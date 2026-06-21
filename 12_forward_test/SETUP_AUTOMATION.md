# Running the Models Automatically on a Paper Account (TradingView)

Honest framing: a TradingView **strategy** in the Strategy Tester is a *backtest*, not a live auto-trader.
To run hands-free you create **alerts** from the strategies and send them (webhook) to something that acts on them.
TradingView's own "Paper Trading" broker is **manual** (it won't auto-execute alerts), so for true automation you
route the webhook to either (A) the logger — to validate the edge, or (B) an execution bridge → a futures demo account.

## Prerequisites
- **Paid TradingView plan** (Essentials+). Webhook alerts are NOT on the free plan.
- Chart: **MNQ1!** (Micro Nasdaq), **5-minute**. (The scripts handle ET sessions internally.)
- Decide your track:
  - **Track A — validate signals (do this first):** alerts → our `forward_logger.js`. No broker, no execution; just proves the edge live (realized R, fill quality). Free except the TV plan + a tunnel.
  - **Track B — auto-execute on paper:** alerts → a bridge (TradersPost / PickMyTrade) → a futures **demo** account (Tradovate demo, or your prop firm's free sim). Truly hands-off.

## Step 1 — Put the strategies on the chart
1. Open MNQ1!, 5-minute.
2. Pine Editor → open `NQ_PDHL_breakout_v1_1_CVD.pine` → **Add to chart**.
3. Repeat for `NQ_MeanReversion_v1_0.pine`. (Both run on the same chart.)
4. Set inputs (gear icon) per the two-step plan:
   - Both: **`$ per point` = 2** (MNQ).
   - P5: `Stop xATR` = 0.75, `Risk %` = your phase (eval ~0.10–0.13% / funded ~0.05%), `useCVD` = on (logged for validation).
   - Reversion: `Risk %` ≈ 0.7× the P5 value (risk parity), limit entries on.

## Step 2 — Create the alerts (one per strategy)
1. Click the alarm-clock (Alerts) → **Create Alert**.
2. **Condition:** select the strategy → **"Any alert() function call"** (this fires on every entry/exit the script emits).
3. **Trigger:** *Once per bar close* (matches the scripts; non-repainting).
4. **Expiration:** open-ended.
5. **Notifications → Webhook URL:** paste your endpoint (Step 3). **Leave the Message box default** — the script already outputs the JSON the receiver needs.
6. Create a second alert the same way for the other strategy. Name them clearly (e.g., "P5-MNQ", "REV-MNQ").

> TradingView fires alerts **server-side** (they trigger even if your PC is off) — but whatever *receives* the webhook must be always-on. That's why a hosted bridge (Track B) is better for 24/5 than a laptop.

## Step 3 — Route the webhook
**Track A (validate the edge — recommended first, ~2–4 weeks):**
1. `cd 12_forward_test && node forward_logger.js`
2. Expose it publicly: `cloudflared tunnel --url http://localhost:8787` (or `ngrok http 8787`).
3. In the alerts, set webhook URL to `https://<tunnel-host>/p5` (P5 alert) and `…/rev` (reversion alert).
4. Track results: `node forward_report.js` → live expR/win%/Sharpe vs the backtest baselines.

**Track B (auto-execute on a paper/demo account):**
1. Create a **TradersPost** (or PickMyTrade) account; connect a **Tradovate demo** account (free futures sim) — or your prop firm's sim.
2. TradersPost gives you a webhook URL per strategy. Map the JSON fields the scripts emit
   (`action` entry/close, `side`, `price`, `sl`, `qty`) to its order template (market/limit entry + stop).
3. Paste those webhook URLs into the TV alerts (P5 → its endpoint, reversion → its endpoint).
4. The bridge auto-places/closes MNQ orders on the demo account whenever an alert fires. Hands-free.

## Step 4 — Verify
- Trigger a manual test alert (or wait for the next signal). Confirm the logger printed it / the bridge shows the order on the demo account.
- Check `forward_report.js` after a few days; confirm the reversion sleeve's **limit fills** match the backtest (the #1 thing to validate live).

## Caveats
- Webhook alerts require a paid TV plan; alerts have per-plan count limits and can expire — recreate as needed.
- Track A (local logger) only **records** signals; it does not place orders. Use Track B for actual paper execution.
- For futures, use **MNQ** so the per-R sizing is precise; 1 full NQ is too coarse for these account sizes.
- Run the two strategies as the validated blend (P5 + ~0.7× reversion). Flat overnight; limit orders on the reversion sleeve are mandatory.
- This validates forward performance; alpha decay is the #1 risk — watch live expR vs the +0.3–0.7R (P5) / ~+0.1R (reversion) baselines.
