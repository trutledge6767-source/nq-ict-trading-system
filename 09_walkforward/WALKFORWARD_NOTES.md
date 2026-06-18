# Phase 11 — Walk-Forward Harness (anti-overfitting)

`walkforward.js` — rolling TRAIN/TEST folds; grid-search params on TRAIN (optimize expectancy
with PF/DD terms + min-trade guard), apply the WINNING params to the immediately-following unseen
TEST window, aggregate out-of-sample (OOS) results. Uses the production engine (non-repainting).

## Self-test validation (synthetic random/zigzag data, 4000 bars, 5 folds)
- meanIS_expR = +0.436  (in-sample, optimized)
- meanOOS_expR = -0.16  (out-of-sample, unseen)
- degradation = 0.596 ; verdict = INSUFFICIENT-OOS-SAMPLE (15 OOS trades < 20 guard)

INTERPRETATION (this is the POINT): on data with NO real edge, in-sample optimization produces a
positive-looking fit that COLLAPSES out-of-sample. The harness correctly exposes this — proving the
anti-overfitting machinery works. Any real strategy must show OOS expectancy that holds up vs IS
(degradation < ~0.3 AND OOS expR > 0 AND OOS trades >= 20) to earn the ROBUST verdict.

## Verdict thresholds
- OOS trades < 20            -> INSUFFICIENT-OOS-SAMPLE
- OOS expR>0 & degradation<0.3 -> ROBUST
- OOS expR>0 & degradation>=0.3 -> WEAK-OOS-positive-but-degrades
- OOS expR<=0               -> OVERFIT/FAIL

## Usage
- `node walkforward.js <dataFile.json> [--folds N] [--testFrac F]`  (production: full filters)
- `node walkforward.js --selftest`
- Programmatic: `walk(data, folds, testFrac, baseParamOverride)` — baseParamOverride lets you
  walk-forward a specific filter configuration.

## Status vs data ceiling
Cannot yet produce a ROBUST verdict on REAL NQ data: the 302-bar 5m sample yields too few trades
per fold (same data ceiling documented in 04_backtests/READING_NOTES.md). Harness is READY; it will
deliver a real verdict the moment a larger bar sample is available.
