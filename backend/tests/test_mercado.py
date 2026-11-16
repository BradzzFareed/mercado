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

from mercado import store, sample_data, models, geo, commodities as cm, pipeline, forecast  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_sample_data_prefix_is_stable():
    a = sample_data.generate(end=sample_data.date(2026, 10, 26), provinces=geo.PROVINCES[:2])
    b = sample_data.generate(end=sample_data.date(2026, 11, 2), provinces=geo.PROVINCES[:2])
    assert np.allclose(a["price"].values, b[b["date"] <= sample_data.date(2026, 10, 26)]["price"].values)


def test_ensemble_beats_naive_on_seasonal_series():
    df = sample_data.generate(provinces=[geo.BY_ID["ncr"]], comms=[cm.BY_ID["tomato"]])
    s = df.set_index(pd.to_datetime(df["date"]))["price"]
    y, dates = np.log(s.values), [d.date() for d in s.index]
    res = models.full(y, dates)
    m = res.backtest["metrics"]
    assert m["ensemble"]["mape"] < m["naive"]["mape"]
    assert abs(sum(res.weights.values()) - 1) < 1e-6
    assert (np.diff(res.sigma) >= 0).all()


def test_match_commodity_eggplants_are_not_eggs():
    assert cm.match_commodity("Eggplants") == "eggplant"
    assert cm.match_commodity("Eggs") == "eggs"


def test_api_endpoints(client):
    meta = client.get("/api/v1/meta").json()
    assert len(meta["provinces"]) >= 20 and len(meta["commodities"]) == len(cm.SYNTHETIC)
    ov = client.get("/api/v1/overview?province=ncr").json()
    assert len(ov["items"]) == len(cm.SYNTHETIC)
    assert all(i["horizons"]["14"]["signal"] in ("dip", "surge", "stable") for i in ov["items"])
    d = client.get("/api/v1/forecast?province=ncr&commodity=tomato").json()
    assert len(d["forecast"]) == 5 and d["forecast"][0]["lo"] < d["forecast"][0]["price"] < d["forecast"][0]["hi"]
    assert "ensemble" in d["model_lab"]["metrics"]
    assert client.get("/api/v1/forecast?province=nope&commodity=rice").status_code == 404


def test_meta_contract_v2(client):
    meta = client.get("/api/v1/meta").json()
    stored = {p["id"] for p in meta["provinces"]}
    without = meta["provinces_without_data"]
    assert {p["id"] for p in without} == {p["id"] for p in geo.PROVINCES} - stored
    assert len(without) == len(geo.PROVINCES) - len(geo.SYNTHETIC_PROVINCES)
    assert set(without[0]) == {"id", "name", "region"}
    assert [c["id"] for c in meta["commodities"]] == [c["id"] for c in cm.SYNTHETIC]
    assert set(meta["commodities"][0]) == set(cm.PUBLIC_FIELDS)
    assert all(p["confidence"] in ("high", "UNCERTAIN") for p in meta["provinces"])
    assert meta["data_version"] and "last_updated" in meta


def test_registered_commodity_without_data_is_not_found(client):
    assert client.get("/api/v1/forecast?province=ncr&commodity=bitter-melon").status_code == 404
    assert client.get("/api/v1/compare?province=ncr&commodity=bitter-melon").status_code == 404
    assert client.get("/api/v1/map?commodity=bitter-melon").status_code == 404


def test_pipeline_simulate_adds_a_week_and_changes_data(client):
    before = store.last_date()
    rep = client.post("/api/v1/pipeline/run", json={"mode": "simulate"}).json()
    assert rep["status"] == "ok" and rep["rows_added"] == len(geo.SYNTHETIC_PROVINCES) * len(cm.SYNTHETIC)
    assert (store.last_date() - before).days == 7


def test_live_mode_degrades_gracefully_offline(client):
    rep = client.post("/api/v1/pipeline/run", json={"mode": "live"}).json()
    assert rep["status"] in ("ok", "no_update")


def test_meta_data_version_changes_after_pipeline_run(client):
    first = client.get("/api/v1/meta").json()
    assert isinstance(first["data_version"], str) and first["data_version"]

    again = client.get("/api/v1/meta").json()          # stable with no run in between
    assert again["data_version"] == first["data_version"]
    assert again["last_updated"] == first["last_updated"]

    rep = client.post("/api/v1/pipeline/run", json={"mode": "simulate"}).json()
    assert rep["status"] == "ok"

    after = client.get("/api/v1/meta").json()
    assert after["data_version"] != first["data_version"]
    assert after["last_updated"] >= first["last_updated"]
