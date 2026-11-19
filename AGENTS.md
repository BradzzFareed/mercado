# Mercado

Location-aware Philippine agri-market price forecasting. Two independent apps
with no root workspace: `backend/` (FastAPI + uv) and `frontend/` (React + Vite).
Run commands from the relevant app directory, not the repo root.

## Commands

Backend (from `backend/`):
- `uv sync` — install deps into `backend/.venv`
- `uv run uvicorn main:app --reload` — dev server on http://127.0.0.1:8000 (docs at `/docs`)
- `uv run pytest -q` — 4 tests in `tests/test_mercado.py`, about 30–60 s (forecast warm-up dominates)
- Always go through `uv run`; do not rely on a globally installed Python env.

Frontend (from `frontend/`):
- `pnpm install`
- `pnpm dev` — http://localhost:5173
- `pnpm lint` — ESLint over the whole frontend
- `pnpm build`

There is no backend linter/formatter config and no TypeScript (frontend is JS/JSX).

## Layout and gotchas

- The FastAPI app is `backend/main.py` (`app` object). The backend is an application,
  not a package: there is no `src/` tree, no console script, and no build backend, so
  `uv sync` installs dependencies only.
- Backend requires Python **3.14+** (`pyproject.toml`, `backend/.python-version`).
- `backend/mercado/` is the live forecast engine: `store.py` (SQLite),
  `models.py`/`forecast.py` (Holt-Winters + Ridge + gradient-boosted trees), and
  static reference data (`geo.py`, `commodities.py`, `sample_data.py`). Prices are
  seeded once at startup from `sample_data.generate()`; there is no background
  refresh job.
- SQLAlchemy, XGBoost, and joblib are declared in `pyproject.toml` but not imported
  anywhere. The store is still stdlib `sqlite3`, and the `gbm` model is scikit-learn's
  `GradientBoostingRegressor`.
- `backend/data/mercado.db` is generated at runtime and gitignored. Delete it to
  force a re-seed from `sample_data.generate()`.
- Tailwind is v4 through `@tailwindcss/vite`. `src/index.css` holds
  `@import "tailwindcss";`; `src/styles.css` is the legacy Mercado design system
  and is imported **after** it so legacy rules win. There is no `tailwind.config.js`.
- Charts: `ForecastChart`, `SeasonBars`, and `DriverBars` use
  Chart.js via `react-chartjs-2`. `Sparkline` and `PhilippinesMap` remain
  hand-rolled SVG.
- Auth uses Supabase. `src/supabaseClient.js` reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`; copy `frontend/.env.example` to `frontend/.env`. Without
  those values it logs a warning and exports `supabase = null` (it does not throw).
  For UI work without credentials, set `VITE_DEV_BYPASS_AUTH=1`.
- `components/Layout.jsx` is the only app shell (header, drawer, nav, language and
  theme toggles, logout). Pages render content only; do not add a header, drawer, or
  full-page background inside a page.
- Routing is a hand-rolled hash router in `src/state.jsx` (`#/board`,
  `#/commodity/<id>`, `#/map`, `#/profile`, ...). `App.jsx` adds a Supabase session
  guard. The profile page (`pages/Profile.jsx`) edits a local draft stored by
  `src/profile.js` (localStorage key `mercado.profile`); `updateProfile` commits it
  and the drawer card in `Layout.jsx` reads the same saved values.

## Integration

- All API routes are mounted under `/api/v1` in `backend/main.py`.
- In dev, `vite.config.js` proxies `/api` to `http://127.0.0.1:8000`, so
  `VITE_API_BASE` should stay empty. For a deployed frontend, set it to the
  backend origin.
- Backend CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`.
  If the Vite port changes, update both sides.
- `frontend/src/api.js` is an axios wrapper that surfaces backend `{error}` bodies
  (and FastAPI `{detail}`) as `Error.message`. It caches GET promises per path for the
  page session; pass `{fresh: true}` to bypass that cache.

## Environment

- `uv` is in `~/.local/bin`. Use whatever `node` and `pnpm` are on PATH; this checkout
  was last verified on Node 26 and pnpm 12. Vite requires Node `^20.19 || >=22.12`.
- The checkout lives on the Windows drive (`/mnt/c/...`), so `uv` warns about
  hardlinks across filesystems. It is harmless; set `UV_LINK_MODE=copy` to
  silence it.
