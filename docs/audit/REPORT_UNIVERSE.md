# Mercado universe audit — WFP HDX price CSV

Read-only audit for the scope expansion (all commodities + all provinces). Repo was
never written to; all scratch work lives in `~/mercado_audit/universe/`. Inputs:
`~/mercado_audit/dl/wfp_http.csv` (MD5 `2440ab74363fb321d317430b09b72453`,
34,079,271 B, 247,458 data rows) and `~/mercado_audit/REPORT.md`.

**Dataset identity** (from the CSV + HDX metadata recorded in the prior audit):
dataset `ea251823-8694-47b4-82d0-7d27f00e8aba`, resource
`9a842d72-0d7d-4922-ad0e-eb8106c1ab0e`, `last_modified` `2026-11-15T09:04:34.681205`.
Monthly observations dated the 15th, 2000-01-15 → 2026-10-15, 108 markets.

All per-task scripts and raw outputs are in this directory:

| script | outputs |
|---|---|
| `task1_commodity_universe.py` | `commodity_universe.csv`, `commodity_summary.md`, `commodity_universe.json` |
| `task2_geography.py` | `admin1.csv`, `admin2.csv`, `geography_summary.json` |
| `task3_misfiled.py` | `market_checks.csv`, `market_suspects.csv`, `market_checks.json` |
| `task4_official.py` | `bg_geography.json`, `admin2_to_official.csv`, `official_mapping.json` |
| `perf_single.py`, `perf_all.py`, `perf_wfp_sample.py`, `perf_memory.py` | `perf_results.json`, `perf_wfp_sample.json`, `perf_memory.json` (DB copy in `perf_data/`) |

---

## 1. Commodity universe (retail rows only)

- Retail rows: **240,534** of 247,458 (pricetype contains "retail").
- Commodity labels in file: **73**; retail-only labels: **70**. The 3 non-retail labels
  are excluded by pricetype, not by name: `Maize flour (white)` (Wholesale, 464 rows),
  `Maize flour (yellow)` (Wholesale, 220), `Rice (paddy)` (Farm Gate, 664).
- Grouping key `(commodity, unit, category)` yields exactly **70 groups** — no
  commodity is split across units or categories.
- Retail units: **KG** 232,345 rows · **Unit** 8,056 rows (only `Eggs`; sold per piece,
  convertible to dozen) · **750 ML** 133 rows (only `Oil (cooking)`, and that label is
  discontinued — see below).
- Retail categories (rows): `vegetables and fruits` 107,981 · `meat, fish and eggs`
  84,648 · `cereals and tubers` 37,500 · `pulses and nuts` 9,951 ·
  `miscellaneous food` 321 · `oil and fats` 133.

### Province series and tiers

Province = `admin2`, except market `Pampanga` (2,935 rows, filed under admin2
`Bulacan`) which is reassigned to province `Pampanga` → **80 effective provinces**
(79 admin2 + Pampanga; see §4 — official PSA list has Pampanga, WFP does not).

Eligible `(province, commodity)` series with ≥36 distinct months **and** a last
observation ≥ 2026-07-15 (within 3 months of the file max 2026-10-15), by history
start cutoff:

| cutoff | ≥36-month eligible | 12–35-month history-only |
|---|---:|---:|
| 2019-01 | **2,438** | 75 |
| 2010-01 | **2,440** | 73 |
| 2000-01 | **2,440** | 73 |

The cutoff barely matters: only 2 additional series qualify between 2019-01 and
2010-01, and none between 2010-01 and 2000-01. Series *length* changes a lot, though
(cost implication in §5).

### Discontinued labels (11)

No observation in the last 6 months (last obs < 2026-04-15). These must be tiered out
of the forecast registry:

| label | unit | last obs |
|---|---|---|
| Chicken | KG | 2020-12-15 |
| Fish (fresh) | KG | 2019-04-15 |
| Garlic (large) | KG | 2021-02-15 |
| Garlic (small) | KG | 2021-02-15 |
| Maize (white) | KG | 2022-04-15 |
| Meat (pork, with fat) | KG | 2021-02-15 |
| Oil (cooking) | 750 ML | 2021-02-15 |
| Rice (milled, superior) | KG | 2020-02-15 |
| Rice (premium) | KG | 2021-01-15 |
| Sugar (brown) | KG | 2021-02-15 |
| Sugar (white) | KG | 2021-02-15 |

Note: `Rice (premium)` and `Rice (milled, superior)` are old WFP rice grades replaced
by the 2020 re-naming (regular/well milled/special); they are gone, not dormant.

### Variant families (labels sharing a base product)

- **Fish: 9** labels (fresh, frigate tuna, mackerel, milkfish, redbelly yellowtail
  fusilier, roundscad, slipmouth, threadfin bream, tilapia)
- **Meat: 7** (beef, beef chops with bones, chicken whole, pork, pork hock, pork with
  bones, pork with fat)
- **Rice: 5** (regular milled, well milled, special, premium†, milled superior† —
  † = discontinued)
- **Bananas: 3** (lakatan, latundan, saba) · **Beans: 3** (green fresh, mung, string)
  · **Garlic: 3** (generic, large†, small†)
- Pairs: Cabbage / Cabbage (chinese), Eggs / Eggs (duck), Groundnuts (shelled /
  unshelled), Maize (white† / yellow), Mangoes (carabao / piko), Onions (red / white),
  Semolina (white / yellow), Shrimp (endeavor / tiger prawn... 2 variants), Sugar
  (brown† / white†).

### Coverage spread

Per label, provinces with any data ranges 6–80 (mean 62.6). 12 labels cover all 80
effective provinces, 45 cover ≥70, 15 cover <40. Full per-label table is
`commodity_universe.csv` / `commodity_summary.md`. Top labels by eligible series
(2019 cutoff): Rice (regular, milled) 78, Eggplants 77, Rice (well milled) 77,
Rice (special) 76, Meat (pork) 74, Bitter melon 72, Carrots 72, Fish (milkfish) 72,
Tomatoes 71, Cabbage 71.

---

## 2. Geography integrity

- **17 admin1** regions, **79 admin2** provinces, **108 markets** (retail rows).
- Every admin2 belongs to **exactly one admin1** (0 violations, 0 missing).
- No market appears under more than one admin2 / admin1 / coordinate (verified: every
  market has exactly 1 distinct latitude, longitude, admin2, admin1).
- **Casing**: 14 admin1 values are not Title Case — 11 are the `Region II`-style
  patterns (fine as-is), but 3 are genuine lowercase "region" mid-name:
  `National Capital region`, `Cordillera Administrative region`,
  `Autonomous region in Muslim Mindanao`. No case-insensitive duplicate names exist.
  The registry should normalize these to `National Capital Region` etc. at ingest.
- Full tables: `admin1.csv` (markets/admin2/rows per region) and `admin2.csv`
  (per-province market count, mean coords, eligible-series count). Highlights:
  - admin1 with most admin2: Region III (6), Region VIII (6), Region V (6).
  - admin2 with most markets: Nueva Ecija 3, Davao del Sur 3, Maguindanao 3,
    Benguet 3, Bulacan 2, Masbate 2, Zamboanga del Sur 2, Southern Leyte 2, …
  - `Camarines Sur` admin2 has **0 eligible series** and only 197 rows ending
    2020-10-15 — the weakest province in the file (see §3).

---

## 3. Mis-filed markets (curated)

Raw geometric flags hit **83/108 markets**, but 54 of those are "only market in its
admin2" — normal, not suspicious. The curated list below is the real signal.
Every market has exactly one coordinate; no market is filed under two admin2s.

### Known cases (confirmed)

| # | market | filed under | evidence | reading | action |
|---|---|---|---|---|---|
| 1 | `Pampanga` | Bulacan (Region III) | coords 15.02, 121.09; 36.1 km from the Bulacan market; nearest other admin2 centroid Rizal 47.5 km | **Contradiction**: the name says Pampanga, but the coordinates sit in Bulacan and the official PSA list *has* Pampanga while WFP has no Pampanga admin2 | **UNCERTAIN** — do not auto-correct. Registry keeps market→admin2 as filed, stores the override as a documented option; verify against WFP source metadata |
| 2 | `Camarines Sur` | Masbate (Region V) | coords 12.55, 123.27 (Masbate area); 44.4 km from the Masbate market; admin2 `Camarines Sur` exists separately with market `Naga City` at 13.62, 123.18 and has only 197 rows ending 2020-10 | Coordinates support the admin2 (Masbate); the market *name* appears to be a mislabeled copy of the province name | **UNCERTAIN** — same pattern as #1; the label is the suspect, not the filing |
| 3 | `Catarman` | Southern Leyte (Region VIII) | coords 10.14, 125.00; 18.6 km from the Southern Leyte market at 10.13, 124.83 | Catarman is the capital of *Northern Samar*, but the coordinates match Southern Leyte, 500+ km from Samar | **UNCERTAIN** — coords support admin2; name is wrong |

### Additional real cases found (curated)

| # | market | filed under | evidence | action |
|---|---|---|---|---|
| 4 | `Davao Occidental` | Davao del Sur (Region XI) | coords 6.41, 125.61 sit inside Davao Occidental; admin2 `Davao Occidental` has **zero** markets; 65.9 km from Davao del Sur peers | The market is a Davao Occidental proxy filed under its pre-2013 parent. Keep, but the registry should expose it as Davao Occidental coverage; official PSA list omits Davao Occidental (see §4) |
| 5 | `Santa Cruz` | Rizal (Region IV-A) | coords 14.61, 121.17 = same point as the `Rizal` market (0 km); Santa Cruz is the capital of *Laguna*, whose own market is `Laguna` at 14.29, 121.41 (actual Santa Cruz) | Same "name is a copy of a province name" pattern as #1–#3; coords support Rizal. **UNCERTAIN** |
| 6 | `Zamboanga City` | Zamboanga del Sur (Region IX) | coords 6.91, 122.07 = Zamboanga City itself; **181.8 km** from the Zamboanga del Sur market, 28.9 km from the Basilan centroid | Highly-urbanized city filed under its parent province (WFP has no Zamboanga City admin2). Normal WFP practice, not a coordinate error; registry may optionally split it out |
| 7 | `Davao City` | Davao del Sur | coords 7.18, 125.44 = Davao City; 66.9 km from peers | Same HUC pattern as #6 |
| 8 | `Cotabato City` | Maguindanao (ARMM) | coords 7.19, 124.24 = Cotabato City; 60.8 km from peers | HUC filed under Maguindanao; PSA lists Cotabato City as its own province-level unit |
| 9 | `Davao de Oro` (market) | Compostela Valley (admin2) | identical point (7.60, 125.97); admin2 uses the **pre-2019** name, market name uses the **post-2019** name | Rename split between the two fields, not a mis-file. Normalize admin2 → Davao de Oro |
| 10 | `Cotabato` (market) | North Cotabato | identical coords to `Kidapawan City` (0 km apart, same admin2) | Old/new province name split (admin2 = old `North Cotabato`, PSA = `Cotabato`) plus a duplicate point; label should become `Kidapawan City`-area proxy. Not geographic |
| 11 | `La Union (Ilocos Region)` vs `San Fernando City` | La Union | **identical coordinates** (16.62, 120.31) — two market labels for one point | Duplicate market label; keep `San Fernando City`, drop or alias the other |
| 12 | `Metro Manila` (market) | Metropolitan Manila (admin2) | identical point; trivial alias (`Metro` vs `Metropolitan`) | Normalize at ingest |

### Not treated as suspects

- 54 markets that are the only market in their admin2 (province-named markets) — normal.
- Province-capital markets whose name differs from the admin2 but is the capital city
  (`Butuan City` under Agusan del Norte, `Tuguegarao City` under Cagayan,
  `Legazpi City` under Albay, `Calapan City` under Oriental Mindoro, …) — normal,
  coordinates agree within a few km.
- `Tubod` under Lanao del Norte (53 km from peers, 24.7 km from Lanao del Sur
  centroid) — Tubod is the Lanao del Norte capital; coords plausible. **UNCERTAIN**
  only in the sense that no other evidence contradicts the admin2.

---

## 4. Official province mapping (PSA / BetterGov geography dimension)

Source: BetterGov `statistics` dataset `bf4d24ba047164246769`, dimension
`Region/Province`, release `2026-06-22T14-57-10-39145c9f6a44` (saved to
`bg_geography.json`; fetched live once, as permitted).

- Official dimension = **17 regions + 82 province-level units**. The 82 are
  **80 provinces** + 2 independent-city units (`Isabela City`, `Cotabato City`).
- WFP = 78 provinces + `Metropolitan Manila` (the NCR *region* used as an admin2).

### Renames normalized (all high confidence)

| WFP admin2 | official | note |
|---|---|---|
| Compostela Valley | Davao de Oro | renamed 2019 (RA 11297) |
| Samar | Western Samar | PSA label |
| Dinagat Islands | Dinagat Island | PSA singular label |
| Sarangani | Saranggani | PSA spelling |
| Metropolitan Manila | — | it is the NCR region itself; map to region, not a province |

### Gaps

- Official provinces **missing from WFP**: `Batanes`, `Pampanga` (2).
- Official city-units **missing as admin2**: `Cotabato City`, `Isabela City`
  (Cotabato City exists only as a market inside Maguindanao).
- WFP admin2 with **no official match**: `Metropolitan Manila` (region, expected).
- All 78 province mappings are exact-normalized or known-alias → **high confidence**;
  no fuzzy-only matches remain.

### Region-label mismatches (UNCERTAIN)

WFP admin1 lags the 2002 region reorganization: `Marinduque`,
`Occidental Mindoro`, `Oriental Mindoro`, `Palawan`, `Romblon` are filed under
`Region IV-B`, whose PSA successor is `MIMAROPA Region` (Marinduque was moved to
MIMAROPA in 2002; Palawan's status has shifted more than once). Also
`North Cotabato` (old) vs official `Cotabato`. **UNCERTAIN** — do not rewrite
history rows; normalize only at the registry display layer.

### Dataset-date caveats (UNCERTAIN)

- The official dimension **omits Davao Occidental** (created 2013) — 82 units is the
  PSA *statistical* list, not the current 82-province administrative reality.
- **Maguindanao** is still one label in the dimension despite the 2022 split into
  Maguindanao del Norte / del Sur; WFP is likewise one label. Treat as one unit.
- `Batanes` has no WFP market at all; `Pampanga` coverage exists only via the
  mis-filed market (#1, §3).

---

## 5. Performance probe

Isolation: all runs used a **copy** at
`~/mercado_audit/universe/perf_data/mercado.db` with `MERCADO_DATA_DIR` set before
import (46,359 rows, 25 provinces × 10 commodities = 250 series,
2000-01-10 → 2026-12-28). The repo DB was never touched. `scikit-learn 1.9.1` was
installed **only** into the scratch venv `~/mercado_audit/.venv`.

### Every all-provinces × all-commodities loop (file:line)

| location | what loops |
|---|---|
| `backend/mercado/forecast.py:115-116` | `/overview` — ThreadPoolExecutor(2) maps `summary(province, c["id"])` over **all commodities** (full ensemble each) |
| `backend/mercado/forecast.py:118-129` | basket aggregation over all commodities (cheap) |
| `backend/mercado/forecast.py:183` | `/map` (`price_map`) — loops over **all provinces** for one commodity, `allow_quick` |
| `backend/mercado/forecast.py:197-207` | `/compare` — calls `price_map` (all provinces) + per-row haversine |
| `backend/mercado/forecast.py:213-214` | `warm()` — double loop **all provinces × all commodities**, full ensemble |
| `backend/main.py:41` | startup lifespan starts `forecast.warm` in a daemon thread |
| `backend/mercado/scheduler.py:24` | scheduler calls `pipeline.run("live")` every N hours |
| `backend/mercado/pipeline.py:82` | ingest row loop over the entire WFP CSV (`normalize_wfp`) |
| `backend/mercado/pipeline.py:118` | `apply_live` per-(province, commodity) replace/skip loop |
| `backend/mercado/models.py:38` | naive seasonal reconstruction loop (per series) |
| `backend/mercado/models.py:53` | Holt-Winters grid search over `_GRID` (per series) |
| `backend/mercado/models.py:57` | Holt-Winters recursive forecast |
| `backend/mercado/models.py:90` | Ridge/GBM feature-matrix loop over weeks 52..n (per series) |
| `backend/mercado/models.py:119` | recursive 1-week-at-a-time forecast loop |
| `backend/mercado/models.py:172-178` | rolling-origin backtest over 10 origins × 4 models |
| `backend/mercado/models.py:208-211` | backtest ensemble reconstruction + series rows |
| `backend/mercado/models.py:222` | direction-hit loop over backtest origins |

### Timings (single series, `ncr/rice`, 1,396 weeks)

| stage | seconds |
|---|---:|
| `store.series` load | 0.011 |
| `models.quick` | **0.019** |
| `models.full` (4 models + 10-origin backtest) | **1.197** |
| `forecast.detail` (full + seasonality) | 1.224 |
| backtest origins | 10 |
| learned weights | naive 0.191 / HW 0.136 / ridge 0.328 / gbm 0.345 |

### Bulk loops at 25 × 10 = 250 series

| loop | seconds |
|---|---:|
| `/overview` (1 province × 10 full ensembles) | 5.285 |
| `/map` (25 provinces × 1 commodity, quick) | 0.410 |
| `/compare` | 0.404 |
| `warm()` all 250 full ensembles | **142.28** (0.569 s/series — sample DB series are long) |
| ingest `normalize_wfp` (247,458 rows) | 34.37 s (24,279 mapped, 202,609 skipped) |

Ingest skip note: 202,609 rows are skipped because `match_commodity` only knows 10
ids (and deliberately drops non-regular rice). With the full registry the mapped set
approaches the 240k retail rows minus discontinued labels — a ~10× ingest volume
increase at unchanged per-row cost (~0.14 ms/row; 34 s per full CSV, acceptable for a
daily pipeline but trivially vectorizable later).

### Real-WFP extrapolation

Timed `models.full` on **79 real WFP series** (one per commodity + random picks;
163–785 weeks, median 336): mean **0.4049 s**, median 0.409, p90 0.419, max 0.733.

- Eligible series at the 2019/2010 cutoffs: 2,438/2,440.
- **2,438 × 0.4049 s ≈ 987 s ≈ 16.5 min single-threaded** at today's typical series
  lengths (most start ~2019-2020, median 336 weeks).
- A 2010 cutoff stretches the long series (Rice regular milled starts 2000-01);
  cost grows sublinearly with length (0.40 s @336 wks → 1.20 s @1,396 wks ⇒
  ≈ n^0.73), so ~880-week series ≈ 0.8 s ⇒ **2,440 × 0.8 ≈ 33 min single-threaded**,
  or ≈ 8–10 min with 4 threads. Both are background-warm compatible.

### Cache feasibility

- After `warm()`: 246 cache entries, RSS 173.5 → 215.8 MB (**+42.3 MB ≈ 176 KB/series**).
  `clear_cache()` did **not** return RSS (allocator retains), but growth is bounded.
- Extrapolated: 2,438 series × 176 KB ≈ **430 MB** — fine for a small server, but
  worth storing compactly (the cache keeps the whole `Result`, including the series
  and per-origin backtest rows).
- **Lazy per-series compute with the existing in-memory cache is feasible**:
  `/map` needs only the quick model (0.4 s for all 25 provinces; ~13 s for 80
  provinces × quick at 0.019 s ≈ but quick is per-series 19 ms → 80 × 19 ms = 1.5 s).
  Full ensembles can be computed on first `/forecast`/`/overview` hit and amortized
  by the startup `warm()` thread. The two-thread `overview` executor (max_workers=2)
  should scale up (4–8) for 70 commodities.

### Backtest floor

`store.series` refuses series shorter than **110 weeks** (`store.py:94-95`). The
10-origin rolling backtest additionally needs roughly **≥138 weeks**; 4 of the 250
sample series pass the 110-week gate but are too short for the full backtest
(`laguna/onion` 122, `laguna/calamansi` 122, `batangas/onion` 131,
`leyte/calamansi` 131). These need a quick-model fallback (the `allow_quick` path
already exists in `forecast.py:98-104`).

---

## 6. Hardcoding inventory (10 commodities / 25 provinces / 6 dishes)

**MUST** = must become data-driven for the expanded scope. **CAN** = may stay curated.

### Backend

| file:line | what | class |
|---|---|---|
| `mercado/geo.py:10-51` | `_PROVINCES` — 25 hardcoded province tuples (id, name, region, market, lat, lon, price_level, aliases) | **MUST** — generate from the registry (79 admin2 + Pampanga) |
| `mercado/geo.py:53-62` | `match_province` alias table + substring matching | **MUST** — registry alias list; normalize Region casing (§2) and renames (§4) |
| `mercado/commodities.py:5-36` | `COMMODITIES` — 10 hardcoded dicts (id, name, short, fil, group, unit, icon, base/drift/amp/peak/vol, typhoon, fuel, shelf, basket, keywords) | **MUST** — registry; sample-generator params stay curated per commodity where they exist |
| `mercado/commodities.py:46-54` | `match_commodity` keyword matching + the `rice` special-case skip at 49-50 | **MUST** — map all ~70 retail labels via registry (1:1 label→id), drop the rice skip |
| `mercado/commodities.py:59-72` | `DISHES` — 6 carinderia dishes referencing commodity ids with kg/dozen amounts | **CAN** stay curated — but ingredient ids must be validated against the registry; dishes referencing discontinued/absent ids must degrade gracefully |
| `mercado/commodities.py:39-43` | `PUBLIC_FIELDS` / `public()` | CAN (extend fields) |
| `mercado/sample_data.py:19-21, generate()` | synthetic generator iterates `geo.PROVINCES` / `cm.COMMODITIES` passed in | CAN — becomes automatically data-driven once geo/commodities are; keep as offline demo |
| `mercado/pipeline.py:26` | `REPLACE_MIN_WEEKS = 110` | CAN (policy constant) — revisit against tiers; history-tier series are shorter |
| `mercado/pipeline.py:82-98` | ingest row loop: `cm.match_commodity` + `geo.match_province` + `_unit_factor` | **MUST** — registry-driven mapping |
| `mercado/pipeline.py:41-67` | `_unit_factor` converts to the commodity's target unit (kg / dozen) | **MUST** — unit spec per registry entry; needs `Unit`→piece/dozen (Eggs) and a decision for `750 ML` (none survive, but future oil labels) |
| `mercado/store.py:94-95` | `series()` hard 110-week minimum | **MUST** — tier-aware: history tier needs 12+ months; quick fallback below the backtest floor |
| `main.py:26` | seed uses `sample_data.generate()` over the full 25×10 | CAN — auto-follows registry |
| `main.py:93,102,113,120` | default params `"ncr"` / `"rice"` | CAN — swap for first registry entry as fallback |
| `main.py:80-89` | `/meta` builds provinces from `geo.PROVINCES` ∩ store availability | auto — data-driven once geo is |
| `tests/test_mercado.py:64,66` | `len(meta["commodities"]) == 10`, `len(ov["items"]) == 10` | **MUST** update to registry counts |
| `tests/test_mercado.py:68` | hardcoded `commodity=tomato` | **MUST** pick from registry |
| `tests/test_mercado.py:77` | `rows_added == len(geo.PROVINCES) * len(cm.COMMODITIES)` | auto-follows, but assert must not assume 25×10 |

### Frontend

| file:line | what | class |
|---|---|---|
| `pages/Planner.jsx:7` | `DEFAULT_QTY` keyed by exactly the 10 commodity ids | **MUST** — default qty per registry entry (0 when unknown), or generated from a registry field |
| `pages/Planner.jsx:19` | qty persisted with `DEFAULT_QTY` fallback | **MUST** (same) |
| `pages/Planner.jsx:38-48` | shopping table iterates **all** `meta.commodities` assuming per-week kg/dozen quantities | **MUST** — unit label from registry; the whole-commodity table at 70+ items needs grouping/limits (UX decision) |
| `pages/Planner.jsx:102` | unit label `r.c.unit === 'dozen' ? 'dz' : 'kg'` | **MUST** — registry unit label (WFP also has piece / 750 ML) |
| `pages/Planner.jsx:28-36` | dishes from `meta.dishes`, costs summed over ingredient ids | CAN — already data-driven over the API payload; stays curated |
| `pages/MapPage.jsx:10` | `useState('rice')` default commodity id | **MUST** — first registry commodity (or a "top pick" flag) |
| `pages/MapPage.jsx:25-29` | commodity chips from `meta.commodities` | already data-driven; at 70 chips needs category grouping (CAN note) |
| `pages/MapPage.jsx:12,61` | looks up `meta.commodities` by id | already data-driven |
| `pages/WhatIf.jsx:9-11` | `scenarioPct` uses `c.typhoon` / `c.fuel` sensitivities | **MUST** — registry sensitivity per commodity (0 when absent) |
| `pages/WhatIf.jsx:33-35` | basket weights `commodityBy[id].basket` for every item | **MUST** — registry basket weight; items without one must be excluded from the basket, not weighted 0-undefined |
| `pages/WhatIf.jsx:19-29` | rows from `overview.items` | already data-driven |
| `pages/Board.jsx:12-23` | items/basket from `/overview`, ±2.5 signal thresholds | data-driven; thresholds CAN stay (mirror backend `forecast.py:48`) |
| `src/alerts.js:3-4` | `PROTEIN = ['Meat & Poultry', 'Fish']` group names for swap logic | **MUST** — group taxonomy must come from the registry (WFP categories differ: `meat, fish and eggs` is one bucket) |
| `src/alerts.js:14` | `c.shelf >= 7` stockability | **MUST** — shelf life per registry entry (default 0) |
| `pages/Detail.jsx:22` | unit label `c.unit === 'dozen' ? perdz : perkg` | **MUST** — registry unit label |
| `pages/Detail.jsx:27` | `modelOrder` fixed list of model names | CAN — model set is engine-level, not commodity-level |
| `pages/ModelLab.jsx:23-28` | fetches `/forecast` for **every** commodity serially on page load | **MUST** revisit — 70 × ~1.2 s backend calls; stagger, cache, or a batch endpoint |
| `src/i18n.js` | `common.perkg` / `common.perdz` strings; `hz.7/14/30` | **MUST** (unit strings must cover new units); horizons CAN stay |
| `src/state.jsx:25` | default province `'ncr'` persisted | CAN — fallback should be first registry province |
| `src/components/LocationPicker.jsx` | fully data-driven over `meta.provinces` / `meta.regions` | no change |
| `src/components/PhilippinesMap.jsx:7-19` | hand-drawn stylized island outlines | CAN — illustration, not data |
| `src/components/Charts.jsx:290-291` | month labels | CAN |
| `src/components/Layout.jsx` | nav lists pages, not commodities/provinces | no change |
| `src/api.test.js` | tests the cache layer, no domain lists | no change |
| `src/util.js:27-36` | `nearestProvince` over `meta.provinces` | already data-driven |

---

## 7. Recommendation (design only — no implementation)

### Registry shape

One versioned registry module (or JSON) is the single source of truth for both
dimensions, generated from the WFP file + the official geography dimension:

```
commodity {
  id: slug                      # e.g. "rice-regular-milled"
  label_wfp: exact CSV label    # "Rice (regular, milled)" — join key for ingest
  name, short, fil              # display (short/fil curated)
  category                      # WFP category (meat, fish and eggs / …)
  group                         # display group (curated, drives alerts.js swaps)
  unit_label                    # "kg" | "dozen" | "piece" | "per 750 ML bottle"
  unit_raw                      # WFP unit string(s) accepted at ingest
  tier: forecast | history | discontinued
  first_date, last_date, provinces_covered
  keywords                      # ingest aliases (auto + manual)
  icon                          # optional, curated
  basket, shelf, typhoon, fuel  # optional; absent = excluded from basket/What-If
}
province {
  id: slug
  name                          # registry display name
  official_name                 # PSA label (Davao de Oro, Western Samar, …)
  region_code, region_name      # normalized Title Case
  market, lat, lon              # representative market + coords
  aliases                       # ingest matching (incl. Metropolitan Manila → NCR)
  confidence: high | UNCERTAIN  # UNCERTAIN for the §3/§4 flagged entries
  tier: live | no-data          # Batanes, Pampanga → no-data until sources exist
}
```

### Quality tiers and the counts they produce

Rules (all relative to the file max 2026-10-15; "recent" = last obs ≥ 2026-07-15):

| tier | rule | series | labels affected |
|---|---|---:|---|
| `forecast` | ≥36 distinct months since cutoff AND recent | **2,440** (2010 cutoff) | ~59 of 70 labels |
| `history` | 12–35 months AND recent | **73** (2010 cutoff) | shown with a "limited history" badge, quick engine only |
| `discontinued` | no obs in last 6 months | — | **11 labels** hidden or clearly marked dead (incl. both old rice grades, cooking oil, all sugar) |
| sub-backtest | <138 weekly obs (≈ <32 months) | 4 of 250 in sample | engine=quick fallback; keep 110-week store gate as hard floor |

Commodity-tier gating: a label enters `forecast` only if it has ≥1 qualifying series;
province coverage per label varies 6–80, so the UI should show per-commodity
coverage and the map should gray out provinces without the series (the `Camarines
Sur` admin2 case: 0 eligible series, data ends 2020-10).

### History start cutoff — choose 2010-01

Evidence:

1. **Series count is insensitive**: 2,438 eligible at 2019-01 vs 2,440 at 2010-01 and
   2,440 at 2000-01. The cutoff does not change the universe.
2. **Seasonality needs full cycles**: the Holt-Winters season is 52 weeks and
   seasonality/driver attribution (`forecast.py:133-145`) trims 26 weeks at each end —
   ≥2 full years is the meaningful floor, which 2019 also satisfies.
3. **What 2010 buys**: 9 extra years for the long real series (Rice regular milled
   2000-01, Meat pork 2000-01, Carrots/Tomatoes/Cabbage 2008-01), improving
   regime diversity for the weights backtest; only 2 series actually *qualify*
   because of it, but the *length* of the top series grows substantially.
4. **Cost is bounded**: measured cost grows ≈ n^0.73 (0.40 s @336 wks, 1.20 s
   @1,396 wks). A 2010 cutoff caps the longest series at ~880 weeks ≈ 0.8 s ⇒
   ~33 min single-threaded for all 2,440 ensembles (≈ 8–10 min on 4 threads), and
   cache ≈ 430 MB. A 2000 cutoff would double that for zero extra series.

So: **registry history start = 2010-01-01**, ingest stores everything it receives,
tiering is computed per series, and the lazy warm-up orders by popularity (the 10
current commodities first). `/map` and `/overview` stay on the quick engine for
cold series (19 ms each), so first paint never waits on the warm-up.

---

## UNCERTAIN register

1. **Pampanga market** (#3.1): name vs coordinates vs official list contradict; needs
   WFP source metadata before any reassignment.
2. **Camarines Sur market** (#3.2) and **Catarman market** (#3.3): coordinates support
   the admin2; the market *names* are the suspects.
3. **Santa Cruz market** (#3.5): same pattern; coords support Rizal.
4. **Davao Occidental** (#3.5/§4): market exists under Davao del Sur; the official
   dimension omits the province entirely.
5. **Maguindanao split (2022)**: neither WFP nor the official dimension reflects it;
   keep one unit.
6. **Region IV-B → MIMAROPA** admin1 labels: WFP lags the 2002 reorg; normalize only
   at display time.
7. **Unit "Unit"→dozen for Eggs** and "750 ML": conversion is unverified against WFP
   metadata (the repo's `pipeline._unit_factor` assumes ×12 per piece for Eggs);
   the 750 ML oil label is discontinued so the risk is currently nil.

## Verification

`git status --short` on the repo after all work: **(empty — run recorded in the final
reply)**.
