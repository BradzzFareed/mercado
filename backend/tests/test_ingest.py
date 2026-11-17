"""Offline ingest tests: WFP mapping, token skipping, transactional loads, spare-real rules, migration, inbox.

Each test gets its own temporary database and inbox. WFP's token and MD5 code run against a fake
opener, so nothing here touches the network or backend/data.
"""
import hashlib
import io
import json
import os
import sqlite3
import sys
import tempfile

import pandas as pd
import pytest

os.environ["MERCADO_DATA_DIR"] = tempfile.mkdtemp()
os.environ.setdefault("MERCADO_WARM", "0")
os.environ.setdefault("MERCADO_SCHEDULER", "0")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from mercado import store, pipeline, geo, commodities as cm, sample_data, scheduler, wfp  # noqa: E402
from main import app  # noqa: E402

HXL = {"date": "#date", "admin1": "#adm1", "admin2": "#adm2", "market": "#loc", "market_id": "#loc+id",
       "latitude": "#geo+lat", "longitude": "#geo+lon", "category": "#item+type", "commodity": "#item",
       "commodity_id": "#item+code", "unit": "#unit", "priceflag": "#visualization", "pricetype": "#priceType",
       "currency": "#currency", "price": "#value", "usdprice": "#value+usd"}


def wfp_row(date, admin2, market, commodity, unit, price, pricetype="Retail", admin1="Region"):
    return dict(date=date, admin1=admin1, admin2=admin2, market=market, market_id=1, latitude=0, longitude=0,
                category="cereals and tubers", commodity=commodity, commodity_id=1, unit=unit, priceflag="actual",
                pricetype=pricetype, currency="PHP", price=price, usdprice=0)


def monthly(start, end):
    days = pd.date_range(start, end, freq="MS") + pd.Timedelta(days=14)   # the 15th of each month
    return [d.strftime("%Y-%m-%d") for d in days]


def series_rows(admin2, market, commodity, unit, dates, base, admin1="Region"):
    return [wfp_row(d, admin2, market, commodity, unit, round(base + i * 0.1, 2), admin1=admin1)
            for i, d in enumerate(dates)]


LONG = monthly("2019-01-01", "2026-10-01")     # ~94 monthly points, ~400 weeks, last 2026-10-15
SHORT = monthly("2026-01-01", "2026-10-01")    # ~40 weeks
STALE = monthly("2019-01-01", "2026-03-01")    # long, but last point 2026-03-15 is before the cutoff


def base_rows():
    rows = []
    rows += series_rows("Metropolitan Manila", "Metro Manila", "Rice (regular, milled)", "KG", LONG, 40)
    rows += series_rows("Cebu", "Cebu City", "Onions (red)", "KG", STALE, 120)
    rows += series_rows("Cebu", "Cebu City", "Tomatoes", "KG", SHORT, 60)
    rows += [
        wfp_row("2026-09-15", "Bulacan", "Pampanga", "Eggs (duck)", "Unit", 9.0),
        wfp_row("2026-09-15", "Masbate", "Camarines Sur", "Eggs", "Unit", 8.0),
        wfp_row("2026-09-15", "Davao del Sur", "Davao Occidental", "Eggplants", "KG", 70.0),
        wfp_row("2026-09-15", "Southern Leyte", "Catarman", "Rice (regular, milled)", "KG", 45.0),
        wfp_row("2026-09-15", "Rizal", "Santa Cruz", "Tomatoes", "KG", 55.0),
        wfp_row("2026-09-15", "Metropolitan Manila", "Metro Manila", "Rice (regular, milled)", "KG", 99.0, "Wholesale"),
        wfp_row("2018-12-15", "Metropolitan Manila", "Metro Manila", "Rice (regular, milled)", "KG", 30.0),
        wfp_row("2026-09-15", "Metropolitan Manila", "Metro Manila", "Mystery item", "KG", 10.0),
    ]
    return rows


def csv_bytes(rows):
    frame = pd.DataFrame([HXL] + rows, columns=list(HXL))
    return frame.to_csv(index=False).encode("utf-8")


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeHDX:
    """Serves a package_show payload and one CSV resource, so wfp's own token and MD5 code runs offline."""

    def __init__(self, payload, last_modified="2026-11-15T09:04:34.681205", declared_hash=None):
        self.payload = payload
        self.last_modified = last_modified
        self.declared = declared_hash or hashlib.md5(payload).hexdigest()
        self.downloads = 0

    def package(self):
        return json.dumps({"success": True, "result": {"dataset_date": "", "resources": [dict(
            id=wfp.RESOURCE_ID, format="CSV", url="https://example.org/food.csv",
            last_modified=self.last_modified, hash=self.declared)]}}).encode()

    def __call__(self, request, timeout=None):
        if request.full_url == wfp.PACKAGE_SHOW_URL:
            return FakeResponse(self.package())
        self.downloads += 1
        return FakeResponse(self.payload)


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    """Every test writes to its own database, inbox and live folder."""
    monkeypatch.setattr(store, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(store, "DB_PATH", os.path.join(str(tmp_path), "mercado.db"))
    monkeypatch.setattr(pipeline, "INBOX_DIR", os.path.join(str(tmp_path), "inbox"))
    monkeypatch.setattr(pipeline, "LIVE_DIR", os.path.join(str(tmp_path), "live"))
    monkeypatch.setattr(pipeline, "STATE_PATH", os.path.join(str(tmp_path), "live", "pipeline_state.json"))
    store.invalidate()
    yield
    store.invalidate()


@pytest.fixture
def hdx(monkeypatch):
    """Returns serve(payload, **kw): points the pipeline's WFP calls at a FakeHDX serving payload."""
    server = {}
    real_fetch, real_download = wfp.fetch_remote_token, wfp.download_verified
    monkeypatch.setattr(wfp, "fetch_remote_token", lambda **kw: real_fetch(opener=server["opener"], **kw))
    monkeypatch.setattr(wfp, "download_verified", lambda remote, **kw: real_download(remote, opener=server["opener"], **kw))

    def serve(payload, **kw):
        server["opener"] = FakeHDX(payload, **kw)
        return server["opener"]
    return serve


def db_state():
    store.init_db()
    with store.connect() as con:
        prices = tuple(con.execute("SELECT COUNT(*), ROUND(COALESCE(SUM(price), 0), 2) FROM prices").fetchone())
        obs = tuple(con.execute("SELECT COUNT(*), ROUND(COALESCE(SUM(price), 0), 2) FROM observations").fetchone())
    return prices, obs


def real_state():
    with store.connect() as con:
        return tuple(con.execute("SELECT COUNT(*), ROUND(COALESCE(SUM(price), 0), 2) FROM prices WHERE source = 'real'").fetchone())


def sources_for(province, commodity):
    with store.connect() as con:
        return {r[0] for r in con.execute("SELECT DISTINCT source FROM prices WHERE province = ? AND commodity = ?",
                                          (province, commodity))}


def saved_tokens():
    with store.connect() as con:
        return [r[0] for r in con.execute("SELECT source_token FROM pipeline_runs WHERE source_token IS NOT NULL")]


def seed_synthetic(provinces, comms):
    store.init_db()
    store.upsert_prices(sample_data.generate(provinces=[geo.BY_ID[p] for p in provinces],
                                             comms=[cm.BY_ID[c] for c in comms]))


# ---------------------------------------------------------------- mapping
def parse(rows):
    return pipeline.normalize_wfp(pd.read_csv(io.BytesIO(csv_bytes(rows)), low_memory=False))


def test_market_rule_precedes_admin2():
    obs, stats = parse(base_rows())
    got = obs.groupby("market")["province"].agg(lambda s: set(s)).to_dict()
    assert got["Pampanga"] == {"pampanga"}           # admin2 says Bulacan
    assert got["Camarines Sur"] == {"camarines-sur"}  # admin2 says Masbate
    assert got["Davao Occidental"] == {"davao-occidental"}  # admin2 says Davao del Sur
    assert stats["quarantined_by_market"] == {"Catarman": 1, "Santa Cruz": 1}
    assert stats["quarantined_rows"] == 2
    assert not set(obs["province"]) & {"leyte", "southern-leyte", "rizal"}


def test_exact_labels_map_by_registry_not_by_keyword():
    obs, _ = parse(base_rows())
    assert set(obs.loc[obs["market"] == "Camarines Sur", "commodity"]) == {"eggs"}
    assert set(obs.loc[obs["market"] == "Pampanga", "commodity"]) == {"eggs-duck"}
    assert set(obs.loc[obs["market"] == "Davao Occidental", "commodity"]) == {"eggplant"}
    assert set(obs.loc[obs["market"] == "Davao Occidental", "unit"]) == {"KG"}


def test_only_retail_rows_are_mapped():
    obs, stats = parse(base_rows())
    assert stats["non_retail"] == 1
    assert 99.0 not in set(obs["price"])
    assert set(obs["unit"]) <= {"KG", "Unit"}   # native units, no conversion


def test_unknown_labels_and_pre_history_rows_are_counted_and_skipped():
    obs, stats = parse(base_rows())
    assert stats["unknown_labels"] == {"Mystery item": 1}
    assert stats["unknown_label_rows"] == 1
    assert stats["before_history"] == 1
    assert "Mystery item" not in set(obs["commodity"])
    assert obs["obs_date"].min() >= pd.Timestamp(pipeline.HISTORY_START)


# ---------------------------------------------------------------- WFP loads
def test_token_unchanged_skips_run_with_zero_data_writes(hdx):
    server = hdx(csv_bytes(base_rows()))
    assert pipeline.run("wfp")["status"] == "ok"
    before = db_state()
    server.downloads = 0
    rep = pipeline.run("wfp")
    assert rep["status"] == "no_update"
    assert rep["message"].startswith("Skipped, unchanged")
    assert server.downloads == 0
    assert db_state() == before


def test_md5_mismatch_writes_nothing_and_saves_no_token(hdx):
    hdx(csv_bytes(base_rows()), declared_hash="0" * 32)
    before = db_state()
    rep = pipeline.run("wfp")
    assert "wfp: WfpError" in rep["message"]
    assert "does not match" in rep["message"]
    assert db_state() == before
    assert saved_tokens() == []


def test_failure_mid_load_rolls_back_and_saves_no_token(hdx, monkeypatch):
    seed_synthetic(["ncr"], ["rice"])
    hdx(csv_bytes(base_rows()))
    before = db_state()

    def fail(con, df):
        raise RuntimeError("simulated failure during the price insert")
    monkeypatch.setattr(store, "_insert_prices", fail)
    rep = pipeline.run("wfp")
    assert rep["status"] == "error"
    assert db_state() == before                      # observations and the synthetic series are restored
    assert sources_for("ncr", "rice") == {"synthetic"}
    assert saved_tokens() == []


def test_successful_load_saves_token_once(hdx):
    server = hdx(csv_bytes(base_rows()))
    assert pipeline.run("wfp")["status"] == "ok"
    tokens = saved_tokens()
    assert len(tokens) == 1
    assert json.loads(tokens[0])["hash"] == server.declared
    pipeline.run("wfp")                              # skipped runs do not add a token
    assert len(saved_tokens()) == 1


def test_real_series_replaces_synthetic(hdx):
    seed_synthetic(["ncr"], ["rice"])
    hdx(csv_bytes(base_rows()))
    assert pipeline.run("wfp")["status"] == "ok"
    assert sources_for("ncr", "rice") == {"real"}
    with store.connect() as con:
        first, last = con.execute("SELECT MIN(date), MAX(date) FROM prices WHERE province='ncr' AND commodity='rice'").fetchone()
    assert (first, last) == ("2019-01-14", "2026-10-12")   # Mondays of the first and last observation


def test_short_series_stays_observations_only(hdx):
    seed_synthetic(["cebu"], ["tomato"])
    hdx(csv_bytes(base_rows()))
    assert pipeline.run("wfp")["status"] == "ok"
    assert sources_for("cebu", "tomato") == {"synthetic"}
    with store.connect() as con:
        assert con.execute("SELECT COUNT(*) FROM observations WHERE province='cebu' AND commodity='tomato'").fetchone()[0] > 0


def test_stale_series_stays_observations_only(hdx):
    seed_synthetic(["cebu"], ["onion"])
    hdx(csv_bytes(base_rows()))
    assert pipeline.run("wfp")["status"] == "ok"
    assert sources_for("cebu", "onion") == {"synthetic"}
    with store.connect() as con:
        assert con.execute("SELECT COUNT(*) FROM observations WHERE province='cebu' AND commodity='onion'").fetchone()[0] > 0


# ---------------------------------------------------------------- spare real data
def test_simulate_appends_only_to_synthetic_series(hdx):
    seed_synthetic(["ncr", "cebu"], ["rice", "tomato"])
    hdx(csv_bytes(base_rows()))
    assert pipeline.run("wfp")["status"] == "ok"        # ncr/rice becomes real
    assert pipeline.run("simulate")["status"] == "ok"
    assert sources_for("ncr", "rice") == {"real"}
    assert sources_for("ncr", "tomato") == {"synthetic"}
    with store.connect() as con:
        new_week = con.execute("SELECT province, commodity, source FROM prices WHERE date = '2026-11-02'").fetchall()
    assert {(r[0], r[1]) for r in new_week} == {("ncr", "tomato"), ("cebu", "rice"), ("cebu", "tomato")}
    assert {r[2] for r in new_week} == {"synthetic"}


def test_seed_keeps_real_rows_and_observations(hdx):
    hdx(csv_bytes(base_rows()))
    assert pipeline.run("wfp")["status"] == "ok"
    real_before, obs_before = real_state(), db_state()[1]
    assert pipeline.run("seed")["status"] == "ok"
    assert real_state() == real_before                   # every real row is unchanged
    assert db_state()[1] == obs_before                   # and so is every observation
    assert sources_for("ncr", "rice") == {"real"}
    assert sources_for("ncr", "tomato") == {"synthetic"}


# ---------------------------------------------------------------- migration
OLD_PRICES = ("CREATE TABLE prices(date TEXT NOT NULL, province TEXT NOT NULL, region TEXT, market TEXT, "
              "commodity TEXT NOT NULL, price REAL NOT NULL{extra}, PRIMARY KEY(date, province, commodity));")
OLD_RUNS = ("CREATE TABLE pipeline_runs(id INTEGER PRIMARY KEY AUTOINCREMENT, started TEXT, finished TEXT, "
            "mode TEXT, source TEXT, status TEXT, rows_added INTEGER, message TEXT, log TEXT);")


@pytest.mark.parametrize("extra", ["", ", source TEXT"], ids=["no-source-column", "nullable-source-column"])
def test_migration_is_idempotent_on_old_schema(extra):
    path = store.DB_PATH
    with sqlite3.connect(path) as con:
        con.executescript(OLD_PRICES.format(extra=extra) + OLD_RUNS)
        cols = "date, province, commodity, price" + (", source" if extra else "")
        values = [("2026-10-12", "ncr", "rice", 40.0), ("2026-10-12", "cebu", "tomato", 60.0),
                  ("2026-10-12", "bohol", "eggs", 8.0)]
        labels = ["sample", "wfp", None] if extra else [None, None, None]
        for (d, p, c, v), lab in zip(values, labels):
            if extra:
                con.execute(f"INSERT INTO prices({cols}) VALUES (?,?,?,?,?)", (d, p, c, v, lab))
            else:
                con.execute(f"INSERT INTO prices({cols}) VALUES (?,?,?,?)", (d, p, c, v))
        con.execute("INSERT INTO pipeline_runs(started, mode, source, status) VALUES ('t', 'live', 'wfp', 'ok')")

    store.init_db()
    store.init_db()                                       # second start must change nothing
    with store.connect() as con:
        assert "source" in {r["name"] for r in con.execute("PRAGMA table_info(prices)")}
        assert "source_token" in {r["name"] for r in con.execute("PRAGMA table_info(pipeline_runs)")}
        assert con.execute("SELECT COUNT(*) FROM observations").fetchone()[0] == 0
        assert [tuple(r) for r in con.execute("SELECT source, COUNT(*) FROM prices GROUP BY source")] == [("synthetic", 3)]
        assert con.execute("SELECT COUNT(*) FROM pipeline_runs WHERE source_token IS NULL").fetchone()[0] == 1
    with store.connect() as con:
        assert store.migrate(con) == 0


def test_fresh_schema_defaults_source_to_synthetic():
    store.init_db()
    with store.connect() as con:
        con.execute("INSERT INTO prices(date, province, commodity, price) VALUES ('2026-10-12', 'ncr', 'rice', 40)")
        assert con.execute("SELECT source FROM prices").fetchone()[0] == "synthetic"


# ---------------------------------------------------------------- inbox
def weekly_csv(path, province, commodity, weeks, start="2024-01-01"):
    dates = pd.date_range(start, periods=weeks, freq="W-MON")
    pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "province": province, "commodity": commodity,
                  "price": [50 + i * 0.1 for i in range(weeks)]}).to_csv(path, index=False)


def test_inbox_skips_short_unknown_and_never_overwrites_real(hdx):
    hdx(csv_bytes(base_rows()))
    assert pipeline.run("wfp")["status"] == "ok"        # ncr/rice is real
    os.makedirs(pipeline.INBOX_DIR, exist_ok=True)
    weekly_csv(os.path.join(pipeline.INBOX_DIR, "long.csv"), "ncr", "tomato", 130)
    weekly_csv(os.path.join(pipeline.INBOX_DIR, "real_clash.csv"), "ncr", "rice", 130)
    weekly_csv(os.path.join(pipeline.INBOX_DIR, "short.csv"), "cebu", "tomato", 40)
    weekly_csv(os.path.join(pipeline.INBOX_DIR, "names.csv"), "Metro Manila", "tomato", 130)

    rep = pipeline.run("inbox")
    assert rep["status"] == "ok"
    assert "1 series stored" in rep["message"]
    assert "1 skipped because real data exists" in rep["message"]
    assert "1 shorter than 110 weeks" in rep["message"]
    assert sources_for("ncr", "tomato") == {"inbox"}
    assert sources_for("ncr", "rice") == {"real"}
    assert sources_for("cebu", "tomato") == set()
    assert sources_for("Metro Manila", "tomato") == set()
    assert sorted(f for f in os.listdir(pipeline.INBOX_DIR) if f.endswith(".done")) == [
        "long.csv.done", "names.csv.done", "real_clash.csv.done", "short.csv.done"]


# ---------------------------------------------------------------- API and run control
def test_meta_data_version_changes_after_real_load(hdx, monkeypatch):
    monkeypatch.setenv("MERCADO_WARM", "0")
    monkeypatch.delenv("MERCADO_SCHEDULER", raising=False)
    with TestClient(app) as client:
        first = client.get("/api/v1/meta").json()
        hdx(csv_bytes(base_rows()))
        assert pipeline.run("wfp")["status"] == "ok"
        after = client.get("/api/v1/meta").json()
    assert after["data_version"] != first["data_version"]
    assert after["last_updated"]
    assert "last_updated" in first


def test_scheduler_is_opt_in(monkeypatch):
    monkeypatch.setenv("MERCADO_WARM", "0")
    monkeypatch.delenv("MERCADO_SCHEDULER", raising=False)
    with TestClient(app):
        assert scheduler.info()["running"] is False


def test_run_lock_returns_409():
    assert pipeline._run_lock.acquire(blocking=False)
    try:
        resp = TestClient(app).post("/api/v1/pipeline/run", json={"mode": "simulate"})
        assert resp.status_code == 409
    finally:
        pipeline._run_lock.release()
