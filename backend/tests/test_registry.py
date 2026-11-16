import json
import os
import re

import pytest

from mercado import geo, commodities as cm
from mercado.registry import load

with open(os.path.join(os.path.dirname(__file__), "fixtures", "registry_snapshot.json"), encoding="utf-8") as fh:
    SNAPSHOT = json.load(fh)


def test_ids_are_unique():
    assert len({c["id"] for c in cm.COMMODITIES}) == len(cm.COMMODITIES)
    assert len({c["label_wfp"] for c in cm.COMMODITIES}) == len(cm.COMMODITIES)
    assert len({p["id"] for p in geo.PROVINCES}) == len(geo.PROVINCES)
    keys = [p["wfp_admin2"] for p in geo.PROVINCES if p["wfp_admin2"]]
    assert len(keys) == len(set(keys))


def test_registry_counts():
    assert len(cm.COMMODITIES) == 70 and len(cm.SYNTHETIC) == 10
    assert len(geo.PROVINCES) == 82 and len(geo.SYNTHETIC_PROVINCES) == 25
    assert len({p["region_code"] for p in geo.PROVINCES}) == 18 == len(geo.regions())
    assert len(load("market_rules")["items"]) == 12


def test_legacy_commodities_are_unchanged():
    legacy = SNAPSHOT["legacy_commodities"]
    assert [c["id"] for c in cm.COMMODITIES[:10]] == [c["id"] for c in legacy]
    for old in legacy:
        got = {k: cm.BY_ID[old["id"]][k] for k in old}
        assert json.dumps(got, sort_keys=True) == json.dumps(old, sort_keys=True), old["id"]


def test_legacy_provinces_are_unchanged():
    legacy = SNAPSHOT["legacy_provinces"]
    assert [p["id"] for p in geo.PROVINCES[:25]] == [p["id"] for p in legacy]
    for old in legacy:
        got = {k: geo.BY_ID[old["id"]][k] for k in old}
        assert json.dumps(got, sort_keys=True) == json.dumps(old, sort_keys=True), old["id"]


def test_legacy_ids_own_their_wfp_labels():
    assert {c["id"]: c["label_wfp"] for c in cm.SYNTHETIC} == {
        "rice": "Rice (regular, milled)",
        "pork": "Meat (pork)",
        "chicken": "Meat (chicken, whole)",
        "eggs": "Eggs",
        "bangus": "Fish (milkfish)",
        "tomato": "Tomatoes",
        "onion": "Onions (red)",
        "calamansi": "Calamansi",
        "cabbage": "Cabbage",
        "eggplant": "Eggplants",
    }


def test_dish_ingredients_exist():
    for d in cm.DISHES:
        for cid, _, _ in d["items"]:
            assert cid in cm.BY_ID, (d["id"], cid)


def test_each_wfp_retail_label_maps_to_exactly_one_commodity():
    labels = SNAPSHOT["wfp_retail_labels"]
    assert len(labels) == 70 == len(set(labels))
    assert {c["label_wfp"] for c in cm.COMMODITIES} == set(labels)
    for lab in labels:
        owners = [c for c in cm.COMMODITIES if c["label_wfp"] == lab]
        assert len(owners) == 1, lab
        assert cm.by_wfp_label(lab) is owners[0]
    assert cm.by_wfp_label("Not a WFP label") is None


@pytest.mark.parametrize("admin2, market, expected", [
    ("Bulacan", "Pampanga", "pampanga"),
    ("Masbate", "Camarines Sur", "camarines-sur"),
    ("Davao del Sur", "Davao Occidental", "davao-occidental"),
    ("Southern Leyte", "Catarman", None),
    ("Rizal", "Santa Cruz", None),
    ("Compostela Valley", "Davao de Oro", "davao-de-oro"),
    ("Metropolitan Manila", "Metro Manila", "ncr"),
    ("Davao del Sur", "Davao City", "davao-sur"),
    ("Camarines Sur", "Naga City", "camarines-sur"),
    ("Bulacan", "Bulacan", "bulacan"),
    ("Samar", "Samar", "western-samar"),
    ("Sarangani", "Sarangani", "saranggani"),
    ("Dinagat Islands", "Dinagat Islands", "dinagat-island"),
])
def test_by_wfp_market(admin2, market, expected):
    assert geo.by_wfp_market(admin2, market) == expected


def test_market_rules_are_well_formed():
    rules = load("market_rules")["items"]
    assert len({r["market"] for r in rules}) == len(rules)
    for r in rules:
        assert r["rule"] in {"assign", "quarantine", "as-filed", "alias"}, r["market"]
        assert r["status"] in {"verified", "rule", "unresolved"}, r["market"]
        assert "REPORT_" in r["evidence"], r["market"]
        if r["rule"] in ("assign", "alias"):
            assert r["target"] in geo.BY_ID, r["market"]
        else:
            assert r["target"] is None, r["market"]


def test_region_names_are_normalized_without_rewriting_codes():
    for p in geo.PROVINCES:
        assert not re.search(r"\sregion\b", p["region"]), p["id"]
    assert geo.BY_ID["abra"]["region"] == "Cordillera Administrative Region"
    assert geo.BY_ID["basilan"]["region"] == "Autonomous Region in Muslim Mindanao"
    assert geo.BY_ID["ncr"]["region"] == "National Capital Region"
    assert geo.BY_ID["marinduque"]["region"] == "Region IV-B"
    assert geo.BY_ID["palawan"]["region"] == "MIMAROPA"


def test_batanes_and_davao_occidental_are_registered():
    b = geo.BY_ID["batanes"]
    assert (b["lat"], b["lon"], b["coords_source"], b["market"]) == (20.45, 121.97, "manual", None)
    d = geo.BY_ID["davao-occidental"]
    assert (d["lat"], d["lon"]) == (6.41, 125.61)
    assert all(p["confidence"] in ("high", "UNCERTAIN") for p in geo.PROVINCES)
    assert d["confidence"] == "UNCERTAIN"


def test_match_province_resolves_only_legacy_names_until_ingest_moves():
    assert geo.match_province("Metro Manila") == "ncr"
    assert geo.match_province("Abra") is None


def test_public_commodity_fields_and_defaults():
    legacy = {c["id"] for c in cm.SYNTHETIC}
    for c in cm.public():
        assert set(c) == set(cm.PUBLIC_FIELDS)
        if c["id"] in legacy:
            assert c["scenario"] is True
        else:
            assert c["scenario"] is False and c["fil"] is None and c["icon"] is None
            assert c["typhoon"] == c["fuel"] == c["shelf"] == c["basket"] == 0


def test_group_vocabulary():
    assert {c["group"] for c in cm.COMMODITIES} == {
        "Grains", "Meat & Poultry", "Fish", "Vegetables & Fruit", "Roots & Tubers",
        "Seafood", "Pulses & Nuts", "Oils & Fats", "Sugar & Sweeteners",
    }


def test_sample_generator_defaults_to_synthetic_subsets():
    from mercado import sample_data
    df = sample_data.generate(end=sample_data.date(2019, 1, 14))
    assert set(df["province"]) == {p["id"] for p in geo.SYNTHETIC_PROVINCES}
    assert set(df["commodity"]) == {c["id"] for c in cm.SYNTHETIC}
