# Deliverables K & L — Alert Instructions + Webhook Automation

Applies to: `08_pine/NQ_ICT_strategy_v0_3.pine` (study name "NQ ICT A+ v0.3").

## K. Creating the alert (TradingView)
1. Add the strategy to the chart and set inputs (default preset is the conservative A+ preset).
2. Click **Alerts → Create Alert**.
3. Condition: select the strategy **"NQ ICT A+ v0.3"** → **"Order fills only"** (recommended) or
   **"alert() function calls only"** (this strategy emits a JSON payload on every entry).
4. Options: **Once Per Bar Close** (matches `process_orders_on_close=true` → non-repainting).
5. Paste the webhook URL of your execution bridge into **Webhook URL** (Notifications tab).
6. Alert name: `NQ_ICT_v0_3`. Expiration: open-ended.

> Use bar-close alerts only. Intrabar alerts would reintroduce repaint/look-ahead risk that the
> strategy was specifically designed to avoid.

## L. Webhook JSON payload (emitted by `alert()` on entry)
```json
{"action":"entry","side":"long","symbol":"NQ1!","price":30410.25,"sl":30380.5,"tp":30469.75,"qty":2}
```
Exit/close payloads (v0.5+, emitted when position size shrinks):
```json
{"action":"reduce","side":"long","symbol":"NQ1!","price":30437.0,"remaining_qty":1}
{"action":"close","side":"long","symbol":"NQ1!","price":30495.0,"remaining_qty":0}
```
- `reduce` fires when the partial (TP1) bank reduces size; `close` fires on full exit.

Fields:
- `action`  — "entry" | "reduce" | "close". Full lifecycle is covered (v0.5+).
- `side`    — "long" | "short"
- `symbol`  — `syminfo.ticker`
- `price`   — entry (bar close)
- `sl`/`tp` — stop / target prices already computed from ATR + RR
- `qty`     — contracts from fixed-fractional vol-adjusted sizing (capped by maxContracts)

## Execution bridge (broker side)
Point the webhook at a relay that maps payload → broker API. Common targets for funded futures:
- A self-hosted relay (e.g., small Flask/Express endpoint) → broker/prop API.
- Third-party connectors (e.g., bridges that accept TradingView JSON) → Tradovate/Rithmic-style routes.

Bridge responsibilities (must implement):
1. **Idempotency** — dedupe on (symbol, bar time, side) so a re-sent alert can't double-fire.
2. **Bracket placement** — submit entry + OCO stop(`sl`)/target(`tp`) atomically.
3. **Risk echo** — re-check broker-side daily-loss / max-position before sending (defense in depth;
   never trust the chart alone to enforce funded-account limits).
4. **Kill switch** — a manual/auto flag that blocks new entries (e.g., on daily-loss breach).

## Safety / funded-account notes
- The Pine risk governor (daily/weekly loss, 3-loss lockout, max trades/day, sizing cap) is the FIRST
  line; the bridge's risk echo is the SECOND. Run `10_risk/funded_eval.js` on backtest output to
  confirm the equity path would survive your firm's trailing-DD before risking a live eval.
- Verify `pointValue` (NQ=20) and contract caps match your account size/plan.
