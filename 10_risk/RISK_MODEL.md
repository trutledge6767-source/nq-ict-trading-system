# Phase 12 — Risk Management & Funded-Account Survivability Model

Objective: maximize the probability of PASSING an evaluation and KEEPING a funded account,
not maximizing historical return. Capital preservation dominates.

---

## 1. Position sizing — fixed fractional with volatility adjustment

Let:
- `E`   = account equity (or eval starting balance)
- `riskPct` = fraction of E risked per trade (default 0.5%; A+ only, so low)
- `stopPts` = entry-to-stop distance in points (= stopAtrMlt × ATR + structure buffer)
- `$/pt` = 20 (NQ), `tickValue` = 5 (0.25 pt)

Contracts `N = floor( (E × riskPct) / (stopPts × $/pt) )`, clamped to `[0, maxContracts]`.

Volatility adjustment: because `stopPts` scales with ATR, dollar risk per trade is auto-normalized
across volatility regimes (wide stops in high vol → fewer contracts). This is the key control that
keeps $ risk constant while structure-based stops vary.

`maxContracts` cap prevents oversizing on tight-stop setups (a 2-pt stop must not authorize 50 cars).

## 2. Hard daily / weekly governors (encoded in engine + Pine)

| Control | Default | Rationale |
|---|---|---|
| Max trades / day | 3 | A+ only; prevents tilt/overtrading |
| Daily loss limit | 2R (or firm daily cap, whichever tighter) | stop the day after 2 losers |
| Daily profit lock | optional +3R → flat for day | protects green days (consistency) |
| Weekly loss limit | 4R | stop the week, preserve eval |
| Consecutive-loss lockout | 3 losses → 1-session cooldown | breaks losing streaks/regime mismatch |

These are enforced BEFORE entry: `canTrade = tradesToday<max && dayPnL>-dailyCap && weekPnL>-weeklyCap && !lockout`.

## 3. Funded-account rule structures (verify current numbers on firm pages before going live)

> These are STRUCTURAL categories used by the survivability simulator (10_risk/funded_eval.js).
> Exact dollar figures vary by account size and change over time — re-verify at evaluation time.

### Trailing drawdown (the account-killer)
- **Apex**: trailing threshold follows the intraday/EOD account peak (by unrealized or EOD high,
  depending on plan) UP until it locks at (start balance + a fixed buffer), then stops trailing.
- **Topstep**: trailing max loss based on end-of-day equity peak; also a per-day loss limit.
- **TradeDay / MyFundedFutures**: trailing OR static-DD plans exist; daily loss limits apply.

Survivability implication: a trade that spikes equity then gives it back can BREACH a trailing-DD
even while net P&L is positive, because the threshold ratcheted up to the peak. => Avoid giving back
large open profit; bank partials; the trailing peak is set by your BEST point, not your close.

### Consistency rules
- Common form: no single day may exceed 30–50% of total profit at payout. => Spread profit across
  days; avoid one giant day that locks payout eligibility.

### Scaling / position limits
- Eval contract caps scale with account size; exceeding the cap can void the eval. Respect `maxContracts`.

## 4. Survivability simulator (10_risk/funded_eval.js)

Given a trade-by-trade $ P&L sequence and a rule set {startBalance, trailingDD, dailyLoss,
trailType(EOD|intraday-proxy), consistencyPct, profitTarget}, it computes:
- peak equity & trailing threshold path,
- the first BREACH (trailing-DD or daily-loss) if any,
- whether profit target is reached before any breach (PASS),
- worst day as % of total profit (consistency check),
- summary: PASS / FAIL / INSUFFICIENT-DATA.

Because it runs on a P&L vector, it is engine-output-driven and data-independent in design — it will
evaluate whatever backtest sample exists, and labels confidence by trade count.

## 5. Default risk profile for the A+ system (conservative eval preset)
- riskPct 0.5%, maxContracts sized to account, RR ≥ 2.0
- daily loss 2R, weekly loss 4R, 3 trades/day, 3-loss lockout
- bank 50% at +1R (reduce give-back vs trailing DD), trail remainder to breakeven+
- news blackout (Phase 2) to avoid event-driven trailing-DD spikes

Target operating point: high expectancy per A+ trade with capped daily downside so a bad day costs
≤2R and cannot breach a typical trailing-DD in one session.
