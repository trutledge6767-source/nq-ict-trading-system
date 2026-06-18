# Phase 2 — News Intelligence & Dynamic Blackout Model

Goal: avoid event-driven volatility spikes that (a) blow stops via slippage and (b) ratchet
funded-account trailing drawdowns. Trade the post-event expansion only AFTER stabilization.

## Event impact tiers (NQ-relevant, US session, times ET)

| Tier | Events | Typical time (ET) | Blackout (pre / post) |
|---|---|---|---|
| EXTREME | FOMC rate decision + presser, CPI, NFP | 14:00/14:30; 08:30; 08:30 | -5 / +30 min (FOMC: -10 / +60) |
| HIGH | PPI, Retail Sales, GDP, ISM Mfg/Svcs, Core PCE, Unemployment Claims | 08:30 / 10:00 | -3 / +15 min |
| MEDIUM | Consumer Confidence, Michigan Sentiment, JOLTS, Treasury auctions (10y/30y) | 10:00 / 13:00 | -2 / +10 min |
| LOW | minor surveys, Fed speakers (non-Chair) | varies | optional -1 / +5 min |

## Recurring schedule heuristics (encoded in news_filter.js)
- Most BLS/Census releases: **08:30 ET** (CPI, PPI, NFP, Retail Sales, GDP, Claims-Thursday).
- ISM / Consumer Confidence / JOLTS: **10:00 ET**.
- FOMC statement **14:00 ET**, press conference **14:30 ET** (8 meetings/yr — must be supplied by date).
- Jobless Claims: **every Thursday 08:30 ET** (HIGH).

Because Pine/engine cannot fetch a live calendar, the system uses TWO layers:
1. **Recurring time-of-day blackout** for the standard 08:30 / 10:00 / 14:00 windows on weekdays
   (catches the bulk of scheduled risk automatically, zero maintenance).
2. **Explicit high-impact date list** (FOMC/CPI/NFP dates) supplied as inputs for the EXTREME tier
   with wider windows. User updates ~monthly.

## Decision rules (to be validated when sample allows — Phase 6)
- H4 (from Phase 1): news blackout should reduce MaxDD more than it reduces net profit.
- Default LIVE behavior (conservative, pre-validation):
  - No new entries inside any HIGH/EXTREME blackout window.
  - Flatten/important: do not hold INTO an EXTREME release; reduce size or exit by pre-window.
  - Resume only after the post-window stabilization timer elapses (price re-accepts inside a
    defined range / ATR normalizes) — Phase 8 will test fixed-timer vs ATR-normalization resume.
- Post-news expansion play is a SEPARATE candidate model (Judas/displacement after 08:30) tested
  on its own merits, not assumed.

## Integration
- Engine: `02_news/news_filter.js` → `inBlackout(barTimeSec, {recurring, events})` boolean.
  Backtest can run WITH and WITHOUT the filter to measure H4 (when sample allows).
- Pine: time-of-day blackout via `time()` session checks + boolean inputs for FOMC/CPI/NFP dates.
