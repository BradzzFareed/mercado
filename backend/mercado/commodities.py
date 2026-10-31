"""Commodity catalogue: display metadata, shock sensitivities, sample-data parameters."""

# sens_* are the percent change in price per 1.0 unit of the scenario slider
# (see the What-If Lab); they are expert-style assumptions, not fitted values.
COMMODITIES = [
    dict(id="rice", name="Rice (regular milled)", short="Rice", fil="Bigas", group="Grains", unit="kg", icon="🍚",
         base=40, drift=0.035, amp=0.02, peak=38, vol=0.006, typhoon=0.35, fuel=0.20, shelf=180, basket=5.0,
         keywords=["rice (regular, milled)", "rice (regular", "regular milled", "rice (local"]),
    dict(id="pork", name="Pork belly (liempo)", short="Pork belly", fil="Liempo", group="Meat & Poultry", unit="kg", icon="🥩",
         base=250, drift=0.05, amp=0.05, peak=51, vol=0.01, typhoon=0.15, fuel=0.35, shelf=3, basket=1.0,
         keywords=["pork", "meat (pork"]),
    dict(id="chicken", name="Dressed chicken", short="Chicken", fil="Manok", group="Meat & Poultry", unit="kg", icon="🍗",
         base=150, drift=0.03, amp=0.03, peak=49, vol=0.009, typhoon=0.20, fuel=0.40, shelf=2, basket=1.5,
         keywords=["chicken", "meat (chicken"]),
    dict(id="eggs", name="Eggs (medium)", short="Eggs", fil="Itlog", group="Meat & Poultry", unit="dozen", icon="🥚",
         base=85, drift=0.04, amp=0.03, peak=49, vol=0.008, typhoon=0.10, fuel=0.30, shelf=14, basket=1.0,
         keywords=["eggs", "egg"]),
    dict(id="bangus", name="Milkfish (bangus)", short="Bangus", fil="Bangus", group="Fish", unit="kg", icon="🐟",
         base=140, drift=0.045, amp=0.04, peak=14, vol=0.012, typhoon=0.80, fuel=0.45, shelf=2, basket=1.0,
         keywords=["milkfish", "bangus", "fish (milkfish"]),
    dict(id="tomato", name="Tomatoes", short="Tomatoes", fil="Kamatis", group="Vegetables & Fruit", unit="kg", icon="🍅",
         base=45, drift=0.02, amp=0.28, peak=36, vol=0.035, typhoon=1.60, fuel=0.25, shelf=5, basket=0.5,
         keywords=["tomato"]),
    dict(id="onion", name="Red onions", short="Onions", fil="Sibuyas", group="Vegetables & Fruit", unit="kg", icon="🧅",
         base=80, drift=0.03, amp=0.12, peak=6, vol=0.03, typhoon=0.70, fuel=0.20, shelf=30, basket=0.5,
         keywords=["onion"]),
    dict(id="calamansi", name="Calamansi", short="Calamansi", fil="Kalamansi", group="Vegetables & Fruit", unit="kg", icon="🍋",
         base=55, drift=0.035, amp=0.20, peak=8, vol=0.03, typhoon=0.80, fuel=0.25, shelf=10, basket=0.2,
         keywords=["calamansi", "calamondin"]),
    dict(id="cabbage", name="Cabbage", short="Cabbage", fil="Repolyo", group="Vegetables & Fruit", unit="kg", icon="🥬",
         base=50, drift=0.02, amp=0.25, peak=33, vol=0.03, typhoon=1.50, fuel=0.30, shelf=7, basket=0.5,
         keywords=["cabbage"]),
    dict(id="eggplant", name="Eggplant (talong)", short="Eggplant", fil="Talong", group="Vegetables & Fruit", unit="kg", icon="🍆",
         base=55, drift=0.025, amp=0.22, peak=36, vol=0.03, typhoon=1.30, fuel=0.25, shelf=4, basket=0.5,
         keywords=["eggplant", "aubergine"]),
]
BY_ID = {c["id"]: c for c in COMMODITIES}

PUBLIC_FIELDS = ["id", "name", "short", "fil", "group", "unit", "icon", "typhoon", "fuel", "shelf", "basket"]


def public():
    return [{k: c[k] for k in PUBLIC_FIELDS} for c in COMMODITIES]


def match_commodity(text):
    """Map a source's commodity label (e.g. WFP 'Meat (pork)') to a Mercado id."""
    t = (text or "").lower()
    if "rice" in t and not any(k in t for k in ("regular", "local")):
        return None  # skip premium / imported varieties so we track one rice grade
    for c in COMMODITIES:
        if any(k in t for k in c["keywords"]):
            return c["id"]
    return None


# Carinderia menu costing: amounts are in the commodity's price unit (kg or dozen).
# Other ingredients (oil, spices, gas) are folded into `other` pesos per serving.
DISHES = [
    dict(id="adobo", name="Pork adobo", price=75, other=9,
         items=[("pork", 0.13, "130 g pork belly"), ("onion", 0.01, "10 g onion")]),
    dict(id="tinola", name="Chicken tinola", price=65, other=8,
         items=[("chicken", 0.15, "150 g chicken"), ("onion", 0.01, "10 g onion"), ("cabbage", 0.04, "40 g greens")]),
    dict(id="bangus", name="Daing na bangus", price=70, other=8,
         items=[("bangus", 0.20, "200 g bangus"), ("calamansi", 0.01, "10 g calamansi")]),
    dict(id="torta", name="Tortang talong", price=40, other=5,
         items=[("eggplant", 0.12, "120 g eggplant"), ("eggs", 0.1667, "2 eggs"), ("tomato", 0.03, "30 g tomato")]),
    dict(id="rice", name="Plain rice (1 cup)", price=15, other=1.5,
         items=[("rice", 0.09, "90 g raw rice")]),
    dict(id="ginisang", name="Ginisang repolyo", price=35, other=5,
         items=[("cabbage", 0.12, "120 g cabbage"), ("tomato", 0.03, "30 g tomato"), ("onion", 0.01, "10 g onion")]),
]


def dishes():
    return [dict(id=d["id"], name=d["name"], price=d["price"], other=d["other"],
                 items=[dict(c=c, amt=a, label=l) for c, a, l in d["items"]]) for d in DISHES]
