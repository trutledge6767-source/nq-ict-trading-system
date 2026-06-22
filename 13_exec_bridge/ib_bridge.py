#!/usr/bin/env python3
# =====================================================================
# ib_bridge.py  --  DIY local execution bridge: TradingView alerts -> IBKR paper.
#
# Receives the SAME JSON the Pine strategies emit (forwarded from
# forward_logger.js, or posted directly), maps each event to an
# Interactive Brokers order on the MNQ front-month future, and places it
# on a PAPER account via IB Gateway / TWS (ib_async).
#
# Event JSON (per strategy, identified by URL path /p5 or /rev):
#   {"action":"entry|close|reduce","side":"long|short","price":..,
#    "sl":..,"tp":..,"qty":..,"symbol":".."}
#
# Order mapping:
#   entry  -> P5: MARKET entry  | REV: LIMIT entry @price ; + protective STOP @sl
#   close  -> MARKET flatten this strategy's qty ; cancel its stop
#   reduce -> partial MARKET close of `qty` (strategy is hold-to-close, so rare)
#
# SAFETY: dry_run=true by default -> logs intended orders to orders.csv and
# console, places NOTHING. Flip dry_run=false in config.json only after IB
# Gateway is running, logged into the PAPER account, and the dry-run chain
# is verified. See SETUP_IBKR.md.
# =====================================================================
import json, os, csv, queue, threading, time, datetime, http.server, socketserver

HERE = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(HERE, 'config.json')
ORDERS_CSV = os.path.join(HERE, 'orders.csv')

DEFAULTS = {
    "http_port": 8799,
    "ib_host": "127.0.0.1",
    "ib_port": 4002,          # IB Gateway paper. TWS paper = 7497
    "ib_client_id": 7,
    "dry_run": True,
    "symbol": "MNQ",
    "exchange": "CME",
    "currency": "USD",
    "default_qty": 1,
    "account": ""             # blank = use the connection's default paper account
}

def load_cfg():
    cfg = dict(DEFAULTS)
    if os.path.exists(CFG_PATH):
        try:
            cfg.update(json.load(open(CFG_PATH)))
        except Exception as e:
            print(f"[cfg] could not read config.json ({e}); using defaults")
    return cfg

CFG = load_cfg()

def now_iso():
    return datetime.datetime.now().isoformat(timespec='seconds')

def log_order(strat, action, intent, side, qty, otype, price, sl, status):
    new = not os.path.exists(ORDERS_CSV)
    with open(ORDERS_CSV, 'a', newline='') as f:
        w = csv.writer(f)
        if new:
            w.writerow(['iso', 'strat', 'action', 'intent', 'side', 'qty', 'type', 'price', 'sl', 'status'])
        w.writerow([now_iso(), strat, action, intent, side, qty, otype, price, sl, status])
    print(f"[{now_iso()}] {strat} {action} -> {intent} ({status})")

# --------------------------------------------------------------------- IB layer
# Imported lazily so dry-run works even without a live IB connection.
IB = None
ib = None
contract = None
# per-strategy open state: {strat: {"side","qty","stop_trade","entry_trade","sl"}}
positions = {}

def connect_ib():
    global IB, ib, contract
    from ib_async import IB as _IB, Future, ContFuture
    IB = _IB
    ib = _IB()
    print(f"[ib] connecting {CFG['ib_host']}:{CFG['ib_port']} clientId={CFG['ib_client_id']} ...")
    ib.connect(CFG['ib_host'], CFG['ib_port'], clientId=CFG['ib_client_id'], timeout=15)
    print(f"[ib] connected. accounts={ib.managedAccounts()}")
    contract = resolve_front_month(Future, ContFuture)
    print(f"[ib] trading contract: {contract.localSymbol or contract.lastTradeDateOrContractMonth} (conId={contract.conId})")

def resolve_front_month(Future, ContFuture):
    """Pick the nearest non-expired MNQ future."""
    today = datetime.date.today().strftime('%Y%m%d')
    details = ib.reqContractDetails(Future(CFG['symbol'], exchange=CFG['exchange'], currency=CFG['currency']))
    cands = sorted((d.contract for d in details), key=lambda c: c.lastTradeDateOrContractMonth)
    front = next((c for c in cands if c.lastTradeDateOrContractMonth >= today), cands[-1] if cands else None)
    if front is None:
        raise RuntimeError("no MNQ contract found via reqContractDetails")
    ib.qualifyContracts(front)
    return front

def entry_type_for(strat):
    return 'limit' if 'rev' in strat.lower() else 'market'

def qty_for(strat, ev):
    for k in ('qty', 'contracts', 'remaining_qty'):
        v = ev.get(k)
        if v not in (None, '', 0, '0'):
            try:
                return max(1, int(round(float(v))))
            except Exception:
                pass
    return int(CFG['default_qty'])

def place(order_kind, action, qty, price=None):
    """Submit one order; return the Trade (or None in dry-run)."""
    from ib_async import MarketOrder, LimitOrder, StopOrder
    if order_kind == 'market':
        o = MarketOrder(action, qty)
    elif order_kind == 'limit':
        o = LimitOrder(action, qty, price)
    elif order_kind == 'stop':
        o = StopOrder(action, qty, price)
    else:
        raise ValueError(order_kind)
    if CFG['account']:
        o.account = CFG['account']
    o.tif = 'GTC'
    return ib.placeOrder(contract, o)

def process(strat, ev):
    action = (ev.get('action') or '').lower()
    side = (ev.get('side') or '').lower()
    price = ev.get('price')
    sl = ev.get('sl')
    qty = qty_for(strat, ev)
    dry = CFG['dry_run'] or ib is None

    if action == 'entry':
        etype = entry_type_for(strat)
        buy = side == 'long'
        ord_action = 'BUY' if buy else 'SELL'
        stop_action = 'SELL' if buy else 'BUY'
        if dry:
            log_order(strat, 'entry', f"{ord_action} {qty} {etype}@{price if etype=='limit' else 'mkt'} stop@{sl}",
                      side, qty, etype, price, sl, 'DRY_RUN')
            positions[strat] = {"side": side, "qty": qty, "sl": sl, "stop_trade": None, "entry_trade": None}
            return
        entry_trade = place(etype, ord_action, qty, price if etype == 'limit' else None)
        stop_trade = place('stop', stop_action, qty, sl) if sl not in (None, '') else None
        positions[strat] = {"side": side, "qty": qty, "sl": sl,
                            "stop_trade": stop_trade, "entry_trade": entry_trade}
        log_order(strat, 'entry', f"{ord_action} {qty} {etype} stop@{sl}", side, qty, etype, price, sl, 'SENT')

    elif action == 'close':
        op = positions.get(strat)
        if not op:
            log_order(strat, 'close', 'no open position', side, qty, '-', price, sl, 'IGNORED')
            return
        opp = 'SELL' if op['side'] == 'long' else 'BUY'
        if dry:
            log_order(strat, 'close', f"{opp} {op['qty']} mkt (flatten); cancel stop", op['side'], op['qty'], 'market', price, op['sl'], 'DRY_RUN')
            positions.pop(strat, None)
            return
        place('market', opp, op['qty'])
        if op.get('stop_trade'):
            try:
                ib.cancelOrder(op['stop_trade'].order)
            except Exception as e:
                print(f"[ib] cancel stop failed: {e}")
        positions.pop(strat, None)
        log_order(strat, 'close', f"{opp} {op['qty']} mkt; stop cancelled", op['side'], op['qty'], 'market', price, op['sl'], 'SENT')

    elif action == 'reduce':
        op = positions.get(strat)
        rq = qty_for(strat, ev)
        if not op:
            log_order(strat, 'reduce', 'no open position', side, rq, '-', price, sl, 'IGNORED')
            return
        opp = 'SELL' if op['side'] == 'long' else 'BUY'
        rq = min(rq, op['qty'])
        if not dry:
            place('market', opp, rq)
        op['qty'] -= rq
        if op['qty'] <= 0:
            positions.pop(strat, None)
        log_order(strat, 'reduce', f"{opp} {rq} mkt (partial)", op['side'], rq, 'market', price, sl, 'DRY_RUN' if dry else 'SENT')

    else:
        log_order(strat, action or 'unknown', 'no-op', side, qty, '-', price, sl, 'SKIPPED')

# --------------------------------------------------------------------- HTTP layer
WORK = queue.Queue()

class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body):
        self.send_response(code)
        self.send_header('content-type', 'application/json')
        self.end_headers()
        self.wfile.write(body.encode())

    def do_GET(self):
        strat = self.path.strip('/').split('?')[0] or 'status'
        if strat in ('status', ''):
            self._send(200, json.dumps({
                "ok": True, "dry_run": CFG['dry_run'],
                "ib_connected": bool(ib and ib.isConnected()) if ib else False,
                "open": {k: {"side": v["side"], "qty": v["qty"], "sl": v["sl"]} for k, v in positions.items()}
            }))
        else:
            self._send(404, '{"ok":false}')

    def do_POST(self):
        n = int(self.headers.get('content-length', 0))
        raw = self.rfile.read(n).decode() if n else ''
        strat = self.path.strip('/').split('?')[0] or 'default'
        try:
            ev = json.loads(raw)
        except Exception:
            self._send(200, 'bad-json')
            return
        WORK.put((strat, ev))
        self._send(200, 'queued')

    def log_message(self, *a):
        pass  # silence default access logging

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def serve_http():
    srv = ThreadingHTTPServer(('0.0.0.0', CFG['http_port']), Handler)
    print(f"[http] bridge listening on :{CFG['http_port']}  (POST /p5 , /rev ; GET /status)")
    srv.serve_forever()

def main():
    print(f"=== ib_bridge  dry_run={CFG['dry_run']}  port={CFG['http_port']} ===")
    if not CFG['dry_run']:
        try:
            connect_ib()
        except Exception as e:
            print(f"[ib] CONNECT FAILED ({e}). Falling back to DRY_RUN so nothing is lost.")
            CFG['dry_run'] = True
    else:
        print("[ib] DRY_RUN: not connecting to IB. Orders will be logged only.")

    threading.Thread(target=serve_http, daemon=True).start()

    connected = bool(ib and ib.isConnected())
    while True:
        if connected:
            ib.sleep(0.25)          # pumps IB event loop
        else:
            time.sleep(0.25)
        while not WORK.empty():
            strat, ev = WORK.get_nowait()
            try:
                process(strat, ev)
            except Exception as e:
                print(f"[process] error {strat}: {e}")
                log_order(strat, ev.get('action', '?'), str(e), ev.get('side', ''), '', '-', ev.get('price'), ev.get('sl'), 'ERROR')

if __name__ == '__main__':
    main()
