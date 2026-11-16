"""Commodity catalogue, loaded from the registry.

COMMODITIES holds every WFP retail label. SYNTHETIC holds the 10 legacy commodities that
carry sample-generator parameters. Ingest matching uses SYNTHETIC only, so ingest output
does not change until ingest moves to by_wfp_label().
"""
from .registry import load

# sens_* are the percent change in price per 1.0 unit of the scenario slider
# (see the What-If Lab); they are expert-style assumptions, not fitted values.
COMMODITIES = [dict(c) for c in load("commodities")["items"]]
BY_ID = {c["id"]: c for c in COMMODITIES}
BY_WFP_LABEL = {c["label_wfp"]: c for c in COMMODITIES}
# Only the legacy 10 carry generator parameters (base, drift, amp, peak, vol).
SYNTHETIC = [c for c in COMMODITIES if "base" in c]

PUBLIC_FIELDS = ["id", "name", "short", "fil", "group", "unit", "icon", "typhoon", "fuel", "shelf", "basket",
                 "category", "label_wfp", "unit_label", "scenario"]


def public():
    return [{k: c[k] for k in PUBLIC_FIELDS} for c in COMMODITIES]


def by_wfp_label(label):
    """Commodity for an exact WFP label (e.g. 'Meat (pork, with bones)'), or None."""
    return BY_WFP_LABEL.get(label)


def match_commodity(text):
    """Map a source's commodity label (e.g. WFP 'Meat (pork)') to a Mercado id."""
    t = (text or "").lower()
    if "rice" in t and not any(k in t for k in ("regular", "local")):
        return None  # skip premium / imported varieties so we track one rice grade
    for c in SYNTHETIC:
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
