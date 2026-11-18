"""Read-only state check for a Mercado database before the live-data setup touches it.

Usage: python scripts/db_state.py <db_path>

Prints one JSON line {"state": "missing" | "keep" | "reset", "reason": "..."} and exits 0.
  keep   prices has a source column AND pipeline_runs has a source_token column AND at least
         one pipeline_runs row holds a non-empty source_token (a load by the current loader).
  reset  anything else, including a file that is not a readable SQLite database.
The database is opened with mode=ro and is never written.
"""
import json
import os
import sqlite3
import sys
from pathlib import Path


def _columns(con, table):
    return {row[1] for row in con.execute(f"PRAGMA table_info({table})")}


def _decide(path):
    if not os.path.exists(path):
        return "missing", f"{path} does not exist"
    if os.path.isdir(path):
        return "reset", f"{path} is a directory, not a database file"
    try:
        con = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)
    except sqlite3.Error as e:
        return "reset", f"cannot open {path}: {e}"
    try:
        prices, runs = _columns(con, "prices"), _columns(con, "pipeline_runs")
        if not prices:
            return "reset", "prices table is missing"
        if not runs:
            return "reset", "pipeline_runs table is missing"
        if "source" not in prices:
            return "reset", "prices has no source column (older schema)"
        if "source_token" not in runs:
            return "reset", "pipeline_runs has no source_token column (older schema)"
        found = con.execute("SELECT 1 FROM pipeline_runs WHERE source_token IS NOT NULL "
                            "AND TRIM(source_token) != '' LIMIT 1").fetchone()
        if found is None:
            return "reset", "no pipeline_runs row recorded a source_token (no load by the current loader)"
        return "keep", "prices has a source column and a pipeline_runs row recorded a source_token"
    except sqlite3.Error as e:
        return "reset", f"not a readable SQLite database: {e}"
    finally:
        con.close()


def main(argv):
    if len(argv) != 2:
        print("usage: python scripts/db_state.py <db_path>", file=sys.stderr)
        return 2
    state, reason = _decide(argv[1])
    print(json.dumps({"state": state, "reason": reason}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
