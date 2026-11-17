"""Mercado API (FastAPI).

Run from backend/:
    uv sync
    uv run uvicorn main:app --reload

Endpoints are mounted under /api/v1 and documented at /docs.
"""
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from mercado import commodities as cm
from mercado import forecast, geo, pipeline, sample_data, scheduler, store, tiers


def seed_if_empty():
    store.init_db()
    if store.count_rows() == 0:
        n = store.upsert_prices(sample_data.generate(provinces=geo.SYNTHETIC_PROVINCES, comms=cm.SYNTHETIC))
        now = datetime.now().isoformat(timespec="seconds")
        with store._lock, store.connect() as con:
            con.execute(
                "INSERT INTO pipeline_runs(started, finished, mode, source, status, rows_added, message, log) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (now, now, "seed", "sample", "ok", int(n), f"loaded synthetic history ({n} rows)", "[]"),
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_if_empty()
    warm = os.environ.get("MERCADO_WARM", "1") != "0"
    if warm and store.count_rows():
        threading.Thread(target=forecast.warm, daemon=True, name="mercado-warm").start()
    if os.environ.get("MERCADO_SCHEDULER") == "1":
        scheduler.start()
    yield
    scheduler.stop()


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


def _has_commodity(cid):
    return cid in cm.BY_ID and cid in set(store.available()["commodities"])


@API.get("/health")
def health():
    a = store.available()
    return {"status": "ok", "rows": a["rows"], "as_of": a["end"]}


def _counts(records, field):
    out = {}
    for r in records:
        out[r[field]] = out.get(r[field], 0) + 1
    return dict(sorted(out.items()))


@API.get("/meta")
def meta():
    a = store.available()
    avail = set(a["provinces"])
    recs = tiers.records(forecast.version())
    comm_series, prov_series = {}, {}
    for (p, c), rec in recs.items():
        comm_series.setdefault(c, []).append(rec)
        prov_series.setdefault(p, []).append(rec)
    shown = {c for c, rs in comm_series.items() if any(r["tier"] != "hidden" for r in rs)}
    provs = [
        dict(id=p["id"], name=p["name"], region_code=p["region_code"], region=p["region"],
             market=p["market"], lat=p["lat"], lon=p["lon"], confidence=p["confidence"],
             tiers=_counts(prov_series.get(p["id"], []), "tier"))
        for p in geo.PROVINCES if p["id"] in avail
    ]
    regions = [dict(r, provinces=[x for x in r["provinces"] if x in avail]) for r in geo.regions()]
    regions = [r for r in regions if r["provinces"]]
    comms = []
    for c in cm.public():
        if c["id"] not in shown:
            continue
        rs = comm_series[c["id"]]
        c = dict(c)
        c["source_mix"] = _counts(rs, "source")
        c["tiers"] = _counts(rs, "tier")
        c["horizons"] = sorted({h for r in rs for h in r["horizons"]})
        c["native_step"] = "month" if any(r["native_step"] == "month" for r in rs) else "week"
        comms.append(c)
    without = [dict(id=p["id"], name=p["name"], region=p["region"]) for p in geo.PROVINCES if p["id"] not in avail]
    return dict(provinces=provs, regions=regions, commodities=comms, provinces_without_data=without,
                dishes=cm.dishes(), horizons=list(forecast.HORIZONS), data=a, **pipeline.version_info())


@API.get("/coverage")
def coverage(include_hidden: bool = False):
    """Compact series index: one row per (province, commodity) with its source, tier and engine."""
    recs = tiers.records(forecast.version())
    fields = ["province", "commodity", "source", "tier", "engine", "n_months", "last_obs"]
    rows = [[r["province"], r["commodity"], r["source"], r["tier"], r["engine"], r["n_months"], r["last_obs"]]
            for _key, r in sorted(recs.items()) if include_hidden or r["tier"] != "hidden"]
    return dict(fields=fields, rows=rows, count=len(rows))


@API.get("/overview")
def overview(province: str = "ncr"):
    _check_prov(province)
    try:
        return forecast.overview(province)
    except ValueError as e:
        return _err(str(e), 422)


@API.get("/forecast")
def fc(province: str = "ncr", commodity: str = "rice", horizon: int | None = None):
    _check_prov(province)
    if not _has_commodity(commodity):
        return _err("Unknown province or commodity", 404)
    try:
        return forecast.detail(province, commodity, horizon=horizon)
    except forecast.HorizonUnavailable as e:
        return JSONResponse({"error": str(e), "available_horizons": e.available}, status_code=422)
    except ValueError as e:
        return _err(str(e), 422)


@API.get("/map")
def pmap(commodity: str = "rice"):
    if not _has_commodity(commodity):
        return _err("Unknown commodity", 404)
    return dict(rows=forecast.price_map(commodity))


@API.get("/compare")
def compare(province: str = "ncr", commodity: str = "rice"):
    _check_prov(province)
    if not _has_commodity(commodity):
        return _err("Unknown province or commodity", 404)
    try:
        return forecast.compare(province, commodity)
    except (ValueError, StopIteration) as e:
        return _err(str(e) or "No comparison available", 422)


@API.get("/pipeline")
def pipe():
    a = store.available()
    return dict(dataset=a, scheduler=scheduler.info(), sources=pipeline.SOURCES, runs=pipeline.recent_runs())


class PipelineRun(BaseModel):
    mode: str = "live"


@API.post("/pipeline/run")
def pipe_run(body: PipelineRun | None = None):
    mode = body.mode if body else "live"
    if mode not in pipeline.MODES:
        return _err(f"Unknown mode. Use one of: {', '.join(pipeline.MODES)}", 400)
    rep = pipeline.run(mode)
    if rep["status"] == "error" and not rep.get("log"):
        return JSONResponse(rep, status_code=409)
    return rep


app.include_router(API)


@app.get("/")
def home():
    return {"message": "Welcome to Mercado API", "docs": "/docs", "health": "/api/v1/health"}
