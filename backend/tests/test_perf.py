"""Cold-start behaviour: quick engine for uncached bulk views, warm order, cache cap.

Offline; every test writes to its own temporary database.
"""
import os
import sys
import tempfile
import threading
import time

import pandas as pd
import pytest

os.environ["MERCADO_DATA_DIR"] = tempfile.mkdtemp()
os.environ.setdefault("MERCADO_WARM", "0")
os.environ.setdefault("MERCADO_SCHEDULER", "0")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mercado import store, forecast, models, geo, commodities as cm, sample_data, tiers  # noqa: E402


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(store, "DB_PATH", os.path.join(str(tmp_path), "mercado.db"))
    store.invalidate()
    tiers._cache.update(version=None, records=None)
    forecast.clear_cache()
    yield
    store.invalidate()


def seed_ncr(comms):
    store.init_db()
    store.upsert_prices(sample_data.generate(provinces=[geo.BY_ID["ncr"]],
                                             comms=[cm.BY_ID[c] for c in comms]))


def weekly_rows(prov, comm, start, n, source="real", price=10.0):
    dates = pd.date_range(start, periods=n, freq="W-MON")
    return pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "province": prov, "region": "R", "market": "M",
                         "commodity": comm, "price": price, "source": source})


def months_ending(end, n):
    return (pd.date_range(end=end, periods=n, freq="MS") + pd.Timedelta(days=14)).strftime("%Y-%m-%d")


def add_series(prov, comm, weeks_n, months_n=36, source="real"):
    store.init_db()
    store.upsert_prices(weekly_rows(prov, comm, "2020-01-06", weeks_n, source=source))
    with store.transaction() as con:
        store.insert_observations(con, pd.DataFrame(
            {"province": prov, "commodity": comm, "market": "Mkt",
             "obs_date": pd.to_datetime(months_ending("2026-06-15", months_n)),
             "price": 10.0, "unit": "KG"}))


def test_cold_overview_and_map_use_quick(monkeypatch):
    seed_ncr(["tomato", "rice"])

    def no_full(*a, **k):
        raise AssertionError("full engine ran for an uncached series")
    monkeypatch.setattr(models, "full", no_full)
    ov = forecast.overview("ncr")
    assert all(i["engine"] == "quick" for i in ov["items"]) and len(ov["items"]) == 2
    rows = forecast.price_map("rice")
    assert all(r["engine"] == "quick" for r in rows) and len(rows) == 1


def test_cached_series_uses_the_cached_result(monkeypatch):
    seed_ncr(["tomato", "rice"])
    forecast.detail("ncr", "tomato")                     # primes the full cache
    real_quick, quick_calls = models.quick, []

    def recording(*a, **k):
        quick_calls.append(1)
        return real_quick(*a, **k)
    monkeypatch.setattr(models, "quick", recording)
    ov = forecast.overview("ncr")
    engines = {i["commodity"]: i["engine"] for i in ov["items"]}
    assert engines["tomato"] == "full" and engines["rice"] == "quick"
    assert len(quick_calls) == 1                         # quick ran only for the uncached series


def test_warm_pairs_legacy_first_and_stored_full_only():
    seed_ncr(["tomato", "eggs"])                         # legacy: full engine (408 weeks)
    add_series("ncr", "garlic", weeks_n=150)             # non-legacy real full
    add_series("cebu", "garlic", weeks_n=109, months_n=12)   # history quick: must be skipped
    forecast.clear_cache()
    pairs = forecast.warm_pairs(provinces=["ncr"])
    assert pairs[:2] == [("ncr", "eggs"), ("ncr", "tomato")]
    assert pairs[2:] == [("ncr", "garlic")]
    assert ("cebu", "garlic") not in pairs
    everything = forecast.warm_pairs()
    assert ("cebu", "garlic") not in everything and ("ncr", "garlic") in everything


def test_warm_computes_full_for_stored_pairs():
    seed_ncr(["tomato"])
    add_series("ncr", "garlic", weeks_n=150)
    forecast.clear_cache()
    forecast.warm(provinces=["ncr"])
    assert ("core", "full", "ncr", "tomato") in forecast._cache
    assert ("core", "full", "ncr", "garlic") in forecast._cache
    assert all(i["engine"] == "full" for i in forecast.overview("ncr")["items"])


def test_warm_does_not_block_the_caller(monkeypatch):
    seed_ncr(["tomato"])
    real_run = forecast._run
    started, release = threading.Event(), threading.Event()

    def slow(*a, **k):
        started.set()
        release.wait(2)
        return real_run(*a, **k)
    monkeypatch.setattr(forecast, "_run", slow)
    thread = threading.Thread(target=forecast.warm, args=(["ncr"],), daemon=True)
    thread.start()
    assert started.wait(1.0), "warm never handed work to its pool"
    release.set()
    thread.join(2)
    assert ("core", "full", "ncr", "tomato") in forecast._cache


def test_cache_cap_evicts_oldest(monkeypatch):
    monkeypatch.setattr(forecast, "CACHE_MAX_ENTRIES", 2)
    forecast.clear_cache()
    a, b, c = object(), object(), object()
    assert forecast._cached(("k", "a"), lambda: a) is a
    assert forecast._cached(("k", "b"), lambda: b) is b
    assert forecast._cached(("k", "c"), lambda: c) is c
    assert ("k", "a") not in forecast._cache and ("k", "b") in forecast._cache
    assert len(forecast._cache) == 2
    forecast.clear_cache()
