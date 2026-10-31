"""SQLite storage + weekly series access."""
import os
import sqlite3
import threading
from datetime import date
import numpy as np
import pandas as pd

DATA_DIR = os.environ.get("MERCADO_DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data"))
DB_PATH = os.path.join(DATA_DIR, "mercado.db")
_lock = threading.RLock()
_cache = {"df": None}

SCHEMA = """
CREATE TABLE IF NOT EXISTS prices(
  date TEXT NOT NULL, province TEXT NOT NULL, region TEXT, market TEXT,
  commodity TEXT NOT NULL, price REAL NOT NULL, source TEXT,
  PRIMARY KEY(date, province, commodity)
);
CREATE TABLE IF NOT EXISTS pipeline_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, started TEXT, finished TEXT, mode TEXT,
  source TEXT, status TEXT, rows_added INTEGER, message TEXT, log TEXT
);
"""


def connect():
    os.makedirs(DATA_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _lock, connect() as con:
        con.executescript(SCHEMA)


def count_rows():
    with _lock, connect() as con:
        return con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]


def upsert_prices(df):
    """Insert/replace rows. Returns the number of *new* (date, province, commodity) keys."""
    if df is None or df.empty:
        return 0
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    cols = ["date", "province", "region", "market", "commodity", "price", "source"]
    rows = list(df[cols].itertuples(index=False, name=None))
    with _lock, connect() as con:
        before = con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
        con.executemany("INSERT OR REPLACE INTO prices VALUES (?,?,?,?,?,?,?)", rows)
        after = con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
    _cache["df"] = None
    return after - before


def reset_prices():
    with _lock, connect() as con:
        con.execute("DELETE FROM prices")
    _cache["df"] = None


def load():
    """All prices as a DataFrame (cached)."""
    if _cache["df"] is None:
        with _lock, connect() as con:
            df = pd.read_sql_query("SELECT * FROM prices", con)
        df["date"] = pd.to_datetime(df["date"])
        _cache["df"] = df
    return _cache["df"]


def invalidate():
    _cache["df"] = None


def last_date():
    df = load()
    return None if df.empty else df["date"].max().date()


def series(province, commodity):
    """Weekly (Monday) price series, gaps interpolated. Raises ValueError if too short."""
    df = load()
    s = df[(df["province"] == province) & (df["commodity"] == commodity)]
    if s.empty:
        raise ValueError(f"no data for {province}/{commodity}")
    s = s.groupby("date")["price"].mean().sort_index()
    s = s.resample("W-MON").mean().interpolate(limit=8, limit_area="inside")
    s = s.dropna()
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
        "start": df["date"].min().date().isoformat(),
        "end": df["date"].max().date().isoformat(),
        "rows": int(len(df)),
        "sources": df.groupby("source")["price"].count().to_dict(),
    }
