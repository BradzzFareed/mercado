# WFP suspect markets: which province do their prices belong to?

**Audit date:** 16 November 2026
**Scope:** five WFP markets whose name, coordinates or admin2 filing disagree, checked against PSA province-level retail prices (BetterGov current variants, `latestYear` 2026).
**Repository:** read-only. `git status --short` is empty at the end (see §8).
**Scratch:** `~/mercado_audit/markets/` (scripts, raw API responses, `query_log.jsonl`).

---

## 0. Executive summary

| Market | Filed under | Verdict | Province its prices match | Recommended action |
|---|---|---|---|---|
| Pampanga | Bulacan | **VERIFIED** | **Pampanga** | Assign to `pampanga`. Live mapping currently sends it to `bulacan`, which is wrong. |
| Camarines Sur | Masbate | **VERIFIED** | **Camarines Sur** | Assign to `camarines-sur`. Live mapping already gets this right, by accident (via the market name). Make the rule explicit. |
| Davao Occidental | Davao del Sur | **VERIFIED** | **Davao Occidental** (not in Mercado's 25-province registry) | Do **not** assign to `davao-sur`, which is what the live mapping does now. Exclude it, or add `davao-occidental` to the registry (a product decision). |
| Catarman | Southern Leyte | **UNRESOLVED** | none (0 comparisons in 2024-01..2026-08) | Quarantine. The live mapping currently sends it to `leyte`, which is wrong, so block that mapping. |
| Santa Cruz | Rizal | **UNRESOLVED** | none (0 comparisons in 2024-01..2026-08) | Quarantine. The live mapping currently drops it, which is consistent with quarantine. |

**Method controls passed.** All five unambiguous control markets match their own province at ≥95%: Laguna 100%, Rizal 100%, Masbate 100%, Bulacan 100%, Southern Leyte 99.6%. The method is usable.

**Important side finding.** The live pipeline maps `admin2` before `market` (`normalize_wfp` calls `geo.match_province(admin2, market, admin1)`). By that mapping function, the mis-filings feed the wrong Mercado series. This was checked by calling the function, not by running the pipeline on live data. See §6 and §8.

---

## 1. Task 1: BetterGov current retail-price datasets and label matching

### 1.1 The 11 current datasets (`latestYear` = 2026, release `2026-09-03`)

| Dataset | ID | PSA commodity labels | Geolocation values |
|---|---|---:|---:|
| Beans and Legumes | `e8ad61d8cb9bbee505c4` | 7 | 119 |
| Cereals | `a6d219f1c948957a4eda` | 14 | 119 |
| Commercial Crops | `5b0b1ab1bedef3dd2166` | 2 | 119 |
| Condiments | `9876c15805a972321aca` | 7 | 119 |
| Fish | `c72eadce080c900ff201` | 57 | 119 |
| Fruit Vegetables | `848e18c571d378f0cf40` | 9 | 119 |
| Fruits | `fe63e7d3e3434cee295e` | 36 | 119 |
| Leafy Vegetables | `080c851322a50fa278bd` | 12 | 119 |
| Livestock | `64c25b56190514176214` | 13 | 119 |
| Poultry | `b067df7c92201d30ff18` | 15 | 119 |
| Rootcrops | `d875fa5e26e33e22b973` | 25 | 119 |

Full commodity lists: `task1_commodities.json`. Geography: 119 geolocations = 1 country + 18 regions + 81 provinces + 19 cities. Year codes: 2024=6, 2025=7, 2026=8. Period codes: 0–11 = January–December. These codes are identical across datasets (checked by comparing Poultry's geolocation codes against the Fruits file, 119/119).

### 1.2 Accepted WFP → PSA pairs (10 commodities)

| WFP label | PSA label (dataset, code) | Basis |
|---|---|---|
| Calamansi | `CALAMANSI, LOOSE, 1 KG` (Fruits, 32) | Name match |
| Rice (regular, milled) | `RICE, REGULAR-MILLED, 1 KG` (Cereals, 1) | Name match |
| Eggs | `FRESH EGG, CHICKEN, MEDIUM, 1 PC` (Poultry, 11) | Name match. Both are per piece, so no conversion. |
| Meat (pork) | `FRESH PORK, KASIM, 1 KG` (Livestock, 5) | **Calibrated on controls**: 160/160 exact matches |
| Meat (chicken, whole) | `FRESH CHICKEN, FULLY DRESSED, BROILER, 1 KG` (Poultry, 1) | **Calibrated on controls, with caveat**: 128/128 on 4 of 5 controls. See §1.4 |
| Fish (milkfish) | `FRESH FISH, MILKFISH, BANGUS, MEDIUM, 1 KG` (Fish, 25) | Name match |
| Tomatoes | `TOMATO, 1 KG` (Fruit Vegetables, 2) | Name match |
| Onions (red) | `ONION RED CREOLE (BERMUDA RED), 1 KG` (Condiments, 3) | Name match |
| Cabbage | `CABBAGE, 1 KG` (Leafy Vegetables, 0) | Name match |
| Eggplants | `EGGPLANT, LONG, PURPLE, 1 KG` (Fruit Vegetables, 1) | Name match |

### 1.3 Rejected or doubtful pairs

| WFP label | Candidate PSA label | Decision | Reason |
|---|---|---|---|
| Meat (pork) | `FRESH PORK, LIEMPO` / `MEAT WITH BONES` / `PORK CHOP` / `PATA` / `SPARE RIBS` | **Rejected** | Calibration: LIEMPO 4/160, MEAT WITH BONES 0/160, PORK CHOP 0/32, PATA and SPARE RIBS have no control data. KASIM is the only cut that matches. |
| Meat (chicken, whole) | `FRESH CHICKEN, NATIVE, DRESSED, WHOLE` | **Rejected** (untested) | 0 control comparisons. Native, not broiler. |
| Meat (chicken, whole) | `FRESH CHICKEN, WHOLE, DRESSED, BOUNTY FRESH` | **Rejected** (untested) | 0 control comparisons. Branded label. |
| Eggs (duck) | `FRESH EGG, DUCK, MEDIUM, 1 PC` | Rejected for this audit | Clear correspondence, but Mercado's egg series is chicken eggs. |
| Cabbage (chinese) | none | Rejected | PSA `CABBAGE, 1 KG` is not the Chinese variety. No separate PSA label. |
| Onions (white) | `ONION WHITE (YELLOW GRANEX), 1 KG` | Rejected for this audit | Different variety. Mercado uses red onion. |
| Rice (well milled) | `RICE, WELL-MILLED, 1 KG` | Rejected for this audit | Different grade from the canonical regular-milled series. |
| Rice (special, premium) | `RICE, SPECIAL, 1 KG` | Rejected for this audit | Different grade. |
| Fish (frigate tuna, threadfin bream and others) | various | Out of scope | Not in Mercado's 10 commodities. |

### 1.4 Chicken calibration caveat (**UNCERTAIN**)

PSA `FRESH CHICKEN, FULLY DRESSED, BROILER` matched all 128 control comparisons on Laguna, Rizal, Bulacan and Southern Leyte (32/32 each). **Masbate has no PSA broiler values at all**, so the label could not be tested there. This is a gap in the calibration, not a failure. The chicken series is kept, and §5 shows that the verdicts do not change when it is removed.

---

## 2. Task 2: match every suspect against all provinces

**Rule.** Retail WFP rows, 2024-01 through 2026-08 (the PSA window). A match is `|WFP − PSA| ≤ 0.01`. Each WFP observation is compared against **all 81 PSA provinces** for the same commodity and month. Cities and regions were also checked, so that any non-province match would show up.

**Comparison** = a WFP observation (market, commodity, month) for which the candidate province has a non-null PSA value. **Share** = exact matches ÷ comparisons for that candidate.

### 2.1 Per-market summary

| Market | Filed | WFP obs in window | Comparable obs | Own-province matches | Own share | No-match obs | Unique-match obs | Tie obs |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Pampanga | Bulacan | 288 | 288 | **288/288** | **100.0%** | 0 | 215 | 73 |
| Camarines Sur | Masbate | 224 | 224 | **224/224** | **100.0%** | 0 | 192 | 32 |
| Davao Occidental | Davao del Sur | 175 | 175 | **174/175** | **99.4%** | 0 | 103 | 72 |
| Catarman | Southern Leyte | **0** | 0 | — | — | — | — | — |
| Santa Cruz | Rizal | **0** | 0 | — | — | — | — | — |

Catarman and Santa Cruz have WFP rows only up to **2019-06-15** (1,391 and 1,571 rows from 2008-01-15). Nothing falls in 2024-01..2026-08.

*Ties* are observations where two or more provinces share the exact same value. In every tie for these three markets, the own province was in the matched set. The unique-match count shows that the own province is the only match in 215, 192 and 103 observations.

### 2.2 Best-match province distribution

| Market | Unique best match (obs) | Ties (obs) |
|---|---|---|
| Pampanga | Pampanga 215 | 73, all include Pampanga |
| Camarines Sur | Camarines Sur 192 | 32, all include Camarines Sur |
| Davao Occidental | Davao Occidental 102, Davao Oriental 1 | 72, all include Davao Occidental |

### 2.3 Exact-match share per candidate province (top candidates, ≥20 comparisons)

**Pampanga** (filed Bulacan)

| Candidate province | Matches | Comparisons | Share |
|---|---:|---:|---:|
| **Pampanga** | **288** | **288** | **100.0%** |
| Cavite | 8 | 288 | 2.8% |
| Ilocos Norte | 8 | 288 | 2.8% |
| La Union | 4 | 256 | 1.6% |
| *Bulacan (filed)* | *3* | *256* | *1.2%* |

**Camarines Sur** (filed Masbate)

| Candidate province | Matches | Comparisons | Share |
|---|---:|---:|---:|
| **Camarines Sur** | **224** | **224** | **100.0%** |
| Ifugao | 4 | 224 | 1.8% |
| Bulacan | 3 | 192 | 1.6% |
| Surigao del Sur | 3 | 224 | 1.3% |
| *Masbate (filed)* | *1* | *224* | *0.4%* |

**Davao Occidental** (filed Davao del Sur)

| Candidate province | Matches | Comparisons | Share |
|---|---:|---:|---:|
| **Davao Occidental** | **174** | **175** | **99.4%** |
| Davao Oriental | 7 | 111 | 6.3% |
| Agusan del Norte | 5 | 143 | 3.5% |
| *Davao del Sur (filed)* | *6* | *175* | *3.4%* |

**Catarman, Santa Cruz**: no comparisons, so no shares.

Non-province matches: a few cities and regions match by coincidence (for example "City of Angeles" and "City of Lucena", 2–5 observations each). None of them reaches 95%.

### 2.4 Per-commodity consistency

Every commodity series in the three resolved markets matched the own province exactly, except one miss in Davao Occidental (see §4).

| Market | Commodities | Own-province share per commodity |
|---|---:|---|
| Pampanga | 9 | 32/32 on all 9 (Calamansi, Eggplants, Eggs, Milkfish, Chicken, Pork, Onions red, Rice, Tomatoes) |
| Camarines Sur | 7 | 32/32 on all 7 (Calamansi, Eggplants, Milkfish, Pork, Onions red, Rice, Tomatoes) |
| Davao Occidental | 6 | 15/15 Cabbage, 32/32 Eggplants, 32/32 Milkfish, 32/32 Chicken, 32/32 Pork, 31/32 Rice |

---

## 3. Task 3: controls

Same procedure, applied to five unambiguous markets. Threshold: ≥95% own-province share.

| Control | Own province | Matches | Comparisons | Share | Result |
|---|---|---:|---:|---:|---|
| Laguna | Laguna | 269 | 269 | 100.0% | PASS |
| Rizal | Rizal | 235 | 235 | 100.0% | PASS |
| Masbate | Masbate | 288 | 288 | 100.0% | PASS |
| Bulacan | Bulacan | 288 | 288 | 100.0% | PASS |
| Southern Leyte | Southern Leyte | 270 | 271 | 99.6% | PASS |

**All controls pass, so the method is usable.** The Southern Leyte exception is one rice observation, October 2025 (see §4).

Pork and chicken calibration (the same comparison, run on controls only):

| Series | Candidate PSA label | Control result |
|---|---|---|
| Pork | `FRESH PORK, KASIM` | **160/160** (5 of 5 controls, 32/32 each) → accepted |
| Pork | `FRESH PORK, LIEMPO` | 4/160 (Masbate only) → rejected |
| Pork | `FRESH PORK, MEAT WITH BONES` | 0/160 → rejected |
| Pork | `FRESH PORK, PORK CHOP` | 0/32 (Rizal) → rejected |
| Pork | `FRESH PORK, PATA` / `SPARE RIBS` | no control data → not calibratable |
| Chicken | `FRESH CHICKEN, FULLY DRESSED, BROILER` | **128/128** (4 controls; Masbate untestable) → accepted with caveat |
| Chicken | `FRESH CHICKEN, NATIVE, DRESSED, WHOLE` / `BOUNTY FRESH` | no control data → not calibratable |

---

## 4. Anomalies that did not change any verdict

Only two observations in the whole audit fail to match the expected province. Both are in rice, both in October 2025.

| Market | Month | WFP price | PSA own province | PSA other value | Note |
|---|---|---:|---:|---|---|
| Southern Leyte (control) | 2025-10 | 47.11 | 44.74 | — | No province matches. Control share is 270/271. Unexplained. |
| Davao Occidental | 2025-10 | 39.90 | 37.79 (Davao Occidental) | 39.90 (**Davao Oriental**) | WFP's value equals Davao Oriental's PSA value exactly. Looks like a one-off WFP error or a coincidence. **UNCERTAIN.** |

---

## 5. Sensitivity

| Check | Result |
|---|---|
| Drop the calibrated-with-caveat chicken series | Pampanga 256/256 (100%). Camarines Sur 224/224 (100%). Davao Occidental 142/143 (99.3%). **No verdict changes.** |
| Drop the rice series (it holds the single Davao Occidental miss) | Davao Occidental 143/143 (100%). |
| Count only unique matches | Pampanga 215/215, Camarines Sur 192/192, Davao Occidental 102/103. |

---

## 6. Live pipeline mapping (read-only check)

`normalize_wfp` calls `geo.match_province(admin2, market, admin1)`, which checks `admin2` first. Running that function on each suspect's `(admin2, market, admin1)` gives:

| Market | Filed admin2 | Verified province | Live pipeline maps to | Correct? | Registry |
|---|---|---|---|---|---|
| Pampanga | Bulacan | Pampanga | `bulacan` | **No** | `pampanga` is in registry |
| Camarines Sur | Masbate | Camarines Sur | `camarines-sur` | Yes (by accident: via "Camarines Sur" in the market name) | in registry |
| Davao Occidental | Davao del Sur | Davao Occidental | `davao-sur` | **No** | `davao-occidental` **not** in registry |
| Catarman | Southern Leyte | none | `leyte` | **No** (`leyte` is a substring of "southern leyte") | `southern-leyte` **not** in registry |
| Santa Cruz | Rizal | none | `None` (dropped) | Consistent with quarantine | `rizal` **not** in registry |

**Impact (code path, not run on live data, UNCERTAIN in magnitude).** `normalize_wfp` averages prices per (date, province, commodity). So the `bulacan` series currently averages the Bulacan market with the Pampanga market, and `davao-sur` averages in Davao Occidental. Catarman's values currently flow into `leyte`. Those series should be considered contaminated until the mapping is fixed.

Mercado registry (25 provinces): `ncr, benguet, pangasinan, ilocos-norte, pampanga, bulacan, laguna, cavite, batangas, or-mindoro, palawan, albay, camarines-sur, iloilo, negros-occ, cebu, bohol, leyte, zamboanga-sur, misamis-or, davao-sur, south-cotabato, agusan-norte, lanao-sur, maguindanao`.

---

## 7. Final verdicts (Task 4)

Rule: **VERIFIED** = controls pass, ≥20 comparisons, one province ≥95%, no rival ≥95%. **MIXED** = two or more provinces ≥95%, or top share 50–95%. **UNRESOLVED** = fewer than 20 comparisons, or top share below 50%.

| Market | Filed | Comparisons | Top province (share) | Rival ≥95%? | Verdict | Recommended action |
|---|---|---:|---|---|---|---|
| Pampanga | Bulacan | 288 | Pampanga (100.0%) | No (next 2.8%) | **VERIFIED** | Assign to `pampanga`. Fix the mapping so `bulacan` no longer receives this market. |
| Camarines Sur | Masbate | 224 | Camarines Sur (100.0%) | No (next 1.8%) | **VERIFIED** | Assign to `camarines-sur`, which the live pipeline already does. Make the rule explicit, and check the existing `Naga City` market (ends 2020-10) for duplicates. |
| Davao Occidental | Davao del Sur | 175 | Davao Occidental (99.4%) | No (next 6.3%) | **VERIFIED** | Do **not** assign to `davao-sur`. Exclude it, or add `davao-occidental` to the registry (a scope decision for you). |
| Catarman | Southern Leyte | 0 | none | — | **UNRESOLVED** | Quarantine. Block the current `leyte` mapping. Note that the 2008–2019 data cannot be checked against 2024–26 PSA. |
| Santa Cruz | Rizal | 0 | none | — | **UNRESOLVED** | Quarantine. Keep dropping it. Note that the 2008–2019 data cannot be checked against 2024–26 PSA. |

### Evidence table for the three VERIFIED markets

| Market | Own-province matches | Ties | Unique | Filed-province share | Best rival share | Controls pass |
|---|---:|---:|---:|---:|---:|---|
| Pampanga | 288/288 | 73 | 215 | 1.2% (Bulacan) | 2.8% (Cavite) | Yes |
| Camarines Sur | 224/224 | 32 | 192 | 0.4% (Masbate) | 1.8% (Ifugao) | Yes |
| Davao Occidental | 174/175 | 72 | 103 | 3.4% (Davao del Sur) | 6.3% (Davao Oriental) | Yes |

---

## 8. Uncertainty, deviations and open questions

- **UNCERTAIN: chicken calibration.** Masbate has no PSA broiler values, so the chicken label is calibrated on 4 of 5 controls. Verdicts do not change without chicken.
- **UNCERTAIN: calamansi 2018–2024 release.** That file (`bg_calamansi_2018_2024.json`) has no release metadata. The 2025–2026 file is release `2026-09-03`. Pampanga and Camarines Sur calamansi in 2024 depend on this file.
- **Deviation: province count is 81, not 82.** The earlier universe audit counted 82 units, which included the cities Cotabato City and Isabela City. This audit derived the PSA province set from the geolocation labels: 100 sub-regional labels minus 19 cities (including Zamboanga City) = 81.
- **Shares pool across commodities.** Observations for one market share a month, so they are not independent. Every individual commodity shows the same pattern, so this does not change the conclusion.
- **Value equality is evidence, not proof of sourcing.** An exact match on 288 monthly prices across 81 provinces is strong. The best rival matched 8 of 288 (2.8%), which is consistent with chance. The audit shows which province's *numbers* the market matches. It does not show who collected them.
- **Eggs are compared per piece** on both sides (WFP unit `Unit`, PSA `1 PC`). No dozen conversion was applied, because this audit only assigns provinces.
- **Window ends 2026-08.** WFP rows for September and October 2026 were excluded because PSA has no data for those months.
- **Two unexplained rice values** (§4). Neither changes a verdict.
- **Davao Occidental is outside Mercado's registry.** Whether to add it is a product decision, not an audit finding.
- **Live mapping was checked by calling the function, not by running the pipeline.** The §6 impact statement is inferred from the code path and has not been measured on the live database. (UNCERTAIN.)

---

## 9. Query accounting and reproduction

**API requests: 29 total.** 25 are logged in `query_log.jsonl` (1 per dataset values call, 3 for Poultry geolocation/year/period, 9 main series, 2 calibration). The other 4 were label probes made during planning and were not logged. The budget was 60. Pacing: 0.6 s between requests. Every response is saved in `raw/`.

Files, in run order:

| Script | Purpose |
|---|---|
| `bg_api.py` | Counted, paced, read-only client (60-query cap, raw saves) |
| `step1_values.py` | Commodity labels for the 11 current datasets → `task1_commodities.json` |
| `step2_calibrate.py` | Control-only calibration queries (pork and chicken candidates) |
| `step3_calibrate_score.py` | Scores pork and chicken candidates against controls → `calibration_summary.json` |
| `step4_fetch.py` | Full 119-geography series for the 9 accepted PSA commodities |
| `common.py` | WFP and PSA loaders, month keys |
| `analyze.py` | Exact-match engine → `analysis.json` |
| `breakdown.py` | Per-commodity own/filed shares and misses |
| `verdict.py` | Controls check, verdicts and sensitivity → `verdicts.json` |

Reproduce from `~/mercado_audit/markets/`: `python3 step3_calibrate_score.py && python3 analyze.py && python3 verdict.py`. The `step1`, `step2` and `step4` scripts make live requests; re-running them is unnecessary because their outputs are saved in `raw/`.

---

## 10. Repository state

No repository files were written. `git status --short` output at the end of the audit is recorded in the reply to the user.
