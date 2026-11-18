"""Interval scale and labels: real full-engine bands are scaled by INTERVAL_SCALE_REAL; everything else is not.

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

from mercado import store, forecast, geo, commodities as cm, sample_data, tiers  # noqa: E402
from main import app  # noqa: E402

Z = 1.2816


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


def add_real(prov, comm, weeks_n, months_n=36):
    store.init_db()
    store.upsert_prices(weekly_rows(prov, comm, "2020-01-06", weeks_n))
    with store.transaction() as con:
        store.insert_observations(con, pd.DataFrame(
            {"province": prov, "commodity": comm, "market": "Mkt",
             "obs_date": pd.to_datetime(months_ending("2026-06-15", months_n)), "price": 10.0, "unit": "KG"}))
    forecast.clear_cache()


def add_inbox(prov, comm, weeks_n):
    store.init_db()
    store.upsert_prices(weekly_rows(prov, comm, "2020-01-06", weeks_n, source="inbox"))
    forecast.clear_cache()


def seed_synthetic_ncr(comm):
    store.init_db()
    store.upsert_prices(sample_data.generate(provinces=[geo.BY_ID["ncr"]], comms=[cm.BY_ID[comm]]))
    forecast.clear_cache()


def engine_arrays(prov, comm, mode="full"):
    r = forecast._run(prov, comm, mode)
    return r["res"], r["lo"], r["hi"], r["point"]


# ------------------------------------------------------------------ scale on real full series only
def test_real_full_band_is_scaled_and_midpoint_unchanged():
    add_real("ncr", "garlic", weeks_n=150)
    res, lo, hi, point = engine_arrays("ncr", "garlic")
    assert forecast.INTERVAL_SCALE_REAL == 1.60
    assert np.array_equal(lo, np.exp(res.point - Z * forecast.INTERVAL_SCALE_REAL * res.sigma))
    assert np.array_equal(hi, np.exp(res.point + Z * forecast.INTERVAL_SCALE_REAL * res.sigma))
    assert np.allclose(np.sqrt(lo * hi), point, rtol=1e-12)            # geometric midpoint is the point forecast
    assert np.all(hi - lo > 0)


def test_scale_one_reproduces_the_unscaled_interval(monkeypatch):
    add_real("ncr", "garlic", weeks_n=150)
    monkeypatch.setattr(forecast, "INTERVAL_SCALE_REAL", 1.0)
    res, lo, hi, _ = engine_arrays("ncr", "garlic")
    assert np.array_equal(lo, np.exp(res.point - Z * res.sigma))
    assert np.array_equal(hi, np.exp(res.point + Z * res.sigma))


def test_scaled_band_contains_the_unscaled_band(monkeypatch):
    add_real("ncr", "garlic", weeks_n=150)
    _, lo_s, hi_s, _ = engine_arrays("ncr", "garlic")
    monkeypatch.setattr(forecast, "INTERVAL_SCALE_REAL", 1.0)
    _, lo_u, hi_u, _ = engine_arrays("ncr", "garlic")
    assert np.all(lo_s <= lo_u) and np.all(hi_s >= hi_u) and np.any(lo_s < lo_u)


def test_point_forecast_and_signals_do_not_depend_on_the_scale(client, monkeypatch):
    add_real("ncr", "garlic", weeks_n=150)
    scaled = client.get("/api/v1/forecast?province=ncr&commodity=garlic").json()
    forecast.clear_cache()
    monkeypatch.setattr(forecast, "INTERVAL_SCALE_REAL", 1.0)
    plain = client.get("/api/v1/forecast?province=ncr&commodity=garlic").json()
    assert [f["price"] for f in scaled["forecast"]] == [f["price"] for f in plain["forecast"]]
    s30, p30 = scaled["horizons"]["30"], plain["horizons"]["30"]
    assert all(s30[k] == p30[k] for k in ("price", "change_pct", "prob_up", "signal"))
    assert (s30["lo"], s30["hi"]) != (p30["lo"], p30["hi"])


def test_quick_real_band_is_never_scaled(monkeypatch):
    add_real("cebu", "garlic", weeks_n=120, months_n=36)               # forecast tier under 145 weeks: quick
    _, lo_a, hi_a, _ = engine_arrays("cebu", "garlic", mode="quick")
    monkeypatch.setattr(forecast, "INTERVAL_SCALE_REAL", 2.5)
    _, lo_b, hi_b, _ = engine_arrays("cebu", "garlic", mode="quick")
    assert np.array_equal(lo_a, lo_b) and np.array_equal(hi_a, hi_b)


def test_synthetic_bands_are_identical_at_any_scale(client, monkeypatch):
    seed_synthetic_ncr("rice")
    scaled = client.get("/api/v1/forecast?province=ncr&commodity=rice").json()
    forecast.clear_cache()
    monkeypatch.setattr(forecast, "INTERVAL_SCALE_REAL", 2.5)
    wide = client.get("/api/v1/forecast?province=ncr&commodity=rice").json()
    assert scaled == wide and scaled["source"] == "synthetic"


def test_inbox_bands_are_not_scaled(monkeypatch):
    add_inbox("ncr", "garlic", weeks_n=150)
    _, lo_a, hi_a, _ = engine_arrays("ncr", "garlic")
    monkeypatch.setattr(forecast, "INTERVAL_SCALE_REAL", 2.5)
    _, lo_b, hi_b, _ = engine_arrays("ncr", "garlic")
    assert np.array_equal(lo_a, lo_b) and np.array_equal(hi_a, hi_b)


# ------------------------------------------------------------------ labels and basis
def test_real_full_label_and_basis(client):
    add_real("ncr", "garlic", weeks_n=150)
    d = client.get("/api/v1/forecast?province=ncr&commodity=garlic").json()
    assert d["interval_label"] == "80%" and d["backtest_basis"] == "interpolated_weekly"
    h = d["horizons"]["30"]
    assert h["lo"] < h["price"] < h["hi"]


def test_real_quick_has_no_label_and_no_basis(client):
    add_real("cebu", "garlic", weeks_n=120, months_n=36)
    d = client.get("/api/v1/forecast?province=cebu&commodity=garlic").json()
    assert d["engine"] == "quick" and d["interval_label"] is None and d["backtest_basis"] is None


def test_synthetic_label_and_basis(client):
    seed_synthetic_ncr("rice")
    d = client.get("/api/v1/forecast?province=ncr&commodity=rice").json()
    assert d["interval_label"] == "80%" and d["backtest_basis"] == "synthetic"


def test_inbox_label_and_basis(client):
    add_inbox("ncr", "garlic", weeks_n=150)
    d = client.get("/api/v1/forecast?province=ncr&commodity=garlic").json()
    assert d["source"] == "inbox" and d["interval_label"] is None and d["backtest_basis"] == "weekly"


def test_history_only_has_both_fields_null(client):
    store.init_db()
    store.upsert_prices(weekly_rows("cebu", "garlic", "2020-01-06", 150, source="synthetic"))
    store.upsert_prices(weekly_rows("batangas", "tomato", "2020-01-06", 150, source="synthetic"))
    with store.transaction() as con:
        store.insert_observations(con, pd.DataFrame(
            {"province": "batangas", "commodity": "garlic", "market": "Mkt",
             "obs_date": pd.to_datetime(months_ending("2026-06-15", 17)), "price": 9.5, "unit": "KG"}))
    forecast.clear_cache()
    d = client.get("/api/v1/forecast?province=batangas&commodity=garlic").json()
    assert d["engine"] == "none" and d["interval_label"] is None and d["backtest_basis"] is None


def test_existing_fields_are_still_served(client):
    add_real("ncr", "garlic", weeks_n=150)
    d = client.get("/api/v1/forecast?province=ncr&commodity=garlic").json()
    assert {"lo", "hi", "price", "signal", "prob_up"} <= set(d["horizons"]["30"])
    assert all({"date", "price", "lo", "hi"} <= set(f) for f in d["forecast"])
