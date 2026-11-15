import os
import sys
import tempfile

import numpy as np
import pandas as pd
import pytest

os.environ["MERCADO_DATA_DIR"] = tempfile.mkdtemp()
os.environ.setdefault("MERCADO_WARM", "0")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from mercado import sample_data, models, geo, commodities as cm  # noqa: E402
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


def test_api_endpoints(client):
    meta = client.get("/api/v1/meta").json()
    assert len(meta["provinces"]) >= 20 and len(meta["commodities"]) == 10
    assert "typhoon" not in meta["commodities"][0]
    ov = client.get("/api/v1/overview?province=ncr").json()
    assert len(ov["items"]) == 10
    assert all(i["horizons"]["14"]["signal"] in ("dip", "surge", "stable") for i in ov["items"])
    d = client.get("/api/v1/forecast?province=ncr&commodity=tomato").json()
    assert len(d["forecast"]) == 5 and d["forecast"][0]["lo"] < d["forecast"][0]["price"] < d["forecast"][0]["hi"]
    assert "model_lab" not in d
    assert client.get("/api/v1/forecast?province=nope&commodity=rice").status_code == 404


def test_removed_features_have_no_routes(client):
    assert client.get("/api/v1/pipeline").status_code == 404
    assert client.post("/api/v1/pipeline/run", json={"mode": "simulate"}).status_code == 404
