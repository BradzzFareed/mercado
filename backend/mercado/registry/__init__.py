"""Identity registry: commodities, provinces and market rules, stored as JSON beside this file.

Each file is {"_meta": {...provenance...}, "items": [...]}. The JSON is the source of truth;
geo.py and commodities.py read it at import time.
"""
import json
import os

_DIR = os.path.dirname(os.path.abspath(__file__))


def load(name):
    with open(os.path.join(_DIR, f"{name}.json"), encoding="utf-8") as fh:
        return json.load(fh)
