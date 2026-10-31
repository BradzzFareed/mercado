"""Automated data pipeline: fetch -> clean & map -> store -> (forecasts retrain lazily).

Modes (see README): live, wfp, inbox, da, simulate, seed.
  * wfp       WFP Philippines Food Prices from HDX (CKAN API -> CSV). Implemented, needs internet.
  * inbox     CSVs dropped into data/inbox/ (columns: date, province, commodity, price). Implemented.
  * da        DA price monitoring: scaffold only (finds report links; PDF parsing is left to implement).
  * simulate  Appends one synthetic week so forecasts can be shown updating offline.
  * seed      Reloads the full synthetic history.
"""
import glob
import io
import json
import os
import re
import threading
import urllib.request
from datetime import date, datetime, timedelta

import pandas as pd

from . import store, geo, commodities as cm, sample_data, forecast

HDX_API = "https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-philippines"
DA_URL = "https://www.da.gov.ph/price-monitoring/"
UA = {"User-Agent": "Mercado-student-project/1.0"}
REPLACE_MIN_WEEKS = 110          # a live series must be this long to replace a sample series

INBOX_DIR = os.path.join(store.DATA_DIR, "inbox")
LIVE_DIR = os.path.join(store.DATA_DIR, "live")
STATE_PATH = os.path.join(LIVE_DIR, "pipeline_state.json")

SOURCES = [
    dict(id="wfp", name="WFP Philippines Food Prices (HDX)", via="HDX CKAN API, CSV", state="implemented"),
    dict(id="inbox", name="CSV inbox (PSA OpenSTAT / BetterGov exports)", via="Drop files in backend/data/inbox/", state="implemented"),
    dict(id="da", name="DA daily price monitoring", via="PDF bulletins (parser to implement)", state="scaffold"),
]
MODES = ("live", "wfp", "inbox", "da", "simulate", "seed")

_run_lock = threading.Lock()


# ---------------------------------------------------------------- cleaning
def _monday(d):
    d = pd.Timestamp(d).normalize()
    return d - pd.Timedelta(days=d.weekday())


def _unit_factor(unit, target_unit):
    """Multiply a WFP price by this to get price per Mercado unit (kg or dozen). None = cannot convert."""
    u = str(unit or "").strip().lower()
    m = re.match(r"^(\d+(?:\.\d+)?)?\s*(kg|g|pcs?|pieces?|units?|dozen|doz)$", u)
    if not m:
        return None
    qty = float(m.group(1)) if m.group(1) else 1.0
    kind = m.group(2)
    if target_unit == "kg":
        if kind == "kg":
            return 1.0 / qty
        if kind == "g":
            return 1000.0 / qty
        return None
    if target_unit == "dozen":
        if kind.startswith(("pc", "piece", "unit")):
            return 12.0 / qty
        if kind.startswith("doz"):
            return 1.0 / qty
    return None


def normalize_wfp(raw: pd.DataFrame):
    """WFP CSV frame -> weekly Mercado rows. Returns (rows, skipped). Skips the HXL tag row."""
    df = raw.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    need = {"date", "admin1", "commodity", "market", "price", "unit"}
    missing = sorted(need - set(df.columns))
    if missing:
        raise ValueError(f"CSV is missing expected WFP columns: {missing}")
    df = df[~df["date"].astype(str).str.startswith("#")]
    if "pricetype" in df.columns:
        df = df[df["pricetype"].astype(str).str.lower().str.contains("retail")]
    out, skipped = [], 0
    for row in df.to_dict("records"):
        cid = cm.match_commodity(str(row.get("commodity")))
        pid = geo.match_province(row.get("admin2"), row.get("market"), row.get("admin1"))
        try:
            price = float(row.get("price"))
            when = pd.to_datetime(row.get("date"))
        except (TypeError, ValueError):
            skipped += 1
            continue
        if cid is None or pid is None or pd.isna(when) or price <= 0:
            skipped += 1
            continue
        f = _unit_factor(row.get("unit"), cm.BY_ID[cid]["unit"])
        if f is None:
            skipped += 1
            continue
        out.append((_monday(when), pid, cid, price * f))
    if not out:
        return pd.DataFrame(columns=["date", "province", "region", "market", "commodity", "price", "source"]), skipped
    g = pd.DataFrame(out, columns=["date", "province", "commodity", "price"])
    g = g.groupby(["date", "province", "commodity"], as_index=False)["price"].mean()
    g["price"] = g["price"].round(2)
    g["region"] = g["province"].map(lambda p: geo.BY_ID[p]["region"])
    g["market"] = g["province"].map(lambda p: geo.BY_ID[p]["market"])
    g["source"] = "wfp"
    return g[["date", "province", "region", "market", "commodity", "price", "source"]], skipped


# ---------------------------------------------------------------- applying
def apply_live(rows: pd.DataFrame, replace_min_weeks=REPLACE_MIN_WEEKS):
    """Store live rows. Long series replace the sample series; short ones are skipped (or upserted if
    replace_min_weeks is None). Returns (rows_added, series_replaced, series_skipped)."""
    added = replaced = skipped = 0
    if rows is None or rows.empty:
        return 0, 0, 0
    keep = []
    for (p, c), g in rows.groupby(["province", "commodity"]):
        weeks = (g["date"].max() - g["date"].min()).days // 7 + 1
        if replace_min_weeks is None:
            keep.append(g)
        elif weeks >= replace_min_weeks:
            with store._lock, store.connect() as con:
                con.execute("DELETE FROM prices WHERE province=? AND commodity=?", (p, c))
            keep.append(g); replaced += 1
        else:
            skipped += 1
    if keep:
        added = store.upsert_prices(pd.concat(keep, ignore_index=True))
    store.invalidate(); forecast.clear_cache()
    return int(added), replaced, skipped


# ---------------------------------------------------------------- sources
def _http(url, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def fetch_wfp(log):
    log("Asking HDX for the WFP Philippines dataset…")
    meta = json.loads(_http(HDX_API))
    res = [r for r in meta["result"]["resources"] if str(r.get("format", "")).lower() == "csv"]
    res.sort(key=lambda r: ("phl" not in str(r.get("name", "")).lower(), "qc" in str(r.get("name", "")).lower()))
    if not res:
        raise RuntimeError("no CSV resource found in the HDX dataset")
    url = res[0].get("download_url") or res[0]["url"]
    log(f"Downloading {url.rsplit('/', 1)[-1]}…")
    text = _http(url, timeout=120).decode("utf-8", "replace")
    os.makedirs(LIVE_DIR, exist_ok=True)
    with open(os.path.join(LIVE_DIR, "wfp_raw.csv"), "w", encoding="utf-8") as fh:
        fh.write(text)
    return pd.read_csv(io.StringIO(text), low_memory=False)


class DASource:
    """Scaffold: DA publishes daily price bulletins as PDFs. find_reports() lists them;
    parse() is where a PDF table extractor (pdfplumber, camelot...) would go."""

    @staticmethod
    def find_reports():
        html = _http(DA_URL).decode("utf-8", "replace")
        return sorted(set(re.findall(r'href="([^"]+\.pdf)"', html, flags=re.I)))

    @staticmethod
    def parse(path):
        raise NotImplementedError("Implement DA PDF table parsing here and return rows like normalize_wfp().")


def read_inbox(log):
    os.makedirs(INBOX_DIR, exist_ok=True)
    files = sorted(glob.glob(os.path.join(INBOX_DIR, "*.csv")))
    frames = []
    for f in files:
        df = pd.read_csv(f)
        df.columns = [c.strip().lower() for c in df.columns]
        miss = {"date", "province", "commodity", "price"} - set(df.columns)
        if miss:
            log(f"{os.path.basename(f)}: skipped, missing columns {sorted(miss)}")
            continue
        df["province"] = df["province"].map(lambda v: v if v in geo.BY_ID else geo.match_province(v))
        df["commodity"] = df["commodity"].map(lambda v: v if v in cm.BY_ID else cm.match_commodity(v))
        bad = df["province"].isna() | df["commodity"].isna() | ~(pd.to_numeric(df["price"], errors="coerce") > 0)
        if bad.any():
            log(f"{os.path.basename(f)}: {int(bad.sum())} rows skipped (unknown market/commodity or bad price)")
        df = df[~bad].copy()
        df["date"] = df["date"].map(_monday)
        df["price"] = pd.to_numeric(df["price"]).round(2)
        df["region"] = df["province"].map(lambda p: geo.BY_ID[p]["region"])
        df["market"] = df["province"].map(lambda p: geo.BY_ID[p]["market"])
        df["source"] = "inbox"
        frames.append(df[["date", "province", "region", "market", "commodity", "price", "source"]])
        os.replace(f, f + ".done")
        log(f"{os.path.basename(f)}: {len(df)} rows read")
    return pd.concat(frames, ignore_index=True) if frames else None


# ---------------------------------------------------------------- run
def _persist(rep):
    with store._lock, store.connect() as con:
        con.execute("INSERT INTO pipeline_runs(started, finished, mode, source, status, rows_added, message, log) VALUES (?,?,?,?,?,?,?,?)",
                    (rep["started"], rep["finished"], rep["mode"], rep["source"], rep["status"], rep["rows_added"],
                     rep["message"], json.dumps(rep["log"])))
    try:
        os.makedirs(LIVE_DIR, exist_ok=True)
        with open(STATE_PATH, "w") as fh:
            json.dump(dict(last_run=rep["finished"], last_status=rep["status"], last_summary=rep["message"],
                           log=[dict(t=l[:8], level="info", msg=l[9:]) for l in rep["log"]]), fh)
    except OSError:
        pass


def run(mode="live"):
    """Run one pipeline cycle. Never raises: failures come back as status 'error' with a message."""
    if mode not in MODES:
        return dict(status="error", message=f"Unknown mode '{mode}'. Use one of: {', '.join(MODES)}.", log=[], rows_added=0, mode=mode, source="-")
    if not _run_lock.acquire(blocking=False):
        return dict(status="error", message="A pipeline run is already in progress.", log=[], rows_added=0, mode=mode, source="-")
    started = datetime.now().isoformat(timespec="seconds")
    lines = []

    def log(msg):
        lines.append(f"{datetime.now().strftime('%H:%M:%S')} {msg}")

    added, source, status, message = 0, mode, "ok", ""
    try:
        store.init_db()
        log(f"Pipeline started ({mode})")
        if mode == "simulate":
            last = store.last_date() or sample_data.DEFAULT_END
            rows = sample_data.next_week_rows(last)
            added = store.upsert_prices(rows); source = "sample"
            store.invalidate(); forecast.clear_cache()
            message = f"Added the week of {(last + timedelta(weeks=1)).isoformat()}: {added} new prices. Forecasts will refresh."
            log(message)
        elif mode == "seed":
            store.reset_prices()
            added = store.upsert_prices(sample_data.generate()); source = "sample"
            store.invalidate(); forecast.clear_cache()
            message = f"Reloaded the sample history ({added:,} rows)."
            log(message)
        else:
            order = ["wfp", "inbox", "da"] if mode == "live" else [mode]
            notes = []
            for src in order:
                try:
                    if src == "wfp":
                        raw = fetch_wfp(log)
                        rows, skipped = normalize_wfp(raw)
                        log(f"Mapped {len(rows):,} weekly prices ({skipped:,} source rows skipped: unmapped item, market or unit)")
                        n, rep_n, skip_n = apply_live(rows)
                        log(f"Stored {n:,} rows; {rep_n} series replaced sample data, {skip_n} too short to replace")
                        added += n
                    elif src == "inbox":
                        rows = read_inbox(log)
                        if rows is None:
                            log("Inbox is empty")
                        else:
                            n, _, _ = apply_live(rows, replace_min_weeks=None)
                            log(f"Stored {n:,} new rows from the inbox"); added += n
                    elif src == "da":
                        links = DASource.find_reports()
                        log(f"DA page lists {len(links)} PDF reports; the PDF parser is a scaffold, nothing imported")
                except Exception as e:  # a failing source must not stop the others
                    notes.append(f"{src}: {type(e).__name__}")
                    log(f"{src} failed: {type(e).__name__}: {str(e)[:120]}")
            source = "+".join(order) if mode == "live" else mode
            if added:
                message = f"Stored {added:,} new prices."
            else:
                status = "no_update"
                message = "No new data. " + ("Sources unreachable or empty (" + ", ".join(notes) + "); kept the existing data." if notes else "Nothing new to import.")
        log("Done")
    except Exception as e:
        status, message = "error", f"{type(e).__name__}: {e}"
        log("Failed: " + message)
    finally:
        _run_lock.release()
    rep = dict(started=started, finished=datetime.now().isoformat(timespec="seconds"), mode=mode, source=source,
               status=status, rows_added=int(added), message=message, log=lines)
    try:
        _persist(rep)
    except Exception:
        pass
    return rep


def recent_runs(limit=12):
    with store._lock, store.connect() as con:
        rows = con.execute("SELECT id, started, finished, mode, source, status, rows_added, message FROM pipeline_runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]
