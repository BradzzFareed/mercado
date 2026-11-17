"""SQLite storage + weekly series access."""
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import date
import numpy as np
import pandas as pd

DATA_DIR = os.environ.get("MERCADO_DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data"))
DB_PATH = os.path.join(DATA_DIR, "mercado.db")
_lock = threading.RLock()
_cache = {"df": None, "index": None}

# prices.source: real (WFP, written by the loader) | synthetic (sample generator) | inbox (CSV inbox).
# Older databases may still hold 'sample' or 'wfp' labels; migrate() relabels them to 'synthetic'.
SCHEMA = """
CREATE TABLE IF NOT EXISTS prices(
  date TEXT NOT NULL, province TEXT NOT NULL, region TEXT, market TEXT,
  commodity TEXT NOT NULL, price REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'synthetic',
  PRIMARY KEY(date, province, commodity)
);
CREATE TABLE IF NOT EXISTS pipeline_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, started TEXT, finished TEXT, mode TEXT,
  source TEXT, status TEXT, rows_added INTEGER, message TEXT, log TEXT,
  source_token TEXT
);
CREATE TABLE IF NOT EXISTS observations(
  province TEXT NOT NULL, commodity TEXT NOT NULL, market TEXT NOT NULL,
  obs_date TEXT NOT NULL, price REAL NOT NULL, unit TEXT,
  PRIMARY KEY(province, commodity, market, obs_date)
);
"""
PRICE_COLS = ["date", "province", "region", "market", "commodity", "price", "source"]
OBS_COLS = ["province", "commodity", "market", "obs_date", "price", "unit"]


def connect():
    os.makedirs(DATA_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    return con


def _columns(con, table):
    return {r["name"] for r in con.execute(f"PRAGMA table_info({table})")}


def migrate(con):
    """Bring an older database up to the current schema. Safe to run on every start.

    Adds prices.source and pipeline_runs.source_token only when they are missing, then relabels legacy
    source values to 'synthetic'. That label is a default for rows whose origin was never recorded.
    Returns the number of rows relabeled.
    """
    if "source" not in _columns(con, "prices"):
        con.execute("ALTER TABLE prices ADD COLUMN source TEXT NOT NULL DEFAULT 'synthetic'")
    if "source_token" not in _columns(con, "pipeline_runs"):
        con.execute("ALTER TABLE pipeline_runs ADD COLUMN source_token TEXT")
    return con.execute(
        "UPDATE prices SET source = 'synthetic' WHERE source IS NULL OR source IN ('sample', 'wfp')"
    ).rowcount


def init_db():
    with _lock, connect() as con:
        con.executescript(SCHEMA)
        migrate(con)


@contextmanager
def transaction():
    """One write transaction: commits on success, rolls back on any error, drops the price cache."""
    with _lock:
        con = connect()
        con.isolation_level = None
        try:
            con.execute("BEGIN IMMEDIATE")
            yield con
            con.execute("COMMIT")
        except BaseException:
            if con.in_transaction:
                con.execute("ROLLBACK")
            raise
        finally:
            _cache["df"] = None
            _cache["index"] = None
            con.close()


def count_rows():
    with _lock, connect() as con:
        return con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]


def _price_rows(df):
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return list(df[PRICE_COLS].itertuples(index=False, name=None))


def _insert_prices(con, df):
    if df is None or df.empty:
        return 0
    rows = _price_rows(df)
    con.executemany("INSERT OR REPLACE INTO prices VALUES (?,?,?,?,?,?,?)", rows)
    return len(rows)


def upsert_prices(df, con=None):
    """Insert or replace price rows. Returns the number of rows written."""
    if con is not None:
        return _insert_prices(con, df)
    with transaction() as tx:
        return _insert_prices(tx, df)


def replace_series(con, df, keys):
    """Delete every prices row of the (province, commodity) keys, then insert df. Returns rows written."""
    con.execute("CREATE TEMP TABLE IF NOT EXISTS series_keys(province TEXT, commodity TEXT, PRIMARY KEY(province, commodity))")
    con.execute("DELETE FROM series_keys")
    con.executemany("INSERT INTO series_keys VALUES (?,?)", list(keys))
    con.execute("DELETE FROM prices WHERE EXISTS (SELECT 1 FROM series_keys k "
                "WHERE k.province = prices.province AND k.commodity = prices.commodity)")
    return _insert_prices(con, df)


def insert_observations(con, df):
    """Raw mapped retail observations. df.obs_date is a datetime column; prices stay in native units."""
    if df is None or df.empty:
        return 0
    rows = list(df.assign(obs_date=df["obs_date"].dt.strftime("%Y-%m-%d"))[OBS_COLS].itertuples(index=False, name=None))
    con.executemany("INSERT OR REPLACE INTO observations VALUES (?,?,?,?,?,?)", rows)
    return len(rows)


def delete_source(con, source):
    """Delete every row of `source`; NULL-source rows belong to 'synthetic'."""
    con.execute("DELETE FROM prices WHERE COALESCE(source, 'synthetic') = ?", (source,))


def series_keys_with(con, *sources):
    """(province, commodity) pairs that hold at least one row from any of the given sources (NULL reads as synthetic)."""
    marks = ",".join("?" * len(sources))
    rows = con.execute(f"SELECT DISTINCT province, commodity FROM prices "
                       f"WHERE COALESCE(source, 'synthetic') IN ({marks})", sources)
    return {(r[0], r[1]) for r in rows}


def synthetic_only_keys(con):
    """(province, commodity) pairs whose every row is synthetic (NULL counts as synthetic)."""
    rows = con.execute("SELECT province, commodity FROM prices GROUP BY province, commodity "
                       "HAVING SUM(COALESCE(source, 'synthetic') != 'synthetic') = 0")
    return {(r[0], r[1]) for r in rows}


def max_date(con, source=None):
    if source is None:
        row = con.execute("SELECT MAX(date) FROM prices").fetchone()
    else:
        # Reads treat a NULL source as 'synthetic' (databases migrated from the old schema).
        row = con.execute("SELECT MAX(date) FROM prices WHERE COALESCE(source, 'synthetic') = ?", (source,)).fetchone()
    return date.fromisoformat(row[0]) if row[0] else None


def load():
    """Price rows as a DataFrame (cached). NULL sources are normalised to 'synthetic'.

    Reads only what the series/tier code needs (region/market live in the geo registry) through a
    plain connection (the Row factory slows bulk fetches), and keeps `date` as ISO strings until a
    series needs a DatetimeIndex - converting 800k dates up front costs a third of the first load.
    """
    with _lock:
        if _cache["df"] is None:
            con = sqlite3.connect(DB_PATH, timeout=30)
            try:
                df = pd.read_sql_query(
                    "SELECT date, province, commodity, price, COALESCE(source, 'synthetic') AS source FROM prices", con)
            finally:
                con.close()
            _cache["df"] = df
        return _cache["df"]


def invalidate():
    _cache["df"] = None
    _cache["index"] = None


def last_date():
    df = load()
    return None if df.empty else date.fromisoformat(df["date"].max())


def interpolate_weekly(s):
    """Dated points -> weekly (Monday) grid: mean per date, W-MON resample, gaps up to 8 weeks filled."""
    s = s.groupby(level=0).mean().sort_index()
    return s.resample("W-MON").mean().interpolate(limit=8, limit_area="inside").dropna()


def series_view():
    """(province, commodity)-keyed view of the price frame, cached alongside load().

    One sort at first use instead of a full-frame scan per series lookup; read-only after build.
    """
    with _lock:
        df = load()
        if _cache["index"] is None:
            _cache["index"] = df.set_index(["province", "commodity"]).sort_index()
        return _cache["index"]


def series(province, commodity):
    """Weekly (Monday) price series, gaps interpolated. Raises ValueError if too short."""
    view = series_view()
    if (province, commodity) not in view.index:
        raise ValueError(f"no data for {province}/{commodity}")
    s = view.loc[(province, commodity)]
    s = interpolate_weekly(s.set_index(pd.to_datetime(s["date"]))["price"])
    if len(s) < 110:
        raise ValueError(f"need at least 110 weeks of history for {province}/{commodity}, have {len(s)}")
    return s


def available():
    df = load()
    if df.empty:
        return {"provinces": [], "commodities": [], "start": None, "end": None, "rows": 0}
    return {
        "provinces": sorted(df["province"].unique().tolist()),
        "commodities": sorted(df["commodity"].unique().tolist()),
        "start": df["date"].min(),
        "end": df["date"].max(),
        "rows": int(len(df)),
        "sources": df.groupby("source")["price"].count().to_dict(),
    }


# ---------------------------------------------------------------- tier reads
def price_series_index(con):
    """Per (province, commodity): the set of sources, weekly point count and last price date.

    One grouped query over prices; NULL sources read as 'synthetic'. Returns
    {(province, commodity): {"sources": set, "n_weeks": int, "last_price": str}}.
    """
    rows = con.execute("SELECT province, commodity, COALESCE(source, 'synthetic') AS src, "
                       "COUNT(*) AS n, MAX(date) AS last_price FROM prices "
                       "GROUP BY province, commodity, src")
    out = {}
    for r in rows:
        e = out.setdefault((r["province"], r["commodity"]), {"sources": set(), "n_weeks": 0, "last_price": r["last_price"]})
        e["sources"].add(r["src"])
        e["n_weeks"] += r["n"]
        e["last_price"] = max(e["last_price"], r["last_price"])
    return out


def observation_stats(con):
    """Per (province, commodity): distinct observation months and first/last observation date."""
    rows = con.execute("SELECT province, commodity, COUNT(DISTINCT substr(obs_date, 1, 7)) AS n_months, "
                       "MIN(obs_date) AS first_obs, MAX(obs_date) AS last_obs FROM observations "
                       "GROUP BY province, commodity")
    return {(r["province"], r["commodity"]): dict(n_months=r["n_months"], first_obs=r["first_obs"], last_obs=r["last_obs"])
            for r in rows}


def max_observation_date(con):
    """Latest observation date in the dataset (any market), or None."""
    row = con.execute("SELECT MAX(obs_date) FROM observations").fetchone()
    return date.fromisoformat(row[0]) if row[0] else None


def observation_history(con, province, commodity):
    """Mean observed price per observation date, oldest first: [(date, price)]."""
    rows = con.execute("SELECT obs_date, AVG(price) AS price FROM observations "
                       "WHERE province = ? AND commodity = ? GROUP BY obs_date ORDER BY obs_date",
                       (province, commodity))
    return [(date.fromisoformat(r["obs_date"]), float(r["price"])) for r in rows]
