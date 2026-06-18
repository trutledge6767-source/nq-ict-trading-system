# Phase 1 — ICT Concept Research & Objective Definitions

Purpose: convert each ICT concept into a *codeable, non-discretionary* definition with a
testable hypothesis. Concepts that cannot be objectified are flagged REJECT.

Legend: **Codeable?** Y = can be expressed in Pine v6 without future leak; N = reject.

---

## 1. Market Structure

| Concept | Objective definition (proposed) | Codeable? | Non-repaint note |
|---|---|---|---|
| Swing high/low | Pivot: high[n] is highest of [n-L .. n+R], confirmed only after R bars close | Y | Confirmed R bars late — no repaint if we wait |
| BOS (Break of Structure) | Close beyond most recent confirmed swing in trend direction | Y | Use close, confirmed pivot |
| CHOCH (Change of Character) | First BOS against prevailing leg = trend shift candidate | Y | Derived from confirmed swings |
| MSS (Market Structure Shift) | Displacement close through a swing that previously held, with FVG in the move | Y | Requires displacement + FVG, both objective |
| Liquidity sweep | Wick takes prior swing high/low then closes back inside within K bars | Y | Confirm on close, not intrabar |
| Internal vs external liquidity | External = session/PD swing highs/lows; internal = sub-swings between them | Y | Define by pivot strength tiers |
| Inducement | Minor pivot just before a sweep of the major level | Y (heuristic) | Hard; tag as optional filter |
| Premium/Discount | Fib 50% of current dealing range; >50% premium, <50% discount | Y | Range = last confirmed external swings |

## 2. PD Arrays

| Concept | Objective definition | Codeable? |
|---|---|---|
| FVG (Fair Value Gap) | 3-bar: bar1.high < bar3.low (bull) or bar1.low > bar3.high (bear); gap size in pts/ATR | Y |
| IFVG (Inverse FVG) | FVG that price closes fully through; flips polarity, becomes S/R | Y |
| Order Block | Last opposite-color candle before displacement that creates BOS+FVG | Y |
| Breaker | Order block that failed (price broke it) then is retested from other side | Y |
| Mitigation block | Like breaker but no liquidity taken beyond it | Y |
| Rejection block | Body-based zone defined by long wick rejection candle | Y |
| Balanced Price Range (BPR) | Overlap of an up-FVG and down-FVG in opposite directions | Y |

## 3. ICT Models (each becomes a candidate strategy module)

| Model | Core logic (to be tested, NOT assumed) | Session | Codeable? |
|---|---|---|---|
| ICT 2022 model | Sweep -> MSS w/ displacement -> retrace to FVG/OB -> target opposing liquidity | NY/London | Y |
| Silver Bullet | FVG entries in fixed 1h windows (10-11 ET, 02-03, 14-15) | Fixed window | Y |
| Turtle Soup | Fade a failed breakout of prior session high/low (false break + reversal) | Any | Y |
| Judas Swing | Early-session false move that reverses; fade the manipulation leg | London/NY open | Y |
| SMT Divergence | NQ vs ES/YM failure to confirm new high/low | RTH | Y (needs 2nd symbol feed) |
| Power of Three | Accumulation -> Manipulation -> Distribution (daily open model) | Daily | Y (as bias, not entry) |
| Unicorn | Breaker + FVG overlap entry | NY | Y |
| Venom | Liquidity-engineered reversal variant | NY | Partial — define strictly or REJECT |
| London Reversal | Reversal off London session extreme into NY | London->NY | Y |
| NY Reversal | Reversal off NY AM extreme | NY AM | Y |

## 4. Session / Time concepts (ET)

| Block | Window (ET) | Use |
|---|---|---|
| London KZ | 02:00–05:00 | Entry window |
| NY AM KZ | 07:00–10:00 (Silver Bullet 10:00–11:00) | Primary entry window |
| NY PM KZ | 13:30–16:00 | Secondary |
| Macro times | top-of-hour :50–:10 windows | Volatility expansion filter |
| Daily bias | Prior day H/L + current daily open + PD array on 1H/4H | Directional filter |
| Weekly bias | Weekly open + prior week H/L | Directional filter |

## 5. Funded Account Rules (to encode as risk constraints — verify current values in Phase 12)

| Firm | Trailing DD | Daily loss | Consistency | Notes |
|---|---|---|---|---|
| Apex | Trailing EOD (intraday trail stops at start balance+profit until buffer) | none hard | 30% best-day rule on payout | Multiple sizes (25k–300k) |
| Topstep | Trailing max DD (intraday peak based) | Daily loss limit per acct size | 50% consistency (no day >50% of profit) | XFA rules |
| TradeDay | Trailing DD | Daily loss limit | Consistency on payout | EOD vs intraday trail varies |
| MyFundedFutures | Trailing/static depending on plan (Starter/Expert/Milestone) | Daily loss limit | 40% consistency some plans | Static-DD plans exist |

> ACTION (Phase 12): these numbers MUST be re-verified against current rule pages before
> encoding hard limits. Treat above as structural categories, not exact figures.

## 6. Codeable concept shortlist for v1 build (highest objectivity, lowest repaint risk)
1. FVG (size-filtered, ATR-normalized)
2. MSS via displacement close through confirmed swing
3. Liquidity sweep (wick-through + close-back-inside)
4. Premium/Discount fib filter
5. NY AM killzone time filter
6. Daily bias (prior-day H/L + daily open)

These six form the v0.1 → v1 core. Everything else is a candidate add-on tested for
*incremental* expectancy in Phase 8–9 (must beat the baseline or be discarded).

## 7. Hypotheses to test (falsifiable)
- H1: ATR-normalized FVG entries in NY AM KZ have positive expectancy > 0.1R over baseline.
- H2: Requiring a liquidity sweep before MSS increases win rate without halving trade count.
- H3: Discount-only longs / premium-only shorts improve PF vs no-fib filter.
- H4: News blackout (Phase 2) reduces MaxDD more than it reduces net profit.
Each hypothesis is accepted/rejected by backtest data in later phases — never assumed.
