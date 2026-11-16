"""Regions, provinces and representative markets, loaded from the registry.

Coordinates are approximate centroids of the main public market area of each province.
`level` is only used by the *sample data generator* (regional price level relative to
Metro Manila); the models never see it.
"""
from math import radians, sin, cos, asin, sqrt

from .registry import load

PROVINCES = [dict(p) for p in load("provinces")["items"]]
BY_ID = {p["id"]: p for p in PROVINCES}
# The legacy 25 keep their hardcoded coordinates (coords_source == "legacy").
SYNTHETIC_PROVINCES = [p for p in PROVINCES if p["coords_source"] == "legacy"]

# Legacy aliases only. Live ingest resolves through match_province(), so its output does not
# change until ingest moves to by_wfp_market().
_ALIAS = {}
for _p in SYNTHETIC_PROVINCES:
    for _a in _p["aliases"]:
        _ALIAS[_a] = _p["id"]

# Exact WFP admin2 label and official name -> province id, for every province.
_WFP_ADMIN2 = {}
for _p in PROVINCES:
    for _a in (_p["wfp_admin2"], _p["name"]):
        if _a:
            _WFP_ADMIN2[_a.lower()] = _p["id"]

_MARKET_RULES = {r["market"]: r for r in load("market_rules")["items"]}


def match_province(*names):
    """Map free-text admin/market names (WFP, DA, PSA) to a province id."""
    for n in names:
        if not isinstance(n, str):
            continue
        key = n.strip().lower()
        if key in _ALIAS:
            return _ALIAS[key]
        # Tech debt: the substring pass is unbounded, so a short alias matches inside a longer
        # name. 'leyte' inside 'southern leyte' is why Catarman lands in leyte. Replace this
        # when ingest moves to by_wfp_market().
        for alias, pid in _ALIAS.items():
            if len(alias) > 4 and alias in key:
                return pid
    return None


def by_wfp_market(admin2, market):
    """Province id for a WFP (admin2, market) pair, or None when quarantined or unknown.

    Market rules run before the admin2 lookup, because WFP files Pampanga, Davao Occidental
    and Catarman under the wrong admin2. 'as-filed' rules fall through to the admin2 lookup.
    """
    rule = _MARKET_RULES.get(market.strip() if isinstance(market, str) else "")
    if rule:
        if rule["rule"] in ("assign", "alias"):
            return rule["target"]
        if rule["rule"] == "quarantine":
            return None
    return _WFP_ADMIN2.get(admin2.strip().lower() if isinstance(admin2, str) else "")


def haversine_km(a, b):
    lat1, lon1, lat2, lon2 = map(radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    d = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * asin(sqrt(d))


def regions():
    out = {}
    for p in PROVINCES:
        r = out.setdefault(p["region_code"], dict(code=p["region_code"], name=p["region"], provinces=[]))
        r["provinces"].append(p["id"])
    return list(out.values())
