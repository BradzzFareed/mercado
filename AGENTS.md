# Mercado

Location-aware Philippine agri-market price forecasting. Two independent apps
with no root workspace: `backend/` (FastAPI + uv) and `frontend/` (React + Vite).
Run commands from the relevant app directory, not the repo root.

## Commands

Backend (from `backend/`):
- `uv sync` — install deps into `backend/.venv`
- `uv run uvicorn main:app --reload` — dev server on http://127.0.0.1:8000 (docs at `/docs`)
- `uv run pytest -q` — test suite (`tests/test_mercado.py`)
- Always go through `uv run`; do not rely on a globally installed Python env.

Frontend (from `frontend/`):
- `pnpm install`
- `pnpm dev` — http://localhost:5173
- `pnpm lint` — ESLint over the whole frontend
- `pnpm build`

There is no backend linter/formatter config and no TypeScript (frontend is JS/JSX).

## Layout and gotchas

- The FastAPI app is `backend/main.py` (`app` object), not `backend/src/backend/`.
  That package is an unused `uv_build` stub; its `backend` console script only
  prints "Hello from backend!" and does not start the API.
- Backend requires Python **3.14+** (`pyproject.toml`, `backend/.python-version`).
- `backend/mercado/` is the live forecast engine: `store.py` (SQLite),
  `models.py`/`forecast.py` (Holt-Winters + Ridge + gradient-boosted trees),
  `pipeline.py` (live/wfp/inbox/da/simulate/seed), `scheduler.py`, and static
  reference data (`geo.py`, `commodities.py`, `catalog.py`, `sample_data.py`).
- `backend/mercado/engine.py` and `insights.py` were intentionally **not**
  migrated: they are an incomplete rewrite (missing `store.Dataset`/`Panel`)
  and nothing imports them.
- SQLAlchemy and XGBoost are declared dependencies but not yet used; the store
  is still stdlib `sqlite3` and the models are still scikit-learn.
- `backend/data/mercado.db` is generated at runtime and gitignored. Delete it to
  force a re-seed from `sample_data.generate()`.
- Tailwind is v4 through `@tailwindcss/vite`. `src/index.css` holds
  `@import "tailwindcss";`; `src/styles.css` is the legacy Mercado design system
  and is imported **after** it so legacy rules win. There is no `tailwind.config.js`.
- Charts: `ForecastChart`, `SeasonBars`, `MultiLine`, and `DriverBars` use
  Chart.js via `react-chartjs-2`. `Sparkline` and `PhilippinesMap` remain
  hand-rolled SVG.
- Auth uses Supabase. `src/supabaseClient.js` reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`; copy `frontend/.env.example` to `frontend/.env`.
- Routing is a hand-rolled hash router in `src/state.jsx` (`#/board`,
  `#/commodity/<id>`, `#/map`, ...). `App.jsx` adds a Supabase session guard.

## Integration

- All API routes are mounted under `/api/v1` in `backend/main.py`.
- In dev, `vite.config.js` proxies `/api` to `http://127.0.0.1:8000`, so
  `VITE_API_BASE` should stay empty. For a deployed frontend, set it to the
  backend origin.
- Backend CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`.
  If the Vite port changes, update both sides.
- `frontend/src/api.js` is an axios wrapper with an in-memory cache; it surfaces
  backend `{error}` bodies (and FastAPI `{detail}`) as `Error.message`.

## Environment

- Dev tools are native Linux installs: `uv` in `~/.local/bin`, and
  `node`/`npm`/`pnpm` in `/usr/bin` (Node 24, pnpm 10).
- The checkout lives on the Windows drive (`/mnt/c/...`), so `uv` warns about
  hardlinks across filesystems. It is harmless; set `UV_LINK_MODE=copy` to
  silence it.
