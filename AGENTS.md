# Mercado

Location-aware Philippine agri-market price forecasting. Two independent apps
with no root workspace: `backend/` (FastAPI + uv) and `frontend/` (React + Vite).
Run commands from the relevant app directory, not the repo root.

## Commands

Backend (from `backend/`):
- `uv sync` — install deps into `backend/.venv`
- `uv run uvicorn main:app --reload` — dev server on http://127.0.0.1:8000 (docs at `/docs`)
- `uv run pytest -q` — 130 tests in `tests/` (`test_mercado`, `test_registry`, `test_wfp`, `test_ingest`, `test_tiers`, `test_perf`, `test_api_fields`, `test_intervals`, `test_setup_script`), about 1-4 minutes depending on the machine (about 1 minute on a fast dev machine), offline
- Always go through `uv run`; do not rely on a globally installed Python env.

Live data (run from the repo root, not `backend/`): `bash scripts/setup_live_data.sh` (PowerShell: `powershell -ExecutionPolicy Bypass -File scripts\setup_live_data.ps1`) installs, tests, starts the server and loads real WFP data. An existing DB is kept only if it has a recorded `source_token` (`scripts/db_state.py`); otherwise it is copied to `~/mercado_backup` and reset first. See `scripts/README.md`.

Frontend (from `frontend/`):
- `pnpm install`
- `pnpm dev` — http://localhost:5173
- `pnpm lint` — ESLint over the whole frontend
- `pnpm test` — Vitest unit tests (`node` environment; no jsdom, so keep tests free of DOM APIs)
- `pnpm build`

There is no backend linter/formatter config and no TypeScript (frontend is JS/JSX).

## Layout and gotchas

- The FastAPI app is `backend/main.py` (`app` object). The backend is an application,
  not a package: there is no `src/` tree, no console script, and no build backend, so
  `uv sync` installs dependencies only.
- Backend requires Python **3.14+** (`pyproject.toml`, `backend/.python-version`).
- `backend/mercado/` is the live forecast engine: `store.py` (SQLite),
  `models.py`/`forecast.py` (Holt-Winters + Ridge + gradient-boosted trees),
  `tiers.py` (data-driven series tiers: forecast/history/hidden, engine full/quick/none),
  `pipeline.py` (live/wfp/inbox/da/simulate/seed), `scheduler.py`, and static
  reference data (`geo.py`, `commodities.py`, `sample_data.py`). The `simulate` mode
  appends one week via `sample_data.next_week_rows()`; there is no separate simulator module.
- WFP ingest goes through `wfp.py` (token check, MD5-verified download) and the registry
  (`geo.by_wfp_market`, `commodities.by_wfp_label`). Each run writes its data and its
  `pipeline_runs` row in one transaction. Raw observations live in `observations`.
- `prices.source` is `real` (WFP), `synthetic` (sample generator) or `inbox`. Simulate and
  seed touch only synthetic series, and real or inbox series are never overwritten by synthetic
  loads. Legacy `sample` and `wfp` labels were relabelled `synthetic` by the migration.
- The background scheduler is opt-in: set `MERCADO_SCHEDULER=1` to enable it.
- Series tiers are computed from the data (`tiers.py`), never stored: `forecast`
  (>= 36 fresh observation months), `history` (12-35 months, fresh), `hidden`
  (stale, older than 3 months from the dataset's latest real observation, or
  < 12 months). Real series expose only the 30-day horizon; synthetic keep 7/14/30;
  requesting an unavailable horizon is a 422 with `available_horizons`. History-only
  series (engine `none`) serve observed history with an empty forecast on `/forecast`.
- `/overview`, `/map` and `/compare` never train the full ensemble on demand: cached
  full result if present, else the quick engine (quick results are not cached).
  `forecast.warm()` pre-computes full results in a background thread, legacy 10
  commodities first, then the rest; 1 worker (the engine is GIL-bound, so more
  threads only add contention). The full-result cache is capped at
  `CACHE_MAX_ENTRIES` (3000) with oldest-entry eviction, and drops automatically
  when `store.generation()` moves (any transaction or `store.invalidate()`).
- `GET /api/v1/coverage` returns the compact series index (arrays, hidden excluded
  unless `?include_hidden=1`); `/meta` commodities carry additive `source_mix`,
  `tiers`, `horizons`, `native_step` and appear only with at least one non-hidden series.
- SQLAlchemy, XGBoost, and joblib are declared in `pyproject.toml` but not imported
  anywhere. The store is still stdlib `sqlite3`, and the `gbm` model is scikit-learn's
  `GradientBoostingRegressor`.
- `backend/data/mercado.db` is generated at runtime and gitignored. Delete it to
  force a re-seed from `sample_data.generate()`.
- Tailwind is v4 through `@tailwindcss/vite`. `src/index.css` holds
  `@import "tailwindcss";`; `src/styles.css` is the legacy Mercado design system
  and is imported **after** it so legacy rules win. There is no `tailwind.config.js`.
- Charts: `ForecastChart`, `SeasonBars`, `MultiLine`, and `DriverBars` use
  Chart.js via `react-chartjs-2`. `Sparkline` and `PhilippinesMap` remain
  hand-rolled SVG.
- Auth uses Supabase. `src/supabaseClient.js` reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`; copy `frontend/.env.example` to `frontend/.env`. Without
  those values it logs a warning and exports `supabase = null` (it does not throw).
  For UI work without credentials, set `VITE_DEV_BYPASS_AUTH=1`.
- Google sign-in calls `supabase.auth.signInWithOAuth({ provider: 'google' })` from `pages/Auth.jsx`.
  The Supabase project needs the Google provider enabled and the app origin in its redirect URLs.
- Profile: `src/profile.js` owns the profile shape, validators, and Supabase metadata mapping.
  With a session, `state.jsx` hydrates it from `user_metadata` (`profileFromUser`, merged with
  `mergeProfile`) and keeps a copy in `localStorage` under `mercado.profile.<userId>`. The Profile
  page saves through `updateProfile()` and then `supabase.auth.updateUser({ data: profileMetadata(next) })`.
- Notifications: `src/notifications.js` keeps read state (`new`, `done`, `archived`) in `localStorage`
  under `mercado.notifications`, one record per `commodity:signal`. Legacy `deleted` records are
  migrated to `archived` on read. Alerts come from `buildAlerts()`
  on the overview, and `NotificationsBell` and `pages/Notifications.jsx` share the same store.
- Predict Prices (Board header): a client-side disaster scenario (`storm`, `drought`) that multiplies
  the forecast from the `/overview` data the board already loaded. The math lives in
  `frontend/src/predictMath.js`. There is no backend or API involvement. The impact table is
  hard-coded per food group and is not calibrated against historical typhoons or droughts.
- `model_lab` is still returned by `/api/v1/forecast`, and `Detail.jsx` renders it as an inline panel.
  There is no standalone Model Lab page and no What-If page; the Pipeline page is at `#/pipeline`.
- `components/Layout.jsx` is the only app shell (header, drawer, nav, language and
  theme toggles, logout). The drawer holds the profile card (opens `#/profile`), the nav
  links, and `NotificationsBell`. Pages render content only; do not add a header, drawer, or
  full-page background inside a page.
- Routing is a hand-rolled hash router in `src/state.jsx` (`#/board`,
  `#/commodity/<id>`, `#/map`, `#/planner`, `#/pipeline`, `#/profile`, `#/notifications`,
  `#/auth`). `App.jsx` adds a Supabase session guard.

## Integration

- All API routes are mounted under `/api/v1` in `backend/main.py`.
- In dev, `vite.config.js` proxies `/api` to `http://127.0.0.1:8000`, so
  `VITE_API_BASE` should stay empty. For a deployed frontend, set it to the
  backend origin.
- Backend CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`.
  If the Vite port changes, update both sides.
- `frontend/src/api.js` is an axios wrapper that surfaces backend `{error}` bodies
  (and FastAPI `{detail}`) as `Error.message`. It caches GET promises per path for the
  page session. Runs from the scheduler or another client are picked up by the `/meta`
  `data_version` poll (every 60 s while the tab is visible), which calls `bumpData()`. Code that needs
  an immediate refresh should still call `clearCache()` or fetch with `{fresh: true}`.

## Environment

- `uv` is in `~/.local/bin`. Use whatever `node` and `pnpm` are on PATH; this checkout
  was last verified on Node 26 and pnpm 12. Vite requires Node `^20.19 || >=22.12`.
- The checkout lives on the Windows drive (`/mnt/c/...`), so `uv` warns about
  hardlinks across filesystems. It is harmless; set `UV_LINK_MODE=copy` to
  silence it.
