"""Automated data pipeline: fetch -> map -> store -> (forecasts retrain lazily).

Modes (see README): live, wfp, inbox, da, simulate, seed.
  * wfp       WFP Philippines Food Prices via wfp.py: cheap token check, MD5-verified CSV, registry mapping.
  * inbox     CSVs dropped into data/inbox/ (columns: date, province, commodity, price; registry ids).
  * da        DA price monitoring: scaffold only (finds report links; PDF parsing is left to implement).
  * simulate  Appends one synthetic week so forecasts can be shown updating offline.
  * seed      Reloads the full synthetic history.

Network and parsing happen first; every mode then writes its data and its pipeline_runs row in one
transaction, so a failure leaves the database as it was and saves no source token.
"""
import glob
import io
import json
import os
import re
import threading
import urllib.request
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from . import store, geo, commodities as cm, sample_data, forecast, wfp
from .registry import load as load_registry

DA_URL = "https://www.da.gov.ph/price-monitoring/"
UA = {"User-Agent": "Mercado-student-project/1.0"}
REPLACE_MIN_WEEKS = 110          # a series must have this many weekly points to be written as real or inbox
HISTORY_START = "2019-01-01"     # observations before this date are not stored
STALE_MONTHS = 3                 # a series whose last observation is older than this stays observations-only
MULTI_MARKET_RULE = "mean"       # how markets in one province combine into one weekly price

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
_QUARANTINED = frozenset(r["market"] for r in load_registry("market_rules")["items"] if r["rule"] == "quarantine")


# ---------------------------------------------------------------- cleaning
def _monday(dates):
    d = pd.to_datetime(dates)
    return d - pd.to_timedelta(d.dt.day_of_week, unit="D")


def normalize_wfp(raw: pd.DataFrame):
    """WFP CSV frame -> (observations, stats).

    Retail rows only. Commodity: exact WFP label via commodities.by_wfp_label. Province: registry market
    rule first, then the admin2 lookup (geo.by_wfp_market). A row the registry cannot place is
    quarantined and counted by market or pair, never guessed. Units stay native. The HXL tag row is skipped.
    """
    df = raw.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    need = {"date", "admin2", "market", "commodity", "price", "unit", "pricetype"}
    missing = sorted(need - set(df.columns))
    if missing:
        raise ValueError(f"CSV is missing expected WFP columns: {missing}")
    stats = dict(rows=len(df))
    hxl = df["date"].astype(str).str.startswith("#")
    stats["hxl"] = int(hxl.sum())
    df = df[~hxl]
    retail = df["pricetype"].astype(str).str.strip().str.lower() == "retail"
    stats["non_retail"] = int((~retail).sum())
    df = df[retail]
    when = pd.to_datetime(df["date"], errors="coerce")
    price = pd.to_numeric(df["price"], errors="coerce")
    ok = when.notna() & price.gt(0)
    stats["invalid"] = int((~ok).sum())
    df = df[ok].assign(obs_date=when[ok], price=price[ok])
    stats["max_obs_date"] = df["obs_date"].max().date().isoformat() if len(df) else None
    early = df["obs_date"] < pd.Timestamp(HISTORY_START)
    stats["before_history"] = int(early.sum())
    df = df[~early]
    commodity_id = df["commodity"].astype(str).map(lambda x: (cm.by_wfp_label(x) or {}).get("id"))
    unknown = Counter(df.loc[commodity_id.isna(), "commodity"].astype(str))
    stats["unknown_labels"] = dict(unknown)
    stats["unknown_label_rows"] = sum(unknown.values())
    df = df.assign(commodity=commodity_id)[commodity_id.notna()]
    province, quarantined, unmapped = [], Counter(), Counter()
    for admin2, market in zip(df["admin2"], df["market"]):
        pid = geo.by_wfp_market(admin2, market)
        province.append(pid)
        if pid is None:
            name = str(market).strip()
            if name in _QUARANTINED:
                quarantined[name] += 1
            else:
                unmapped[f"{admin2} / {market}"] += 1
    df = df.assign(province=province)
    df = df[df["province"].notna()].assign(market=lambda d: d["market"].astype(str).str.strip())
    obs = df.groupby(["province", "commodity", "market", "obs_date"], as_index=False).agg(
        price=("price", "mean"), unit=("unit", "first"))
    stats["quarantined_rows"] = sum(quarantined.values())
    stats["quarantined_by_market"] = dict(quarantined)
    stats["unmapped_rows"] = sum(unmapped.values())
    stats["unmapped_by_pair"] = dict(unmapped)
    stats["duplicate_keys_averaged"] = int(len(df) - len(obs))
    stats["observations"] = len(obs)
    return obs, stats


def _price_frame(weekly, pid, cid, source):
    p = geo.BY_ID[pid]
    return pd.DataFrame({"date": weekly.index, "province": pid, "region": p["region"], "market": p["market"],
                         "commodity": cid, "price": weekly.round(2).to_numpy(), "source": source})


def _select(df, keys, inside=True):
    """Rows of df whose (province, commodity) is in keys (or outside them when inside=False)."""
    wanted = set(keys)
    mask = np.fromiter(((p, c) in wanted for p, c in zip(df["province"], df["commodity"])), dtype=bool, count=len(df))
    return df[mask] if inside else df[~mask]


@dataclass
class _WfpPlan:
    token: object
    observations: pd.DataFrame
    real_rows: pd.DataFrame
    real_keys: list
    counts: dict
    stats: dict


def build_wfp_plan(raw: pd.DataFrame, token):
    """Pure: WFP CSV frame -> the observations to store and the weekly series that qualify as real."""
    obs, stats = normalize_wfp(raw)
    if obs.empty:
        raise ValueError("no mappable WFP retail rows since " + HISTORY_START)
    cutoff = pd.Timestamp(stats["max_obs_date"]) - pd.DateOffset(months=STALE_MONTHS)
    obs = obs.assign(monday=_monday(obs["obs_date"]))
    frames, keys = [], []
    counts = dict(real=0, short=0, stale=0, real_observations=0, short_observations=0, stale_observations=0)
    for (pid, cid), g in obs.groupby(["province", "commodity"]):
        weekly = store.interpolate_weekly(pd.Series(g["price"].to_numpy(), index=pd.DatetimeIndex(g["monday"])))
        if len(weekly) < REPLACE_MIN_WEEKS:
            kind = "short"
        elif g["obs_date"].max() < cutoff:
            kind = "stale"
        else:
            kind = "real"
            keys.append((pid, cid))
            frames.append(_price_frame(weekly, pid, cid, "real"))
        counts[kind] += 1
        counts[f"{kind}_observations"] += len(g)
    real_rows = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=store.PRICE_COLS)
    return _WfpPlan(token=token, observations=obs[store.OBS_COLS], real_rows=real_rows,
                    real_keys=keys, counts=counts, stats=stats)


# ---------------------------------------------------------------- sources
def _http(url, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


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


def _stored_wfp_token():
    """Token of the last successful run that loaded WFP, or None."""
    with store._lock, store.connect() as con:
        row = con.execute("SELECT source_token FROM pipeline_runs WHERE status = 'ok' AND source_token IS NOT NULL "
                          "ORDER BY id DESC LIMIT 1").fetchone()
    return wfp.RemoteToken(**json.loads(row["source_token"])) if row else None


def _prepare_wfp(log):
    """Returns (load, None), or (None, skip_note) when HDX reports the file unchanged."""
    log("Asking HDX for the WFP food-prices resource…")
    remote = wfp.fetch_remote_token()
    stored = _stored_wfp_token()
    if not wfp.token_changed(remote, stored):
        return None, f"Skipped, unchanged: HDX still lists the file modified {remote.last_modified}."
    log(f"HDX file changed (modified {remote.last_modified}); downloading…")
    payload = wfp.download_verified(remote)
    log(f"Downloaded {len(payload):,} bytes; MD5 matches HDX ({remote.hash})")
    os.makedirs(LIVE_DIR, exist_ok=True)
    with open(os.path.join(LIVE_DIR, "wfp_raw.csv"), "wb") as fh:
        fh.write(payload)
    plan = build_wfp_plan(pd.read_csv(io.BytesIO(payload), low_memory=False), remote)
    s, c = plan.stats, plan.counts
    log(f"Retail rows: {s['rows'] - s['hxl'] - s['non_retail']:,} ({s['non_retail']:,} non-retail excluded); "
        f"{s['before_history']:,} before {HISTORY_START}; {s['invalid']:,} with bad date or price")
    log(f"Unknown WFP labels skipped: {s['unknown_label_rows']:,} rows, {len(s['unknown_labels'])} labels")
    log(f"Quarantined by market: {s['quarantined_rows']:,} rows {s['quarantined_by_market']}")
    log(f"Unmapped (no registry match): {s['unmapped_rows']:,} rows")
    log(f"Observations: {s['observations']:,}; series real {c['real']}, short {c['short']}, stale {c['stale']}")

    def write(con, lg):
        store.insert_observations(con, plan.observations)
        n = store.replace_series(con, plan.real_rows, plan.real_keys)
        return n, (f"WFP: {c['real']:,} series stored as real ({n:,} weekly prices); "
                   f"{c['short']} short and {c['stale']} stale series kept as observations only.")
    return _Load(write=write, token=remote), None


def _prepare_inbox(log):
    os.makedirs(INBOX_DIR, exist_ok=True)
    files = sorted(glob.glob(os.path.join(INBOX_DIR, "*.csv")))
    if not files:
        log("Inbox is empty")
        return None
    frames, parsed = [], []
    for f in files:
        name = os.path.basename(f)
        df = pd.read_csv(f)
        df.columns = [c.strip().lower() for c in df.columns]
        miss = {"date", "province", "commodity", "price"} - set(df.columns)
        if miss:
            log(f"{name}: skipped, missing columns {sorted(miss)}")
            continue
        known = df["province"].isin(list(geo.BY_ID)) & df["commodity"].isin(list(cm.BY_ID))
        when = pd.to_datetime(df["date"], errors="coerce")
        price = pd.to_numeric(df["price"], errors="coerce")
        ok = known & when.notna() & price.gt(0)
        log(f"{name}: {int((~known).sum())} rows with unknown ids, {int((known & ~ok).sum())} with bad date or price")
        frames.append(pd.DataFrame({"province": df.loc[ok, "province"], "commodity": df.loc[ok, "commodity"],
                                    "monday": _monday(when[ok]), "price": price[ok]}))
        parsed.append(f)
    if not frames:
        log("Inbox: no valid rows in any file")
        _mark_done(parsed)
        return None
    allrows = pd.concat(frames, ignore_index=True)
    keys, short, parts = [], 0, []
    for (pid, cid), g in allrows.groupby(["province", "commodity"]):
        weekly = store.interpolate_weekly(pd.Series(g["price"].to_numpy(), index=pd.DatetimeIndex(g["monday"])))
        if len(weekly) < REPLACE_MIN_WEEKS:
            short += 1
            continue
        keys.append((pid, cid))
        parts.append(_price_frame(weekly, pid, cid, "inbox"))
    rows = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=store.PRICE_COLS)

    def write(con, lg):
        real = store.series_keys_with(con, "real")
        blocked = [k for k in keys if k in real]
        keep = [k for k in keys if k not in real]
        n = store.replace_series(con, _select(rows, keep), keep)
        return n, (f"Inbox: {len(keep)} series stored ({n:,} weekly prices); {len(blocked)} skipped because "
                   f"real data exists; {short} shorter than {REPLACE_MIN_WEEKS} weeks skipped.")
    return _Load(write=write, after=lambda: _mark_done(parsed))


def _mark_done(paths):
    """Rename consumed inbox files after a successful commit. A failed rename leaves the file to be re-read,
    which is harmless because inbox loads replace whole series."""
    for f in paths:
        try:
            os.replace(f, f + ".done")
        except OSError:
            pass


@dataclass
class _Load:
    write: Callable          # (con, log) -> (rows_written, summary); runs inside the run's transaction
    token: object = None     # RemoteToken recorded on the run row when the transaction commits
    after: Callable = None   # runs after a successful commit


# ---------------------------------------------------------------- applying
def _simulate_load():
    def write(con, lg):
        last = store.max_date(con, "synthetic") or sample_data.DEFAULT_END
        rows = _select(sample_data.next_week_rows(last), store.synthetic_only_keys(con))
        n = store.upsert_prices(rows, con=con)
        nxt = last + timedelta(weeks=1)
        return n, (f"Added the week of {nxt.isoformat()}: {n} synthetic prices. Series that hold real data were left alone. "
                   "Forecasts will refresh.")
    return _Load(write=write)


def _seed_load():
    def write(con, lg):
        store.delete_source(con, "synthetic")
        taken = store.series_keys_with(con, "real", "inbox")
        n = store.upsert_prices(_select(sample_data.generate(), taken, inside=False), con=con)
        return n, f"Reloaded the synthetic history ({n:,} rows). Real and inbox data were left alone."
    return _Load(write=write)


def _collect(mode, log, notes, skips):
    """Network and parsing for each source in this mode. Writes nothing."""
    if mode == "simulate":
        return [_simulate_load()]
    if mode == "seed":
        return [_seed_load()]
    loads = []
    for src in (["wfp", "inbox", "da"] if mode == "live" else [mode]):
        try:
            if src == "wfp":
                load, skip = _prepare_wfp(log)
                if load:
                    loads.append(load)
                if skip:
                    skips.append(skip)
                    log(skip)
            elif src == "inbox":
                load = _prepare_inbox(log)
                if load:
                    loads.append(load)
            elif src == "da":
                links = DASource.find_reports()
                log(f"DA page lists {len(links)} PDF reports; the PDF parser is a scaffold, nothing imported")
        except Exception as e:  # a failing source must not stop the others
            notes.append(f"{src}: {type(e).__name__}: {str(e)[:120]}")
            log(f"{src} failed: {type(e).__name__}: {str(e)[:120]}")
    return loads


# ---------------------------------------------------------------- run
def _report(started, lines, mode, source, status, added, message):
    return dict(started=started, finished=datetime.now().isoformat(timespec="seconds"), mode=mode, source=source,
                status=status, rows_added=int(added), message=message, log=lines)


def _record_run(con, rep, token=None):
    con.execute("INSERT INTO pipeline_runs(started, finished, mode, source, status, rows_added, message, log, source_token) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (rep["started"], rep["finished"], rep["mode"], rep["source"], rep["status"], rep["rows_added"],
                 rep["message"], json.dumps(rep["log"]), json.dumps(asdict(token)) if token is not None else None))


def _save_run(rep):
    try:
        with store.transaction() as con:
            _record_run(con, rep)
    except Exception:
        pass


def _write_state(rep):
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

    source = {"live": "wfp+inbox+da", "simulate": "sample", "seed": "sample"}.get(mode, mode)
    notes, skips, loads = [], [], []
    committed = False
    rep = None
    try:
        store.init_db()
        log(f"Pipeline started ({mode})")
        loads = _collect(mode, log, notes, skips)
        with store.transaction() as con:
            added, texts, token = 0, [], None
            for load in loads:
                n, text = load.write(con, log)
                added += n
                texts.append(text)
                if load.token is not None:
                    token = load.token
            if loads:
                status = "ok"
                message = " ".join(texts + ([f"Sources failed: {', '.join(notes)}."] if notes else []))
            else:
                status = "no_update"
                message = "; ".join(skips) if skips else "No new data. " + (
                    "Sources unreachable or empty (" + ", ".join(notes) + "); kept the existing data." if notes else "Nothing new to import.")
            log("Done")
            rep = _report(started, lines, mode, source, status, added, message)
            _record_run(con, rep, token)
        committed = True
    except Exception as e:
        status, message = "error", f"{type(e).__name__}: {e}"
        log("Failed: " + message)
        rep = _report(started, lines, mode, source, status, 0, message)
        _save_run(rep)
    finally:
        _run_lock.release()
    if committed:
        if loads:
            forecast.clear_cache()
        for load in loads:
            if load.after:
                load.after()
    _write_state(rep)
    return rep


def recent_runs(limit=12):
    with store._lock, store.connect() as con:
        rows = con.execute("SELECT id, started, finished, mode, source, status, rows_added, message FROM pipeline_runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


def last_finished():
    """Latest pipeline_runs.finished timestamp (ISO-8601) or None. PK-ordered, O(1)."""
    with store._lock, store.connect() as con:
        row = con.execute("SELECT finished FROM pipeline_runs ORDER BY id DESC LIMIT 1").fetchone()
    return row["finished"] if row else None


def version_info():
    """Cheap cache-busting token + display timestamp for /meta."""
    last = last_finished()
    return dict(data_version=f"{forecast.version()}:{last or 0}", last_updated=last)
