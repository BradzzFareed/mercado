"""Forecast service: caching, signals, drivers, seasonality, bulk views."""
import math
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import numpy as np

from . import store, models, geo, commodities as cm, tiers

HORIZONS = (7, 14, 30)
_cache = {}
_lock = threading.RLock()
_version = {"n": 0}
CACHE_MAX_ENTRIES = 3000          # oldest cached full result is evicted beyond this


def clear_cache():
    with _lock:
        _cache.clear()
        _version["n"] += 1


def version():
    """In-process counter, bumped whenever cached forecasts are cleared."""
    with _lock:
        return _version["n"]


def _cached(key, fn):
    with _lock:
        hit = _cache.get(key)
        if hit is not None:
            return hit
    val = fn()
    with _lock:
        if key not in _cache:
            while len(_cache) >= CACHE_MAX_ENTRIES:
                _cache.pop(next(iter(_cache)))
            _cache[key] = val
    return val


def _norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _at_day(cur, vals, day):
    xs = [0] + [7 * (k + 1) for k in range(len(vals))]
    ys = [cur] + list(vals)
    return float(np.interp(day, xs, ys))


def _signal(change_pct, sigma_pct, prob_up):
    thr = max(2.5, 0.5 * sigma_pct)
    if change_pct >= thr:
        return "surge"
    if change_pct <= -thr:
        return "dip"
    return "stable"


def _horizon_block(cur, point, lo, hi, sigma):
    out = {}
    for d in HORIZONS:
        price = _at_day(cur, point, d)
        l, h = _at_day(cur, lo, d), _at_day(cur, hi, d)
        sg = _at_day(0.0, sigma, d)
        change = (price / cur - 1) * 100
        sig_pct = (math.exp(sg) - 1) * 100
        prob_up = _norm_cdf(math.log(price / cur) / max(sg, 1e-6))
        out[str(d)] = dict(price=round(price, 2), lo=round(l, 2), hi=round(h, 2), change_pct=round(change, 2),
                           prob_up=round(prob_up, 3), signal=_signal(change, sig_pct, prob_up))
    return out


def _best_buy(cur, point, dates, horizon_days):
    cands = [(0, cur, None)] + [(7 * (k + 1), p, dates[k]) for k, p in enumerate(point) if 7 * (k + 1) <= horizon_days + 3]
    best = min(cands, key=lambda c: c[1])
    worst = max(cands, key=lambda c: c[1])
    return dict(when="now" if best[0] == 0 else best[2].isoformat(), days=best[0], price=round(float(best[1]), 2),
                saves_pct=round(float((worst[1] - best[1]) / worst[1] * 100), 2))


def _run(province, commodity, mode):
    s = store.series(province, commodity)
    y = np.log(s.values)
    res = models.full(y, [d.date() for d in s.index]) if mode == "full" else models.quick(y, [d.date() for d in s.index])
    cur = float(s.values[-1])
    point = np.exp(res.point)
    z = 1.2816
    lo = np.exp(res.point - z * res.sigma)
    hi = np.exp(res.point + z * res.sigma)
    # Compact cache entry: values + a datetime index; per-call pieces (fdates, history rows)
    # are rebuilt where they are served instead of being stored.
    return dict(values=np.asarray(s.values, dtype=float), dates=s.index, last=s.index[-1].date(),
                cur=cur, point=point, lo=lo, hi=hi, res=res)


def _engine_result(province, commodity, mode):
    """Full results are cached (and capped); quick results are computed on demand only."""
    if mode == "full":
        return _cached(("core", "full", province, commodity), lambda: _run(province, commodity, "full"))
    return _run(province, commodity, "quick")


def _core(province, commodity, mode):
    return _engine_result(province, commodity, mode)


def summary(province, commodity, allow_quick=True):
    """Headline numbers. Uses the cached full ensemble when one exists; otherwise the fast model,
    so bulk views (board, map, compare) never train the full ensemble on demand."""
    with _lock:
        mode = "full" if ("core", "full", province, commodity) in _cache else ("quick" if allow_quick else "full")
    r = _engine_result(province, commodity, mode)
    horizons = _horizon_block(r["cur"], r["point"], r["lo"], r["hi"], r["res"].sigma)
    values = r["values"]
    spark = [round(float(v), 2) for v in values[-26:]]
    return dict(commodity=commodity, engine=mode, price=round(r["cur"], 2), horizons=horizons, spark=spark,
                spark_forecast=[round(float(v), 2) for v in r["point"]], as_of=r["last"].isoformat(),
                percentile_52w=round(float((values[-52:] <= r["cur"]).mean() * 100), 0))


def overview(province):
    df = store.load()
    have = set(df.loc[df["province"] == province, "commodity"])
    recs = tiers.records(version())
    comms = [c for c in cm.COMMODITIES if c["id"] in have
             and recs.get((province, c["id"]), {}).get("engine") not in (None, "none")]
    with ThreadPoolExecutor(max_workers=2) as ex:
        items = list(ex.map(lambda c: summary(province, c["id"]), comms))
    # Palengke basket: weighted sum of unit prices (weights ~ a small carinderia's weekly kg)
    w = {c["id"]: c["basket"] for c in cm.COMMODITIES}
    cur = sum(w[i["commodity"]] * i["price"] for i in items)
    basket = dict(current=round(cur, 2))
    for d in HORIZONS:
        fut = sum(w[i["commodity"]] * i["horizons"][str(d)]["price"] for i in items)
        basket[str(d)] = dict(price=round(fut, 2), change_pct=round((fut / cur - 1) * 100, 2))
    hist = []
    arrs = {i["commodity"]: i["spark"] for i in items}
    for k in range(26):
        hist.append(round(sum(w[c] * arrs[c][k] for c in arrs), 2))
    basket["spark"] = hist
    basket["spark_forecast"] = [round(sum(w[i["commodity"]] * i["spark_forecast"][k] for i in items), 2) for k in range(models.HORIZON)]
    return dict(province=province, as_of=items[0]["as_of"], items=items, basket=basket)


def seasonality(province, commodity):
    """Average seasonal effect by calendar month (% vs. trend), from history."""
    s = store.series(province, commodity)
    y = np.log(s.values)
    trend = np.convolve(y, np.ones(52) / 52, mode="same")
    ok = slice(26, len(y) - 26)
    dev = (y - trend)[ok]
    months = np.array([d.month for d in s.index[ok]])
    out = []
    for m in range(1, 13):
        v = dev[months == m]
        out.append(round(float((math.exp(v.mean()) - 1) * 100), 2) if len(v) else 0.0)
    return out


def detail(province, commodity, hist_weeks=104):
    r = _engine_result(province, commodity, "full")
    values, dates, last = r["values"], r["dates"], r["last"]
    res = r["res"]
    cur = r["cur"]
    fdates = [last + timedelta(weeks=k + 1) for k in range(models.HORIZON)]
    horizons = _horizon_block(cur, r["point"], r["lo"], r["hi"], res.sigma)
    hist = [dict(date=d.date().isoformat(), price=round(float(v), 2)) for d, v in zip(dates[-hist_weeks:], values[-hist_weeks:])]
    fc = [dict(date=d.isoformat(), price=round(float(p), 2), lo=round(float(l), 2), hi=round(float(h), 2))
          for d, p, l, h in zip(fdates, r["point"], r["lo"], r["hi"])]
    comp = res.comp
    n = 4  # attribute the 4-week move
    seas = (math.exp(comp["season"][n - 1]) - 1) * 100
    trend = (math.exp(comp["trend"][n - 1]) - 1) * 100
    total = (r["point"][n - 1] / cur - 1) * 100
    drivers = dict(total_pct=round(float(total), 2), seasonal_pct=round(float(seas), 2), trend_pct=round(float(trend), 2),
                   momentum_pct=round(float(total - seas - trend), 2), weeks=n)
    bt = res.backtest
    bt_out = None if bt is None else dict(
        metrics={k: {kk: (None if vv is None else round(vv, 2)) for kk, vv in v.items()} for k, v in bt["metrics"].items()},
        weights={k: round(v, 3) for k, v in bt["weights"].items()}, series=bt["series"],
        origins=bt["origins"], labels=models.LABELS)
    members = {m: [round(float(np.exp(v)), 2) for v in res.members[m]] for m in res.members}
    vals = values[-52:]
    return dict(
        province=province, commodity=commodity, as_of=last.isoformat(), current=round(cur, 2),
        history=hist, forecast=fc, horizons=horizons, drivers=drivers,
        best_buy={str(d): _best_buy(cur, r["point"], fdates, d) for d in HORIZONS},
        stats=dict(min_52w=round(float(vals.min()), 2), max_52w=round(float(vals.max()), 2),
                   avg_52w=round(float(vals.mean()), 2), percentile_52w=round(float((vals <= cur).mean() * 100), 0),
                   volatility_pct=round(float(np.std(np.diff(np.log(values[-52:]))) * 100), 2)),
        seasonality=seasonality(province, commodity), members=members, model_lab=bt_out)


def price_map(commodity):
    out = []
    avail = set(store.available()["provinces"])
    recs = tiers.records(version())
    for p in geo.PROVINCES:
        if p["id"] not in avail:
            continue
        if recs.get((p["id"], commodity), {}).get("engine") in (None, "none"):
            continue
        try:
            q = summary(p["id"], commodity, allow_quick=True)
        except ValueError:
            continue
        out.append(dict(province=p["id"], name=p["name"], region=p["region"], lat=p["lat"], lon=p["lon"],
                        market=p["market"], price=q["price"], horizons=q["horizons"], engine=q["engine"]))
    return out


def compare(province, commodity):
    here = geo.BY_ID[province]
    rows = price_map(commodity)
    mine = next(r for r in rows if r["province"] == province)
    for r in rows:
        r["distance_km"] = round(geo.haversine_km(here, geo.BY_ID[r["province"]]))
        r["diff_pct"] = round((r["price"] / mine["price"] - 1) * 100, 1)
        r["diff_abs"] = round(r["price"] - mine["price"], 2)
    rows.sort(key=lambda r: r["distance_km"])
    nearby = [r for r in rows if r["province"] != province and r["distance_km"] <= 450]
    cheaper = [r for r in nearby if r["diff_abs"] < 0]
    best = min(cheaper, key=lambda r: r["price"]) if cheaper else None
    return dict(province=province, commodity=commodity, mine=mine, rows=rows, best_nearby=best)


def warm_pairs(provinces=None):
    """Stored, non-hidden full-engine series: the legacy 10 commodities first, then the rest."""
    recs = tiers.records(version())
    wanted = set(provinces) if provinces else None
    legacy = {c["id"] for c in cm.SYNTHETIC}
    first, rest = [], []
    for (p, c), rec in sorted(recs.items()):
        if rec["tier"] == "hidden" or rec["engine"] != "full":
            continue
        if wanted is not None and p not in wanted:
            continue
        (first if c in legacy else rest).append((p, c))
    return first + rest


def warm(provinces=None, progress=None, workers=4):
    """Pre-compute full forecasts for every stored full-engine series (run in a background thread).

    Ordered legacy-10-first. Never blocks: callers start it in their own thread.
    """
    pairs = warm_pairs(provinces)

    def one(pair):
        try:
            _core(pair[0], pair[1], "full")
        except ValueError:
            pass
        if progress:
            progress(pair[0])

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, pairs))
