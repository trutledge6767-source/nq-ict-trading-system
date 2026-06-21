# Forward-Test Logger

Captures live TradingView alert webhooks from the two strategies, pairs entry→exit into
realized-R trades, and reports live results vs the 7-year backtest baselines.

Files: `forward_logger.js` (webhook server) · `forward_report.js` (live-vs-backtest report).
Outputs (created on first event): `events.csv` (raw log), `trades_p5.csv`, `trades_rev.csv`, `state.json`.

## 1. Run the logger
```
node forward_logger.js                      # port 8787, no auth
PORT=8787 FT_TOKEN=mysecret node forward_logger.js   # with a shared secret
```
Leave it running. `GET /status` returns open positions + event count.

## 2. Make it reachable from TradingView (needs a PUBLIC URL)
TradingView webhooks require a public HTTPS endpoint and a paid plan (Pro+). Pick one:
- **Tunnel (easiest):** `cloudflared tunnel --url http://localhost:8787` or `ngrok http 8787` → use the public URL it prints.
- **VPS:** run the logger on a small server and use its IP/domain.

## 3. Configure the alerts (one per strategy)
After adding each strategy to the chart, right-click → **Add alert**:
- Condition: the strategy, **"alert() function calls only"**.
- **Webhook URL** (Notifications tab):
  - P5+CVD strategy → `https://<public-host>/p5` (append `?token=mysecret` if set)
  - Mean-reversion strategy → `https://<public-host>/rev`
- Message: leave as default — the scripts already emit the JSON the logger expects.

The **path** (`/p5` vs `/rev`) is how the logger tags which strategy fired — keep them distinct.

## 4. Read results
```
node forward_report.js
```
Shows, per strategy: live trade count, win%, expR, netR, maxDD, sharpe, sample-size flag,
and a verdict vs baseline (CVD-P5 ~+0.67R; reversion(limit) ~+0.12R).

## What it does / doesn't measure
- ✅ Signal-level realized R from alert prices (entry vs stop vs exit), paired automatically.
- ✅ Survives restarts (open trades persisted in `state.json`).
- ⚠️ It does NOT see your broker's actual fills — **real slippage must be compared separately**,
  especially the reversion sleeve's **limit fills** (the #1 live risk). Log broker fills vs alert prices.
- Need **~50+ completed trades** before trusting expR. Reversion reaches that in weeks (~6 trades/day);
  CVD-P5 needs months (~40 trades/yr). Judge CVD-P5 on expR in the **+0.3..+0.7R** band, not recent outliers.
