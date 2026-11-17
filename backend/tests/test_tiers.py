"""Tier and coverage tests: boundaries, NULL sources, short series, /coverage and /meta additions.

Each test writes to its own temporary database; everything is offline.
"""
import os
import sys
import tempfile

import pandas as pd
import pytest

os.environ["MERCADO_DATA_DIR"] = tempfile.mkdtemp()
os.environ.setdefault("MERCADO_WARM", "0")
os.environ.setdefault("MERCADO_SCHEDULER", "0")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from mercado import store, tiers, forecast, commodities as cm  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    """Every test gets its own database; tier and forecast caches are reset with it."""
    monkeypatch.setattr(store, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(store, "DB_PATH", os.path.join(str(tmp_path), "mercado.db"))
    store.invalidate()
    tiers._cache.update(version=None, records=None)
    forecast.clear_cache()
    yield
    store.invalidate()


def weekly_rows(prov, comm, start, n, source="real", price=10.0):
    dates = pd.date_range(start, periods=n, freq="W-MON")
    return pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "province": prov, "region": "R", "market": "M",
                         "commodity": comm, "price": price, "source": source})


def month_dates(start, n):
    """n distinct observation months, on the 15th."""
    return (pd.date_range(start, periods=n, freq="MS") + pd.Timedelta(days=14)).strftime("%Y-%m-%d")


def months_ending(end, n):
    """n distinct observation months ending in the month of `end`, each on the 15th."""
    return (pd.date_range(end=end, periods=n, freq="MS") + pd.Timedelta(days=14)).strftime("%Y-%m-%d")


def obs_rows(prov, comm, dates, price=10.0):
    return pd.DataFrame({"province": prov, "commodity": comm, "market": "Mkt",
                         "obs_date": pd.to_datetime(dates), "price": price, "unit": "KG"})


def add(prov, comm, weeks_n=None, months_n=0, start_week="2020-01-06", source="real",
        start_obs="2020-01-15", obs_end="2026-06-15"):
    store.init_db()
    if weeks_n:
        store.upsert_prices(weekly_rows(prov, comm, start_week, weeks_n, source=source))
    if months_n:
        dates = month_dates(start_obs, months_n) if start_obs else months_ending(obs_end, months_n)
        with store.transaction() as con:
            store.insert_observations(con, obs_rows(prov, comm, dates))


def rec(prov, comm, version=None):
    return tiers.records(forecast.version() if version is None else version)[(prov, comm)]


# ---------------------------------------------------------------- boundaries
def test_tier_month_boundaries():
    add("ncr", "rice", weeks_n=150, months_n=36, start_obs=None)      # 36 fresh months, full engine
    add("cebu", "rice", weeks_n=150, months_n=35, start_obs=None)     # one month short of forecast
    add("iloilo", "rice", weeks_n=150, months_n=12, start_obs=None)   # history band
    add("ab", "rice", weeks_n=150, months_n=11, start_obs=None)       # one month short of history
    got = {k: rec(*k) for k in [("ncr", "rice"), ("cebu", "rice"), ("iloilo", "rice"), ("ab", "rice")]}
    assert got[("ncr", "rice")]["tier"] == "forecast" and got[("ncr", "rice")]["engine"] == "full"
    assert got[("cebu", "rice")]["tier"] == "history" and got[("cebu", "rice")]["engine"] == "quick"
    assert got[("iloilo", "rice")]["tier"] == "history" and got[("iloilo", "rice")]["engine"] == "quick"
    assert got[("ab", "rice")]["tier"] == "hidden" and got[("ab", "rice")]["engine"] == "none"


def test_engine_week_boundaries():
    add("ncr", "rice", weeks_n=145, months_n=36, start_obs=None)      # full threshold met
    add("cebu", "rice", weeks_n=144, months_n=36, start_obs=None)     # just under: quick, still forecast
    add("bulacan", "rice", weeks_n=110, months_n=12, start_obs=None)  # history floor: quick
    add("iloilo", "rice", weeks_n=109, months_n=12, start_obs=None)   # under the floor: observations only
    assert rec("ncr", "rice")["engine"] == "full"
    assert rec("cebu", "rice")["engine"] == "quick" and rec("cebu", "rice")["tier"] == "forecast"
    assert rec("bulacan", "rice")["engine"] == "quick" and rec("bulacan", "rice")["tier"] == "history"
    assert rec("iloilo", "rice")["engine"] == "none" and rec("iloilo", "rice")["horizons"] == []


def test_freshness_boundary_is_three_months_and_uses_data_max():
    # dataset max observation comes from the data (2024-06-15), not today's date
    add("ncr", "rice", months_n=42, start_obs="2020-12-15")           # last obs 2024-06-15 (dataset max)
    add("cebu", "rice", months_n=12, start_obs=None, obs_end="2024-06-15")     # fresh, history
    add("bulacan", "rice", months_n=12, start_obs=None, obs_end="2024-03-15")  # exactly at cutoff
    add("iloilo", "rice", months_n=12, start_obs=None, obs_end="2024-02-15")   # stale
    assert rec("ncr", "rice")["tier"] == "forecast"                   # 42 months
    assert rec("cebu", "rice")["tier"] == "history"
    assert rec("bulacan", "rice")["tier"] == "history"                # boundary is inclusive
    assert rec("iloilo", "rice")["tier"] == "hidden"


def test_synthetic_series_stay_forecast():
    add("ncr", "rice", weeks_n=150, source="synthetic", start_obs="2019-01-15", months_n=20)
    r = rec("ncr", "rice")
    assert r["tier"] == "forecast" and r["engine"] == "full" and r["source"] == "synthetic"
    assert r["horizons"] == [7, 14, 30] and r["native_step"] == "week"


LEGACY_SCHEMA = """
CREATE TABLE prices(
  date TEXT NOT NULL, province TEXT NOT NULL, region TEXT, market TEXT,
  commodity TEXT NOT NULL, price REAL NOT NULL, source TEXT,
  PRIMARY KEY(date, province, commodity)
);
CREATE TABLE observations(
  province TEXT NOT NULL, commodity TEXT NOT NULL, market TEXT NOT NULL,
  obs_date TEXT NOT NULL, price REAL NOT NULL, unit TEXT,
  PRIMARY KEY(province, commodity, market, obs_date)
);
"""


def test_null_source_is_synthetic():
    rows = [(d, "ncr", "R", "M", "rice", 10.0, None) for d in
            pd.date_range("2020-01-06", periods=150, freq="W-MON").strftime("%Y-%m-%d")]
    with store.connect() as con:                 # old-schema table with nullable source
        con.executescript(LEGACY_SCHEMA)
        con.executemany("INSERT INTO prices VALUES (?,?,?,?,?,?,?)", rows)
    r = rec("ncr", "rice")
    assert r["source"] == "synthetic" and r["tier"] == "forecast" and r["engine"] == "full"
    assert r["horizons"] == [7, 14, 30] and r["native_step"] == "week"
    with store.connect() as con:
        assert store.max_date(con, "synthetic") is not None
    a = store.available()
    assert a["sources"].get("synthetic") == 150


def test_mixed_sources_are_marked_mixed():
    add("ncr", "rice", weeks_n=150, source="synthetic")
    store.upsert_prices(weekly_rows("ncr", "rice", "2020-01-06", 10, source="inbox"))
    r = rec("ncr", "rice")
    assert r["source"] == "mixed" and r["native_step"] == "week"


def test_short_price_series_is_history_only():
    add("ncr", "rice", weeks_n=109, months_n=12, start_obs="2024-01-15", start_week="2024-01-01")
    r = rec("ncr", "rice")
    assert r["tier"] == "history" and r["engine"] == "none" and r["horizons"] == []
    assert r["n_months"] == 12 and r["n_weeks"] == 109


def test_observation_only_series_have_no_weeks():
    add("ncr", "rice", months_n=17, start_obs=None, obs_end="2026-06-15")
    r = rec("ncr", "rice")
    assert r["tier"] == "history" and r["engine"] == "none" and r["n_weeks"] == 0
    assert r["horizons"] == [] and r["source"] == "real"


# ---------------------------------------------------------------- endpoints
@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_coverage_shape(client):
    add("ncr", "rice", weeks_n=150, months_n=36, start_obs=None)
    add("cebu", "rice", weeks_n=109, months_n=12, start_obs=None, start_week="2024-01-06")
    add("iloilo", "rice", weeks_n=10, months_n=5, start_obs=None)    # hidden: fewer than 12 months
    body = client.get("/api/v1/coverage").json()
    assert set(body) == {"fields", "rows", "count"}
    assert body["fields"] == ["province", "commodity", "source", "tier", "engine", "n_months", "last_obs"]
    rows = {(r[0], r[1]): r for r in body["rows"]}
    assert rows[("ncr", "rice")][:6] == ["ncr", "rice", "real", "forecast", "full", 36]
    assert rows[("ncr", "rice")][6] == "2026-06-15"
    assert rows[("cebu", "rice")][4] == "none" and rows[("cebu", "rice")][5] == 12
    assert ("iloilo", "rice") not in rows
    hidden = client.get("/api/v1/coverage?include_hidden=1").json()
    assert ("iloilo", "rice") in {(r[0], r[1]) for r in hidden["rows"]}


def test_meta_additions_and_legacy_fields(client):
    add("ncr", "rice", weeks_n=150, months_n=36, source="synthetic")
    add("cebu", "rice", weeks_n=150, months_n=36, source="real", start_obs=None)
    meta = client.get("/api/v1/meta").json()
    rice = next(c for c in meta["commodities"] if c["id"] == "rice")
    assert set(cm.PUBLIC_FIELDS) <= set(rice)
    assert rice["source_mix"] == {"real": 1, "synthetic": 1}
    assert rice["tiers"] == {"forecast": 2}
    assert rice["horizons"] == [7, 14, 30]
    assert rice["native_step"] == "month"
    ncr = next(p for p in meta["provinces"] if p["id"] == "ncr")
    assert ncr["tiers"] == {"forecast": 1}
    # every legacy /meta key is still there with the same meaning
    for key in ("provinces", "regions", "commodities", "provinces_without_data", "dishes", "horizons",
                "data", "data_version", "last_updated"):
        assert key in meta
    assert all(set(cm.PUBLIC_FIELDS) <= set(c) for c in meta["commodities"])


def test_hidden_only_commodity_is_absent_from_meta(client):
    add("ncr", "rice", weeks_n=10, months_n=5, start_obs=None)       # hidden: fewer than 12 months
    meta = client.get("/api/v1/meta").json()
    assert "rice" not in {c["id"] for c in meta["commodities"]}
