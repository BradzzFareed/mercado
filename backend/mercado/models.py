"""Forecasting models (all work on log-prices, weekly frequency).

  naive        last observed value carried forward (baseline)
  holt_winters damped-trend additive Holt-Winters with a 52-week season
  ridge        ridge regression on lag/momentum/mean-reversion/Fourier features
  gbm          gradient-boosted trees on the same features
  ensemble     inverse-squared-error weighted blend, weights learned by
               rolling-origin backtesting on the series' own recent history

Forecasts are produced recursively one week at a time. Prediction intervals
come from the ensemble's backtest errors at each horizon.
"""
from dataclasses import dataclass
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler

M = 52          # season length in weeks
HORIZON = 5     # weeks ahead (35 days; covers the 30-day view)
MODEL_NAMES = ["naive", "holt_winters", "ridge", "gbm"]
LABELS = {"naive": "Naive (last price)", "holt_winters": "Holt-Winters", "ridge": "Ridge regression",
          "gbm": "Gradient boosting", "ensemble": "Mercado ensemble"}


# ---------------------------------------------------------------- Holt-Winters
_GRID = [(a, b, g) for a in (0.2, 0.5) for b in (0.02, 0.1) for g in (0.1, 0.3)]
PHI = 0.96


def _hw_run(y, a, b, g):
    n = len(y)
    s = list(y[:M] - y[:M].mean())
    lvl = float(y[:M].mean())
    tr = float((y[M:2 * M].mean() - y[:M].mean()) / M)
    sse = 0.0
    errs = []
    for t in range(n):
        i = t % M
        yhat = lvl + PHI * tr + s[i]
        e = y[t] - yhat
        if t >= M:
            sse += e * e
            errs.append(e)
        lvl = lvl + PHI * tr + a * e
        tr = PHI * tr + b * e
        s[i] += g * e
    return sse, lvl, tr, s, errs


def holt_winters(y, h=HORIZON):
    """Returns forecast (log), plus component dict for driver attribution."""
    best = min((_hw_run(y, *p) + (p,) for p in _GRID), key=lambda r: r[0])
    _, lvl, tr, s, errs, _p = best
    n = len(y)
    out, trend_cum = [], 0.0
    for k in range(1, h + 1):
        trend_cum += PHI ** k * tr
        out.append(lvl + trend_cum + s[(n + k - 1) % M])
    cur_season = s[(n - 1) % M]
    comp = dict(
        trend=[float(sum(PHI ** j * tr for j in range(1, k + 1))) for k in range(1, h + 1)],
        season=[float(s[(n + k - 1) % M] - cur_season) for k in range(1, h + 1)],
        resid_sd=float(np.std(errs)) if errs else 0.05,
    )
    return np.array(out), comp


# ----------------------------------------------------------- feature models
def _woy(date):
    return date.isocalendar()[1]


def _features(y, dates, t, next_date):
    """Features known at time t (inclusive) used to predict y[t+1] - y[t]."""
    r = lambda k: y[t - k] - y[t - k - 1]
    w = 2 * np.pi * _woy(next_date) / 52.0
    return [
        r(0), r(1), r(2), r(3),
        y[t] - y[t - 3:t + 1].mean(),
        y[t] - y[t - 12:t + 1].mean(),
        y[t] - y[t - 51:t + 1].mean(),
        np.sin(w), np.cos(w), np.sin(2 * w), np.cos(2 * w),
    ]


def build_matrix(y, dates):
    """Training matrix over the full series: rows for t = 52 .. n-2."""
    X, T = [], []
    for t in range(52, len(y) - 1):
        X.append(_features(y, dates, t, dates[t + 1]))
        T.append(t)
    X = np.array(X)
    tgt = np.array([y[t + 1] - y[t] for t in T])
    return X, tgt, np.array(T)


def _fit_feature_model(kind, X, tgt):
    if kind == "ridge":
        sc = StandardScaler().fit(X)
        m = Ridge(alpha=5.0).fit(sc.transform(X), tgt)
        return lambda f: float(m.predict(sc.transform(np.array([f])))[0])
    m = GradientBoostingRegressor(n_estimators=80, max_depth=3, learning_rate=0.06, subsample=0.8,
                                  min_samples_leaf=12, random_state=0)
    m.fit(X, tgt)
    return lambda f: float(m.predict(np.array([f]))[0])


def feature_forecast(kind, y, dates, X, tgt, T, upto, h=HORIZON):
    """Fit on rows whose target index <= upto-1 (i.e. history y[:upto]) and roll forward h steps."""
    mask = T + 1 <= upto - 1
    if mask.sum() < 60:
        raise ValueError("not enough history to fit")
    predict = _fit_feature_model(kind, X[mask], tgt[mask])
    yy = list(y[:upto])
    dd = list(dates[:upto])
    from datetime import timedelta
    out = []
    for _ in range(h):
        t = len(yy) - 1
        nd = dd[-1] + timedelta(weeks=1)
        f = _features(np.array(yy), dd, t, nd)
        step = predict(f)
        step = float(np.clip(step, -0.25, 0.25))
        yy.append(yy[-1] + step)
        dd.append(nd)
        out.append(yy[-1])
    return np.array(out)


# -------------------------------------------------------------- orchestration
@dataclass
class Result:
    point: np.ndarray        # ensemble log forecast, len HORIZON
    sigma: np.ndarray        # log-scale std per horizon
    members: dict            # model -> log forecast
    weights: dict
    comp: dict
    backtest: dict | None


def _gather(y, dates, X, tgt, T, upto, which):
    out, comp = {}, None
    last = y[upto - 1]
    if "naive" in which:
        out["naive"] = np.full(HORIZON, last)
    if "holt_winters" in which:
        out["holt_winters"], comp = holt_winters(y[:upto])
    for k in ("ridge", "gbm"):
        if k in which:
            out[k] = feature_forecast(k, y, dates, X, tgt, T, upto)
    return out, comp


def quick(y, dates):
    """Fast forecast for bulk views (map, overview): HW + Ridge average, no backtest."""
    X, tgt, T = build_matrix(y, dates)
    mem, comp = _gather(y, dates, X, tgt, T, len(y), ("holt_winters", "ridge"))
    point = 0.5 * mem["holt_winters"] + 0.5 * mem["ridge"]
    base = max(comp["resid_sd"], 0.01)
    sigma = np.array([base * np.sqrt(k + 1) * 0.9 for k in range(HORIZON)])
    return Result(point, sigma, mem, {"holt_winters": .5, "ridge": .5}, comp, None)


def full(y, dates, origins=10, step=3):
    """Full ensemble with rolling-origin backtest."""
    n = len(y)
    X, tgt, T = build_matrix(y, dates)
    errs = {m: [] for m in MODEL_NAMES}     # each: list of arrays (HORIZON,) of log errors
    pred4 = {m: [] for m in MODEL_NAMES}
    meta = []                               # (origin index, actual log path)
    for o in range(origins):
        upto = n - HORIZON - (origins - 1 - o) * step
        if upto < 110:
            continue
        actual = y[upto:upto + HORIZON]
        mem, _ = _gather(y, dates, X, tgt, T, upto, MODEL_NAMES)
        for m in MODEL_NAMES:
            errs[m].append(mem[m] - actual)
            pred4[m].append(mem[m])
        meta.append((upto, actual))
    if not meta:
        raise ValueError("series too short to backtest")
    mae = {m: float(np.mean(np.abs(np.array(errs[m])))) for m in MODEL_NAMES}
    raw = {m: 1.0 / (mae[m] ** 2 + 1e-9) for m in MODEL_NAMES}
    tot = sum(raw.values())
    w = {m: raw[m] / tot for m in MODEL_NAMES}
    ens_err = sum(w[m] * np.array(errs[m]) for m in MODEL_NAMES)     # (origins, HORIZON)
    sig = np.sqrt((ens_err ** 2).mean(axis=0))
    sig = np.maximum.accumulate(np.maximum(sig, 0.008))
    def mape(e, actual_paths):
        a = np.array([np.exp(p) for p in actual_paths])
        return float(np.mean(np.abs(np.exp(np.array(e) + np.log(a)) - a) / a) * 100)
    actual_paths = [m_[1] for m_ in meta]
    metrics = {}
    for m in MODEL_NAMES:
        e = np.array(errs[m])
        metrics[m] = dict(mape=mape(e, actual_paths), mape_h1=mape(e[:, :1], [p[:1] for p in actual_paths]),
                          mape_h4=mape(e[:, 3:4], [p[3:4] for p in actual_paths]),
                          direction=None if m == "naive" else _direction(e, actual_paths, y, meta))
    metrics["ensemble"] = dict(mape=mape(ens_err, actual_paths), mape_h1=mape(ens_err[:, :1], [p[:1] for p in actual_paths]),
                               mape_h4=mape(ens_err[:, 3:4], [p[3:4] for p in actual_paths]),
                               direction=_direction(ens_err, actual_paths, y, meta))
    # final fit on all history
    mem, comp = _gather(y, dates, X, tgt, T, n, MODEL_NAMES)
    point = sum(w[m] * mem[m] for m in MODEL_NAMES)
    bt_rows = []
    for (upto, actual), idx in zip(meta, range(len(meta))):
        d = dates[upto + 3]
        row = dict(date=d.isoformat(), actual=float(np.exp(actual[3])))
        for m in MODEL_NAMES:
            row[m] = float(np.exp(pred4[m][idx][3]))
        row["ensemble"] = float(np.exp(sum(w[m] * pred4[m][idx][3] for m in MODEL_NAMES)))
        bt_rows.append(row)
    backtest = dict(metrics=metrics, weights=w, series=bt_rows, origins=len(meta), horizon_weeks=4)
    return Result(point, sig, mem, w, comp, backtest)


def _direction(e, actual_paths, y, meta):
    """Share of backtests where the model got the *direction* of the 4-week move right."""
    hit = 0
    for i, (upto, actual) in enumerate(meta):
        pred_move = (actual[3] + e[i][3]) - y[upto - 1]
        true_move = actual[3] - y[upto - 1]
        hit += (pred_move > 0) == (true_move > 0)
    return float(hit / len(meta) * 100)
