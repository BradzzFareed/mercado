"""Forecast service: caching, signals, drivers, seasonality, bulk views."""
import math
import threading
from datetime import timedelta
import numpy as np

from . import store, models, geo, commodities as cm

HORIZONS = (7, 14, 30)
_cache = {}
_lock = threading.RLock()
_version = {"n": 0}


def clear_cache():
    with _lock:
        _cache.clear()
        _version["n"] += 1


def _cached(key, fn):
    with _lock:
        if key in _cache:
            return _cache[key]
    val = fn()
    with _lock:
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
    dates = [d.date() for d in s.index]
    res = models.full(y, dates) if mode == "full" else models.quick(y, dates)
    last = dates[-1]
    fdates = [last + timedelta(weeks=k + 1) for k in range(models.HORIZON)]
    cur = float(s.values[-1])
    point = np.exp(res.point)
    z = 1.2816
    lo = np.exp(res.point - z * res.sigma)
    hi = np.exp(res.point + z * res.sigma)
    return dict(series=s, dates=dates, fdates=fdates, cur=cur, point=point, lo=lo, hi=hi, res=res)


def _core(province, commodity, mode):
    key = ("core", mode, province, commodity)
    return _cached(key, lambda: _run(province, commodity, mode))


def summary(province, commodity, allow_quick=False):
    """Headline numbers. Uses the full ensemble; with allow_quick, falls back to the fast
    model for series whose full ensemble has not been computed yet (bulk map view)."""
    with _lock:
        have_full = ("core", "full", province, commodity) in _cache
    mode = "full" if (have_full or not allow_quick) else "quick"
    r = _core(province, commodity, mode)
    horizons = _horizon_block(r["cur"], r["point"], r["lo"], r["hi"], r["res"].sigma)
    s = r["series"]
    spark = [round(float(v), 2) for v in s.values[-26:]]
    return dict(commodity=commodity, engine=mode, price=round(r["cur"], 2), horizons=horizons, spark=spark,
                spark_forecast=[round(float(v), 2) for v in r["point"]], as_of=r["dates"][-1].isoformat(),
                percentile_52w=round(float((s.values[-52:] <= r["cur"]).mean() * 100), 0))


def overview(province):
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as ex:
        items = list(ex.map(lambda c: summary(province, c["id"]), cm.COMMODITIES))
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
    r = _core(province, commodity, "full")
    s = r["series"]
    res = r["res"]
    cur = r["cur"]
    horizons = _horizon_block(cur, r["point"], r["lo"], r["hi"], res.sigma)
    hist = [dict(date=d.isoformat(), price=round(float(v), 2)) for d, v in zip(r["dates"][-hist_weeks:], s.values[-hist_weeks:])]
    fc = [dict(date=d.isoformat(), price=round(float(p), 2), lo=round(float(l), 2), hi=round(float(h), 2))
          for d, p, l, h in zip(r["fdates"], r["point"], r["lo"], r["hi"])]
    comp = res.comp
    n = 4  # attribute the 4-week move
    seas = (math.exp(comp["season"][n - 1]) - 1) * 100
    trend = (math.exp(comp["trend"][n - 1]) - 1) * 100
    total = (r["point"][n - 1] / cur - 1) * 100
    drivers = dict(total_pct=round(float(total), 2), seasonal_pct=round(float(seas), 2), trend_pct=round(float(trend), 2),
                   momentum_pct=round(float(total - seas - trend), 2), weeks=n)
    bt = res.backtest
    bt_out = dict(metrics={k: {kk: (None if vv is None else round(vv, 2)) for kk, vv in v.items()} for k, v in bt["metrics"].items()},
                  weights={k: round(v, 3) for k, v in bt["weights"].items()}, series=bt["series"],
                  origins=bt["origins"], labels=models.LABELS)
    members = {m: [round(float(np.exp(v)), 2) for v in res.members[m]] for m in res.members}
    vals = s.values[-52:]
    return dict(
        province=province, commodity=commodity, as_of=r["dates"][-1].isoformat(), current=round(cur, 2),
        history=hist, forecast=fc, horizons=horizons, drivers=drivers,
        best_buy={str(d): _best_buy(cur, r["point"], r["fdates"], d) for d in HORIZONS},
        stats=dict(min_52w=round(float(vals.min()), 2), max_52w=round(float(vals.max()), 2),
                   avg_52w=round(float(vals.mean()), 2), percentile_52w=round(float((vals <= cur).mean() * 100), 0),
                   volatility_pct=round(float(np.std(np.diff(np.log(s.values[-52:]))) * 100), 2)),
        seasonality=seasonality(province, commodity), members=members, model_lab=bt_out)


def price_map(commodity):
    out = []
    avail = set(store.available()["provinces"])
    for p in geo.PROVINCES:
        if p["id"] not in avail:
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


def warm(provinces=None, progress=None):
    """Pre-compute full forecasts (called in a background thread at startup)."""
    provinces = provinces or [p["id"] for p in geo.PROVINCES]
    for pid in provinces:
        for c in cm.COMMODITIES:
            try:
                summary(pid, c["id"])
            except ValueError:
                pass
        if progress:
            progress(pid)
