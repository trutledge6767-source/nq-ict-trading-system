# Track B — Auto-execute on an IBKR PAPER account (DIY local bridge)

The bridge (`ib_bridge.py`) receives the same alert JSON your Pine strategies emit
(forwarded from `forward_logger.js`) and places MNQ orders on an **Interactive Brokers
paper account** via IB Gateway. Free. Nothing leaves your machine except the orders → IB.

```
TV alert -> ngrok -> forward_logger.js (logs+pairs) -> ib_bridge.py -> IB Gateway (paper) -> MNQ
```

**Ships SAFE:** `config.json` has `dry_run: true`. In that mode the bridge places NOTHING —
it only writes intended orders to `orders.csv`. Go live (paper) only after the steps below.

---

## What YOU do once (I can't — needs your identity/login)

### 1. Create an IBKR paper account
- Sign up at interactivebrokers.com (or, if you have a live login, just enable the paper account
  from Client Portal → Settings → Paper Trading Account).
- Paper accounts get a configurable starting balance — set it near **$150k** to mirror the eval size.

### 2. Install + configure IB Gateway (lighter than TWS; ideal for headless auto-trading)
- Download **IB Gateway** (stable). Log in with your **paper** credentials (paper login is separate).
- In Gateway: **Configure → Settings → API → Settings**:
  - ✅ Enable ActiveX and Socket Clients
  - Socket port = **4002** (Gateway paper default; matches `config.json`). *(TWS paper = 7497.)*
  - ✅ Allow connections from localhost only; add **127.0.0.1** to Trusted IPs
  - ❎ Read-Only API must be **OFF** (it must be allowed to place orders)
- Leave Gateway running and logged in during RTH. (It auto-logs-out daily ~midnight; restart each morning,
  or set auto-restart in Gateway settings.)

### 3. Market data (paper)
- For paper fills the bridge uses MARKET/LIMIT orders; live L1 data helps fills price realistically.
- IBKR paper usually mirrors your live market-data subscriptions. If MNQ quotes are missing, add the
  **CME real-time** bundle (or use delayed — orders still fill in sim, just at delayed marks).

---

## Go live (paper) — flip the switch

1. Confirm Gateway is up and logged into the **paper** account (step 2).
2. Edit `13_exec_bridge/config.json`: set `"dry_run": false`. Adjust `"default_qty"` (start at **1** MNQ)
   and, if you have multiple paper accounts, set `"account"` to the paper account id (else leave blank).
3. Launch everything: double-click **`13_exec_bridge/start_track_b.bat`**
   (starts bridge + logger-with-forwarding + ngrok on your stable domain). Three windows — leave open.
4. Sanity check: open `http://127.0.0.1:8799/status` → should show `"ib_connected": true, "dry_run": false`.

> The TradingView alert webhooks do **not** change — they still point at `…/p5` and `…/rev` on your
> ngrok domain. The logger forwards locally to the bridge, so Track A logging keeps working alongside.

---

## Order mapping (what the bridge does per alert)
| Alert | Order |
|-------|-------|
| `p5` entry  | MARKET entry + protective STOP @ `sl` (breakout = take immediately) |
| `rev` entry | LIMIT entry @ `price` + protective STOP @ `sl` (reversion = passive fill) |
| any `close` | MARKET flatten that sleeve's qty + cancel its stop |
| any `reduce`| partial MARKET close (rare — strategy is hold-to-RTH-close) |

**Position netting (expected, and realistic):** both sleeves trade MNQ, so IB nets them into one
position — which *is* the live blend's net exposure. Each sleeve still rests its own stop. This is the
faithful representation of running the P5 + reversion blend on one funded account.

## Verify / monitor
- `orders.csv` — every intent the bridge acted on (audit trail, dry-run and live).
- `http://127.0.0.1:8799/status` — connection + open per-sleeve positions.
- IB Gateway / Client Portal — actual fills, positions, paper P&L.
- Track A reports still work: `node ../12_forward_test/forward_report.js`.

## Gotchas
- **Gateway must be running + logged in**, or the bridge auto-falls-back to dry-run (logs, no orders).
- Daily Gateway re-login: restart Gateway (and `start_track_b.bat`) each morning, or enable auto-restart.
- `clientId` (config) must be unique per API client; if you also run TWS API tools, give each a different id.
- This is **paper**. Validate fills/slippage vs backtest before ever pointing at real money — the reversion
  sleeve's limit-fill quality is the #1 thing to confirm live (see strategy notes).
