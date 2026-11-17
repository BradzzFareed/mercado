"""API field tests: source/tier/engine/horizons/native_step/unit/confidence/baseline,
the gated no-gain flag, horizon validation (422) and history-only /forecast.

Offline; each test writes to its own temporary database.
"""
import os
import sys
import tempfile

import numpy as np
import pandas as pd
import pytest

os.environ["MERCADO_DATA_DIR"] = tempfile.mkdtemp()
os.environ.setdefault("MERCADO_WARM", "0")
os.environ.setdefault("MERCADO_SCHEDULER", "0")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from mercado import store, forecast, models, geo, commodities as cm, sample_data, tiers  # noqa: E402
from main import app  # noqa: E402

FIELDS = ("source", "tier", "engine", "native_step", "unit", "confidence", "baseline")


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(store, "DB_PATH", os.path.join(str(tmp_path), "mercado.db"))
    store.invalidate()
    tiers._cache.update(version=None, records=None)
    forecast.clear_cache()
    yield
    store.invalidate()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def weekly_rows(prov, comm, start, n, source="real", price=10.0):
    dates = pd.date_range(start, periods=n, freq="W-MON")
    return pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "province": prov, "region": "R", "market": "M",
                         "commodity": comm, "price": price, "source": source})


def months_ending(end, n):
    return (pd.date_range(end=end, periods=n, freq="MS") + pd.Timedelta(days=14)).strftime("%Y-%m-%d")


def seed_history_only():
    """A province and commodity that exist only as observations, plus price rows elsewhere."""
    store.init_db()
    store.upsert_prices(weekly_rows("cebu", "garlic", "2020-01-06", 150, source="synthetic"))
    store.upsert_prices(weekly_rows("batangas", "tomato", "2020-01-06", 150, source="synthetic"))
    with store.transaction() as con:
        store.insert_observations(con, pd.DataFrame(
            {"province": "batangas", "commodity": "garlic", "market": "Mkt",
             "obs_date": pd.to_datetime(months_ending("2026-06-15", 17)), "price": 9.5, "unit": "KG"}))
    forecast.clear_cache()


def add_real(prov, comm, weeks_n, months_n=36, start="2020-01-06"):
    store.init_db()
    store.upsert_prices(weekly_rows(prov, comm, start, weeks_n))
    with store.transaction() as con:
        store.insert_observations(con, pd.DataFrame(
            {"province": prov, "commodity": comm, "market": "Mkt",
             "obs_date": pd.to_datetime(months_ending("2026-06-15", months_n)), "price": 10.0, "unit": "KG"}))
    forecast.clear_cache()


def seed_synthetic_ncr(comm):
    store.init_db()
    store.upsert_prices(sample_data.generate(provinces=[geo.BY_ID["ncr"]], comms=[cm.BY_ID[comm]]))
    forecast.clear_cache()


# ------------------------------------------------------------------ field shapes
def test_real_full_series_fields(client):
    add_real("ncr", "garlic", weeks_n=150)
    d = client.get("/api/v1/forecast?province=ncr&commodity=garlic").json()
    assert d["engine"] == "full" and d["tier"] == "forecast" and d["source"] == "real"
    assert d["native_step"] == "month" and d["horizons_available"] == [30]
    assert list(d["horizons"]) == ["30"] and list(d["best_buy"]) == ["30"]
    assert d["confidence"] == "normal" and d["baseline"] == d["current"]
    assert d["unit"] == next(c["unit"] for c in client.get("/api/v1/meta").json()["commodities"] if c["id"] == "garlic")
    assert d["no_gain_vs_last_price"] is None          # flag disabled after the failed agreement check


def test_real_quick_series_fields(client):
    add_real("cebu", "garlic", weeks_n=120, months_n=36)     # forecast tier, under 145 weeks
    d = client.get("/api/v1/forecast?province=cebu&commodity=garlic").json()
    assert d["engine"] == "quick" and d["tier"] == "forecast" and d["confidence"] == "low"
    assert d["horizons_available"] == [30] and d["forecast"] and d["no_gain_vs_last_price"] is None


def test_history_quick_series_fields(client):
    add_real("iloilo", "garlic", weeks_n=120, months_n=20)   # 12-35 fresh months: history tier
    d = client.get("/api/v1/forecast?province=iloilo&commodity=garlic").json()
    assert d["engine"] == "quick" and d["tier"] == "history" and d["confidence"] == "low"
    assert d["horizons_available"] == [30] and d["forecast"] and d["no_gain_vs_last_price"] is None


def test_history_only_series_returns_history(client):
    seed_history_only()
    r = client.get("/api/v1/forecast?province=batangas&commodity=garlic")
    assert r.status_code == 200
    d = r.json()
    assert d["tier"] == "history" and d["engine"] == "none" and d["source"] == "real"
    assert d["forecast"] == [] and d["horizons"] == {} and d["horizons_available"] == []
    assert len(d["history"]) == 17 and d["baseline"] == d["current"] == 9.5
    assert d["confidence"] == "low" and d["native_step"] == "month" and d["no_gain_vs_last_price"] is None


def test_synthetic_series_fields(client):
    seed_synthetic_ncr("rice")
    d = client.get("/api/v1/forecast?province=ncr&commodity=rice").json()
    assert d["source"] == "synthetic" and d["tier"] == "forecast" and d["engine"] == "full"
    assert d["native_step"] == "week" and d["horizons_available"] == [7, 14, 30]
    assert sorted(d["horizons"]) == ["14", "30", "7"] and d["confidence"] == "normal"
    assert d["no_gain_vs_last_price"] is None


def test_overview_and_map_rows_carry_fields(client):
    seed_synthetic_ncr("rice")
    add_real("cebu", "garlic", weeks_n=120, months_n=36)
    ov = client.get("/api/v1/overview?province=ncr").json()
    item = next(i for i in ov["items"] if i["commodity"] == "rice")
    assert all(k in item for k in FIELDS) and item["source"] == "synthetic"
    assert ov["basket"]["30"]["change_pct"] < 1000            # basket exists
    rows = client.get("/api/v1/map?commodity=garlic").json()["rows"]
    assert all(all(k in r for k in FIELDS) for r in rows)
    assert all(r["engine"] == "quick" and r["horizons_available"] == [30] for r in rows)


def test_overview_basket_intersection(client):
    seed_synthetic_ncr("rice")                                # legacy-only province keeps 7/14/30
    ov = client.get("/api/v1/overview?province=ncr").json()
    assert set(ov["basket"]) == {"current", "7", "14", "30", "spark", "spark_forecast"}


def test_mixed_province_basket_is_the_common_horizon(client):
    seed_synthetic_ncr("rice")
    add_real("cebu", "garlic", weeks_n=120, months_n=36)      # cebu: synthetic? no; make cebu mixed below
    store.upsert_prices(sample_data.generate(provinces=[geo.BY_ID["cebu"]], comms=[cm.BY_ID["tomato"]]))
    forecast.clear_cache()
    ov = client.get("/api/v1/overview?province=cebu").json()
    assert set(ov["basket"]) == {"current", "30", "spark", "spark_forecast"}


# ------------------------------------------------------------------ 422 horizons
def test_unavailable_horizon_returns_422_with_list(client):
    add_real("ncr", "garlic", weeks_n=150)
    r = client.get("/api/v1/forecast?province=ncr&commodity=garlic&horizon=7")
    assert r.status_code == 422
    body = r.json()
    assert "error" in body and body["available_horizons"] == [30]
    assert client.get("/api/v1/forecast?province=ncr&commodity=garlic&horizon=30").status_code == 200


def test_available_horizon_accepted_for_synthetic(client):
    seed_synthetic_ncr("rice")
    assert client.get("/api/v1/forecast?province=ncr&commodity=rice&horizon=14").status_code == 200
    r = client.get("/api/v1/forecast?province=ncr&commodity=rice&horizon=60")
    assert r.status_code == 422 and r.json()["available_horizons"] == [7, 14, 30]


def test_history_only_rejects_any_horizon(client):
    seed_history_only()
    r = client.get("/api/v1/forecast?province=batangas&commodity=garlic&horizon=30")
    assert r.status_code == 422 and r.json()["available_horizons"] == []


# ------------------------------------------------------------------ no-gain flag
def test_no_gain_is_bool_when_enabled(client, monkeypatch):
    seed_synthetic_ncr("tomato")                              # the ensemble beats naive on tomato
    monkeypatch.setattr(forecast, "NO_GAIN_FLAG_ENABLED", True)
    d = client.get("/api/v1/forecast?province=ncr&commodity=tomato").json()
    assert isinstance(d["no_gain_vs_last_price"], bool)


def test_no_gain_is_null_without_a_backtest(client, monkeypatch):
    seed_synthetic_ncr("rice")

    def quick_full(y, dates, *a, **k):
        return models.quick(y, dates)                        # full slot, but no backtest
    monkeypatch.setattr(models, "full", quick_full)
    monkeypatch.setattr(forecast, "NO_GAIN_FLAG_ENABLED", True)
    d = client.get("/api/v1/forecast?province=ncr&commodity=rice").json()
    assert d["no_gain_vs_last_price"] is None and d["model_lab"] is None
