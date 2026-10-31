"""Static reference data for Mercado: commodities, markets (locations), and scenario assumptions.

Everything the rest of the app needs to *describe* the Philippine food-price world lives here,
so the ML code stays generic and the data generator / pipeline / API all agree on the same ids.
"""

# --------------------------------------------------------------------------------------
# Commodities
#   gen_*   -> parameters ONLY used by the sample-data simulator (simulate.py)
#   shock_* -> scenario-lab assumptions: % price change at full effect for
#              (+10% fuel price), (+1 typhoon level), (100% drought/El Niño severity)
#   shelf   -> rough shelf life in days (decides "stock up" vs "buy normal amount")
# --------------------------------------------------------------------------------------
COMMODITIES = [
    dict(id="rice", name="Rice (regular milled)", fil="Bigas", unit="kg", emoji="🍚", group="staple",
         shelf=365, base=47.0, trend=0.012, amp=0.035, peak=33, sigma=0.0055, phi=0.97,
         fuel=0.030, typh=0.10, spike_p=0.0, spike=0.0, shock=(0.5, 1.5, 12.0)),
    dict(id="pork", name="Pork belly (liempo)", fil="Liempo", unit="kg", emoji="🥓", group="protein",
         shelf=30, base=335.0, trend=0.050, amp=0.050, peak=50, sigma=0.011, phi=0.95,
         fuel=0.060, typh=0.05, spike_p=0.008, spike=0.08, shock=(0.9, 1.0, 5.0)),
    dict(id="chicken", name="Dressed chicken", fil="Manok", unit="kg", emoji="🍗", group="protein",
         shelf=30, base=180.0, trend=0.020, amp=0.030, peak=51, sigma=0.010, phi=0.93,
         fuel=0.070, typh=0.06, spike_p=0.0, spike=0.0, shock=(1.1, 0.8, 4.0)),
    dict(id="eggs", name="Eggs (medium)", fil="Itlog", unit="dozen", emoji="🥚", group="protein",
         shelf=14, base=112.0, trend=0.020, amp=0.040, peak=47, sigma=0.009, phi=0.94,
         fuel=0.050, typh=0.04, spike_p=0.0, spike=0.0, shock=(0.8, 0.6, 4.0)),
    dict(id="bangus", name="Milkfish (bangus)", fil="Bangus", unit="kg", emoji="🐟", group="protein",
         shelf=30, base=180.0, trend=0.030, amp=0.050, peak=36, sigma=0.012, phi=0.94,
         fuel=0.090, typh=0.22, spike_p=0.0, spike=0.0, shock=(1.2, 4.0, 6.0)),
    dict(id="tomato", name="Tomatoes", fil="Kamatis", unit="kg", emoji="🍅", group="veg",
         shelf=7, base=75.0, trend=0.010, amp=0.300, peak=36, sigma=0.050, phi=0.78,
         fuel=0.120, typh=0.55, spike_p=0.030, spike=0.35, shock=(1.8, 9.0, 25.0)),
    dict(id="onion", name="Red onion", fil="Sibuyas", unit="kg", emoji="🧅", group="veg",
         shelf=60, base=150.0, trend=0.020, amp=0.200, peak=48, sigma=0.045, phi=0.88,
         fuel=0.080, typh=0.20, spike_p=0.020, spike=0.45, shock=(1.0, 3.0, 18.0)),
    dict(id="calamansi", name="Calamansi", fil="Kalamansi", unit="kg", emoji="🍋", group="veg",
         shelf=7, base=75.0, trend=0.015, amp=0.250, peak=6, sigma=0.035, phi=0.85,
         fuel=0.080, typh=0.25, spike_p=0.010, spike=0.25, shock=(1.2, 4.0, 20.0)),
    dict(id="cabbage", name="Cabbage", fil="Repolyo", unit="kg", emoji="🥬", group="veg",
         shelf=10, base=70.0, trend=0.010, amp=0.250, peak=35, sigma=0.045, phi=0.80,
         fuel=0.120, typh=0.50, spike_p=0.020, spike=0.30, shock=(1.8, 8.0, 22.0)),
    dict(id="garlic", name="Garlic (local)", fil="Bawang", unit="kg", emoji="🧄", group="veg",
         shelf=120, base=190.0, trend=0.020, amp=0.120, peak=30, sigma=0.020, phi=0.93,
         fuel=0.050, typh=0.06, spike_p=0.0, spike=0.0, shock=(0.6, 1.5, 10.0)),
]
COMMODITY_BY_ID = {c["id"]: c for c in COMMODITIES}

# Items a shopper could swap to when something surges (ordered by closeness)
SUBSTITUTES = {
    "pork": ["chicken", "bangus", "eggs"],
    "chicken": ["eggs", "bangus", "pork"],
    "bangus": ["chicken", "eggs", "pork"],
    "eggs": ["bangus", "chicken"],
    "tomato": ["cabbage"],
    "cabbage": ["tomato"],
    "onion": ["garlic"],
    "garlic": ["onion"],
    "calamansi": [],
    "rice": [],
}

# --------------------------------------------------------------------------------------
# Locations: one representative public market per province.
#   exp  -> typhoon exposure used by the simulator
#   lvl  -> price level multipliers (rice, protein, veg) vs. the national base
# --------------------------------------------------------------------------------------
def _loc(id, region, province, market, lat, lng, exp, lvl):
    return dict(id=id, region=region, province=province, market=market, lat=lat, lng=lng, exp=exp, lvl=lvl)


LOCATIONS = [
    _loc("ncr-qc", "NCR · National Capital Region", "Metro Manila", "Commonwealth Market, Quezon City", 14.676, 121.044, 0.8, (1.04, 1.05, 1.05)),
    _loc("car-benguet", "CAR · Cordillera", "Benguet", "La Trinidad Trading Post", 16.456, 120.589, 0.9, (1.02, 1.00, 0.78)),
    _loc("r1-pangasinan", "Region I · Ilocos", "Pangasinan", "Dagupan Public Market", 16.043, 120.333, 1.0, (0.99, 0.97, 0.95)),
    _loc("r1-ilocosnorte", "Region I · Ilocos", "Ilocos Norte", "Laoag City Market", 18.197, 120.594, 1.2, (1.00, 1.00, 0.97)),
    _loc("r2-isabela", "Region II · Cagayan Valley", "Isabela", "Santiago City Market", 16.688, 121.548, 1.3, (0.96, 0.96, 0.95)),
    _loc("r3-pampanga", "Region III · Central Luzon", "Pampanga", "San Fernando Public Market", 15.029, 120.689, 0.9, (0.99, 1.00, 1.00)),
    _loc("r3-bulacan", "Region III · Central Luzon", "Bulacan", "Malolos Public Market", 14.843, 120.811, 0.9, (1.00, 1.00, 1.00)),
    _loc("r3-nuevaecija", "Region III · Central Luzon", "Nueva Ecija", "Cabanatuan City Market", 15.486, 120.967, 1.0, (0.95, 0.98, 0.95)),
    _loc("r4a-cavite", "Region IV-A · CALABARZON", "Cavite", "Dasmariñas Public Market", 14.329, 120.937, 0.8, (1.02, 1.03, 1.03)),
    _loc("r4a-batangas", "Region IV-A · CALABARZON", "Batangas", "Batangas City Market", 13.756, 121.058, 0.9, (1.01, 1.02, 0.98)),
    _loc("r4b-palawan", "MIMAROPA", "Palawan", "Puerto Princesa Public Market", 9.739, 118.735, 0.6, (1.12, 1.10, 1.18)),
    _loc("r5-albay", "Region V · Bicol", "Albay", "Legazpi City Market", 13.139, 123.744, 1.3, (1.03, 1.00, 1.02)),
    _loc("r5-camsur", "Region V · Bicol", "Camarines Sur", "Naga City Market", 13.621, 123.195, 1.3, (1.01, 0.99, 1.00)),
    _loc("r6-iloilo", "Region VI · Western Visayas", "Iloilo", "Iloilo Central Market", 10.720, 122.562, 0.8, (0.99, 0.98, 1.00)),
    _loc("r6-negrosocc", "Region VI · Western Visayas", "Negros Occidental", "Bacolod Central Market", 10.676, 122.954, 0.7, (0.98, 0.96, 0.97)),
    _loc("r7-cebu", "Region VII · Central Visayas", "Cebu", "Carbon Market, Cebu City", 10.317, 123.891, 0.7, (1.03, 1.02, 1.04)),
    _loc("r7-bohol", "Region VII · Central Visayas", "Bohol", "Tagbilaran City Market", 9.647, 123.855, 0.8, (1.04, 1.00, 1.02)),
    _loc("r8-leyte", "Region VIII · Eastern Visayas", "Leyte", "Tacloban City Market", 11.244, 125.003, 1.3, (1.02, 0.99, 1.00)),
    _loc("r9-zamsur", "Region IX · Zamboanga Peninsula", "Zamboanga del Sur", "Pagadian City Market", 7.826, 123.437, 0.3, (1.00, 0.97, 0.95)),
    _loc("r10-misor", "Region X · Northern Mindanao", "Misamis Oriental", "Cagayan de Oro Market", 8.482, 124.647, 0.4, (0.99, 0.98, 0.94)),
    _loc("r11-davsur", "Region XI · Davao", "Davao del Sur", "Bankerohan Public Market", 7.062, 125.608, 0.25, (0.98, 0.96, 0.92)),
    _loc("r12-southcot", "Region XII · SOCCSKSARGEN", "South Cotabato", "Koronadal City Market", 6.503, 124.847, 0.2, (0.96, 0.95, 0.90)),
    _loc("r13-agusannorte", "Region XIII · Caraga", "Agusan del Norte", "Butuan City Market", 8.949, 125.543, 1.0, (1.02, 1.00, 0.98)),
    _loc("barmm-maguindanao", "BARMM", "Maguindanao del Norte", "Cotabato City Market", 7.223, 124.246, 0.25, (1.03, 1.02, 1.00)),
]
LOCATION_BY_ID = {l["id"]: l for l in LOCATIONS}

# Day-to-day "wow" defaults used by the UI (household & carinderia weekly baskets, kg or dozen)
BASKET_PRESETS = {
    "household": {"label": "Pamilya (5 members)", "items": dict(rice=8, pork=1.5, chicken=2, eggs=2, bangus=1, tomato=1, onion=0.5, calamansi=0.3, cabbage=1, garlic=0.2)},
    "carinderia": {"label": "Carinderia (40 servings/day)", "items": dict(rice=60, pork=10, chicken=14, eggs=8, bangus=6, tomato=6, onion=5, calamansi=2, cabbage=6, garlic=1.5)},
}

# Alert thresholds (can be tuned from the UI "sensitivity" slider)
DEFAULT_THRESHOLD = 0.03  # ±3% expected move over the horizon
