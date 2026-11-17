# A2b report: WFP ingest on the registry

Branch `a/ingest` (from `main` at `64e046c`). Five commits, no push, no rebase.

| # | Commit | Subject |
|---|---|---|
| 1 | `513c0e5` | feat(store): observations table, source column and source_token with guarded migration |
| 2 | `77ce87f` | feat(pipeline): load WFP via wfp.py with registry mapping, transactional and token-skipping |
| 3 | `d024fa6` | fix(pipeline,main): simulate and seed spare real series; scheduler opt-in |
| 4 | `69ca528` | test(ingest): ingest, migration and safety tests |
| 5 | `401a9d6` | docs: PROJECT_SPEC.md and AGENTS.md updates |

## Pre-change answers

- **`store.connect()` sets `row_factory = sqlite3.Row`:** yes (`store.py`, line 30).
- **Modes `/pipeline/run` accepts:** `live`, `wfp`, `inbox`, `da`, `simulate`, `seed`. An unknown mode returns 400. The body defaults to `live`.
- **Lock against concurrent runs:** yes. `pipeline._run_lock` is a non-blocking `threading.Lock`. `main.pipe_run` turns the contention result into HTTP 409. It is per process only, so two uvicorn workers would not share it. No change was needed in `main.py`.
- **`live` versus `wfp` before A2b:** `live` ran `wfp → inbox → da`, with failures isolated per source, and reported `no_update` when nothing was added. `wfp` ran the same code without the other sources. The old WFP path used `fetch_wfp` (a name heuristic, no token, no MD5), then `normalize_wfp` (legacy `match_*` functions), then `apply_live`. `apply_live` replaced only series spanning 110 or more calendar weeks and dropped the rest without storing them.

## Files changed

- `backend/mercado/store.py`: schema, guarded `migrate()`, `init_db()`, `transaction()`, `replace_series`, `insert_observations`, `upsert_prices(df, con=None)`, `interpolate_weekly`, and synthetic-aware helpers. `reset_prices` was removed.
- `backend/mercado/pipeline.py`: rewritten WFP path, `normalize_wfp` on the registry, `build_wfp_plan`, `_prepare_inbox`, simulate and seed rules, one transaction per run. `fetch_wfp`, `apply_live`, `read_inbox` and `_unit_factor` were removed.
- `backend/mercado/sample_data.py`: rows labelled `synthetic` instead of `sample`.
- `backend/main.py`: scheduler starts only when `MERCADO_SCHEDULER == "1"`. Nothing else changed.
- `backend/tests/test_ingest.py`: new, 20 tests.
- `backend/tests/test_mercado.py`: removed `test_wfp_normalizer_handles_hxl_row_and_units`. It tested the old unit conversion; `test_ingest.py` replaces it.
- `PROJECT_SPEC.md`, `AGENTS.md`: docs only.

Not touched: `models.py`, `forecast.py`, `wfp.py`, `geo.py`, `commodities.py`, the frontend, `pyproject.toml`, `uv.lock`, the registry JSON.

## Tests

- `uv run pytest -q`: **63 passed** in about 45–50 s (offline). Before A2b: 44. Net +19: 20 new minus 1 removed.
- Every ingest test runs on its own temporary database and inbox. WFP's token and MD5 code run against a fake opener.

## End-to-end (scratch DB, real CSV, `MERCADO_WARM=0`)

Script: `~/mercado_audit/a2b/e2e.py`. Result: `e2e/e2e_result.json`. The fake opener serves the real `pkg_show.json` and the real CSV through `wfp`'s own functions.

1. **Seed** (lifespan seeded 102,000 synthetic rows; explicit `seed` run rewrote them): `ok`.
2. **WFP load:** `ok`, MD5 matched `2440ab74…2453`. 240,534 retail rows: 6,924 non-retail excluded, 24,025 before 2019, 0 invalid, 0 unknown labels, 131 quarantined (Santa Cruz 65, Catarman 66), 0 unmapped. 216,378 observations. 2,544 series real (820,707 weekly prices), 1,857 short and 7 stale kept as observations only.
3. **`/meta`:** `data_version` `1:2026-11-17T07:55:43` before the load and `2:2026-11-17T07:55:57` after. `last_updated` present. 81 provinces, 59 commodities (11 commodities have only observations).
4. **`/overview?province=ncr`:** HTTP 200, 43 items, as_of 2026-10-12, basket current 1,403.72. Cold, with full ensembles, 17.6 s.
5. **`/forecast?province=ncr&commodity=rice`:** HTTP 200, as_of 2026-10-12, current 46.66. The 7/14/30-day points are 46.68, 46.69 and 46.73, all signals `stable`. The 80% band is 46.20 to 47.16 at 7 days.
6. **WFP again:** `no_update`, "Skipped, unchanged", zero downloads on the second run, one new `pipeline_runs` row, no data writes.

**sha256 of `backend/data/mercado.db`:** `2b283ec9e5ccb168e6663b8b428198cf055307988a44bd13197a23fe517eaf5c` before and after. Unchanged. Every run used a scratch `MERCADO_DATA_DIR`. The migration was tested on a copy.

## Migration (on a copy of the dev DB)

- The dev DB had 46,359 price rows before the change: 22,450 labelled `sample` and 23,909 labelled `wfp`. Both were relabelled `synthetic`. That label is a default, not proof. The rows were not recorded with an origin.
- `prices.source` already existed, nullable. Existing databases keep it nullable because SQLite cannot add `NOT NULL` without a table rebuild, which I did not do. Fresh databases get `NOT NULL DEFAULT 'synthetic'`. Covered by tests.
- Running `init_db()` twice gives the same result.

## Contamination (5a): old mapping vs new, real CSV

Old side: `git archive` of `HEAD` at `~/mercado_audit/a2b/snap`, imported in its own process. New side: this branch. Scope: retail rows dated 2019 or later, 216,509 rows. The old per-row mapping covers only the 10 legacy commodities, because the old code only kept those.

| Measure | Value |
|---|---|
| Rows kept by both mappings | 30,876 |
| Rows whose **province** changed | 7,205 |
| Rows whose **commodity** changed | 5,672 |
| Province or commodity changed | 11,514 |
| Old kept, new quarantined | 38 (all Leyte, from Catarman) |
| Series keys losing rows / gaining rows / touched | 116 / 244 / 360 |

Province changes by rule: market rule 1,354 rows (Pampanga 988, Davao Occidental 366). Admin2 lookup 5,851 rows. The admin2 cases are old substring-alias matches, for example `Southern Leyte → leyte`, `Davao del Norte → davao-sur`, `Davao de Oro (Compostela Valley) → davao-sur`, `North Cotabato → maguindanao`, `Zamboanga Sibugay → zamboanga-sur`.

Expected cases, all rows in the CSV:

- **Pampanga:** 2,935 rows, all under `bulacan` before and `pampanga` now. Market rule.
- **Davao Occidental:** 695 rows, `davao-sur` before and `davao-occidental` now. Market rule.
- **Catarman:** 66 rows, `leyte` before and quarantined now. Market rule.
- **Santa Cruz:** 65 rows, unmapped before and quarantined now. Market rule.
- **Camarines Sur (Masbate filing):** 2,627 rows, `camarines-sur` under both. Unchanged.

Commodity changes (legacy id before, new id now): pork 2,898 (`Meat (pork, with bones)` 2,420, `Meat (pork, hock)` 352, `Meat (pork, with fat)` 126), cabbage 1,635 (`Cabbage (chinese)`), eggs 627 (`Eggs (duck)`), onion 483 (`Onions (white)`), chicken 29 (`Chicken` → `chicken-generic`). Pork's real series therefore reflects only `Meat (pork)` in the legacy series.

Rows kept only by the new mapping (185,502) are mostly non-legacy commodities that the old code did not keep. That is coverage, not contamination.

Legacy series, old (all history) vs new:

| Commodity | Old, legacy provinces | Old, pass 110-week span gate | New real | New observations-only |
|---|---|---|---|---|
| rice | 24 | 24 | 25 | 0 |
| pork | 23 | 23 | 24 | 0 |
| chicken | 24 | 20 | 19 | 6 |
| eggs | 24 | 21 | 20 | 5 |
| bangus | 24 | 24 | 25 | 0 |
| tomato | 24 | 24 | 25 | 0 |
| onion | 24 | 23 | 22 | 3 |
| calamansi | 24 | 18 | 18 | 7 |
| cabbage | 24 | 23 | 21 | 4 |
| eggplant | 24 | 23 | 24 | 1 |

Across the 250 legacy pairs in the E2E DB: 223 real, 27 still synthetic (26 observations-only plus 1 with no WFP data).

## Changing market sets (5b)

Method: `~/mercado_audit/a2b/market_sets.py`. The market set is the set of markets with an observation in each calendar month. At each change month, `effect = log(mean of current set) − log(mean of previous set) − median over common markets of log(change)`. Flagged when `|effect| > 5%`. Size for the top-20 list is `|effect|` in percent. This is my definition; the spec did not define size. The rule is unchanged.

- Series observed: 4,408 (459 of the 617 with a set change are real series).
- Series whose market set changes over time: **617**.
- Change months: 892. Comparable (common markets exist): 735. Not comparable (no common market): 157.
- Change months flagged (over 5%): 228. Up 121, down 107.
- Series with at least one flagged change: **183** (140 real).

The top 20 by size are in `market_set_top20.csv`. The largest cases:

- `davao-sur` mangoes-carabao, onion, maize-yellow, tomato, and others, 2022-01. Davao City enters the province. The mean moves about 35–65%, while the common markets move about 0–6%.
- `misamis-or` calamansi, 2021-01. The one remaining market drops out. The mean moves −60%.
- `zamboanga-sur` water-spinach, 2022-01. Zamboanga City enters. +45%.

Decision for the owner: the mean rule makes the level of a real series depend on which markets reported each month. Options are to keep the mean, to use a fixed market panel, or to use a common-market index. `MULTI_MARKET_RULE` makes the switch a one-line change.

## Series counts (5c)

- Written to `prices` as real: **2,544** series, 820,707 weekly rows.
- Observations only, short (under 110 weeks): **1,857** series, 18,781 observations.
- Observations only, stale (last observation before the cutoff, 2026-07-15): **7** series, 194 observations.
- Quarantined rows: **131**. Santa Cruz 65, Catarman 66.
- Unknown WFP labels skipped: **0 rows**, 0 labels. Every retail label in this CSV is in the registry.
- Unmapped rows: 0. Duplicate observation keys: 0.
- Non-retail excluded: 6,924. Before 2019: 24,025.

## Unit-scale mismatch (no conversion done)

- **`eggs` (blocking before the eggs series reach the UI or the menu planner):** the registry declares `eggs` as **dozen**, and the synthetic history is per dozen (median 113.5 in 2026). WFP's native unit for `Eggs` is `Unit` (per piece). The real series stores per-piece prices (median 8.96 in 2026, NCR latest 8.58). After the load, `/overview` and `/forecast` show about 9 for eggs where the synthetic data showed about 113. The carinderia "torta" dish (`commodities.DISHES`) costs eggs per dozen, so its cost is about 12× too low. The loader does not convert, per the spec. Choose one of: multiply the `Eggs` observations by 12 before weekly aggregation, or change the registry unit to piece and re-derive the dish amounts.
- Other legacy commodities are native KG, matching the registry. Their level changes at replacement are real data replacing synthetic data, not unit errors: rice 41.0 vs 45.0 synthetic, pork 320 vs 314, chicken 195.5 vs 167, bangus 205 vs 169, tomato 76.2 vs 48.5, onion 145 vs 91.4, calamansi 75 vs 63.9, cabbage 83.7 vs 53.8, eggplant 75 vs 61.0 (medians of native observations 2019 or later vs the synthetic medians).

## Deviations and open questions

1. **Frontend regression (not fixed, frontend out of scope):** `SampleBadge` and the Pipeline sample note check `sources.sample`. The badge is now hidden even though data is synthetic. Documented in PROJECT_SPEC §8 item 8. Needs a one-line frontend change to `sources.synthetic`.
2. **Eggs unit** (see above). This is the most important open item.
3. **Overview cost:** `/overview?province=ncr` now computes full ensembles for 43 commodities. Cold, that is 17.6 s on this machine. A2c (tiers and quick-engine routing) is the place to fix it.
4. **`wfp.py` docstring** still says `pipeline.fetch_wfp()` keeps its heuristic fetch. That is stale now. I did not edit `wfp.py`, which was out of scope.
5. **Schema details:** `observations` primary-key columns are `NOT NULL` (the spec wording did not say so; this is stricter). `source_token` stores the JSON of the whole `RemoteToken`, including the URL, not a bare hash.
6. **Commit layout:** the inbox rewrite is in commit 2 rather than 3, because the loader needed the same transactional path. Commit 4 includes a two-line removal of the unused `store.reset_prices`, amended into HEAD before any push. I did not rebase. The lock in `main.py` already existed, so commit 3 has no lock code.
7. **`simulate` and `seed` run-row labels** still say `sample` in `pipeline_runs.source`. Only the prices column changed.
8. **Real HDX path not exercised live.** The E2E used the audit copy of `package_show` and the real CSV, served through `wfp`'s own functions. The ingest tests cover the token, MD5 and failure paths with the same fake opener. No live network call was made.
9. **Mapping edge:** the real CSV has no HXL tag row (`hxl: 0`). The skip stays as a defence.
10. **Three test bugs** were fixed during the work: a DB read before `init_db()`, a simulate expectation that left out `cebu/rice`, and a seed check that compared the whole table instead of real rows. In each case the pipeline behaved as intended and the test was wrong.

## Files

- `REPORT_A2B.md` (this file)
- `contamination_summary.json`, `contamination_province_pairs.csv`, `contamination_commodity_pairs.csv`, `legacy_series_changes.csv`
- `market_set_summary.json`, `market_set_top20.csv`, `market_set_changes_all.csv`
- `new_stats.json`, `new_series.csv`, `new_observations.csv`
- `e2e/e2e_result.json`
- `db_sha_before.txt`, `db_sha_after.txt`
- Scripts: `measure_old.py`, `measure_new.py`, `compare.py`, `market_sets.py`, `e2e.py`, `hdx_harness.py`
