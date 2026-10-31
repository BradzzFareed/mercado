"""Sample-data simulator.

Creates ~37,000 weekly retail-price records (24 markets x 10 commodities x 157 weeks) so Mercado can be
demonstrated offline. The numbers are SIMULATED (seasonality + fuel + typhoon pulses + noise); they are
calibrated to look like Philippine wet-market prices but are not official statistics. The live pipeline
(pipeline.py) replaces them with real WFP/HDX data.

    python -m mercado.simulate            # writes data/sample/prices.csv + exog.csv
    python -m mercado.simulate --seed 7
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from .catalog import COMMODITIES, LOCATIONS

END_DATE = "2026-10-26"   # a Monday
N_WEEKS = 157             # ~3 years of weekly data
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "sample"

TYPHOON_MONTH_PROB = {1: .01, 2: .0, 3: .0, 4: .0, 5: .01, 6: .03, 7: .05, 8: .08, 9: .12, 10: .13, 11: .10, 12: .04}
TYPHOON_KERNEL = np.array([0.4, 1.0, 0.8, 0.55, 0.35, 0.2, 0.1])  # price reaction lags the storm by ~1 week


def make_exog(rng: np.random.Generator, dates: pd.DatetimeIndex):
    n = len(dates)
    steps = rng.normal(0, 0.012, n) + (rng.random(n) < 0.03) * rng.normal(0, 0.05, n)
    log_fuel = np.cumsum(steps)
    fuel = 100 * np.exp(log_fuel - log_fuel[0])
    typhoon = np.zeros(n)
    for i, m in enumerate(dates.month):
        if rng.random() < TYPHOON_MONTH_PROB[m]:
            typhoon[i] = rng.choice([1, 2, 3], p=[.5, .3, .2])
    return fuel, typhoon


def _ar(rng, n, phi, sd):
    x = np.zeros(n)
    eps = rng.normal(0, sd, n)
    for t in range(1, n):
        x[t] = phi * x[t - 1] + eps[t]
    return x


def simulate(seed: int = 11, end: str = END_DATE, weeks: int = N_WEEKS):
    rng = np.random.default_rng(seed)
    dates = pd.date_range(end=end, periods=weeks, freq="7D")
    n = len(dates)
    t = np.arange(n)
    woy = dates.isocalendar().week.to_numpy().astype(float)
    fuel, typhoon = make_exog(rng, dates)
    pulse = np.convolve(typhoon, TYPHOON_KERNEL)[:n]
    dlog_fuel = np.log(fuel / fuel[0])

    regions = sorted({l["region"] for l in LOCATIONS})
    rows = []
    for c in COMMODITIES:
        s, phi = c["sigma"], c["phi"]
        nat = _ar(rng, n, phi, s * 0.8)
        reg = {r: _ar(rng, n, phi, s * 0.5) for r in regions}
        # national supply spikes (disease outbreaks, import delays...) that decay over weeks
        spike = np.zeros(n)
        for i in range(1, n):
            spike[i] = 0.72 * spike[i - 1]
            if rng.random() < c["spike_p"]:
                spike[i] += c["spike"] * rng.uniform(0.6, 1.2)
        season = c["amp"] * np.cos(2 * np.pi * (woy - c["peak"]) / 52.0)
        trend = c["trend"] * t / 52.0
        group_idx = {"staple": 0, "protein": 1, "veg": 2}[c["group"]] if c["group"] != "staple" else 0
        for loc in LOCATIONS:
            lvl = loc["lvl"][0] if c["id"] == "rice" else loc["lvl"][1] if c["group"] == "protein" else loc["lvl"][2]
            lvl *= rng.normal(1.0, 0.025)
            local = _ar(rng, n, phi, s * 0.7)
            exposure = loc["exp"] * rng.uniform(0.85, 1.15)
            logp = (np.log(c["base"] * lvl) + trend + season + nat + reg[loc["region"]] + local
                    + c["fuel"] * 1.5 * dlog_fuel
                    + c["typh"] * exposure * 0.25 * pulse
                    + spike * rng.uniform(0.6, 1.2))
            price = np.round(np.exp(logp), 2)
            for k in range(n):
                rows.append((dates[k].date().isoformat(), loc["id"], loc["region"], loc["province"], loc["market"],
                             c["id"], c["unit"], price[k]))
    prices = pd.DataFrame(rows, columns=["date", "location_id", "region", "province", "market",
                                         "commodity", "unit", "price_php"])
    exog = pd.DataFrame({"date": [d.date().isoformat() for d in dates],
                         "fuel_index": np.round(fuel, 2), "typhoon_index": typhoon})
    return prices, exog


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    prices, exog = simulate(args.seed)
    prices.to_csv(DATA_DIR / "prices.csv", index=False)
    exog.to_csv(DATA_DIR / "exog.csv", index=False)
    print(f"wrote {len(prices):,} price rows and {len(exog)} exog rows to {DATA_DIR}")


if __name__ == "__main__":
    main()
