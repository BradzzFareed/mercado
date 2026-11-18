# REPORT_A4: interval calibration for real series

Branch `a/intervals` (from `main` @ `5dbfb7b`). Three commits, nothing pushed.
Measured 2026-11-18. Outputs in `~/mercado_audit/a4/`.

## Verdict

- **M1:** the leak mechanism is **CONFIRMED BY CONSTRUCTION**. 80.0% of the engine's backtest origins end on an interpolated week, and 70.0% of their `actual` points are interpolated. The brief's claim that live forecasts are unaffected is **REFUTED for the interval width**: live σ comes from the same backtest on the same series, so it inherits the mid-segment origins. The point forecast's last value is real. Attribution to the leak alone is not isolated (see open questions).
- **Full engine (M2): PASS.** k = **1.60** (smallest 0.05 step with 80% pooled coverage on half A). Held-out half B: **80.4%** overall, minimum commodity **72.5%** (eggplant). k ≤ 2.0. Applied to real full-engine series.
- **Quick engine (M3): FAIL.** Overall held-out 83.9% passes, but rice is 60.8% (floor 70%). Stays unscaled, and its label is `null`.

## Pre-change answers

- **Where lo/hi come from:** `forecast._run()`, `lo/hi = exp(point ∓ 1.2816·σ)`. σ is `res.sigma` from `models.py`: the RMS of the ensemble's rolling-backtest errors (full) or Holt-Winters residual sd (quick). Scaling was possible in `forecast._run()` alone, with no `models.py` edit. Only `lo`/`hi` were scaled, not σ, so `prob_up` and signals cannot move.
- **Backtest origins:** `models.full(origins=10, step=3)`: weekly indices `n-5, n-8, …, n-32`, target path 5 weeks. The `model_lab` block reads `series` (week-4 rows) and the metrics.
- **Mid-segment for real series:** 80.0% of origins (exact Monday rule). The earlier 70% from A2c was a ±6-day approximation and undercounted.
- **Quick intervals:** yes, from Holt-Winters residual σ, no backtest.
- **Accuracy numbers:** ModelLab reads the `model_lab` block, which is backtest MAPE/direction, not intervals.

## A3' scripts

None existed under `~/mercado_audit/` (only `setup/{a,b}`: scratch DBs and the verified CSV). I wrote a new leak-free harness: `measure_a4.py`, `analyse_m2m3.py`, `build_scratch.py`.

## Scratch database

Built offline by `build_scratch.py`: `pipeline.run("seed")`, then `pipeline.run("wfp")` with the HDX token replaced by a `file://` URL to the cached CSV and the verified MD5 `2440ab74363fb321d317430b09b72453`. The real download, MD5 check and transactional write ran unmodified. Result: 2,544 real series, 820,707 real prices, 216,378 observations, the same counts as the A2c scratch DB. `scripts/setup_live_data.sh` was not used because it needs HDX access.

Validation: rebuilding the weekly series from `observations` with the ingest builder reproduces the stored real prices exactly (8 of 2,544 series checked, max diff 0.0).

## M1 (exact Monday rule)

| Scope | Origins | Last known week interpolated | `actual` interpolated |
|---|---:|---:|---:|
| Legacy real full (688 series) | 6,880 | **80.0%** (5,504) | 70.0% (4,816) |
| All real full (2,474 series) | 24,740 | 80.0% (19,792) | 70.0% (17,318) |

Identical per commodity. Origins are 2 of 10 on a real Monday for every series, so the 80% is structural to the 3-week step against a monthly series.

## Leak-free definition used for M2/M3

For each real full-tier series and each origin month m (with month m+1 observed, and the series full-tier at m: ≥36 observation months and ≥145 weekly points): truncate observations at m (all markets), rebuild weekly with `pipeline._monday` plus `store.interpolate_weekly`, swap `store.series` for that rebuild, and call `forecast._run(..., "full"|"quick")`, which is the served path. Actual is the market mean on the next month's Monday. Compared at day 30 with `forecast._at_day`, as `/forecast` does. The last 12 eligible origins per series.

**Deviation:** eligibility was first set to ≥110 weeks. The first run crashed on a series with origins below full tier. I discarded that run and tightened the rule to the full-tier state above. Not tuned to any result.

## M2 (full engine), split by series

Sample: 20 real full-tier series per legacy commodity, `numpy` seed 42, stratified 10 / 10 into A and B. Records: 200 series, 2,350 origins (195 series have 12; 4 have 1 and 1 has 6, because they have few eligible origins). `error_series: 0`.

| | Origins | Raw (k=1.00) | At k = 1.60 |
|---|---:|---:|---:|
| Half A (fit) | 1,200 | 64.8% | 80.7% |
| Half B (held-out) | 1,150 | **66.0%** | **80.4%** |

k curve on A: 1.00 → 64.8%, 1.30 → 73.7%, 1.50 → 78.5%, **1.60 → 80.7%**. Verified: k=1 reproduces the served band exactly (max abs diff 0.0).

Held-out B per commodity, at k=1.60 (raw in brackets):

| Commodity | n | At k | Raw |
|---|---:|---:|---:|
| Rice | 120 | 78.3% | 62.5% |
| Pork | 120 | 83.3% | 65.8% |
| Chicken | 120 | 86.7% | 70.0% |
| Eggs | 92 | 81.5% | 69.6% |
| Bangus | 120 | 81.7% | 68.3% |
| Tomato | 120 | 80.0% | 61.7% |
| Onion | 120 | 77.5% | 70.0% |
| Calamansi | 120 | 78.3% | 65.8% |
| Cabbage | 109 | 84.4% | 68.8% |
| Eggplant | 109 | **72.5%** | 57.8% |

Rule: 80.4% ∈ [75, 85] ✓; minimum 72.5% ≥ 70 ✓; k 1.60 ≤ 2.0 ✓ → **PASS**.

## M3 (quick engine), same sample and origins

Raw A 79.5%, raw B 82.4%. Smallest k on A: 1.05 (A 81.6%). Held-out B at 1.05: **83.9%** overall, but rice **60.8%** (below 70%) → **FAIL**. Quick stays unscaled. Other commodities on B at 1.05: pork 95.0, chicken 94.2, eggs 91.3, calamansi 91.7, bangus 85.8, tomato 85.8, cabbage 83.5, onion 76.7, eggplant 75.2.

Label rule: raw B 82.4% is outside 58–72%, so the quick label is `null`.

## Label rule and the full-engine label

PASS → `INTERVAL_LABEL = "80%"` (measured on held-out half B).

## M4 (signal consistency, live series)

Legacy 10 commodities, all provinces, real full-tier series: **688**. `differ` = quick signal ≠ full signal, day-30 signal (the only real horizon).

- **differ / total = 199 / 688 = 28.9%** (agreement 71.1%).
- Confusion table, **rows = full engine, columns = quick engine**:

| full \ quick | surge | dip | stable |
|---|---:|---:|---:|
| surge | 93 | 2 | 47 |
| dip | 2 | 1 | 7 |
| stable | 116 | 25 | 395 |

Marginals: full surge 142, dip 10, stable 536. Quick surge 211, dip 28, stable 449. The quick engine calls more surges and dips than the full engine (more often in the direction "quick > full").

Per commodity differ: onion 38/60, cabbage 31/71, eggplant 28/79, tomato 24/72, bangus 16/74, calamansi 15/47, pork 13/76, rice 13/80, chicken 11/62, eggs 10/67.

## Changes

Commit 1 `9d1a71b` feat(forecast): `backend/mercado/forecast.py` only. `INTERVAL_SCALE_REAL = 1.60`, `INTERVAL_LABEL = "80%"`. `_run` scales `lo/hi` by k for full real series. `_interval_meta()` adds `interval_label` and `backtest_basis` to `/forecast`.

Commit 2 `ba34b5a` test(forecast): `backend/tests/test_intervals.py`, 13 tests.

Commit 3 docs: `PROJECT_SPEC.md` §3, §7, §12.4, §12.6 and header; `AGENTS.md` test line; `docs/audit/REPORT_A4.md` (this report).

## Served output (scratch server, same request order before and after)

Before: `forecast ncr/rice` (full, real), `forecast batangas/calamansi` (synthetic), `overview ncr`, `map rice`, `meta`. Full-cache priming for ncr/rice happens first in both runs.

- `meta`: byte-identical.
- `forecast ncr/rice`: point forecast, change, `prob_up` and signal identical. 30-day band 46.26–47.22 (width 0.96) → 45.97–47.51 (1.54), ×1.60. The 5 forecast-path `lo`/`hi` moved too. New fields `interval_label` `"80%"` and `backtest_basis` `"interpolated_weekly"`.
- `forecast batangas/calamansi` (synthetic): only the two new fields differ.
- `overview ncr`: only `items[0]` (rice, cached full) changes its 30-day `lo`/`hi`. Other items use the quick engine, so they are unchanged.
- `map rice`: only the ncr row's 30-day `lo`/`hi` changes, for the same reason.

So `/overview` and `/map` change only where a full result is cached, and only in `horizons.30.lo/hi`.

## Tests

`uv run pytest -q`: **130 passed** (117 before + 13 new), 1 warning, **137 s** on this machine. Earlier runs: 108 s for 117 tests. The A2c note recorded 44.5 s on a quieter machine.

## Integrity

- `backend/data/mercado.db` sha256 at start: `27b6d0071ca48f507a32de66d83e1ade86f855256ca7b6e8b1739d8fb9ff0917`. At end: the same (checked after all runs).
- All measurement and serving used `~/mercado_audit/a4/data` (scratch). The live database was never opened for writing.

## Open questions and deviations

1. **Leak in the point forecast's weights.** The ensemble weights are fitted on the same leaky backtest. Point forecasts were not changed (out of scope), so they may still be biased. Worth a separate audit.
2. **Attribution.** The k-scale corrects the observed undercoverage (66% at 80% nominal). It does not prove that the mid-segment origins are the whole cause. A test with an inner backtest on non-interpolated weekly points would isolate it.
3. **Synthetic label.** `interval_label` is `"80%"` for synthetic full-engine series. This is the nominal z-value, not a measured coverage. You may prefer `null` there.
4. **`backtest_basis` for quick real series is `null`**, not `"interpolated_weekly"` as the brief's literal wording would give. Quick has no backtest, so the basis would be false.
5. **Test time claim.** The brief's wording ("about 5 minutes on a typical dev machine") is used as instructed. This machine measured 108–137 s (about 2 minutes). You may want "about 2 minutes".
6. **Docs not touched, per "no other doc edits":** PROJECT_SPEC §4.4 line 155 ("the 80% interval comes from the backtest residual σ") and README line 44 are now slightly stale for real series. §3 still lacks `test_tiers`, `test_perf`, `test_api_fields` and the new `test_intervals`.
7. **Quick engine calibration** is unresolved: its raw coverage is 82%, but rice is 61% held-out. Not scaled, per the rule.
8. **Short series.** Five series had fewer than 12 eligible origins (2,350 of 2,400 origin points). This is not a sampling error, but it does shorten the sample slightly.
9. **M1 correction.** The 70% figure quoted in the A2c context came from an approximate ±6-day rule. The exact rule gives 80%. The verdict is unchanged.
