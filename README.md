# Mercado

> **Location-Aware Agri-Market Retail Price Forecasting Platform**

Mercado is a web-based machine learning application designed to help everyday Filipino consumers, household planners, and small food enterprise owners (such as local *carinderias*) anticipate retail food price changes in their specific region or province. By leveraging time-series regression models trained on historical Philippine agricultural market data, Mercado provides 7- to 30-day commodity price forecasts and automated price surge/dip alerts.

---

## Table of Contents

- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [System Architecture & Data Flow](#-system-architecture--data-flow)
- [Repository Structure](#-repository-structure)
- [Development Requirements](#-development-requirements)
- [Setup & Installation Guide](#-setup--installation-guide)
  - [1. Cloning the Repository](#1-cloning-the-repository)
  - [2. Backend Setup (FastAPI + uv)](#2-backend-setup-fastapi--uv)
  - [3. Frontend Setup (React + Tailwind CSS)](#3-frontend-setup-react--tailwind-css)
- [Running the Project Locally](#-running-the-project-locally)
- [Troubleshooting](#-troubleshooting)

---

## Project Overview

Food price instability caused by seasonal weather patterns, transportation costs, and market disruptions creates financial uncertainty for Filipino households operating on tight budgets. Official price reports are often presented as national averages or static tables, making them difficult for local consumers to apply to their immediate wet markets (*palengkes*).

**Mercado** addresses this information gap by providing:

1. **Localized Predictions:** Allows users to filter forecasts down to their specific Region or Province rather than relying on national averages.
2. **Interactive Visualizations:** Renders historical price trajectories alongside projected future price corridors.
3. **Actionable Price Signals:** Displays smart indicators when basic commodities (such as rice, pork belly, chicken, calamansi, and tomatoes) are expected to experience price dips or surges.

---

## Key Features

- **Location Selector:** Interactive dropdowns to filter market data by Region and Province.
- **Commodity Price Forecasts:** Interactive time-series charts powered by Chart.js displaying 7- to 30-day predicted retail prices.
- **Smart Buying Alerts:** Color-coded badges indicating whether a staple is in a "Price Dip" (optimal buying window) or "Price Surge" (expected increase).
- **Fast REST API:** High-performance FastAPI backend delivering predictions in milliseconds.
- **Modern Responsive UI:** Clean, mobile-friendly interface styled with Tailwind CSS and Lucide React icons.

---

## Tech Stack

### Backend (API & ML Engine)

- **Language:** Python 3.10+
- **Package & Environment Manager:** [`uv`](https://astral.sh/uv) (Ultra-fast Rust-based package manager)
- **Web Framework:** [FastAPI](https://fastapi.tiangolo.com/)
- **ASGI Server:** Uvicorn
- **Data Processing & ML:** Pandas, NumPy, Scikit-Learn, XGBoost, Joblib
- **Database & ORM:** SQLite (Development) / PostgreSQL (Production) via SQLAlchemy

### Frontend (User Interface)

- **Framework:** React.js initialized via [Vite](https://vitejs.dev/)
- **Package Manager:** [`pnpm`](https://pnpm.io/)
- **Styling & Design:** [Tailwind CSS](https://tailwindcss.com/) (`@tailwindcss/vite`)
- **Icon Set:** [Lucide React](https://lucide.dev/)
- **HTTP Client:** Axios
- **Data Visualization:** Chart.js with `react-chartjs-2`

---

## System Architecture & Data Flow

1. **User Request:** The user selects a location (*e.g., Region IV-A / Batangas*) and commodity (*e.g., Pork Belly*) on the React UI.
2. **API Call:** Axios sends a request to FastAPI: `GET /api/v1/predict?region=4A&commodity=pork_belly`.
3. **Inference & DB Retrieval:** FastAPI queries historical price logs from the database, passes inputs to the pre-trained `.joblib` model, and generates future price estimates.
4. **JSON Response:** FastAPI returns formatted prediction arrays and status indicators.
5. **Rendering:** React receives the JSON payload and updates Chart.js graph components in real time.

---

## Repository Structure

```text
mercado/                       <-- Root Repository Directory
├── .gitignore                 <-- Git Ignore File
├── README.md                  <-- Project Documentation
│
├── backend/                   <-- FastAPI Backend
│   ├── .venv/                 <-- Virtual Environment (Managed by uv)
│   ├── main.py                <-- FastAPI Application & Route Definitions
│   ├── models/                <-- Trained ML Model Binaries (.joblib)
│   ├── pyproject.toml         <-- Python Dependencies Metadata
│   └── uv.lock                <-- Deterministic Package Lockfile
│
└── frontend/                  <-- React Frontend
    ├── node_modules/          <-- Installed Frontend Packages
    ├── package.json           <-- Frontend Dependencies & Build Scripts
    ├── pnpm-lock.yaml         <-- Dependency Lockfile
    ├── vite.config.js         <-- Vite & Tailwind Plugin Configuration
    └── src/
        ├── index.css          <-- Global Stylesheet (@import "tailwindcss";)
        ├── App.jsx            <-- Main UI Container Component
        └── main.jsx           <-- React Root Mounting Point
```

---

## Development Requirements

Before installing the project, make sure your computer has the following tools installed:

1. **Git** (v2.30+): [Download Git](https://git-scm.com/)
2. **Node.js** (v18.0+): [Download Node.js](https://nodejs.org/)
3. **`pnpm`** (Package Manager): Install globally via terminal:

   ```bash
   npm install -g pnpm
   ```

4. **Python** (v3.10+): [Download Python](https://www.python.org/) *(Ensure "Add Python to PATH" is enabled on Windows)*.
5. **`uv`** (Python Package Manager):
   - **Windows (PowerShell):**

     ```powershell
     powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
     ```

   - **macOS / Linux:**

     ```bash
     curl -LsSf https://astral.sh/uv/install.sh | sh
     ```

---

## Setup & Installation Guide

### 1. Cloning the Repository

Open your terminal and clone the project:

```bash
git clone <>
cd mercado
```

---

### 2. Backend Setup (FastAPI + uv)

1. Open your terminal and navigate to the `backend/` directory:

   ```bash
   cd backend
   ```

2. Install backend dependencies and initialize the virtual environment:

   ```bash
   uv sync
   ```

3. Start the FastAPI development server:

   ```bash
   uv run uvicorn main:app --reload
   ```

4. Verify the backend is active:
   - **Root API:** Open `http://127.0.0.1:8000/` in your browser.
   - **Health Check:** Open `http://127.0.0.1:8000/api/v1/health`.
   - **Interactive API Docs (Swagger UI):** Open `http://127.0.0.1:8000/docs`.

---

### 3. Frontend Setup (React + Tailwind CSS)

1. Open a **new terminal tab/window** and navigate to the `frontend/` directory:

   ```bash
   cd frontend
   ```

2. Install all JavaScript dependencies:

   ```bash
   pnpm install
   ```

3. Start the React development server:

   ```bash
   pnpm run dev
   ```

4. Open `http://localhost:5173` in your browser. You should see the Mercado web application displaying **"System Status: Mercado Backend Service"** in green.

---

## Running the Project Locally

To run the full stack during local development, keep both terminal tabs active:

| Service             | Working Directory | Command                              | URL                     |
| ------------------- | ----------------- | ------------------------------------ | ----------------------- |
| **FastAPI Backend** | `mercado/backend` | `uv run uvicorn main:app --reload`   | `http://127.0.0.1:8000` |
| **React Frontend**  | `mercado/frontend`| `pnpm run dev`                       | `http://localhost:5173` |

---

## Troubleshooting

- **Port 8000 in use:** Stop running Python tasks (`stop-process -name python` on PowerShell or `killall uvicorn` on Mac/Linux).
- **Backend Connection Failed on Frontend:** Ensure the backend server is running in the second terminal tab on `http://127.0.0.1:8000`.
- **Missing Package Error in Python:** Ensure you run commands using `uv run` (e.g., `uv run uvicorn main:app --reload`).
