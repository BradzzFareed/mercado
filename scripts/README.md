# Live-data setup scripts

One command gives you a backend with the real WFP food-price data, loaded the same way for everyone:

- `setup_live_data.sh`: WSL, Linux and CI (bash). **This is the primary invocation.**
- `setup_live_data.ps1`: Windows PowerShell 5.1.
- `db_state.py`: read-only helper that decides whether an existing database is safe to keep. Both scripts call it.

The scripts never change backend code, models, pipeline or frontend. They never delete a database without first copying it to a backup.

## Usage

From the repository root:

```bash
bash scripts/setup_live_data.sh                  # primary; or ./scripts/setup_live_data.sh if executable
bash scripts/setup_live_data.sh --port 8765 --skip-tests
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_live_data.ps1
powershell -ExecutionPolicy Bypass -File scripts\setup_live_data.ps1 -Port 8765 -SkipTests
```

Use `-ExecutionPolicy Bypass` if scripts are blocked on your machine. It applies to that one run only.

The backend server keeps running after the script ends. The last line of output gives the URL, the PID, and the command that stops it.

## Parameters

| Bash flag | PowerShell | Environment | Default | Meaning |
|---|---|---|---|---|
| `--port N` | `-Port N` | `PORT` | `8000` | Backend port on 127.0.0.1 |
| `--skip-tests` | `-SkipTests` | `SKIP_TESTS=1` | off | Skip step 3 (backend test suite) |
| `--force-reset` | `-ForceReset` | `FORCE_RESET=1` | off | Back up and reset the database even if it could be kept |
| `--load-timeout-minutes N` | `-LoadTimeoutMinutes N` | `LOAD_TIMEOUT_MINUTES` | `20` | Maximum wait for the WFP load |
| `-h`, `--help` | | | | Show usage (bash) |

Both scripts also honour `MERCADO_DATA_DIR`. A relative value is relative to `backend/`. Without it the data directory is `backend/data`.

## What each step does

Each step prints `[n/7] <step>... OK` or a failure message. The first failure stops the script.

| Step | What happens | Exit code on failure |
|---|---|---|
| 1. Prerequisites | Checks that `uv` is on PATH and that uv can find Python 3.14 or newer (`uv python find ">=3.14"`). It prints the version it found. If something is missing, it prints install guidance and stops. It never installs system tools. | 2 |
| Port preflight | Before anything else is touched, checks `GET /api/v1/health` on the chosen port. If Mercado already answers there, or another service holds the port, it stops and changes nothing. It does not reuse a running server. | 6 |
| 2. `uv sync` | Installs the backend dependencies into `backend/.venv`. | 3 |
| 3. Tests | Runs `uv run pytest -q` in `backend/` and prints the pass count. If pytest did not run at all (no test summary), it retries once with `UV_LINK_MODE=copy`. A genuine test failure stops the script. | 4 |
| 4. Database decision | Runs `db_state.py` on the database and acts on the result (see the rule below). | 5 |
| 5. Start the backend | Starts uvicorn from `backend/` on the chosen port with `MERCADO_SCHEDULER=0`, for that process only. It waits up to 120 s for `/health`. If the server dies or never answers, the script stops the server it started and shows the last 20 log lines. | 6 |
| 6. Load real data | Sends `POST /api/v1/pipeline/run` with body `{"mode":"wfp"}`. The call is synchronous and waits up to `LoadTimeoutMinutes`. A 409 (a run is already in progress) is retried every 5 s for up to 2 minutes. Success is `status: "ok"`, or a message containing "unchanged" (skipped). Anything else, including `no_update` with "Sources unreachable", is a failure. The script does not retry a download on its own. | 7 |
| 7. Verify | Checks `/api/v1/meta` (`data_version` and `last_updated` present), `/api/v1/coverage` (default row count at least 2000), `/api/v1/forecast?province=ncr&commodity=rice` (HTTP 200 with `source: "real"`), and a second `wfp` run (skipped/unchanged passes; `ok` passes with a warning because HDX changed between runs). It prints a pass/fail table. | 8 |

The server is left running after step 7, even if verification fails, so you can look at it. Stop it with the command printed at the end.

## Database keep/reset rule

Step 4 runs `scripts/db_state.py` (read-only, stdlib only) on `<data dir>/mercado.db`. The helper prints one JSON line with `state` and `reason`.

| Situation | State | Action |
|---|---|---|
| No database file | `missing` | Nothing to back up. The server creates a new database on start. |
| The file is not a readable SQLite database, or it is a directory | `reset` | Back up and reset. |
| `prices` has no `source` column (older schema) | `reset` | Back up and reset. |
| `pipeline_runs` has no `source_token` column | `reset` | Back up and reset. This is the case for databases written before the current loader. |
| Schema is current, but no `pipeline_runs` row has a non-empty `source_token` (for example, a dev DB that only has synthetic seed rows) | `reset` | Back up and reset. |
| Schema is current, and at least one run recorded a `source_token` (a load by the current loader) | `keep` | Leave the database alone. Step 6 then decides from HDX whether there is anything new. |

A reset works like this:

1. The database is copied to `~/mercado_backup/mercado.db.<yyyyMMdd-HHmmss>` (Windows: `$HOME\mercado_backup\`). A `-wal` file is copied too if present. The copy is verified byte for byte (SHA-256 on Windows) before anything is removed.
2. Only then are `mercado.db`, `mercado.db-wal`, `mercado.db-shm` and `<data dir>/live/` removed. Nothing else in the data directory is touched.
3. `-ForceReset` or `--force-reset` applies this even when the rule would keep the database.

Keep in mind that `live/` (which holds the last downloaded WFP CSV) is regenerated by the next load and is not backed up.

A new database also receives the synthetic sample history on first start (the server's normal behaviour). WFP then replaces the synthetic series for the provinces and commodities it covers. Other series remain synthetic and are labelled `synthetic` in the data.

## Stopping the server

The PID is written to `<data dir>/server.pid`.

```bash
kill "$(cat backend/data/server.pid)"        # or: kill <pid>
```

```powershell
Stop-Process -Id <pid>                        # PID from the last line of the script, or backend\data\server.pid
```

On Windows the script records the PID of the process that owns the listening socket, because the venv `python.exe` can hand off to a child process.

## Logs

- Bash: `<data dir>/server.log` holds stdout and stderr.
- PowerShell: `<data dir>/server.log` holds stdout and `<data dir>/server.err.log` holds stderr. Uvicorn writes its messages to stderr, so look there first when startup fails.

## Running from WSL on a Windows drive

If the checkout is on `/mnt/c`, running `setup_live_data.sh` from WSL makes `uv sync` recreate `backend/.venv` in the Linux layout (`.venv/bin`, not `.venv/Scripts`). Windows then needs `uv sync` again before its own runs. The PowerShell script does this in its step 2, so run it once on Windows after a WSL run. The bash script warns about this when the repository is on `/mnt/`. If `.venv/bin/python` is missing after `uv sync`, the script stops and tells you to remove `backend/.venv` yourself. It never deletes the venv.

## Re-running

Running either script again is safe:

- If the server is still running on the port, the port preflight (right after step 1) stops with a message. Nothing is changed, and the database is not touched.
- If the server has been stopped, step 4 keeps the database (it has a token run), and the scripts start the server again and reload.

## Text for the main README

Lane C can paste this block into the main `README.md`:

````markdown
### Live WFP data in one command

Run one of these from the repository root. Each installs the backend, runs the tests, starts the server on port 8000 and loads the real WFP food-price data. The server keeps running afterwards.

```bash
bash scripts/setup_live_data.sh                  # WSL, Linux, CI
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_live_data.ps1   # Windows PowerShell
```

Options: `--port N` / `-Port N`, `--skip-tests` / `-SkipTests`, `--force-reset` / `-ForceReset`. See `scripts/README.md` for the steps, the rule that decides whether an existing database is kept or backed up first, and how to stop the server.
````
