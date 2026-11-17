# REPORT_A2C

Branch `a/tiers` — five commits on `main` @ `3559432`, working tree clean, nothing pushed.

`backend/data/mercado.db` sha256 before and after: `bc9bd8df35a901ea399978c9a2b9f37f4a36778d868c08a2d0fbfa6659f01c0d` — **unchanged**. All runs used scratch `MERCADO_DATA_DIR`s under `~/mercado_audit/a2c/`; `MERCADO_SCHEDULER=0` everywhere; unit tests offline.

## Pre-change answers

- `/overview` ran the **full** engine for every commodity (43 NCR commodities ≈ 17.6 s). `/map`/`/compare` used full only when already cached, quick otherwise, and quick results were written into the same cache (`("core","quick",…)`). `/forecast` always ran full; no quick fallback.
- Forecast cache key: `("core", mode, province, commodity)`; dict + `RLock`; check-get then compute-set could double-compute a key. `store` cached one DataFrame, dropped on any transaction.
- The shared DataFrame was safe to read from several threads (never mutated after build); only its unlocked publication in `store.load()` raced — fixed (now built under `_lock`).
- DISHES quantities are in the commodity's price unit; torta eggs were `0.1667` dozen (2 eggs). Dish cost is computed only in the frontend (`Planner.jsx`: `other + Σ amt × price`); the backend only serves `DISHES`.
- `models.full()`'s backtest exposes **MAPE, not MAE** (`metrics[...].mape`, `mape_h4`, plus `series` rows at week 4 with `actual`/`naive`/`ensemble`). MAE is derived from those week-4 price rows.

## Commits

| Commit | Content |
|---|---|
| `dfc5eb8` `fix(eggs)` | registry eggs `piece`; generator scale parameter `base 85 → 85/12` (chosen over post-dividing; log-additive, so identical to dividing before rounding); torta eggs `2.0` pieces; snapshot fixture; 6 new tests |
| `9598f53` `feat(tiers)` | `tiers.py`; store read helpers, all reads `COALESCE(source,'synthetic')`; additive `/meta` fields; `GET /coverage`; 12 new tests |
| `9fa0d2a` `perf(forecast)` | quick engine for uncached overview/map/compare (quick results **not cached**); compact capped cache (`CACHE_MAX_ENTRIES=3000`, oldest eviction); keyed series view; ordered background warm; store-generation-driven cache invalidation |
| `3debdba` `feat(api)` | per-series `source/tier/engine/native_step/unit/confidence/baseline/horizons_available`; horizon 422 with `available_horizons`; history-only 200; gated `no_gain_vs_last_price` |
| `e1b3135` `docs` | PROJECT_SPEC §12 as implemented, AGENTS.md, `wfp.py` docstring only (code untouched) |

## Eggs baseline

- Baseline saved in `~/mercado_audit/a2c/baseline/` (generator CSV, `/meta` eggs entry, hashes).
- Latest NCR synthetic eggs 122.48/dozen → 10.21/piece; full synthetic range 6.19–11.23/piece (inside the asserted 5–20).
- Torta cost at the same underlying prices: baseline **36.5336** → unchanged to < 0.01 (2.0 pieces × per-piece price == 0.1667 dozen × per-dozen price).
- Non-eggs generator output byte-identical: per-commodity sha256s (9 commodities × 91,800 rows) recorded in `tests/fixtures/eggs_baseline.json` and asserted.

### Remaining "dozen" strings

Backend fixed in commit 1 (`commodities.py:43` comment, registry JSON unit/unit_label/_meta, test snapshot fixture). The only backend occurrence left is the provenance note `backend/mercado/registry/commodities.json:29` ("legacy eggs unit changed dozen -> piece"), which must name the old unit.

Frontend (Lane C, untouched): `frontend/src/i18n.js:54,84` (`common.perdz`, '/dozen', '/dosena'); `frontend/src/components/PriceTag.jsx:15`; `frontend/src/pages/Detail.jsx:22`; `frontend/src/pages/Planner.jsx:102` ('dz', plus `DEFAULT_QTY` `eggs: 3` in dozens). All three components render "/kg" for `unit === 'piece'` until Lane C adds a per-piece label, and index `horizons['14']` on rows that now only carry `30`.

## Tests

- Before: 63 tests, 58.3 s. After: **99 tests, 44.5 s** (`uv run pytest -q`), all passing. Every commit passed on its own.

## Measurements (scratch DB: seed + real WFP CSV, 820,707 real + 11,016 synthetic rows, 2,571 price series, 216,378 observations)

| Endpoint (cold, fresh process) | Result |
|---|---|
| `/overview?province=ncr` | **2.0 s**, 200, 43 items, all `quick` (was 17.6 s, all full) |
| `/map?commodity=rice` | **0.97 s**, 200, 80 rows, all `quick` |
| `/compare?province=ncr&commodity=rice` | **1.13 s**, 200, 80 rows |
| `/meta` | 0.18 s, **42.6 KB** |
| `/coverage` | 0.01 s, **175.3 KB**; 2,578 rows default, 4,409 with `?include_hidden=1` (2,501 forecast / 77 history / 1,831 hidden) |

The remaining ~2 s is dominated by the one-time `store.load()` (≈0.7 s SQLite fetch of 831k rows), the tier scan (≈0.4 s) and 43 quick forecasts (≈0.4 s); subsequent requests are ~0.4 s.

### Served-JSON equality (compact cache, commit 3)

Captured before (worktree @ `3559432`) and after on the same scratch DB: `/forecast` (rice/ncr), `/map` (rice) and `/compare` are **byte-identical**. `/overview` differs only by the intended engine switch (uncached series full → quick; `basket.current` identical at 1403.72).

### Warm (legacy 10 × provinces = 715 stored full-engine series)

| Workers | Wall | s/series | RSS after (from ~168 MB start) |
|---|---|---|---|
| 1 | **296 s** | 0.415 | 550 MB |
| 4 | 403 s | 0.564 | 571 MB |
| 8 | 409 s | 0.572 | 595 MB |

Threads only add contention (the engine is GIL-bound), so `warm` defaults to **1 worker**. Memory: live cache data is **~8 KB/entry** (5.7 MB for 715; extrapolates to ~20 MB for all 2,501 full-engine series). The ~380 MB RSS jump is allocator high-water retention from the first fits: it plateaus (flat between 70 and 715 series in a controlled run), so warming the remaining ~1,800 series should not add proportional RSS. All 2,501 fit inside `CACHE_MAX_ENTRIES=3000`; warm-all is ~1,040 s of background work.

## A3' agreement check (step 14) — see `agreement_result.json`

Engine's own 10-origin backtest, week-4 MAE from `backtest["series"]`, 688 legacy real full-engine series (715 pairs minus 27 synthetic-only). Overall engine-win share **86.0%** vs the A3' band 33–41% (way outside ±10pp), and only **3 of 9** A3'-listed commodities fall on the same side of 50% as A3' (Tomato, Onion, Calamansi; Chicken is the weakest agreement at 67.7% vs A3' 22.2%, Rice 90.0% vs 47.8%). Metrics-MAPE agrees (90.1% overall in the earlier run). **Verdict: FAIL → `NO_GAIN_FLAG_ENABLED = False`, `no_gain_vs_last_price` always `null`.** The gap is in-sample optimism: `models.full()` fits ensemble weights on the same 10 origins it scores. Nothing was tuned.

| Commodity | n | engine wins MAE | A3' prod. | same side of 50% |
|---|---:|---:|---:|---|
| Rice | 80 | 90.0% | 47.8% | no |
| Pork | 76 | 85.5% | 27.3% | no |
| Chicken | 62 | 67.7% | 22.2% | no |
| Eggs | 67 | 73.1% | 25.0% | no |
| Bangus | 74 | 87.8% | 26.1% | no |
| Tomato | 72 | 97.2% | 56.5% | yes |
| Onion | 60 | 80.0% | 61.1% | yes |
| Calamansi | 47 | 95.7% | 66.7% | yes |
| Cabbage | 71 | 88.7% | 42.9% | no |
| Eggplant | 79 | 92.4% | — | n/a |

## Signal consistency (step 15)

Quick-engine (overview) vs full-engine (detail) signals, ncr × legacy 10, 30-day horizon: **0/10 differences (0.0%)** (`signal_consistency.json`). (Pre-change at 7/14/30 it was 0/30.)

## Deviations / notes

- `warm` default worker count is 1, not 4, per the "keep the fastest" rule (measured above).
- Tier decision implemented as agreed: synthetic price series are always `forecast` even when stale observations exist (26 of 27 cases).
- `/meta` commodity-level `horizons` = union (`[7,14,30]` if any synthetic series), `native_step` = `"month"` if any real series; per-series values remain authoritative.
- `/overview` basket covers only the horizons every item in the province has (just `30` where real data exists); `7`/`14` keys disappear there. Lane C note.
- `/forecast` history-only returns `horizons: {}` (the dict analogue of the spec's "[]"); `horizons_available: []` is the explicit list.
- The 7 observations-only non-hidden series (engine `none`) appear in `/coverage` and in the history-only `/forecast` path, but not in `/overview`/`/map` (price-series views).
- Existing dev DBs keep per-dozen synthetic eggs rows until re-seeded (delete `backend/data/mercado.db`); no data migration was requested.
- The old `/meta` commodities/provinces tests that asserted exact field sets were relaxed to "legacy fields ⊆ fields" (additive contract).
