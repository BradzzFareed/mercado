"""Mercado API (FastAPI).

Run from backend/:
    uv sync
    uv run uvicorn main:app --reload

Endpoints are mounted under /api/v1 and documented at /docs.
"""
import os
import threading
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from mercado import commodities as cm
from mercado import forecast, geo, sample_data, store


def seed_if_empty():
    store.init_db()
    if store.count_rows() == 0:
        store.upsert_prices(sample_data.generate())


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_if_empty()
    warm = os.environ.get("MERCADO_WARM", "1") != "0"
    if warm and store.count_rows():
        threading.Thread(target=forecast.warm, daemon=True, name="mercado-warm").start()
    yield


app = FastAPI(title="Mercado API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API = APIRouter(prefix="/api/v1", tags=["mercado"])


def _err(msg, code=400):
    """Preserve the old Flask error body ({error: msg}) for the frontend fetch layer."""
    return JSONResponse({"error": msg}, status_code=code)


def _check_prov(pid):
    if pid not in geo.BY_ID or pid not in set(store.available()["provinces"]):
        raise HTTPException(status_code=404, detail="Unknown province")


@API.get("/health")
def health():
    a = store.available()
    return {"status": "ok", "rows": a["rows"], "as_of": a["end"]}


@API.get("/meta")
def meta():
    a = store.available()
    avail = set(a["provinces"])
    provs = [
        dict(id=p["id"], name=p["name"], region_code=p["region_code"], region=p["region"],
             market=p["market"], lat=p["lat"], lon=p["lon"])
        for p in geo.PROVINCES if p["id"] in avail
    ]
    regions = [dict(r, provinces=[x for x in r["provinces"] if x in avail]) for r in geo.regions()]
    regions = [r for r in regions if r["provinces"]]
    return dict(provinces=provs, regions=regions, commodities=cm.public(), dishes=cm.dishes(),
                horizons=list(forecast.HORIZONS), data=a)


@API.get("/overview")
def overview(province: str = "ncr"):
    _check_prov(province)
    try:
        return forecast.overview(province)
    except ValueError as e:
        return _err(str(e), 422)


@API.get("/forecast")
def fc(province: str = "ncr", commodity: str = "rice"):
    _check_prov(province)
    if commodity not in cm.BY_ID:
        return _err("Unknown province or commodity", 404)
    try:
        return forecast.detail(province, commodity)
    except ValueError as e:
        return _err(str(e), 422)


@API.get("/map")
def pmap(commodity: str = "rice"):
    if commodity not in cm.BY_ID:
        return _err("Unknown commodity", 404)
    return dict(rows=forecast.price_map(commodity))


@API.get("/compare")
def compare(province: str = "ncr", commodity: str = "rice"):
    _check_prov(province)
    if commodity not in cm.BY_ID:
        return _err("Unknown province or commodity", 404)
    try:
        return forecast.compare(province, commodity)
    except (ValueError, StopIteration) as e:
        return _err(str(e) or "No comparison available", 422)


app.include_router(API)


@app.get("/")
def home():
    return {"message": "Welcome to Mercado API", "docs": "/docs", "health": "/api/v1/health"}
