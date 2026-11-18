"""scripts/db_state.py: the keep/reset rule for an existing database. Offline; fixtures live in tmp_path."""
import hashlib
import importlib.util
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "db_state.py"

_spec = importlib.util.spec_from_file_location("db_state", SCRIPT)
db_state = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(db_state)


def _build(path, *, source_col=True, token_col=True, runs=()):
    """A prices/pipeline_runs database. runs: one entry per pipeline_runs row, its source_token (None = no token)."""
    prices_extra = ", source TEXT NOT NULL DEFAULT 'synthetic'" if source_col else ""
    runs_extra = ", source_token TEXT" if token_col else ""
    con = sqlite3.connect(path)
    con.executescript(f"""
        CREATE TABLE prices(date TEXT NOT NULL, province TEXT NOT NULL, region TEXT, market TEXT,
          commodity TEXT NOT NULL, price REAL NOT NULL{prices_extra}, PRIMARY KEY(date, province, commodity));
        INSERT INTO prices(date, province, commodity, price) VALUES ('2024-01-01', 'ncr', 'rice', 50.0);
        CREATE TABLE pipeline_runs(id INTEGER PRIMARY KEY AUTOINCREMENT, started TEXT, finished TEXT, mode TEXT,
          source TEXT, status TEXT, rows_added INTEGER, message TEXT, log TEXT{runs_extra});
    """)
    for token in runs:
        if token_col:
            con.execute("INSERT INTO pipeline_runs(status, source_token) VALUES ('ok', ?)", (token,))
        else:
            con.execute("INSERT INTO pipeline_runs(status) VALUES ('ok')")
    con.commit()
    con.close()
    return path


def _sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


FIXTURES = {
    "new_schema_token_run": dict(runs=('{"last_modified": "2026-11-15", "hash": "2440ab74"}',)),
    "new_schema_no_runs": dict(runs=()),
    "new_schema_runs_without_token": dict(runs=(None, None)),
    "new_schema_blank_token": dict(runs=("   ",)),
    "old_schema_no_source_column": dict(source_col=False, token_col=False, runs=(None,)),
    "source_column_no_token_column": dict(source_col=True, token_col=False, runs=(None,)),
}
EXPECTED = {
    "new_schema_token_run": "keep",
    "new_schema_no_runs": "reset",
    "new_schema_runs_without_token": "reset",
    "new_schema_blank_token": "reset",
    "old_schema_no_source_column": "reset",
    "source_column_no_token_column": "reset",
}


def test_missing_file(tmp_path):
    path = tmp_path / "mercado.db"
    state, reason = db_state._decide(str(path))
    assert state == "missing"
    assert reason
    assert not path.exists(), "the helper must not create the file"


def test_garbage_file_is_reset(tmp_path):
    path = tmp_path / "mercado.db"
    path.write_bytes(b"this is not a sqlite database\x00" * 200)
    state, reason = db_state._decide(str(path))
    assert state == "reset"
    assert "SQLite" in reason


def test_empty_file_is_reset(tmp_path):
    path = tmp_path / "mercado.db"
    path.write_bytes(b"")
    state, _ = db_state._decide(str(path))
    assert state == "reset"


def test_directory_is_reset(tmp_path):
    state, _ = db_state._decide(str(tmp_path))
    assert state == "reset"


def test_missing_pipeline_runs_table_is_reset(tmp_path):
    path = tmp_path / "mercado.db"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE prices(date TEXT, province TEXT, commodity TEXT, price REAL, source TEXT)")
    con.commit()
    con.close()
    state, _ = db_state._decide(str(path))
    assert state == "reset"


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_fixture_state(tmp_path, name):
    path = _build(tmp_path / "mercado.db", **FIXTURES[name])
    state, reason = db_state._decide(str(path))
    assert state == EXPECTED[name], reason
    assert reason


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_helper_never_modifies_file(tmp_path, name):
    path = _build(tmp_path / "mercado.db", **FIXTURES[name])
    before = _sha(path)
    db_state._decide(str(path))
    subprocess.run([sys.executable, str(SCRIPT), str(path)], check=True, capture_output=True)
    assert _sha(path) == before


def test_cli_prints_one_json_line(tmp_path):
    path = _build(tmp_path / "mercado.db", **FIXTURES["new_schema_token_run"])
    proc = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr
    lines = proc.stdout.strip().splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["state"] == "keep"
