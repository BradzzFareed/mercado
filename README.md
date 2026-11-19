# Mercado

> **Location-Aware Agri-Market Retail Price Forecasting Platform**

Mercado is a web-based machine learning application designed to help everyday Filipino consumers, household planners, and small food enterprise owners (such as local *carinderias*) anticipate retail food price changes in their specific region or province. By leveraging time-series regression models trained on historical Philippine agricultural market data, Mercado provides 7- to 30-day commodity price forecasts and automated price surge/dip alerts.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [System Architecture & Data Flow](#system-architecture--data-flow)
- [Repository Structure](#repository-structure)
- [Development Requirements](#development-requirements)
- [Setup & Installation Guide](#setup--installation-guide)
  - [1. Cloning the Repository](#1-cloning-the-repository)
  - [2. Backend Setup (FastAPI + uv)](#2-backend-setup-fastapi--uv)
  - [3. Frontend Setup (React + Vite)](#3-frontend-setup-react--vite)
- [Running the Project Locally](#running-the-project-locally)
- [Tests](#tests)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Project Overview

Food price instability caused by seasonal weather patterns, transportation costs, and market disruptions creates financial uncertainty for Filipino households operating on tight budgets. Official price reports are often presented as national averages or static tables, making them difficult for local consumers to apply to their immediate wet markets (*palengkes*).

**Mercado** addresses this information gap by providing:

1. **Localized Predictions:** Allows users to filter forecasts down to their specific Region or Province rather than relying on national averages.
2. **Interactive Visualizations:** Renders historical price trajectories alongside projected future price corridors.
3. **Actionable Price Signals:** Displays smart indicators when basic commodities (such as rice, pork belly, chicken, calamansi, and tomatoes) are expected to experience price dips or surges.

---

## Key Features

- **Supabase Authentication:** Email/password sign-up and sign-in, with username lookup.
- **Price Board:** One price tag per commodity with today's price, a sparkline, the forecast, and a Surge / Dip / Steady flag.
- **Commodity Detail:** Interactive Chart.js forecast with an 80% range, best day to buy, drivers, and seasonality.
- **Price Map:** A dot-matrix map of the Philippines colored by expected price change.
- **Carinderia Planner:** Menu costing, margin at risk, and a weekly shopping list.
- **English / Filipino toggle, dark mode, and mobile layout.**

---

## Tech Stack

### Backend (API & ML Engine)

- **Language:** Python 3.14+
- **Package & Environment Manager:** [`uv`](https://astral.sh/uv)
- **Web Framework:** [FastAPI](https://fastapi.tiangolo.com/)
- **ASGI Server:** Uvicorn
- **Data Processing & ML:** Pandas, NumPy, Scikit-Learn
- **Database:** SQLite through the standard-library `sqlite3` module
- **Testing:** pytest with `fastapi.testclient`

> SQLAlchemy, XGBoost, and joblib are declared dependencies but are not imported yet. SQLAlchemy and XGBoost are planned for the data-layer and model work; the live forecast engine still uses `sqlite3` and scikit-learn.

### Frontend (User Interface)

- **Framework:** React 19 via [Vite](https://vitejs.dev/)
- **Package Manager:** [`pnpm`](https://pnpm.io/)
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`) coexisting with the legacy `styles.css` design system
- **Icons:** [Lucide React](https://lucide.dev/) plus a small custom SVG icon set
- **HTTP Client:** Axios
- **Data Visualization:** Chart.js with `react-chartjs-2`
- **Auth:** `@supabase/supabase-js`
- **Linting:** ESLint 10 with React Hooks and React Refresh plugins

---

## System Architecture & Data Flow

1. **User Request:** The user picks a province/market and commodity in the React UI.
2. **API Call:** Axios calls FastAPI through the Vite dev proxy, e.g. `GET /api/v1/forecast?province=ncr&commodity=rice`.
3. **Inference & DB Retrieval:** FastAPI reads weekly price history from SQLite, trains/blends the forecast models, and returns prices, uncertainty bands, and signals.
4. **JSON Response:** The frontend receives formatted prediction arrays and status indicators.
5. **Rendering:** React updates Chart.js graphs, the price board, and the map.

### API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Row count and latest data date |
| GET | `/api/v1/meta` | Provinces, regions, commodities, dishes, horizons, dataset info |
| GET | `/api/v1/overview?province=` | Price board: per-commodity summaries and basket |
| GET | `/api/v1/forecast?province=&commodity=` | Full detail: history, forecast, drivers, seasonality |
| GET | `/api/v1/map?commodity=` | All provinces for one commodity |
| GET | `/api/v1/compare?province=&commodity=` | Nearby cheaper markets |

---

## Repository Structure

```text
mercado/
├── .gitignore
├── AGENTS.md                  <-- Notes for AI coding agents
├── README.md
│
├── backend/                   <-- FastAPI backend
│   ├── main.py                <-- App, lifespan (seed/warm), /api/v1 routes
│   ├── pyproject.toml         <-- Dependencies managed by uv
│   ├── uv.lock
│   ├── mercado/               <-- Forecast engine
│   │   ├── commodities.py     <-- Commodity metadata and display info
│   │   ├── geo.py             <-- Regions, provinces, market coordinates
│   │   ├── sample_data.py     <-- Deterministic synthetic history generator
│   │   ├── models.py          <-- Naive, Holt-Winters, Ridge, gradient-boosted trees
│   │   ├── forecast.py        <-- Caching, signals, drivers, bulk views
│   │   └── store.py           <-- SQLite storage and weekly series access
│   ├── data/                  <-- Generated at runtime (mercado.db is gitignored)
│   └── tests/
│       └── test_mercado.py
│
└── frontend/                  <-- React frontend
    ├── .env.example           <-- Copy to .env for Supabase/API config
    ├── index.html
    ├── package.json
    ├── pnpm-lock.yaml
    ├── vite.config.js         <-- React + Tailwind plugins, /api proxy to :8000
    ├── eslint.config.js
    └── src/
        ├── main.jsx           <-- React root; imports Tailwind then legacy CSS
        ├── App.jsx            <-- Hash router + Supabase session guard
        ├── state.jsx          <-- App context: route, meta, province, horizon, language, theme
        ├── api.js             <-- Axios wrapper with in-memory cache
        ├── supabaseClient.js  <-- Supabase client from env vars
        ├── i18n.js            <-- English / Filipino strings
        ├── alerts.js, util.js
        ├── index.css          <-- Tailwind entry point
        ├── styles.css         <-- Legacy Mercado design system (CSS variables, components)
        ├── pages/             <-- Auth, Board, Detail, MapPage, Planner
        └── components/        <-- Layout, Charts (Chart.js + SVG sparkline), PhilippinesMap, PriceTag, Common, Icons, LocationPicker
```

---

## Development Requirements

1. **Git** (v2.30+)
2. **Node.js** (20.19+ or 22.12+; v24 recommended)
3. **pnpm**: `npm install -g pnpm`
4. **Python** 3.14+
5. **uv**:
   - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
   - macOS / Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`

---

## Setup & Installation Guide

### 1. Cloning the Repository

```bash
git clone <repo-url>
cd mercado
```

### 2. Backend Setup (FastAPI + uv)

```bash
cd backend
uv sync
uv run uvicorn main:app --reload
```

The first launch creates `backend/data/mercado.db`, seeds a synthetic price history, and warms forecasts in a background thread. Verify:

- Root: `http://127.0.0.1:8000/`
- Health: `http://127.0.0.1:8000/api/v1/health`
- Swagger docs: `http://127.0.0.1:8000/docs`

### 3. Frontend Setup (React + Vite)

```bash
cd frontend
pnpm install
cp .env.example .env    # then fill in the Supabase values
pnpm dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://127.0.0.1:8000`, so no CORS configuration is needed in development.

---

## Running the Project Locally

| Service | Working Directory | Command | URL |
| --- | --- | --- | --- |
| **FastAPI Backend** | `backend/` | `uv run uvicorn main:app --reload` | `http://127.0.0.1:8000` |
| **React Frontend** | `frontend/` | `pnpm dev` | `http://localhost:5173` |

---

## Tests

```bash
cd backend
uv run pytest -q
```

The suite covers sample-data determinism, ensemble quality versus the naive baseline, and the API endpoints.

Frontend checks:

```bash
cd frontend
pnpm lint
pnpm build
```

---

## Environment Variables

### Backend

| Variable | Default | Purpose |
| --- | --- | --- |
| `MERCADO_DATA_DIR` | `backend/data` | Where the SQLite database lives |
| `MERCADO_WARM` | `1` | Set to `0` to skip pre-computing forecasts at startup |

### Frontend (`frontend/.env`)

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE` | Backend origin. Leave empty in dev to use the Vite proxy. |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_DEV_BYPASS_AUTH` | Set to `1` to skip the login gate for UI work without Supabase credentials. Never enable in production. |

---

## Troubleshooting

- **Port 8000 in use:** Stop other uvicorn/Python processes.
- **Frontend cannot reach the backend:** Ensure `uv run uvicorn main:app --reload` is running and `VITE_API_BASE` is empty in dev (so the proxy is used).
- **Login screen errors:** Confirm `frontend/.env` exists and contains valid Supabase values. For UI work without credentials, set `VITE_DEV_BYPASS_AUTH=1` in `frontend/.env`.
- **Blank page or "Something went wrong":** The API is not running, or the database is still seeding. Check `http://127.0.0.1:8000/api/v1/health`.
- **Reset everything:** Delete `backend/data/mercado.db` and restart; it re-seeds itself.
- **Missing Python package:** Always run through `uv run` (e.g., `uv run uvicorn main:app --reload`).
