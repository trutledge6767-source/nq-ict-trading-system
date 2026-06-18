# Rejected / Unsupported Candidates (anti-overfitting discipline)

Per mission rules, concepts are ADOPTED only when data supports them. Below are ideas that were
built, tested, and NOT adopted as defaults — kept here so they aren't blindly re-tried.

| Candidate | Engine toggle | Test result | Decision |
|---|---|---|---|
| ATR volatility-regime filter (trade only mid-band ATR percentile) | `useVolFilter` (default OFF) | On variable-vol synthetic: reduced trades (96->60->35) but WORSENED expectancy (-0.18 -> -0.42/-0.34) and did not reduce DD reliably | NOT ADOPTED. Stays OFF. Re-test only on REAL NQ; no synthetic support. |

## Why keep the toggle if rejected?
The code path is harmless when OFF (regression-verified: identical results), and it lets a future
real-data walk-forward objectively re-test the idea. Rejection here = "no evidence it helps," not
"impossible" — but it will NOT be enabled without real-data evidence (no overfitting-by-intuition).

## Discipline note
This file is the counterweight to the improvements log: partial-profit and ATR-trailing were ADOPTED
because the data (engine + Monte Carlo) supported them; the vol-regime filter was REJECTED because the
data did not. Same standard applied both ways.
