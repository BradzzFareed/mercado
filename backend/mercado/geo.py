"""Regions, provinces and representative markets.

Coordinates are approximate centroids of the main public market area of each
province. `rice_factor` etc. are only used by the *sample data generator*
(regional price level relative to Metro Manila); the models never see them.
"""
from math import radians, sin, cos, asin, sqrt

# id, province, region_code, region_name, market, lat, lon, price_level, aliases
_PROVINCES = [
    ("ncr", "Metro Manila", "NCR", "National Capital Region", "Commonwealth Market, Quezon City", 14.676, 121.075, 1.00, ["national capital region", "ncr", "manila", "metropolitan manila"]),
    ("benguet", "Benguet", "CAR", "Cordillera Administrative Region", "La Trinidad Trading Post", 16.455, 120.590, 0.93, ["baguio", "baguio city"]),
    ("pangasinan", "Pangasinan", "I", "Ilocos Region", "Dagupan City Public Market", 16.043, 120.333, 0.95, ["dagupan"]),
    ("ilocos-norte", "Ilocos Norte", "I", "Ilocos Region", "Laoag City Public Market", 18.198, 120.594, 0.97, ["laoag"]),
    ("pampanga", "Pampanga", "III", "Central Luzon", "San Fernando Public Market", 15.029, 120.689, 0.97, []),
    ("bulacan", "Bulacan", "III", "Central Luzon", "Malolos Public Market", 14.843, 120.811, 0.98, []),
    ("laguna", "Laguna", "IV-A", "CALABARZON", "Calamba Public Market", 14.211, 121.165, 0.99, []),
    ("cavite", "Cavite", "IV-A", "CALABARZON", "Dasmarinas Public Market", 14.329, 120.937, 1.00, []),
    ("batangas", "Batangas", "IV-A", "CALABARZON", "Batangas City Public Market", 13.756, 121.058, 0.98, []),
    ("or-mindoro", "Oriental Mindoro", "MIMAROPA", "MIMAROPA", "Calapan Public Market", 13.411, 121.180, 1.03, []),
    ("palawan", "Palawan", "MIMAROPA", "MIMAROPA", "Puerto Princesa Public Market", 9.739, 118.735, 1.10, []),
    ("albay", "Albay", "V", "Bicol Region", "Legazpi City Public Market", 13.139, 123.744, 1.00, ["legazpi"]),
    ("camarines-sur", "Camarines Sur", "V", "Bicol Region", "Naga City Public Market", 13.622, 123.195, 0.99, ["naga"]),
    ("iloilo", "Iloilo", "VI", "Western Visayas", "Iloilo Central Market", 10.697, 122.564, 0.98, ["iloilo city"]),
    ("negros-occ", "Negros Occidental", "VI", "Western Visayas", "Bacolod Central Market", 10.676, 122.951, 0.97, ["bacolod"]),
    ("cebu", "Cebu", "VII", "Central Visayas", "Carbon Market, Cebu City", 10.292, 123.902, 1.02, ["cebu city"]),
    ("bohol", "Bohol", "VII", "Central Visayas", "Tagbilaran City Market", 9.648, 123.855, 1.05, ["tagbilaran"]),
    ("leyte", "Leyte", "VIII", "Eastern Visayas", "Tacloban City Market", 11.244, 125.003, 1.04, ["tacloban"]),
    ("zamboanga-sur", "Zamboanga del Sur", "IX", "Zamboanga Peninsula", "Pagadian City Market", 7.826, 123.437, 1.02, ["zamboanga", "zamboanga city"]),
    ("misamis-or", "Misamis Oriental", "X", "Northern Mindanao", "Cagayan de Oro Cogon Market", 8.477, 124.647, 0.96, ["cagayan de oro"]),
    ("davao-sur", "Davao del Sur", "XI", "Davao Region", "Bankerohan Public Market, Davao City", 7.065, 125.608, 0.97, ["davao", "davao city"]),
    ("south-cotabato", "South Cotabato", "XII", "SOCCSKSARGEN", "General Santos City Market", 6.112, 125.172, 0.94, ["general santos", "koronadal"]),
    ("agusan-norte", "Agusan del Norte", "XIII", "Caraga", "Butuan City Public Market", 8.949, 125.541, 1.00, ["butuan"]),
    ("lanao-sur", "Lanao del Sur", "BARMM", "Bangsamoro (BARMM)", "Marawi City Market", 7.998, 124.294, 1.06, ["marawi"]),
    ("maguindanao", "Maguindanao", "BARMM", "Bangsamoro (BARMM)", "Cotabato City Market", 7.223, 124.246, 1.04, ["cotabato", "cotabato city"]),
]

PROVINCES = [
    dict(id=p[0], name=p[1], region_code=p[2], region=p[3], market=p[4], lat=p[5], lon=p[6],
         level=p[7], aliases=[p[1].lower()] + p[8])
    for p in _PROVINCES
]
BY_ID = {p["id"]: p for p in PROVINCES}

_ALIAS = {}
for _p in PROVINCES:
    for _a in _p["aliases"]:
        _ALIAS[_a] = _p["id"]


def match_province(*names):
    """Map free-text admin/market names (WFP, DA, PSA) to a province id."""
    for n in names:
        if not isinstance(n, str):
            continue
        key = n.strip().lower()
        if key in _ALIAS:
            return _ALIAS[key]
        for alias, pid in _ALIAS.items():
            if len(alias) > 4 and alias in key:
                return pid
    return None


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
