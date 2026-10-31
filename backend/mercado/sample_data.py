"""Deterministic SAMPLE data generator.

Produces weekly retail prices that *behave like* Philippine wet-market data
(seasonal vegetables, rainy-season spikes, Christmas pork, typhoon shocks,
the 2022-23 onion crisis, rice price swings) so the platform can be demoed
offline. It is synthetic - NOT official statistics. Swap it for real data by
running the pipeline against WFP/HDX or by dropping CSVs in data/inbox/.

Determinism: every series is generated from a fixed seed over a long horizon and
then truncated, so asking for more weeks never changes earlier weeks. That is
what lets the demo "receive a new week" from the pipeline.
"""
from datetime import date, timedelta
import numpy as np
import pandas as pd

from . import geo, commodities as cm

START = date(2019, 1, 7)          # a Monday
DEFAULT_END = date(2026, 10, 26)  # latest Monday before the demo date
MAX_WEEKS = 700

# (date, severity 0-1, lat, lon, radius_km) - synthetic storm events
STORMS = [
    (date(2019, 8, 12), 0.5, 17.0, 121.0, 350), (date(2020, 11, 9), 1.0, 15.0, 121.5, 400),
    (date(2021, 12, 20), 0.9, 10.0, 125.0, 450), (date(2022, 9, 26), 0.8, 15.5, 120.8, 350),
    (date(2022, 10, 31), 0.7, 14.0, 122.0, 400), (date(2023, 7, 24), 0.7, 17.5, 121.0, 350),
    (date(2024, 10, 28), 0.9, 13.5, 123.5, 400), (date(2025, 7, 21), 0.6, 16.0, 120.5, 350),
    (date(2025, 11, 3), 0.8, 11.0, 124.0, 450), (date(2026, 7, 20), 0.6, 15.5, 121.5, 350),
    (date(2026, 10, 5), 0.5, 12.5, 123.0, 350),
]


def week_dates(n):
    return [START + timedelta(weeks=i) for i in range(n)]


def n_weeks(end=DEFAULT_END):
    return (end - START).days // 7 + 1


def _ar(rng, n, sd, rho=0.7):
    e = rng.normal(0, sd, n)
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = rho * x[i - 1] + e[i]
    return x


def _national(c, n):
    """National log-price path for a commodity (shared across provinces)."""
    rng = np.random.default_rng(_seed("nat", c["id"]))
    t = np.arange(n)
    yrs = t / 52.0
    dates = week_dates(n)
    woy = np.array([d.isocalendar()[1] for d in dates])
    log = np.log(c["base"]) + c["drift"] * yrs
    phase = 2 * np.pi * (woy - c["peak"]) / 52.0
    log += c["amp"] * np.cos(phase) + 0.25 * c["amp"] * np.cos(2 * phase + 1.0)
    log += _ar(rng, n, c["vol"], 0.75)
    idx = {d: i for i, d in enumerate(dates)}

    def bump(start, weeks_up, weeks_down, size):
        i0 = max(0, (start - START).days // 7)
        out = np.zeros(n)
        for k in range(n - i0):
            if k < weeks_up:
                out[i0 + k] = size * (k + 1) / weeks_up
            else:
                out[i0 + k] = size * np.exp(-(k - weeks_up) / max(weeks_down, 1))
        return out

    cid = c["id"]
    if cid == "pork":      # ASF era
        log += bump(date(2019, 9, 2), 10, 28, 0.30)
    if cid == "rice":      # 2023 spike, tariff cut relief in 2025
        log += bump(date(2023, 6, 5), 14, 40, 0.28)
        log -= bump(date(2025, 2, 3), 12, 200, 0.12)
    if cid == "onion":     # 2022-23 onion crisis
        log += bump(date(2022, 10, 3), 10, 8, 1.10)
    if cid == "chicken":
        log += bump(date(2022, 2, 7), 8, 20, 0.10)
    if cid == "calamansi":
        log += bump(date(2024, 12, 2), 8, 16, 0.25)
    # fuel/transport factor: 2022 oil spike, mild noise
    fuel = bump(date(2022, 2, 28), 14, 24, 0.10)
    log += c["fuel"] * fuel
    return log


def _seed(*parts):
    s = 2166136261
    for ch in "|".join(map(str, parts)):
        s = ((s ^ ord(ch)) * 16777619) % (2**32)
    return s


def generate(end=DEFAULT_END, provinces=None, comms=None):
    """Return a long DataFrame: date, province, region, market, commodity, price, source."""
    n = n_weeks(end)
    dates = week_dates(n)
    provinces = provinces or geo.PROVINCES
    comms = comms or cm.COMMODITIES
    nat = {c["id"]: _national(c, MAX_WEEKS)[:n] for c in comms}
    storm_idx = [((d - START).days // 7, sev, la, lo, rad) for d, sev, la, lo, rad in STORMS]
    rows = []
    for p in provinces:
        for c in comms:
            rng = np.random.default_rng(_seed("prov", p["id"], c["id"]))
            full = _ar(rng, MAX_WEEKS, c["vol"] * 0.8, 0.6)[:n]
            offset = rng.normal(0, 0.04)
            level = np.log(p["level"])
            if c["id"] == "rice" and p["region_code"] in ("X", "XI", "XII", "XIII"):
                level -= 0.04
            if c["id"] in ("bangus", "pork") and p["region_code"] in ("MIMAROPA", "VIII"):
                level += 0.03
            log = nat[c["id"]] + level + offset + full
            # local typhoon shocks
            for i0, sev, la, lo, rad in storm_idx:
                if i0 >= n:
                    continue
                dist = geo.haversine_km(p, dict(lat=la, lon=lo))
                if dist > rad * 1.6:
                    continue
                prox = max(0.0, 1 - dist / (rad * 1.6))
                k = np.arange(n - i0)
                shock = 0.22 * sev * prox * c["typhoon"] * np.exp(-k / 5.0) * (1 - np.exp(-(k + 1) / 1.2))
                log[i0:] += shock
            price = np.exp(log)
            for d, v in zip(dates, price):
                rows.append((d, p["id"], p["region"], p["market"], c["id"], round(float(v), 2), "sample"))
    return pd.DataFrame(rows, columns=["date", "province", "region", "market", "commodity", "price", "source"])


def next_week_rows(current_last_date):
    """Rows for the single week after `current_last_date` (used by the demo pipeline)."""
    nxt = current_last_date + timedelta(weeks=1)
    df = generate(end=nxt)
    return df[df["date"] == nxt].reset_index(drop=True)
