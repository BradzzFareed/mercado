# Mercado

Location-aware Philippine agri-market price forecasting. Two independent apps
with no root workspace: `backend/` (FastAPI + uv) and `frontend/` (React + Vite).
Run commands from the relevant app directory, not the repo root.

## Commands

Backend (from `backend/`):
- `uv sync` — install deps into `backend/.venv`
- `uv run uvicorn main:app --reload` — dev server on http://127.0.0.1:8000 (docs at `/docs`)
- Always go through `uv run`; do not rely on a globally installed Python env.

Frontend (from `frontend/`):
- `pnpm install`
- `pnpm dev` — http://localhost:5173
- `pnpm lint` — ESLint over the whole frontend
- `pnpm build`

There are no test suites or test commands on either side. There is also no
backend linter/formatter config and no TypeScript (frontend is JS/JSX).

## Layout and gotchas

- The FastAPI app is `backend/main.py` (`app` object), not `backend/src/backend/`.
  That package is an unused `uv_build` stub; its `backend` console script only
  prints "Hello from backend!" and does not start the API.
- Backend requires Python **3.14+** (`pyproject.toml`, `backend/.python-version`).
  The root README's "Python 3.10+" is stale.
- `backend/mercado/` contains only untracked `.pyc` leftovers; there are no source
  modules there. Don't import `mercado.*`.
- Tailwind is v4 through `@tailwindcss/vite`; `src/index.css` is the only global
  stylesheet (`@import "tailwindcss";`). There is no `tailwind.config.js`.
- `src/App.css` is unused Vite-template CSS; `main.jsx` imports only `index.css`.
- No `.env` files or config loading. CORS origins and the frontend API base URL
  are hardcoded.

## Integration

- `frontend/src/App.jsx` calls `http://127.0.0.1:8000/api/v1/health`.
- Backend CORS allows only `http://localhost:5173` and `http://127.0.0.1:5173`.
  If the Vite port changes, update both sides.
- Only `GET /` and `GET /api/v1/health` are implemented. Treat the README's
  predictions, database, and ML-model sections as roadmap, not current behavior.

## Environment

- Dev tools are native Linux installs: `uv` in `~/.local/bin`, and
  `node`/`npm`/`pnpm` in `/usr/bin` (Node 24, pnpm 10).
- The checkout lives on the Windows drive (`/mnt/c/...`), so `uv` warns about
  hardlinks across filesystems. It is harmless; set `UV_LINK_MODE=copy` to
  silence it.
