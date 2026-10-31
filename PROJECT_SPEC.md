# Mercado — Project Specification & LLM Context Pack

> **How to use this file:** upload it as-is to an LLM (ChatGPT, Claude, Gemini, etc.) to give it full working context for this repository. It is self-contained: no repository files are required to understand the architecture, contracts, and conventions described below.
>
> **Repository:** Mercado — location-aware Philippine agri-market retail price forecasting
> **Branch / commit at time of writing:** `migration/ui-revamp` @ `93ea697`
> **Verified state:** backend tests `6 passed`, frontend `pnpm lint` clean, `pnpm build` passes, all `/api/v1` endpoints respond, Vite proxy verified.

---

## 1. What the project is

Mercado is a web application that forecasts retail food prices in the Philippines at province level. A user picks a province/market and sees current prices, 7/14/30-day forecasts with an 80% uncertainty range, and surge/dip signals for 10 basic commodities. Secondary features: a price map, a carinderia (small eatery) menu-cost planner, a what-if scenario lab, a model-accuracy lab, and a data-pipeline control panel.

It is a **two-app monorepo with no root workspace**:

| App | Path | Stack | Dev URL |
|---|---|---|---|
| API + ML engine | `backend/` | Python 3.14+, FastAPI, uv, pandas/NumPy/scikit-learn, stdlib `sqlite3` | `http://127.0.0.1:8000` |
| Web UI | `frontend/` | React 19, Vite 8, Tailwind 4, axios, Chart.js, Supabase Auth | `http://localhost:5173` |

No Docker, no CI configuration, no TypeScript, no backend linter/formatter config.

---

## 2. Exact technology versions

**Backend** (`backend/pyproject.toml`, `requires-python = ">=3.14"`)

- `fastapi>=0.162`, `uvicorn`, `joblib`
- `pandas>=3.1`, `numpy>=2.5`, `scikit-learn>=1.9`
- dev: `pytest`, `httpx`
- `sqlalchemy>=2.1` and `xgboost` are **declared but unused** (deferred migration, see §10)

**Frontend** (`frontend/package.json`)

- `react` / `react-dom` ^19.3, `vite` ^8.3, `@vitejs/plugin-react` ^6.1
- `tailwindcss` + `@tailwindcss/vite` ^4.3
- `axios` ^1.21, `chart.js` ^4.6, `react-chartjs-2` ^5.3
- `@supabase/supabase-js` ^2.118
- `lucide-react` ^1.64
- `eslint` ^10.13 with the react-hooks and react-refresh plugins

**Tooling:** `uv` (installed in `~/.local/bin`), Node 24 / pnpm 10 (in `/usr/bin`). The checkout lives on a Windows drive mounted at `/mnt/c/...`, so `uv` prints a hardlink warning; it is harmless — set `UV_LINK_MODE=copy` to silence it.

---

## 3. File tree (tracked files, annotated)

```text
mercado-migrate/
├── .gitignore                     # ignores .venv, __pycache__, *.db, data/live, data/inbox, node_modules, dist, .env
├── AGENTS.md                      # agent-facing commands, gotchas, deferred work
├── README.md                      # human setup / architecture / API / troubleshooting reference
├── PROJECT_SPEC.md                # this document
│
├── backend/
│   ├── .python-version            # 3.14
│   ├── README.md
│   ├── pyproject.toml             # uv project + dependencies (project name "backend")
│   ├── uv.lock
│   ├── main.py                    # FastAPI app, lifespan, ALL /api/v1 routes, error shim
│   ├── src/backend/__init__.py    # UNUSED uv_build stub — does not start the API
│   ├── mercado/                   # the live engine package
│   │   ├── __init__.py
│   │   ├── commodities.py         # 10 commodities + shock sensitivities; 6 carinderia dishes
│   │   ├── geo.py                 # 25 provinces/markets, regions, haversine, alias matching
│   │   ├── catalog.py             # static reference data used by legacy/sample paths
│   │   ├── sample_data.py         # deterministic synthetic weekly price generator
│   │   ├── simulate.py            # writes sample CSVs into backend/data/sample/
│   │   ├── models.py              # naive / Holt-Winters / Ridge / GBM / ensemble + backtest
│   │   ├── forecast.py            # cache, signals, horizon blocks, overview/detail/map/compare, warm()
│   │   ├── pipeline.py            # WFP / inbox / live / simulate / seed ingestion + run log
│   │   ├── scheduler.py           # background thread rerunning the pipeline
│   │   └── store.py               # SQLite schema, upsert, weekly series, availability
│   ├── data/                      # GITIGNORED, generated: mercado.db, live/, inbox/, sample/
│   └── tests/
│       └── test_mercado.py        # 6 pytest tests via fastapi.testclient
│
└── frontend/
    ├── .env.example               # VITE_API_BASE / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
    ├── .env                       # GITIGNORED, real Supabase credentials (local only)
    ├── .gitignore
    ├── README.md
    ├── index.html                 # fonts (Bricolage Grotesque, Figtree), theme-color, icon
    ├── package.json
    ├── pnpm-lock.yaml
    ├── vite.config.js             # react + tailwind plugins; server.port 5173; /api -> :8000 proxy
    ├── eslint.config.js
    ├── public/
    │   ├── Mercado_icon.png
    │   └── favicon.svg
    └── src/
        ├── main.jsx               # React root; imports index.css THEN styles.css
        ├── App.jsx                # Supabase session guard + page switch + Layout
        ├── state.jsx              # context: hash route, meta, province, horizon, lang, theme, useApi, nav
        ├── api.js                 # axios wrapper + in-memory promise cache, {error}/{detail} extraction
        ├── supabaseClient.js      # createClient from VITE_SUPABASE_* (throws if missing)
        ├── i18n.js                # English / Filipino strings
        ├── alerts.js              # buildAlerts(), advise() — client-side recommendation logic
        ├── util.js                # peso/pct/fmtDate/addDays/clamp/classify/store/save/changeColor
        ├── index.css              # @import "tailwindcss";
        ├── styles.css             # legacy Mercado design system (tokens, layout, components), ~222 lines
        ├── pages/
        │   ├── Auth.jsx           # Supabase email/password signup + signin, username metadata
        │   ├── Board.jsx          # price board (also renders its own header — see §10)
        │   ├── Detail.jsx         # commodity detail: chart, horizons, stats, drivers, seasonality, backtest
        │   ├── MapPage.jsx        # Philippines bubble map + regional legend
        │   ├── Planner.jsx        # carinderia menu costing, margin, shopping list (localStorage)
        │   ├── WhatIf.jsx         # typhoon + fuel sliders layered over the forecast
        │   ├── ModelLab.jsx       # ensemble vs naive accuracy per commodity
        │   └── Pipeline.jsx       # sources, run-now, simulate-week
        └── components/
            ├── Layout.jsx         # shell: sidebar/topbar, nav, theme + language toggles, logout
            ├── Charts.jsx         # ForecastChart, SeasonBars, MultiLine, DriverBars (Chart.js) + Sparkline (SVG)
            ├── PhilippinesMap.jsx # SVG dot-matrix map
            ├── PriceTag.jsx       # PriceTag, SignalChip
            ├── Common.jsx         # PageHead, HorizonToggle, Training, ErrorBox, SampleBadge
            ├── LocationPicker.jsx # province/market picker
            └── Icons.jsx          # custom inline SVG icon factory
```

---

## 4. Backend architecture

### 4.1 Startup (`backend/main.py`)

`FastAPI(title="Mercado API", lifespan=lifespan)`. The lifespan does, in order:

1. `seed_if_empty()` → `store.init_db()`; if `count_rows() == 0`, load `sample_data.generate()` and write a `pipeline_runs` row with `mode="seed"`.
2. If `MERCADO_WARM != "0"` and data exists → daemon thread running `forecast.warm()`, which pre-computes full ensembles for all 25 × 10 series.
3. If `MERCADO_SCHEDULER != "0"` → `scheduler.start()`.
4. On shutdown → `scheduler.stop()`.

CORS allows only `http://localhost:5173` and `http://127.0.0.1:5173` (credentials enabled, all methods/headers). All feature routes live on `APIRouter(prefix="/api/v1")`; `GET /` returns a small welcome JSON.

### 4.2 Module responsibilities

| Module | Role |
|---|---|
| `store.py` | SQLite at `MERCADO_DATA_DIR/mercado.db` (default `backend/data`). Thread `RLock`, process-wide DataFrame cache, `upsert_prices` (INSERT OR REPLACE), `reset_prices`, `load`, `invalidate`, `last_date`, `series(province, commodity)` → weekly pandas Series, `available()` → rows / date range / provinces. |
| `sample_data.py` | Deterministic synthetic history: per-commodity base price, drift, seasonal amplitude and peak week, volatility, region price factor. Same seed and end date ⇒ identical prefix (asserted by tests). |
| `models.py` | All models work on **log** weekly prices. `naive` (last value), `holt_winters` (damped additive trend, 52-week season), `ridge` (lag / momentum / mean-reversion / Fourier features with `StandardScaler`), `gbm` (`GradientBoostingRegressor`), `ensemble` (inverse-squared-error weights from a rolling-origin backtest). Recursive 5-week (35-day) forecast. `full()` trains everything plus the backtest; `quick()` is the cheap fallback. |
| `forecast.py` | Dict cache keyed by `(kind, mode, province, commodity)`; exposes `summary`, `overview`, `detail`, `seasonality`, `price_map`, `compare`, `warm`, `clear_cache`. |
| `pipeline.py` | Modes `live` / `wfp` / `inbox` / `da` / `simulate` / `seed`; `normalize_wfp` (HXL tag-row skip, retail filter, unit conversion to kg/dozen, commodity and province matching, outlier guard); non-blocking `_run_lock`; never raises — returns `status: "error"` instead. |
| `scheduler.py` | Daemon thread on interval `MERCADO_REFRESH_HOURS` (default 24); `start` / `stop` / `info` (next run, interval). |
| `commodities.py` | `COMMODITIES` — rice, pork, chicken, eggs, bangus, tomato, onion, calamansi, cabbage, eggplant — with display metadata, `typhoon`/`fuel` sensitivities, `shelf` days, `basket` weight, and WFP `keywords`. `DISHES` — adobo, tinola, bangus, torta, rice, ginisang — with per-serving ingredient amounts. |
| `geo.py` | 25 provinces with region code/name, representative market, lat/lon, price level, aliases; `regions()`, `BY_ID`, `haversine_km`, `match_province`. |

### 4.3 Forecast semantics (critical for correctness)

- **Input:** weekly retail price series per `(province, commodity)`; model space is `log(price)`.
- **Output:** 5 weekly points (weeks 1–5), converted to daily values by interpolation (`_at_day`) for the 7/14/30-day horizons.
- **Interval:** `exp(point ± 1.2816·σ)`, where σ comes from the ensemble's backtest residuals at each horizon, so the band widens with horizon (asserted monotonic in tests).
- **Signal rule:** `thr = max(2.5, 0.5·σ%)`; `change ≥ thr` → `surge`, `change ≤ −thr` → `dip`, otherwise `stable`.
- **Drivers:** decomposes the 4-week move into seasonal + trend + momentum percentages.
- **Best buy:** cheapest day within each horizon, either `"now"` or an ISO date, with `saves_pct` relative to the most expensive candidate.
- **Model lab:** per-model MAPE and direction accuracy, ensemble weights, backtest series, and origin count.
- **Quick vs full:** `overview` and `map` may use the cheap model until a full ensemble has been warmed; `detail` always uses `full`.

---

## 5. API contract (all under `/api/v1`)

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{status, rows, as_of}` |
| GET | `/meta` | `{provinces[], regions[], commodities[], dishes[], horizons[], data}` — provinces filtered to those present in the DB |
| GET | `/overview?province=` | `{province, as_of, items[10], basket}`; each item is a `summary()` |
| GET | `/forecast?province=&commodity=` | full `detail()` payload |
| GET | `/map?commodity=` | `{rows[]}`, one per available province |
| GET | `/compare?province=&commodity=` | `{province, commodity, mine, rows[], best_nearby}` with `distance_km`, `diff_pct`, `diff_abs` |
| GET | `/pipeline` | `{dataset, scheduler, sources, runs}` |
| POST | `/pipeline/run` | body `{mode}` optional (defaults to `"live"`) → run report |
| GET | `/` (unversioned) | welcome JSON |

Key payload shapes:

```jsonc
// summary() — item in /overview, row in /map
{ "commodity":"rice", "engine":"full|quick", "price":40.12,
  "horizons": { "7":{price,lo,hi,change_pct,prob_up,signal}, "14":{...}, "30":{...} },
  "spark":[26 floats], "spark_forecast":[5 floats], "as_of":"2026-10-26", "percentile_52w":63 }

// detail()
{ province, commodity, as_of, current,
  history:[{date,price}], forecast:[{date,price,lo,hi}],
  horizons{...}, drivers:{total_pct,seasonal_pct,trend_pct,momentum_pct,weeks},
  best_buy:{"7":{when,days,price,saves_pct},"14":...,"30":...},
  stats:{min_52w,max_52w,avg_52w,percentile_52w,volatility_pct},
  seasonality:[12 floats], members:{model:[5 prices]},
  model_lab:{metrics{model:{mape,direction}}, weights{model:float}, series, origins, labels} }

// pipeline/run report
{ status:"ok|no_update|error", mode, source, rows_added, message, log:[...] }
```

**Error shape:** the frontend reads `data.error` first, then FastAPI's `data.detail`. Domain failures return `{error: msg}` via a `JSONResponse` helper (`_err`), while guard failures from `HTTPException` return `{detail: msg}` (for example an unknown province → 404). Do not "clean this up" without updating `frontend/src/api.js`.

**Pipeline modes:**

- `live` — WFP HDX fetch; degrades gracefully to `ok` / `no_update` when offline.
- `wfp` — explicit WFP pull.
- `inbox` — CSV files dropped in `backend/data/inbox/`.
- `da` — scaffold only (PDF bulletin parser not implemented).
- `simulate` — appends one synthetic week across 25 provinces × 10 commodities.
- `seed` — destructive reset plus reseed.

---

## 6. Data model

```sql
CREATE TABLE prices(
  date TEXT NOT NULL,          -- ISO date, weekly cadence, one row per province/commodity
  province TEXT NOT NULL,
  region TEXT, market TEXT,
  commodity TEXT NOT NULL,
  price REAL NOT NULL,
  source TEXT,
  PRIMARY KEY(date, province, commodity)
);

CREATE TABLE pipeline_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started TEXT, finished TEXT, mode TEXT, source TEXT,
  status TEXT, rows_added INTEGER, message TEXT,
  log TEXT                     -- JSON array of log lines
);
```

Seeded dataset: **25 provinces × 10 commodities × ~408 weeks = 102,000 rows**, `as_of` 2026-10-26. The database is generated at runtime and gitignored; delete `backend/data/mercado.db` to force a reseed.

---

## 7. Frontend architecture

### 7.1 Routing and global state

`src/state.jsx` is a hand-rolled **hash router** plus one React context.

Routes: `#/board`, `#/commodity/<id>`, `#/map`, `#/planner`, `#/whatif`, `#/lab`, `#/pipeline`, `#/auth`. `nav(page, arg)` sets `window.location.hash` and scrolls to top.

Context exposes: `route`, `nav`, `meta`, `metaError`, `loadMeta`, `province`, `setProvince`, `prov`, `horizon`, `setHorizon`, `lang`, `setLang`, `theme`, `setTheme`, `t()` (i18n), `commodityBy`, `dataVersion`, `bumpData`, and `useApi(path, deps)`.

Persisted in `localStorage`: `mercado.province`, `mercado.horizon`, `mercado.lang`, `mercado.theme`, plus planner keys `mercado.sell` and `mercado.qty`.

`useApi(path, deps)` returns `{data, error, loading, reload}` and refetches when the path or `dataVersion` changes (a pipeline run bumps `dataVersion`).

### 7.2 Authentication

`App.jsx` wraps everything in `AppProvider`, then:

1. `supabase.auth.getSession()` plus an `onAuthStateChange` subscription.
2. While checking → `<Training place="Mercado" />` splash.
3. No session, or the route is `auth` → `<Auth onLogin={() => nav('board')} />`.
4. Otherwise render `<Layout>` and the selected page (pages render only after `meta` has loaded).

`Auth.jsx` performs Supabase `signUp` (with `full_name` and `username` in user metadata) and `signInWithPassword`; on success it calls `finish()` → `onLogin` or `nav('board')`. `Layout.jsx` calls `supabase.auth.signOut()` and then `nav('auth')`.

Credentials come only from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `supabaseClient.js` throws a descriptive error at import time if either is missing.

### 7.3 Data access

`src/api.js` is a thin axios wrapper:

- `BASE = VITE_API_BASE`, empty in development, which means same-origin and therefore the Vite proxy.
- `get(path, {fresh})` caches the **promise** in a `Map` and deletes it on rejection; `post(path, body)` bypasses the cache.
- Errors become `Error(message, {cause})`, with the message taken from `response.data.error ?? response.data.detail ?? message`.

In development, `vite.config.js` proxies `/api` → `http://127.0.0.1:8000`, so no CORS configuration is needed.

### 7.4 Styling

Two systems coexist deliberately:

- `src/index.css` — `@import "tailwindcss";` only (Tailwind v4 via the Vite plugin; there is **no** `tailwind.config.js`).
- `src/styles.css` — the legacy design system: CSS custom properties (`--bg`, `--surface`, `--ink`, `--leaf`, `--mango`, `--surge`, `--dip`, `--band`, `--r`, fonts), dark mode via `@media (prefers-color-scheme: dark)` and `[data-theme]`, plus component classes (`.page-head`, `.seg`, `.card`, `.price-tag`, `.signal`, `.map-bubble`, `.spark`, …).

`main.jsx` imports `index.css` **then** `styles.css`, so legacy rules win on conflict. New screens may use Tailwind utilities; existing screens rely on legacy classes.

### 7.5 Charts

- **Chart.js** via `react-chartjs-2`:
  - `ForecastChart` — history, dashed forecast, shaded 80% band, custom overlay drawing the forecast zone, horizon marker, "now" dot, and best-buy ring.
  - `SeasonBars` — diverging monthly bars with a cheapest-month annotation.
  - `MultiLine` — backtest actual vs predicted.
  - `DriverBars` — horizontal diverging bars with value labels.
- **Hand-rolled SVG:**
  - `Sparkline` — board rows.
  - `PhilippinesMap` — dot-matrix islands, bubbles colored by `changeColor`.
- Charts resolve theme colors at render time from CSS variables, so dark mode works, but toggling the theme requires a re-render (values are read in `theme()`, not via reactive observers).
- The production bundle is ~770 kB and triggers a >500 kB warning; this is non-fatal.

### 7.6 Page features

| Route / page | Features |
|---|---|
| `#/board` (`Board.jsx`) | One row per commodity: price tag, sparkline plus forecast, Surge/Dip/Steady chip, basket total, alerts, sample-data badge, horizon toggle, location picker. |
| `#/commodity/<id>` (`Detail.jsx`) | Forecast chart, horizon cards, best day to buy, 52-week stats, drivers, seasonality bars, per-model forecast members, backtest table with MAPE/direction/weights, nearby cheaper markets. |
| `#/map` (`MapPage.jsx`) | SVG Philippines map colored by expected change for the selected horizon; clicking a bubble selects a province; regional legend. |
| `#/planner` (`Planner.jsx`) | Pick menu items and servings, see ingredient cost, margin, margin at risk from the forecast, and a weekly shopping list with buy-now/wait advice. Persists to `localStorage`. |
| `#/whatif` (`WhatIf.jsx`) | Typhoon severity (0–1) and fuel change (−20…+60%) sliders. Effect = `typhoon·0.25·sensitivity·ramp(days/14) + fuel·sensitivity·0.4·ramp(days/21)`; signals are recomputed client-side (`classify`, ±2.5% thresholds mirroring the backend). |
| `#/lab` (`ModelLab.jsx`) | For each commodity, ensemble MAPE vs the naive baseline and direction accuracy, fetched from `/forecast` in a loop. |
| `#/pipeline` (`Pipeline.jsx`) | Dataset info, scheduler state, source status, run-now per mode, "simulate a new week", and run history. |
| `#/auth` (`Auth.jsx`) | Supabase sign in / sign up, password visibility toggle, inline errors. |

Cross-cutting: English/Filipino toggle (`i18n.js`), light/dark/system theme, and a responsive mobile nav drawer.

---

## 8. Features summary (product view)

1. Province-level price forecasts for 10 commodities at 7/14/30 days, with uncertainty bands.
2. Surge / dip / stable signals with probability of an increase.
3. Best day to buy within each horizon.
4. Palengke (wet market) basket cost projection.
5. Interactive Philippine map of expected price movement.
6. Carinderia menu costing and margin-at-risk planning.
7. Typhoon/fuel what-if scenario lab.
8. Model transparency lab (ensemble vs naive backtest, weights, per-model forecasts).
9. Data pipeline control (live pull, CSV inbox, simulation, reseed, scheduler).
10. Supabase authentication, English/Filipino UI, dark mode.

---

## 9. Commands

```bash
# Backend (from backend/)
uv sync
uv run uvicorn main:app --reload        # :8000, docs at /docs
uv run pytest -q                        # 6 tests, ~2 min (warms forecasts)

# Frontend (from frontend/)
pnpm install
cp .env.example .env                    # then fill in Supabase values
pnpm dev                                # :5173
pnpm lint
pnpm build
```

Optional backend environment:

| Variable | Default | Purpose |
|---|---|---|
| `MERCADO_DATA_DIR` | `backend/data` | SQLite and pipeline state location |
| `MERCADO_WARM` | `1` | Set `0` to skip forecast pre-computation at startup |
| `MERCADO_SCHEDULER` | `1` | Set `0` to disable the recurring pipeline refresh |
| `MERCADO_REFRESH_HOURS` | `24` | Scheduler interval |
| `MERCADO_PORT` / `PORT` | `8000` | Legacy port override |

Frontend environment (`frontend/.env`):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | Backend origin. Leave empty in development to use the Vite proxy. |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

---

## 10. Known issues, quirks, and deferred work

**Quirks to leave alone unless asked:**

- `backend/src/backend/` is an unused `uv_build` stub; its console script only prints "Hello from backend!". The app is `backend/main.py`.
- `backend/mercado/engine.py` and `insights.py` were **intentionally not migrated** (incomplete rewrite referencing nonexistent `store.Dataset` / `Panel`; nothing imports them). Do not add them back.
- `Layout.jsx` and `Board.jsx` both render a header/nav block. This duplication came from the feature branch and is not a migration bug.
- Error responses are split between `{error}` (domain) and `{detail}` (`HTTPException`). Preserve both.
- `pnpm build` warns about a >500 kB chunk; non-fatal.
- `pytest` emits a Starlette deprecation warning about `httpx` inside `TestClient`; non-fatal.

**Deliberately deferred:**

1. Replace the stdlib `sqlite3` store with SQLAlchemy.
2. Replace `GradientBoostingRegressor` with XGBoost.
3. Full Tailwind rewrite of `styles.css`.
4. Implement the `da` pipeline mode (PDF bulletin parser); it is currently a scaffold.

**Fresh-clone caveat:** `frontend/.env` is gitignored. A new checkout must copy `.env.example` and fill in Supabase values, otherwise `supabaseClient.js` throws at startup.

---

## 11. Guardrails for an LLM working here

1. **Run commands from `backend/` or `frontend/`** — there is no root workspace.
2. **Always use `uv run`**; never assume a globally installed Python environment. Python must be 3.14+.
3. **Keep the `/api/v1` prefix** and the existing response shapes; the frontend hardcodes both.
4. **Never commit** `.env`, `backend/data/*.db`, `backend/data/live/`, `backend/data/inbox/`, `node_modules/`, or `dist/`.
5. **Model internals use log prices.** Any change to `models.py` or `forecast.py` must keep `ensemble` beating `naive` in the backtest and σ monotonic across horizons — the tests assert both.
6. **Do not reorder CSS imports** in `main.jsx` (Tailwind first, legacy second) without migrating the affected screens.
7. **Keep `Sparkline` and `PhilippinesMap` as SVG**; only the four main charts use Chart.js.
8. **Verify with:** `uv run pytest -q`, `pnpm lint`, `pnpm build`, then curl `/api/v1/health`, `/meta`, `/overview?province=ncr`, and `/forecast?province=ncr&commodity=tomato`.
9. **Reseeding is destructive** — `POST /api/v1/pipeline/run {"mode":"seed"}` wipes and rebuilds the price table.
10. **Synthetic data is deterministic**; changes to `sample_data.py` alter every forecast and will break fixture-style expectations.

---

## 12. Domain glossary

| Term | Meaning |
|---|---|
| Palengke | Public wet market |
| Carinderia | Small neighborhood eatery; the planner models its menu costs |
| Commodity id | Lowercase slug used across API and UI (`rice`, `pork`, `chicken`, `eggs`, `bangus`, `tomato`, `onion`, `calamansi`, `cabbage`, `eggplant`) |
| Horizon | Forecast look-ahead in days: 7, 14, 30 |
| Signal | `surge` (prices rising), `dip` (falling), `stable` |
| Basket | Weighted sum of unit prices approximating a small carinderia's weekly purchases |
| WFP | World Food Programme; source of the HDX price CSV |
| HXL | Humanitarian Exchange Language; WFP CSVs carry a leading `#`-tag row that must be skipped |
| Ensemble | Inverse-squared-error weighted blend of naive, Holt-Winters, Ridge, and GBM |
| σ (sigma) | Backtest residual standard deviation in log space; drives the 80% interval and the signal threshold |
