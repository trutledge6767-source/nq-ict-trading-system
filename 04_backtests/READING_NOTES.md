# Backtest Reading — Method & Blocker Log

## Blocker (Iteration 2, 2026-06-17)
TradingView Desktop (this build) Strategy Tester is NOT readable via the MCP:
- `data_get_strategy_results` -> "No strategy found on chart" even though
  `chart_get_state` lists the strategy and the tester tabs + date range render.
- Report body does not mount in DOM (innerText lacks "Net profit" etc.).
- No strategy-tester bottom-tab button exists (only screener/pine/calendar).
- TV tester DID run v0.2 over Apr 26–Jun 17 2026 on 5m (~52 days) — visible via tabs,
  but numeric values are unreadable programmatically.

## Decision: dual-engine architecture
1. **Offline backtest engine (PRIMARY for research/validation)** — Python script that
   reads OHLCV CSV (pulled via MCP data_get_ohlcv) and replays the EXACT strategy logic
   bar-by-bar. Fully readable metrics, reproducible, non-repainting by construction.
   Path: 04_backtests/engine/
2. **Pine v6 strategy (deployment artifact)** — compiles clean, non-repainting; used for
   live chart visualization, alerts, and webhook automation. Logic kept in lockstep with
   the offline engine (same definitions of FVG/MSS/sweep/killzone/bias).

## Data limitation
- data_get_ohlcv max 500 bars/call, returns most-recent window (no offset).
- Coverage by TF (500 bars): 1m ~ 8h, 5m ~ 1.7 RTH days... actually ~500*5min continuous,
  15m ~ several days, 1H ~ 10 weeks. Higher TF = more calendar coverage.
- Mitigation: pull each TF's 500-bar window; document sample size per test; use 15m/1H for
  longer-horizon structure/bias validation; treat 1m/5m as recent-regime entry validation.
- Per mission rules: "use all available bars, document limitations, maximize sample size."

## Metrics to compute offline (per strategy version / TF / regime)
WinRate, ProfitFactor, NetProfit($ & R), MaxDrawdown(R & $), TradeCount, Expectancy(R),
AvgR, AvgWin/AvgLoss, AvgDuration, Sharpe(per-trade), longest losing streak.
