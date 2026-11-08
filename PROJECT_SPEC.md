# Mercado — Project Specification & LLM Context Pack

> **How to use this file:** upload it as-is to an LLM to give it working context for this repository. It describes the code as it exists today. If this document and the code disagree, the code wins — fix the document.
>
> **Last reviewed:** 2026-11-08 against the code. Backend tests: `6 passed`.

---

## 1. What the project is

Mercado forecasts retail food prices in the Philippines at province level. A user picks a province and sees current prices, 7/14/30-day forecasts with an 80% band, and surge/dip/stable signals for 10 basic commodities. Secondary features: a price map, a carinderia (small eatery) menu-cost planner, a what-if lab (typhoon and fuel sliders), a model-accuracy lab, and a pipeline control panel.

It is a **two-app repository with no root workspace**:

| App | Path | Stack | Dev URL |
|---|---|---|---|
| API + forecast engine | `backend/` | Python 3.14+, FastAPI, uv, pandas, NumPy, scikit-learn, stdlib `sqlite3` | `http://127.0.0.1:8000` |
| Web UI | `frontend/` | React 19, Vite, Tailwind v4, axios, Chart.js, Supabase Auth | `http://localhost:5173` |

No Docker, no CI, no TypeScript, no backend linter or formatter config, no frontend test runner. Verification is manual plus the backend pytest suite.

---

## 2. Dependencies

**Backend** (`backend/pyproject.toml`, `requires-python >= 3.14`)

- Used by app code: `fastapi`, `uvicorn`, `pandas`, `numpy`, `scikit-learn`.
- Declared but not imported by app code: `joblib`, `sqlalchemy`, `xgboost`. See §9 for the planned use of the last two.
- Dev group: `pytest`, `httpx`.
- The project is an application, not a built package: there is no `[build-system]` and no console script. `uv sync` installs dependencies only.

**Frontend** (`frontend/package.json`): `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss` with `@tailwindcss/vite`, `axios`, `chart.js` with `react-chartjs-2`, `@supabase/supabase-js`, `lucide-react`, and `eslint` with the react-hooks and react-refresh plugins. Check the manifests for exact versions.

**Tooling:** `uv` is in `~/.local/bin`. Node and pnpm are the current releases (verified on Node 26 and pnpm 12). The checkout lives on the Windows drive (`/mnt/c/...`), so `uv` prints a hardlink warning; set `UV_LINK_MODE=copy` to silence it.

---

## 3. Repository layout

```text
mercado/
├── .gitignore
├── AGENTS.md                      # agent-facing commands and gotchas
├── README.md                      # human setup and reference
├── PROJECT_SPEC.md                # this document
│
├── backend/
│   ├── pyproject.toml             # uv application; dependencies only
│   ├── uv.lock
│   ├── main.py                    # FastAPI app, lifespan, all /api/v1 routes, error helpers
│   ├── mercado/                   # forecast engine package
│   │   ├── __init__.py
│   │   ├── store.py               # SQLite schema, upserts, cached price DataFrame, weekly series
│   │   ├── sample_data.py         # deterministic synthetic weekly price generator
│   │   ├── models.py              # naive / Holt-Winters / Ridge / GBM / ensemble, backtests
│   │   ├── forecast.py            # result cache, signals, horizon blocks, overview/detail/map/compare, warm()
│   │   ├── pipeline.py            # live / wfp / inbox / da / simulate / seed ingestion and run log
│   │   ├── scheduler.py           # background thread that re-runs the pipeline
│   │   ├── commodities.py         # 10 commodities, 6 carinderia dishes
│   │   └── geo.py                 # 25 provinces, 16 regions, haversine distance, name matching
│   ├── data/                      # GITIGNORED, generated: mercado.db, live/, inbox/
│   └── tests/
│       └── test_mercado.py        # 6 pytest tests via fastapi.testclient
│
└── frontend/
    ├── .env.example               # VITE_API_BASE, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_DEV_BYPASS_AUTH
    ├── .env                       # GITIGNORED, local credentials
    ├── index.html                 # loads Bricolage Grotesque and Figtree fonts
    ├── vite.config.js             # react + tailwind plugins; port 5173; /api proxy to :8000
    ├── eslint.config.js
    └── src/
        ├── main.jsx               # imports index.css THEN styles.css
        ├── App.jsx                # auth gate, route switch, wraps pages in Layout
        ├── state.jsx              # hash router, AppProvider context, useApi
        ├── api.js                 # axios wrapper with promise cache; clearCache()
        ├── supabaseClient.js      # supabase client, or null when env vars are missing
        ├── i18n.js                # English / Filipino strings; translate()
        ├── alerts.js              # buildAlerts(), advise()
        ├── util.js                # peso, pct, fmtDate, classify, store/save, changeColor, …
        ├── index.css              # @import "tailwindcss";
        ├── styles.css             # legacy design system (tokens, layout, component classes)
        ├── pages/
        │   ├── Auth.jsx           # Supabase sign in / sign up (renders outside Layout)
        │   ├── Board.jsx          # price board: KPI cards, price tags, alerts
        │   ├── Detail.jsx         # commodity detail: forecast chart, stats, drivers, backtest
        │   ├── MapPage.jsx        # Philippines map and regional legend
        │   ├── Planner.jsx        # carinderia menu costing and shopping list (localStorage)
        │   ├── WhatIf.jsx         # typhoon and fuel sliders over the forecast
        │   ├── ModelLab.jsx       # ensemble vs naive accuracy per commodity
        │   └── Pipeline.jsx       # dataset info, scheduler state, run-now per mode
        └── components/
            ├── Layout.jsx         # app shell: header, drawer, nav, LocationPicker, language/theme toggles, logout
            ├── Common.jsx         # PageHead, HorizonToggle, Training, ErrorBox, SampleBadge
            ├── PriceTag.jsx       # PriceTag, SignalChip
            ├── Charts.jsx         # ForecastChart, SeasonBars, MultiLine, DriverBars (Chart.js); Sparkline (SVG)
            ├── PhilippinesMap.jsx # SVG dot-matrix map
            ├── Pinmarker.jsx      # map pin
            ├── LocationPicker.jsx # province / market picker
            └── Icons.jsx          # inline SVG icons and Logo
```

---

## 4. Backend

### 4.1 Startup (`backend/main.py`)

`app = FastAPI(title="Mercado API", lifespan=lifespan)`. The lifespan runs, in order:

1. `seed_if_empty()`: calls `store.init_db()`. If `store.count_rows() == 0`, it inserts `sample_data.generate()` and writes a `pipeline_runs` row with `mode="seed"`.
2. If `MERCADO_WARM != "0"` and rows exist, starts a daemon thread running `forecast.warm()`.
3. If `MERCADO_SCHEDULER != "0"`, calls `scheduler.start()`.
4. On shutdown, calls `scheduler.stop()`.

CORS allows only `http://localhost:5173` and `http://127.0.0.1:5173`. All feature routes live on `API = APIRouter(prefix="/api/v1")`, which is included into the app. `GET /` is an unversioned welcome route.

### 4.2 Routes

| Method | Path | Handler | Returns |
|---|---|---|---|
| GET | `/api/v1/health` | `health` | `{status, rows, as_of}` |
| GET | `/api/v1/meta` | `meta` | `{provinces[], regions[], commodities[], dishes[], horizons[], data}`; provinces are filtered to those present in the DB |
| GET | `/api/v1/overview?province=` | `overview` | `{province, as_of, items[10], basket}`; each item is a `forecast.summary()` |
| GET | `/api/v1/forecast?province=&commodity=` | `fc` | `forecast.detail()` payload |
| GET | `/api/v1/map?commodity=` | `pmap` | `{rows[]}`, one per available province |
| GET | `/api/v1/compare?province=&commodity=` | `compare` | `{province, commodity, mine, rows[], best_nearby}` with `distance_km`, `diff_pct`, `diff_abs` |
| GET | `/api/v1/pipeline` | `pipe` | `{dataset, scheduler, sources, runs}` |
| POST | `/api/v1/pipeline/run` | `pipe_run` | body `{mode}` (defaults to `"live"`) → run report |
| GET | `/` | `home` | welcome JSON |

**Error shape.** Domain failures return `{error: msg}` through the `_err` helper. `HTTPException` (for example an unknown province through `_check_prov`) returns `{detail: msg}`. The frontend reads `error` first, then `detail`. Keep both shapes.

### 4.3 Module responsibilities

| Module | Role |
|---|---|
| `store.py` | SQLite at `MERCADO_DATA_DIR/mercado.db` (default `backend/data`). A module `RLock` guards writes. Functions: `connect`, `init_db`, `count_rows`, `upsert_prices`, `reset_prices`, `load`, `invalidate`, `last_date`, `series`, `available`. `load()` caches the full price table as a DataFrame until `invalidate()`. `series(province, commodity)` returns a weekly Monday series, interpolated, and raises `ValueError` under 110 weeks. |
| `sample_data.py` | Deterministic synthetic history. `START = 2019-01-07`, `DEFAULT_END = 2026-10-26`, which is 408 weeks. Functions: `week_dates`, `n_weeks`, `generate`, `next_week_rows`. Same seed and end date produce the same prefix. |
| `models.py` | All models work on **log** weekly prices. `MODEL_NAMES = ["naive", "holt_winters", "ridge", "gbm"]`. `gbm` is sklearn's `GradientBoostingRegressor`. Helpers include `holt_winters`, `build_matrix`, `feature_forecast`. `quick()` is the cheap fallback. `full()` runs the rolling-origin backtest and builds the **ensemble**, an inverse-squared-error weighted blend of the four models. `HORIZON = 5` weeks. |
| `forecast.py` | Result cache keyed by `(kind, mode, province, commodity)` with a version counter. `HORIZONS = (7, 14, 30)`. Public functions: `summary`, `overview`, `detail`, `seasonality`, `price_map`, `compare`, `warm`, `clear_cache`. `summary(..., allow_quick=True)` may use the quick model for series without a full ensemble yet. |
| `pipeline.py` | `MODES = ("live", "wfp", "inbox", "da", "simulate", "seed")`. `run(mode)` never raises; failures come back as `status: "error"`. A non-blocking `_run_lock` prevents concurrent runs. `normalize_wfp` skips the HXL tag row, filters to retail, converts units to kg or dozen, and matches commodities and provinces. `fetch_wfp`, `read_inbox`, `apply_live`, `recent_runs`. |
| `scheduler.py` | Daemon thread on `MERCADO_REFRESH_HOURS` (default 24). Functions: `start(interval_hours=None)`, `stop()`, `info()`. |
| `commodities.py` | `COMMODITIES` (10: rice, pork, chicken, eggs, bangus, tomato, onion, calamansi, cabbage, eggplant) with display metadata, typhoon and fuel sensitivities, and shelf life. `DISHES` (6) with per-serving ingredient amounts. `BY_ID`, `public()`, `match_commodity()`, `dishes()`. |
| `geo.py` | `PROVINCES` (25) with region, representative market, coordinates, and aliases. `BY_ID`, `regions()` (16), `match_province()`, `haversine_km()`. |

### 4.4 Forecast semantics

- **Input:** weekly retail price per `(province, commodity)`; the model works in `log(price)`.
- **Output:** 5 weekly points, interpolated to the 7/14/30-day horizons.
- **Band:** the 80% interval comes from the backtest residual σ at each horizon, so the band widens with horizon.
- **Signal** (`forecast._signal`): `thr = max(2.5, 0.5 × σ%)`. A change at or above `thr` is `surge`, at or below `-thr` is `dip`, otherwise `stable`.
- **Best buy:** the cheapest day in each horizon, given as `"now"` or an ISO date, with `saves_pct` against the most expensive candidate.
- **Engine label:** `overview` and `map` may show `engine: "quick"` until the full ensemble is warmed. `detail` always uses `full`.

---

## 5. Data model

```sql
CREATE TABLE prices(
  date TEXT NOT NULL,                   -- ISO Monday, one row per province and commodity per week
  province TEXT NOT NULL, region TEXT, market TEXT,
  commodity TEXT NOT NULL, price REAL NOT NULL, source TEXT,
  PRIMARY KEY(date, province, commodity)
);

CREATE TABLE pipeline_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started TEXT, finished TEXT, mode TEXT, source TEXT,
  status TEXT, rows_added INTEGER, message TEXT,
  log TEXT                              -- JSON array of log lines
);
```

Seeded dataset: 25 provinces × 10 commodities × 408 weeks = 102,000 rows, `as_of` 2026-10-26. The database is generated at runtime and gitignored. Delete `backend/data/mercado.db` to force a reseed.

---

## 6. Frontend architecture

### 6.1 Request and data path

```
Page component → useApi(path, deps) → api.get(path) → axios → Vite proxy /api → FastAPI /api/v1 → forecast.py → store.py → SQLite
```

- `api.js` caches **promises** in a `Map` keyed by path. `get(path, {fresh: true})` bypasses the cache. `post()` never caches. `clearCache()` empties the map.
- `useApi(path, deps)` (in `state.jsx`) refetches when the path or deps change. `reload()` forces a fresh fetch.
- In development, `vite.config.js` proxies `/api` to `http://127.0.0.1:8000`, so `VITE_API_BASE` stays empty.

### 6.2 Routing and global state

`src/state.jsx` provides a hand-rolled hash router and one context from `AppProvider`.

Routes, handled in `App.jsx`: `#/board`, `#/commodity/<id>`, `#/map`, `#/planner`, `#/whatif`, `#/lab`, `#/pipeline`, `#/auth`. `nav(page, arg)` sets the hash and scrolls to the top.

Context fields: `route`, `nav`, `meta`, `metaError`, `loadMeta`, `province`, `prov`, `setProvince`, `horizon`, `setHorizon`, `lang`, `setLang`, `theme`, `setTheme`, `t`, `commodityBy`, `dataVersion`, `bumpData`.

`localStorage` keys: `mercado.province` (default `ncr`), `mercado.horizon` (default 14), `mercado.lang`, `mercado.theme`. The Planner also stores `mercado.sell`, `mercado.qty`, `mercado.target`, and `mercado.servings`.

`loadMeta` re-fetches `/meta` whenever `dataVersion` changes.

### 6.3 Authentication and shell

`App.jsx` renders in this order:

1. While checking the Supabase session, render `<Training />`.
2. With no session, or on route `auth`, render `<Auth />`. This happens outside `Layout`.
3. Otherwise render `<Layout>` around the selected page.

`VITE_DEV_BYPASS_AUTH=1` skips the gate for UI work without credentials. `supabaseClient.js` logs a warning and exports `supabase = null` when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing. It does not throw.

`Layout.jsx` is the **only** app shell. It provides the header, the side drawer, navigation links, the `LocationPicker`, the language toggle, the theme toggle, and logout (`supabase.auth.signOut()`, then `nav('auth')`). Pages render content only and must not add their own header, drawer, or full-page background.

### 6.4 Styling

- `main.jsx` imports `index.css` **then** `styles.css`, so legacy rules win on conflict.
- `index.css` is `@import "tailwindcss";` only. There is no `tailwind.config.js`.
- `styles.css` is the legacy design system: CSS custom properties, dark mode through `[data-theme]` and the media query, and component classes such as `.page-head`, `.card`, `.tag` (price tags), `.chip` and `.signal`, `.spark`.
- `Layout.jsx` and `Board.jsx` each have an inline `<style>` block. Layout's global classes (for example `.side-drawer`, `.icon-btn`) belong to Layout only. `Board.jsx` scopes its rules under `.board-page-wrapper`.

### 6.5 Charts

- **Chart.js** via `react-chartjs-2`: `ForecastChart`, `SeasonBars`, `MultiLine`, and `DriverBars`.
- **Hand-rolled SVG:** `Sparkline` (in `Charts.jsx`) and `PhilippinesMap` (with `Pinmarker`). Keep these as SVG.
- Charts read theme colors when they render, so a theme change needs a re-render.

### 6.6 Pages

| Route | Page | Purpose |
|---|---|---|
| `#/board` | `Board.jsx` | Basket total and surge/dip counts, price tags with sparklines, alerts, horizon toggle |
| `#/commodity/<id>` | `Detail.jsx` | Forecast chart, stats, drivers, seasonality, model members, backtest, nearby cheaper markets |
| `#/map` | `MapPage.jsx` | Map colored by expected change at the selected horizon; click a province to select it |
| `#/planner` | `Planner.jsx` | Menu costing, margin at risk, shopping list |
| `#/whatif` | `WhatIf.jsx` | Typhoon (0–1) and fuel (−20…+60%) sliders over the forecast |
| `#/lab` | `ModelLab.jsx` | Ensemble vs naive MAPE and direction accuracy per commodity |
| `#/pipeline` | `Pipeline.jsx` | Dataset and scheduler state, run-now per mode, run history |
| `#/auth` | `Auth.jsx` | Supabase sign in and sign up |

---

## 7. Commands

```bash
# Backend (from backend/)
uv sync
uv run uvicorn main:app --reload        # :8000, docs at /docs
uv run pytest -q                        # 6 tests, roughly 60–100 s (warms forecasts)

# Frontend (from frontend/)
pnpm install
cp .env.example .env                    # then fill in Supabase values
pnpm dev                                # :5173
pnpm lint
pnpm build
```

Backend environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `MERCADO_DATA_DIR` | `backend/data` | SQLite and pipeline state location |
| `MERCADO_WARM` | `1` | Set `0` to skip forecast pre-computation at startup |
| `MERCADO_SCHEDULER` | `1` | Set `0` to disable the recurring pipeline refresh |
| `MERCADO_REFRESH_HOURS` | `24` | Scheduler interval |

Frontend environment (`frontend/.env`):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | Backend origin for deployed builds. Leave empty in development. |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_DEV_BYPASS_AUTH` | `1` skips the login gate for UI work. Never enable in production. |

`frontend/.env` is gitignored. A fresh clone must copy `.env.example`; without the Supabase values, sign-in is unavailable unless the bypass is set.

---

## 8. Known issues

1. **`da` pipeline mode is incomplete.** `pipeline.py` finds PDF report links, but PDF table parsing is not implemented. The parser stub raises `NotImplementedError`, and `run()` logs that nothing was imported.
2. **Client cache can serve stale data after a pipeline run.** `api.js` keeps promises for the lifetime of the page. The Pipeline page calls `clearCache()` and `bumpData()` after its own runs, but runs started by the scheduler or from another tab do not reach the cache. Those views stay stale until a full page reload.
3. **What-If signal thresholds differ from the backend.** `util.js` `classify()` uses a fixed ±2.5%. The backend uses `max(2.5, 0.5 × σ%)`, so a high-volatility series can show different signals in the lab than on the board. The `classify` comment says the thresholds are the same, which is not true when σ is large.
4. **No frontend tests.** `package.json` has `dev`, `build`, `lint`, and `preview` scripts only.
5. **Pytest emits a Starlette deprecation warning** about `httpx` inside `TestClient`. It is not a failure.
6. **`pnpm build` warns about a chunk over 500 kB.** It is not a failure.
7. **Board's scoped styles use hardcoded light-on-dark colors.** This is a follow-up, not a bug.

---

## 9. Planned dependencies

These are declared in `pyproject.toml` for planned model work. They are intentionally unused today.

- **XGBoost** (`xgboost`): not imported anywhere yet. The planned use is a replacement for the `GradientBoostingRegressor` behind the `gbm` model in `models.py`.
- **SQLAlchemy** (`sqlalchemy`): not imported yet. The planned use is to replace the stdlib `sqlite3` store in `store.py` and to persist backtests and forecasts.
- **joblib** (`joblib`): declared, not imported by app code. Nothing in the codebase depends on it today.

---

## 10. Guardrails for an LLM working here

1. **Run commands from `backend/` or `frontend/`.** There is no root workspace.
2. **Always use `uv run`** for Python. Python must be 3.14+.
3. **Keep the `/api/v1` prefix and the existing response shapes.** The frontend hardcodes both.
4. **Keep both error shapes** (`error` and `detail`) and update `frontend/src/api.js` if you change either.
5. **Model internals use log prices.** Changes to `models.py` or `forecast.py` must keep the ensemble beating the naive baseline in the backtest and keep σ non-decreasing across horizons. The tests assert both.
6. **Do not reorder the CSS imports** in `main.jsx` without migrating the affected screens.
7. **Layout owns the shell.** Pages render content only.
8. **Keep `Sparkline` and `PhilippinesMap` as SVG.** Only the four main charts use Chart.js.
9. **Reseeding is destructive.** `POST /api/v1/pipeline/run {"mode": "seed"}` rebuilds the price table.
10. **Synthetic data is deterministic.** Changing `sample_data.py` changes every forecast and breaks fixture-style expectations.
11. **Never commit** `.env`, `backend/data/*.db`, `backend/data/live/`, `backend/data/inbox/`, `node_modules/`, or `dist/`.
12. **Verify with:** `uv run pytest -q`, `pnpm lint`, `pnpm build`, then `curl` `/api/v1/health`, `/api/v1/meta`, `/api/v1/overview?province=ncr`, and `/api/v1/forecast?province=ncr&commodity=tomato`.

---

## 11. Domain glossary

| Term | Meaning |
|---|---|
| Palengke | Public wet market |
| Carinderia | Small neighborhood eatery; the planner models its menu costs |
| Commodity id | Lowercase slug used in the API and UI (`rice`, `pork`, `chicken`, `eggs`, `bangus`, `tomato`, `onion`, `calamansi`, `cabbage`, `eggplant`) |
| Horizon | Forecast look-ahead in days: 7, 14, or 30 |
| Signal | `surge` (rising), `dip` (falling), or `stable` |
| Basket | Weighted sum of unit prices approximating a small carinderia's weekly purchases |
| WFP | World Food Programme; source of the HDX price CSV |
| HXL | Humanitarian Exchange Language; WFP CSVs carry a leading `#`-tag row that must be skipped |
| Ensemble | Inverse-squared-error weighted blend of naive, Holt-Winters, Ridge, and GBM |
| σ (sigma) | Backtest residual standard deviation in log space; drives the 80% band and the signal threshold |
