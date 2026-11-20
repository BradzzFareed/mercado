# Mercado — Project Specification & LLM Context Pack

> **How to use this file:** upload it as-is to an LLM to give it working context for this repository. It describes the code as it exists today. If this document and the code disagree, the code wins — fix the document.
>
> **Last reviewed:** 2026-11-18 against the code. Backend tests: `130 passed`.

---

## 1. What the project is

Mercado forecasts retail food prices in the Philippines at province level. A user picks a province and sees current prices, 7/14/30-day forecasts with an 80% band, and surge/dip/stable signals for 10 basic commodities. Secondary features: a price map, a carinderia (small eatery) menu-cost planner, a data pipeline control panel, a user profile with an avatar, and buying-alert notifications. The commodity detail page also shows an inline model-accuracy panel.

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
│   │   ├── pipeline.py            # live / wfp / inbox / da / simulate / seed; WFP via wfp.py, one transaction per run
│   │   ├── scheduler.py           # background thread that re-runs the pipeline
│   │   ├── commodities.py         # registry-backed: 70 WFP commodities (10 synthetic), 6 carinderia dishes
│   │   ├── registry/              # commodities.json, provinces.json, market_rules.json (identity data)
│   │   └── geo.py                 # registry-backed: 82 provinces (25 synthetic), regions, haversine, name matching
│   ├── data/                      # GITIGNORED, generated: mercado.db, live/, inbox/
│   └── tests/
│       ├── test_mercado.py        # API, forecast and pipeline tests via fastapi.testclient
│       ├── test_registry.py       # registry integrity and legacy snapshot
│       ├── test_wfp.py            # wfp.py token and MD5 checks, offline
│       ├── test_ingest.py         # WFP mapping, token skipping, transactions, migration, inbox, offline
│       └── test_setup_script.py   # scripts/setup_live_data.sh and db_state.py checks, offline
│
├── scripts/                       # live-data setup (bash, PowerShell); see scripts/README.md
│   ├── setup_live_data.sh         # primary: install, test, start the server, load WFP, verify
│   ├── setup_live_data.ps1        # Windows PowerShell 5.1 equivalent
│   └── db_state.py                # read-only keep/reset decision for backend/data/mercado.db
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
        ├── profile.js             # profile shape, Supabase metadata mapping, localStorage copy, validators
        ├── notifications.js       # notification store (mercado.notifications), category mapping, chime
        ├── avatars.js             # avatar catalogue (avatar-1 … avatar-8) and URL helpers
        ├── util.js                # peso, pct, fmtDate, store/save, changeColor, …
        ├── index.css              # @import "tailwindcss";
        ├── styles.css             # legacy design system (tokens, layout, component classes)
        ├── pages/
        │   ├── Auth.jsx           # Supabase sign in / sign up (renders outside Layout)
        │   ├── Board.jsx          # price board: KPI cards, price tags, alerts
        │   ├── Detail.jsx         # commodity detail: forecast chart, stats, drivers, backtest
        │   ├── MapPage.jsx        # Philippines map and regional legend
        │   ├── Planner.jsx        # carinderia menu costing and shopping list (localStorage)
        │   ├── Pipeline.jsx       # dataset info, scheduler state, run-now per mode
        │   ├── Profile.jsx        # personal details, avatar picker, saves to Supabase metadata and localStorage
        │   └── Notifications.jsx  # buying alerts with new / done / deleted tabs and bulk actions
        └── components/
            ├── Layout.jsx         # app shell: header, drawer, nav, LocationPicker, language/theme toggles, logout
            ├── Common.jsx         # PageHead, HorizonToggle, Training, ErrorBox, SampleBadge
            ├── PriceTag.jsx       # PriceTag, SignalChip
            ├── Charts.jsx         # ForecastChart, SeasonBars, MultiLine, DriverBars (Chart.js); Sparkline (SVG)
            ├── PhilippinesMap.jsx # SVG dot-matrix map
            ├── Pinmarker.jsx      # map pin
            ├── LocationPicker.jsx # province / market picker
            ├── NotificationsBell.jsx # header bell with the buying-alert popup
            ├── Avatar.jsx         # avatar image or illustrated fallback
            ├── AvatarPicker.jsx   # grid of the eight avatar illustrations
            └── Icons.jsx          # inline SVG icons and Logo
```

---

## 4. Backend

### 4.1 Startup (`backend/main.py`)

`app = FastAPI(title="Mercado API", lifespan=lifespan)`. The lifespan runs, in order:

1. `seed_if_empty()`: calls `store.init_db()`. If `store.count_rows() == 0`, it inserts `sample_data.generate()` and writes a `pipeline_runs` row with `mode="seed"`.
2. If `MERCADO_WARM != "0"` and rows exist, starts a daemon thread running `forecast.warm()`.
3. If `MERCADO_SCHEDULER == "1"`, calls `scheduler.start()`. The scheduler is off by default.
4. On shutdown, calls `scheduler.stop()`.

CORS allows only `http://localhost:5173` and `http://127.0.0.1:5173`. All feature routes live on `API = APIRouter(prefix="/api/v1")`, which is included into the app. `GET /` is an unversioned welcome route.

### 4.2 Routes

| Method | Path | Handler | Returns |
|---|---|---|---|
| GET | `/api/v1/health` | `health` | `{status, rows, as_of}` |
| GET | `/api/v1/meta` | `meta` | `{provinces[], regions[], commodities[], provinces_without_data[], dishes[], horizons[], data, data_version, last_updated}`; provinces and commodities are filtered to those present in the DB. Field contract in §12 |
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
| `store.py` | SQLite at `MERCADO_DATA_DIR/mercado.db` (default `backend/data`). A module `RLock` guards writes. `init_db()` creates the tables and runs `migrate()`, which adds `prices.source` and `pipeline_runs.source_token` only when missing and relabels legacy `sample`/`wfp` sources to `synthetic`. `transaction()` is one `BEGIN IMMEDIATE` write that commits or rolls back. Other functions: `connect`, `count_rows`, `upsert_prices(df, con=None)`, `replace_series`, `insert_observations`, `delete_source`, `series_keys_with`, `synthetic_only_keys`, `max_date`, `interpolate_weekly`, `load`, `invalidate`, `last_date`, `series`, `available`. `load()` caches the full price table as a DataFrame until `invalidate()`. `series(province, commodity)` returns a weekly Monday series, interpolated, and raises `ValueError` under 110 weeks. |
| `sample_data.py` | Deterministic synthetic history. `START = 2019-01-07`, `DEFAULT_END = 2026-10-26`, which is 408 weeks. Functions: `week_dates`, `n_weeks`, `generate`, `next_week_rows`. Same seed and end date produce the same prefix. |
| `models.py` | All models work on **log** weekly prices. `MODEL_NAMES = ["naive", "holt_winters", "ridge", "gbm"]`. `gbm` is sklearn's `GradientBoostingRegressor`. Helpers include `holt_winters`, `build_matrix`, `feature_forecast`. `quick()` is the cheap fallback. `full()` runs the rolling-origin backtest and builds the **ensemble**, an inverse-squared-error weighted blend of the four models. `HORIZON = 5` weeks. |
| `forecast.py` | Result cache keyed by `(kind, mode, province, commodity)` with a version counter. `HORIZONS = (7, 14, 30)`. Public functions: `summary`, `overview`, `detail`, `seasonality`, `price_map`, `compare`, `warm`, `clear_cache`. `summary(..., allow_quick=True)` may use the quick model for series without a full ensemble yet. |
| `pipeline.py` | `MODES = ("live", "wfp", "inbox", "da", "simulate", "seed")`. `run(mode)` never raises; failures come back as `status: "error"`. A non-blocking `_run_lock` prevents concurrent runs; `/pipeline/run` returns 409 while one is in progress. The WFP path (`wfp` and `live`) calls `wfp.fetch_remote_token()`, compares the token with `source_token` of the last successful run, and skips with a `no_update` run ("Skipped, unchanged") when it matches. Otherwise it calls `wfp.download_verified()` and runs `normalize_wfp()`: retail rows only, exact WFP labels (`commodities.by_wfp_label`), provinces by `geo.by_wfp_market()` (market rule first, then admin2), unmapped and quarantined rows counted, never guessed, native units. `build_wfp_plan()` keeps observations from 2019-01-01, builds weekly series as the mean over markets, and marks as `real` only the series with at least 110 weekly points whose last observation is within 3 months of the dataset's latest observation. Observations are written for every mapped row. `run()` does all network and parsing first, then writes data and the `pipeline_runs` row in one transaction; a failure rolls back and saves no token. `simulate` appends only to series whose rows are all synthetic. `seed` deletes and regenerates only synthetic rows, skipping series that hold real or inbox data. `inbox` accepts registry ids only, stores series of at least 110 weeks as `inbox`, never overwrites `real`, and renames consumed files to `.done` after commit. `DASource`, `recent_runs`, `version_info`, `last_finished`. |
| `scheduler.py` | Daemon thread on `MERCADO_REFRESH_HOURS` (default 24), started only when `MERCADO_SCHEDULER=1`. Functions: `start(interval_hours=None)`, `stop()`, `info()`. |
| `commodities.py` | Loads `registry/commodities.json`. `COMMODITIES` (70, every WFP retail label), `SYNTHETIC` (the 10 legacy commodities with generator parameters), `BY_ID`, `BY_WFP_LABEL`, `by_wfp_label()`, `public()`, `match_commodity()` (matches `SYNTHETIC` only), `DISHES` (6) with per-serving ingredient amounts, `dishes()`. |
| `geo.py` | Loads `registry/provinces.json` and `registry/market_rules.json`. `PROVINCES` (82), `SYNTHETIC_PROVINCES` (the 25 legacy), `BY_ID`, `regions()`, `match_province()` (legacy aliases only; ingest still uses it), `by_wfp_market()` (market rules first, then the WFP admin2 lookup), `haversine_km()`. |

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
  commodity TEXT NOT NULL, price REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'synthetic',   -- real | synthetic | inbox
  PRIMARY KEY(date, province, commodity)
);

CREATE TABLE pipeline_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started TEXT, finished TEXT, mode TEXT, source TEXT,
  status TEXT, rows_added INTEGER, message TEXT,
  log TEXT,                             -- JSON array of log lines
  source_token TEXT                     -- JSON RemoteToken of the WFP file this run loaded, or NULL
);

CREATE TABLE observations(              -- raw WFP retail observations after mapping, native units
  province TEXT NOT NULL, commodity TEXT NOT NULL, market TEXT NOT NULL,
  obs_date TEXT NOT NULL, price REAL NOT NULL, unit TEXT,
  PRIMARY KEY(province, commodity, market, obs_date)
);
```

`prices.source` values: `real` (written by the WFP loader), `synthetic` (sample generator), `inbox` (CSV inbox). A database created before A2b has its existing rows relabelled `synthetic`. That label is a default; the old rows' origin was not recorded, so it is not proof that they were synthetic. A series written as `real` or `inbox` replaces the whole existing series for its province and commodity, synthetic rows included.

Seeded dataset: 25 provinces × 10 commodities × 408 weeks = 102,000 rows, `as_of` 2026-10-26. The database is generated at runtime and gitignored. Delete `backend/data/mercado.db` to force a full reset. `seed` alone rebuilds only the synthetic rows and keeps real and inbox data.

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

Routes, handled in `App.jsx`: `#/board`, `#/commodity/<id>`, `#/map`, `#/planner`, `#/pipeline`, `#/profile`, `#/notifications`, `#/auth`. `nav(page, arg)` sets the hash and scrolls to the top.

Context fields: `route`, `nav`, `meta`, `metaError`, `loadMeta`, `province`, `prov`, `setProvince`, `horizon`, `horizonPref`, `setHorizon`, `horizonChoices`, `lang`, `setLang`, `theme`, `setTheme`, `t`, `commodityBy`, `dataVersion`, `bumpData`, `profile`, `updateProfile`.

`localStorage` keys: `mercado.province` (default `ncr`), `mercado.horizon` (default 14), `mercado.lang`, `mercado.theme`. The Planner also stores `mercado.sell`, `mercado.qty`, `mercado.target`, and `mercado.servings`. The profile is stored as `mercado.profile.<userId>` (or `mercado.profile` before a user is known), and notification read state is stored as `mercado.notifications`.

`/meta` is polled every 60 seconds while the tab is visible. When its `data_version` changes (a scheduler run, or a pipeline run from another client), `bumpData()` clears the API cache and increments `dataVersion`, which re-fetches every view that lists it in its `useApi` deps. `loadMeta` itself runs on mount and on error retry.

### 6.3 Authentication and shell

`App.jsx` renders in this order:

1. While checking the Supabase session, render `<Training />`.
2. With no session, or on route `auth`, render `<Auth />`. This happens outside `Layout`.
3. Otherwise render `<Layout>` around the selected page.

`VITE_DEV_BYPASS_AUTH=1` skips the gate for UI work without credentials. `supabaseClient.js` logs a warning and exports `supabase = null` when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing. It does not throw.

`Layout.jsx` is the **only** app shell. It provides the header, the side drawer, navigation links, the `LocationPicker`, the language toggle, the theme toggle, and logout (`supabase.auth.signOut()`, then `nav('auth')`). Pages render content only and must not add their own header, drawer, or full-page background.

**Profile.** With a Supabase session, `state.jsx` reads `user_metadata` through `profileFromUser()`, merges it with the device copy via `mergeProfile()` (metadata wins, local fills blanks), and stores the result as `mercado.profile.<userId>`. `updateProfile()` updates that local copy. The Profile page then writes the full shape back with `supabase.auth.updateUser({ data: profileMetadata(next) })`, so the next sign-in on another device restores it. The drawer's profile card shows the saved name and avatar, and falls back to the user's metadata when no saved name exists.

**Notifications.** `Layout.jsx` builds buying alerts from `/api/v1/overview` with `buildAlerts()` and passes them to `NotificationsBell`, which also backs the `#/notifications` page. `useNotificationList()` syncs alerts into `mercado.notifications`, one record per `commodity:signal`. Each record has a status of `new`, `done`, or `deleted`. Only the Deleted tab removes a record for good. Notification state stays on the device and is not synced to Supabase.

**Google sign-in.** `Auth.jsx` calls `supabase.auth.signInWithOAuth({ provider: 'google' })` with `redirectTo: window.location.origin`. The Supabase project must have the Google provider enabled and the app origin in its redirect URLs.

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
| `#/commodity/<id>` | `Detail.jsx` | Forecast chart, stats, drivers, seasonality, inline model-accuracy panel (the `model_lab` payload), nearby cheaper markets |
| `#/map` | `MapPage.jsx` | Map colored by expected change at the selected horizon; click a province to select it |
| `#/planner` | `Planner.jsx` | Menu costing, margin at risk, shopping list |
| `#/pipeline` | `Pipeline.jsx` | Dataset and scheduler state, run-now per mode, run history |
| `#/profile` | `Profile.jsx` | Personal details with validation, avatar picker; saved to Supabase metadata and localStorage |
| `#/notifications` | `Notifications.jsx` | Buying alerts with new / done / deleted tabs, search, and bulk actions |
| `#/auth` | `Auth.jsx` | Supabase sign in and sign up, including Google OAuth |

---

## 7. Commands

```bash
# Backend (from backend/)
uv sync
uv run uvicorn main:app --reload        # :8000, docs at /docs
uv run pytest -q                        # 130 tests, about 1-4 minutes depending on the machine (about 1 minute on a fast dev machine), offline (no network needed)

# Live data (from the repo root; see scripts/README.md)
bash scripts/setup_live_data.sh         # PowerShell: scripts\setup_live_data.ps1. Keeps an existing DB only if it has a recorded source_token (scripts/db_state.py); otherwise backs it up to ~/mercado_backup and resets it.

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
| `MERCADO_SCHEDULER` | `0` | Set `1` to run the recurring pipeline refresh in the background |
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
2. **Client cache can lag a pipeline run for up to 60 seconds.** `api.js` keeps promises for the lifetime of the page. The Pipeline page calls `clearCache()` and `bumpData()` after its own runs. Runs from the scheduler or another tab are picked up by the `/meta` `data_version` poll (every 60 seconds while the tab is visible), which then bumps `dataVersion` and refreshes the views. A tab in the background catches up when it becomes visible again.
3. **Frontend tests are partial.** `pnpm test` (Vitest, `node` environment, no jsdom) covers `alerts`, `api`, `state`, `profile`, `notifications`, and the Board, Detail, MapPage, Planner, and Common render paths. The Auth, Profile, Notifications, Layout, and Pipeline pages have no tests.
4. **Pytest emits a Starlette deprecation warning** about `httpx` inside `TestClient`. It is not a failure.
5. **`pnpm build` warns about a chunk over 500 kB.** It is not a failure.
6. **Board's scoped styles use hardcoded light-on-dark colors.** This is a follow-up, not a bug.
7. **Sample badge and sample note read the old label.** `SampleBadge` (`components/Common.jsx`) and the Pipeline page's sample note check `meta.data.sources.sample`. After A2b, synthetic rows are labelled `synthetic`, so both are hidden even while the data is synthetic. Switch the frontend to `sources.synthetic`.

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
9. **Seeding replaces only synthetic data.** `POST /api/v1/pipeline/run {"mode": "seed"}` deletes and regenerates `source='synthetic'` rows. Series that hold `real` or `inbox` data and all `observations` are kept. Deleting `backend/data/mercado.db` remains the only full reset.
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

---

## 12. API contract v2

This contract covers `GET /api/v1/meta`. Changes from v1 are additive: existing field names, types and error shapes stay the same. Defaults apply when a registry entry has no value, so clients can rely on them.

**Filtering.** `commodities[]` and `provinces[]` list only what has rows in the store. The registry is larger than the store (70 commodities and 82 provinces in the registry, 10 and 25 seeded).

### 12.1 `meta.commodities[]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | string | none | Slug. Legacy ids are `rice`, `pork`, `chicken`, `eggs`, `bangus`, `tomato`, `onion`, `calamansi`, `cabbage`, `eggplant`. Other ids are slugs of the WFP label, and the WFP label `Chicken` is `chicken-generic`. |
| `name` | string | none | Display name. For new entries this is the WFP label. |
| `short` | string | none | Short display name. |
| `fil` | string or null | `null` | Filipino name. Null for new entries. |
| `group` | string | none | One of: `Grains`, `Meat & Poultry`, `Fish`, `Vegetables & Fruit`, `Roots & Tubers`, `Seafood`, `Pulses & Nuts`, `Oils & Fats`, `Sugar & Sweeteners`. |
| `unit` | string | none | `kg`, `piece` (`eggs`, `Eggs (duck)`), or `750 ml` (`Oil (cooking)`). |
| `icon` | string or null | `null` | Emoji. |
| `typhoon` | number | `0` | Typhoon sensitivity. `0` means no effect. The What-If page that used it has been removed. |
| `fuel` | number | `0` | Fuel sensitivity. `0` means no effect. The What-If page that used it has been removed. |
| `shelf` | number | `0` | Shelf life used for stockability. `0` means unknown. |
| `basket` | number | `0` | Weight in the palengke basket. `0` excludes the commodity from the basket. |
| `category` | string | none | WFP category, verbatim (for example `vegetables and fruits`). |
| `label_wfp` | string | none | Exact WFP retail label. Unique across commodities. |
| `unit_label` | string | none | Display unit: `kg`, `piece`, or `750 ml`. |
| `scenario` | boolean | `false` | `true` only where explicit sensitivities exist (the legacy 10). |

### 12.2 `meta.provinces[]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | string | none | Legacy ids are kept (25). Other ids are slugs of the official name (for example `davao-de-oro`). |
| `name` | string | none | Official name. Legacy names are unchanged. |
| `region_code` | string | none | Roman numeral (`I`..`XIII`), `NCR`, `CAR`, `BARMM`, or the legacy `MIMAROPA`. |
| `region` | string | none | Legacy region names are unchanged. New entries use the WFP admin1 name with casing normalized, so `Region IV-B` is not rewritten. |
| `market` | string or null | none | Representative market. Null for `batanes`. |
| `lat`, `lon` | number | none | Coordinates. |
| `confidence` | `high` or `UNCERTAIN` | `high` | `UNCERTAIN` marks a region-label or coordinate doubt. See the registry `_meta`. |

### 12.3 Other `meta` fields

- `provinces_without_data[]`: `{id, name, region}` for each registry province with no rows. Clients can use it to show coverage gaps.
- `regions[]`: groups over the stored provinces only (unchanged).
- `commodities` is ordered as the registry is (legacy first).
- `data_version` and `last_updated`: unchanged, from `pipeline.version_info()`.
- `dishes`, `horizons`, `data`: unchanged.

### 12.4 Series tiers, engines and horizons (implemented)

Each (province, commodity) series is tiered from the data (`mercado/tiers.py`), never stored in the registry:

| Field | Values | Notes |
|---|---|---|
| `source` | `real`, `synthetic`, `inbox`, `mixed` | From `prices.source`; NULL reads as `synthetic`. `mixed` when a series holds more than one source. |
| `tier` | `forecast`, `history`, `hidden` | `forecast`: >= 36 distinct observation months and fresh. `history`: fresh and 12–35 months. `hidden`: stale (last observation older than 3 months from the dataset's latest real observation, not today) or < 12 months. Synthetic series are always `forecast`. |
| `engine` | `full`, `quick`, `none` | `full` for the forecast tier with >= 145 weekly price points; `quick` otherwise (forecast tier below 145, or history tier with >= 110); `none` for observations-only or hidden series. |
| `native_step` | `week`, `month` | `week` for synthetic series, `month` for real ones (monthly data interpolated to a weekly grid). |
| `horizons` | `[7,14,30]` or `[30]` | Synthetic series keep all three; real series expose 30 days only. History-only series have none. |

Series fields served per row by `/forecast`, `/overview` and `/map`: `source`, `tier`, `engine`, `native_step`, `unit` (from the registry), `confidence` (`normal`, or `low` for the history tier and quick-engine series), `baseline` (the last observed price, i.e. the naive forecast), and `horizons_available`. `/forecast` additionally returns `no_gain_vs_last_price` (`true`/`false`/`null`): computed from the engine's own 10-origin backtest as ensemble MAE >= naive MAE, gated by `NO_GAIN_FLAG_ENABLED` in `mercado/forecast.py`. The A2c agreement check against the A3' accuracy audit failed (the engine's own backtest is in-sample and disagrees with A3'), so the flag ships disabled and the field is always `null`.

**Interval fields.** `/forecast` also returns `interval_label` and `backtest_basis` (additive; `/overview` and `/map` get no new fields):

- `interval_label`: `"80%"` or `null`. Real full-engine series: `"80%"`, measured (below). Synthetic full-engine series: `"80%"`, nominal only (the z-value of an 80% normal band, not measured). Real quick-engine series, inbox series and history-only series: `null`.
- `backtest_basis`: the data the band's error model was fitted on: `"interpolated_weekly"` (real, full engine), `"synthetic"` (synthetic, full engine), `"weekly"` (inbox, full engine). `null` where there is no backtest (quick engine, history-only).

Real full-engine bands are scaled: `lo`/`hi` = `exp(point ∓ 1.2816 · k · σ)` with `k = INTERVAL_SCALE_REAL = 1.60` (`mercado/forecast.py`). The point forecast, signals, `prob_up` and σ itself are unchanged. Synthetic, inbox and quick bands are not scaled.

*Why.* The engine's 10-origin backtest steps weekly over a monthly series linearly interpolated between real observations. At 80% of origins the last known week is interpolated, so it already slopes toward the next real observation. The backtest errors, and the σ built from them, are too small. *Measured* (`docs/audit/REPORT_A4.md`, 2026-11-18, on a scratch database rebuilt from the cached WFP CSV, MD5 `2440ab74363fb321d317430b09b72453`): with each origin refit on data truncated at that origin (12 origins per series, 200 legacy series split by series into halves A and B), the unscaled 80% band covers 66.0% of held-out origins. The smallest k on a 0.05 grid that reaches 80% on half A is 1.60; on held-out half B it covers **80.4%** overall, with a minimum commodity of 72.5%. The quick engine failed the same rule (rice 60.8% held-out) and stays unscaled. The figures describe the scratch database; the live database is not re-measured.

**Horizon rule.** Requesting a horizon a series does not offer returns **422** with `available_horizons`; nothing is substituted silently.

**History-only series** (engine `none`, known only from observations): `/forecast` returns 200 with the observed history, `forecast: []`, `horizons: {}` and `horizons_available: []`.

**Bulk endpoints never train the full ensemble on demand.** `/overview`, `/map` and `/compare` use a cached full result when one exists, otherwise the quick engine (quick results are not cached). `warm()` pre-computes the full engine for every stored non-hidden full-tier series — the legacy 10 commodities first, then the rest — in a background thread pool (1 worker; the engine is GIL-bound), keeping `MERCADO_WARM=0` as the off switch. The full-result cache is capped at `CACHE_MAX_ENTRIES` (3000) with oldest-entry eviction.

**`GET /api/v1/coverage`** returns the compact series index as arrays: `{"fields": [...], "rows": [[province, commodity, source, tier, engine, n_months, last_obs], ...], "count": n}`. Hidden-tier series are excluded unless `?include_hidden=1`. `/meta` commodities appear only when they have at least one non-hidden series, and carry additive `source_mix`, `tiers`, `horizons` and `native_step`; `/meta` provinces carry additive `tiers`.

**Eggs unit.** `eggs` is priced per **piece** (WFP "Eggs" is per unit). The registry `unit`/`unit_label` are `piece`; dish quantities are pieces; the synthetic generator's eggs are generated per piece, so a series never changes scale when real data replaces it.

### 12.5 Errors

Unchanged. Domain failures return `{error}`, and `HTTPException` returns `{detail}`. Requests for a commodity that is in the registry but has no rows return 404 on `/forecast`, `/map` and `/compare`, as unknown ids do.

### 12.6 Note on `docs/audit/`

Paths in `docs/audit/*.md` (for example `~/mercado_audit/...`) refer to the auditor's scratch folder. They are not needed to run the project, and the scripts those reports describe are not part of the repository.
