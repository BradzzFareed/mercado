"""Data-driven series tiers: what the store says each (province, commodity) can support.

One record per series, computed from grouped SQL reads - never stored in the registry:

  tier      forecast  >= TIER_FORECAST_MONTHS distinct observation months and fresh
            history   fresh and >= TIER_HISTORY_MONTHS months
            hidden    stale (older than STALE_MONTHS from the dataset's latest real
                      observation) or fewer than TIER_HISTORY_MONTHS months
  engine    full      forecast tier with >= FULL_ENGINE_MIN_WEEKS weekly price points
            quick     forecast tier below that, or history tier with >= HISTORY_QUICK_MIN_WEEKS
            none      history tier below that (observations only), or hidden
  source    real | synthetic | inbox, or "mixed" when a series holds more than one

Synthetic price series (the sample generator) are always tier "forecast" - they have no
real observations to judge freshness with, and the pipeline deliberately keeps them where
real data was short or stale. Freshness is measured against the dataset's latest real
observation date, never against today.
"""
import calendar
import threading
from datetime import date

from . import store

TIER_FORECAST_MONTHS = 36
TIER_HISTORY_MONTHS = 12
STALE_MONTHS = 3
FULL_ENGINE_MIN_WEEKS = 145
HISTORY_QUICK_MIN_WEEKS = 110          # store.series() refuses less than this

SYNTHETIC_HORIZONS = [7, 14, 30]       # weekly data supports all three
REAL_HORIZONS = [30]                   # monthly data, interpolated to weeks: only 30 days

_lock = threading.Lock()
_cache = {"version": None, "records": None}


def records(version):
    """(province, commodity) -> record. Recomputed when `version` (forecast.version()) changes."""
    with _lock:
        if _cache["records"] is None or _cache["version"] != version:
            _cache["records"] = _compute()
            _cache["version"] = version
        return _cache["records"]


def non_hidden(version):
    """Records whose tier is not hidden (what /meta, /coverage and warm serve)."""
    return {key: rec for key, rec in records(version).items() if rec["tier"] != "hidden"}


def stale_cutoff(max_obs):
    """max_obs minus STALE_MONTHS calendar months (the same rule pipeline.py uses)."""
    if max_obs is None:
        return None
    m = max_obs.month - STALE_MONTHS
    y = max_obs.year
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, min(max_obs.day, calendar.monthrange(y, m)[1]))


def _compute():
    with store.connect() as con:
        price = store.price_series_index(con)
        obs = store.observation_stats(con)
        max_obs = store.max_observation_date(con)
    cutoff = stale_cutoff(max_obs)

    out = {}
    for key in sorted(set(price) | set(obs)):
        sources = price.get(key, {}).get("sources") or {"real"}   # observations-only series are real
        source = next(iter(sources)) if len(sources) == 1 else "mixed"
        n_weeks = price.get(key, {}).get("n_weeks", 0)
        st = obs.get(key)
        if st is None:
            n_months, first_obs, last_obs = 0, None, price[key]["last_price"]
        else:
            n_months, first_obs, last_obs = st["n_months"], st["first_obs"], st["last_obs"]

        if source == "synthetic" or st is None:
            tier = "forecast"           # nothing to judge staleness with, or the generator's own series
        elif n_months < TIER_HISTORY_MONTHS or (cutoff and last_obs < cutoff.isoformat()):
            tier = "hidden"
        elif n_months >= TIER_FORECAST_MONTHS:
            tier = "forecast"
        else:
            tier = "history"

        if tier == "hidden":
            engine = "none"
        elif n_weeks == 0:
            engine = "none"             # observations only: no weekly price series at all
        elif tier == "forecast":
            engine = "full" if n_weeks >= FULL_ENGINE_MIN_WEEKS else "quick"
        else:
            engine = "quick" if n_weeks >= HISTORY_QUICK_MIN_WEEKS else "none"

        monthly = "real" in sources
        horizons = [] if engine == "none" else (REAL_HORIZONS if monthly else SYNTHETIC_HORIZONS)
        out[key] = dict(province=key[0], commodity=key[1], source=source, tier=tier, engine=engine,
                        n_weeks=n_weeks, n_months=n_months, first_obs=first_obs, last_obs=last_obs,
                        native_step="month" if monthly else "week", horizons=horizons)
    return out
