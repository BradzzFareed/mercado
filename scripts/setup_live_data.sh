#!/usr/bin/env bash
# One-command live-data setup for Mercado (WSL, Linux, CI).
#
#   bash scripts/setup_live_data.sh [--port N] [--skip-tests] [--force-reset] [--load-timeout-minutes N]
#
# Environment equivalents: PORT, SKIP_TESTS=1, FORCE_RESET=1, LOAD_TIMEOUT_MINUTES, MERCADO_DATA_DIR.
# Exit codes: 2 prerequisites, 3 uv sync, 4 tests, 5 database, 6 server or port, 7 load, 8 verify.
# See scripts/README.md for the steps and the keep/reset rule.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND="$REPO/backend"

PORT="${PORT:-8000}"
SKIP_TESTS="${SKIP_TESTS:-0}"
FORCE_RESET="${FORCE_RESET:-0}"
LOAD_TIMEOUT_MINUTES="${LOAD_TIMEOUT_MINUTES:-20}"

usage() {
  cat <<'EOF'
Usage: bash scripts/setup_live_data.sh [options]

  --port N                   backend port on 127.0.0.1 (default 8000, env PORT)
  --skip-tests               skip the backend test suite (env SKIP_TESTS=1)
  --force-reset              back up and reset the database even if it is safe to keep (env FORCE_RESET=1)
  --load-timeout-minutes N   maximum wait for the WFP load (default 20, env LOAD_TIMEOUT_MINUTES)
  -h, --help                 show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    --force-reset) FORCE_RESET=1; shift ;;
    --load-timeout-minutes) LOAD_TIMEOUT_MINUTES="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PORT" in ''|*[!0-9]*) echo "Invalid port: $PORT" >&2; exit 2 ;; esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then echo "Invalid port: $PORT" >&2; exit 2; fi
case "$LOAD_TIMEOUT_MINUTES" in ''|*[!0-9]*) echo "Invalid --load-timeout-minutes: $LOAD_TIMEOUT_MINUTES" >&2; exit 2 ;; esac
if [ "$LOAD_TIMEOUT_MINUTES" -lt 1 ]; then echo "Invalid --load-timeout-minutes: $LOAD_TIMEOUT_MINUTES" >&2; exit 2; fi

if [ -n "${MERCADO_DATA_DIR:-}" ]; then
  case "$MERCADO_DATA_DIR" in
    /*) DATA_DIR="$MERCADO_DATA_DIR" ;;
    *) DATA_DIR="$BACKEND/$MERCADO_DATA_DIR" ;;
  esac
else
  DATA_DIR="$BACKEND/data"
fi
DATA_DIR="$(realpath -m -- "$DATA_DIR")"
if [ -z "$DATA_DIR" ] || [ "$DATA_DIR" = "/" ]; then echo "Refusing to use data directory '$DATA_DIR'" >&2; exit 2; fi

DB="$DATA_DIR/mercado.db"
LIVE_DIR="$DATA_DIR/live"
LOG="$DATA_DIR/server.log"
PIDFILE="$DATA_DIR/server.pid"
BASE="http://127.0.0.1:$PORT"
PY=""
PID=""
OPEN=0
FAILED=0
RESULTS=()

step() { printf '[%s/7] %s... ' "$1" "$2"; OPEN=1; }
finish() { OPEN=0; printf '%s\n' "$*"; }
note() {
  if [ "$OPEN" = 1 ]; then echo; OPEN=0; fi
  echo "  $*"
}
die() {
  local code=$1 msg=$2
  shift 2
  if [ "$OPEN" = 1 ]; then echo; OPEN=0; fi
  echo "FAIL: $msg" >&2
  local line
  for line in "$@"; do printf '%s\n' "$line" | sed 's/^/  /' >&2; done
  exit "$code"
}

port_state() {
  local code
  code="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$BASE/api/v1/health" || true)"
  case "$code" in
    200) echo health ;;
    000|"") echo free ;;
    *) echo busy ;;
  esac
}

jget() {
  printf '%s' "$1" | "$PY" -c '
import json, sys
try:
    d = json.load(sys.stdin)
except ValueError:
    d = {}
v = d.get(sys.argv[1]) if isinstance(d, dict) else None
if v is None:
    print("")
elif isinstance(v, (dict, list)):
    print(json.dumps(v))
else:
    print(v)
' "$2"
}

check() {
  RESULTS+=("$1|$2|$3")
  case "$2" in PASS|WARN) ;; *) FAILED=1 ;; esac
}

cd "$BACKEND" || die 2 "backend/ not found at $BACKEND"

step 1 "Prerequisites"
command -v uv >/dev/null 2>&1 || die 2 "uv is not on PATH." \
  "Install uv (https://docs.astral.sh/uv/getting-started/installation/), open a new shell, then rerun." \
  "This script does not install system tools."
command -v curl >/dev/null 2>&1 || die 2 "curl is not on PATH." "Install curl with your system package manager, then rerun."
PY_SYS="$(uv python find '>=3.14' 2>/dev/null)" || die 2 "Python >= 3.14 is not available to uv." \
  "Install one with: uv python install 3.14" "Then rerun this script."
"$PY_SYS" -c 'import sys; raise SystemExit(sys.version_info < (3, 14))' \
  || die 2 "uv found $PY_SYS, which is older than Python 3.14." "Install one with: uv python install 3.14"
PYVER="$("$PY_SYS" -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
finish "OK (uv $(uv --version | awk '{print $2}'), Python $PYVER)"

printf 'Port preflight: 127.0.0.1:%s... ' "$PORT"
case "$(port_state)" in
  free) echo "free, OK" ;;
  health)
    echo
    die 6 "port $PORT already serves /health. Not starting a second server and not reusing it." \
      "Nothing was changed. If it is a Mercado server from an earlier run, stop it (PID file: $PIDFILE)." \
      "Or choose another port with --port."
    ;;
  busy)
    echo
    die 6 "port $PORT is in use by another service (no Mercado /health answer)." \
      "Nothing was changed. Choose another port with --port."
    ;;
esac

step 2 "uv sync (backend)"
uv sync || die 3 "uv sync failed in backend/ (see output above)."
PY="$BACKEND/.venv/bin/python"
[ -x "$PY" ] || die 3 "backend/.venv/bin/python is missing after uv sync." \
  "If this checkout is on a Windows drive (/mnt/c), the venv may have been created on Windows." \
  "Remove it yourself (rm -rf backend/.venv) and rerun. This script does not delete the venv."
case "$REPO" in
  /mnt/*) note "note: this checkout is on a Windows drive; backend/.venv now has the Linux layout. Run uv sync from Windows afterwards (the .ps1 does this in step 2)." ;;
esac
finish "OK"

step 3 "Backend tests"
if [ "$SKIP_TESTS" = "1" ]; then
  finish "SKIPPED (SKIP_TESTS=1)"
else
  TEST_LOG="$(mktemp)"
  uv run pytest -q 2>&1 | tee "$TEST_LOG"
  rc=${PIPESTATUS[0]}
  if [ "$rc" -ne 0 ] && ! grep -qE '[0-9]+ (passed|failed|error)' "$TEST_LOG"; then
    note "pytest did not run (no test summary); retrying once with UV_LINK_MODE=copy"
    UV_LINK_MODE=copy uv run python -m pytest -q 2>&1 | tee "$TEST_LOG"
    rc=${PIPESTATUS[0]}
  fi
  if [ "$rc" -ne 0 ]; then
    die 4 "pytest failed (exit $rc)." "$(tail -n 30 "$TEST_LOG")"
  fi
  PASSED="$(grep -oE '[0-9]+ passed' "$TEST_LOG" | tail -n 1)"
  rm -f "$TEST_LOG"
  finish "OK (${PASSED:-pass count not reported})"
fi

echo "Database and server paths: data dir $DATA_DIR"

step 4 "Database decision"
HELPER_OUT="$("$PY" "$SCRIPT_DIR/db_state.py" "$DB")" || die 5 "scripts/db_state.py failed."
STATE="$(jget "$HELPER_OUT" state)"
REASON="$(jget "$HELPER_OUT" reason)"
if [ "$FORCE_RESET" = "1" ] && [ "$STATE" != "missing" ]; then
  REASON="forced by --force-reset (helper said: $REASON)"
  STATE="reset"
fi
case "$STATE" in
  keep)
    finish "OK (keep: $REASON)"
    ;;
  missing)
    finish "OK (missing: $REASON; nothing to back up)"
    ;;
  reset)
    BACKUP_DIR="$HOME/mercado_backup"
    BACKUP="$BACKUP_DIR/mercado.db.$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR" || die 5 "cannot create $BACKUP_DIR; database left untouched."
    cp -p -n -- "$DB" "$BACKUP" || die 5 "backup copy failed; database left untouched."
    cmp -s -- "$DB" "$BACKUP" || die 5 "backup verification failed; database left untouched."
    if [ -f "$DB-wal" ]; then
      cp -p -n -- "$DB-wal" "$BACKUP-wal" || die 5 "backup copy of mercado.db-wal failed; database left untouched."
      cmp -s -- "$DB-wal" "$BACKUP-wal" || die 5 "backup verification of mercado.db-wal failed; database left untouched."
    fi
    rm -f -- "$DB" "$DB-wal" "$DB-shm"
    if [ -d "$LIVE_DIR" ]; then rm -rf -- "$LIVE_DIR"; fi
    [ ! -e "$DB" ] || die 5 "could not remove $DB (backup is at $BACKUP)."
    finish "OK (reset: $REASON; backup: $BACKUP)"
    ;;
  *)
    die 5 "unexpected helper state '$STATE'."
    ;;
esac

step 5 "Start the backend (port $PORT)"
case "$(port_state)" in
  free) ;;
  *) die 6 "port $PORT is no longer free; not starting a server." ;;
esac
mkdir -p "$DATA_DIR" || die 6 "cannot create $DATA_DIR"
: >"$LOG"
MERCADO_SCHEDULER=0 MERCADO_DATA_DIR="$DATA_DIR" nohup "$PY" -m uvicorn main:app \
  --host 127.0.0.1 --port "$PORT" </dev/null >"$LOG" 2>&1 &
PID=$!
echo "$PID" >"$PIDFILE"
DEADLINE=$((SECONDS + 120))
while :; do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PIDFILE"
    die 6 "the server exited during startup." "$(tail -n 20 "$LOG")"
  fi
  if [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$BASE/api/v1/health" || true)" = "200" ]; then
    break
  fi
  if [ "$SECONDS" -ge "$DEADLINE" ]; then
    kill "$PID" 2>/dev/null
    rm -f "$PIDFILE"
    die 6 "the server did not answer /health within 120 s (started server stopped)." "$(tail -n 20 "$LOG")"
  fi
  sleep 1
done
finish "OK (pid $PID, log $LOG)"

step 6 "Load real WFP data (POST /api/v1/pipeline/run, mode wfp)"
TIMEOUT_S=$((LOAD_TIMEOUT_MINUTES * 60))
RETRY_UNTIL=$((SECONDS + 120))
while :; do
  RAW="$(curl -sS -m "$TIMEOUT_S" -X POST -H 'Content-Type: application/json' -d '{"mode":"wfp"}' \
    -w '\n%{http_code}' "$BASE/api/v1/pipeline/run")"
  crc=$?
  if [ "$crc" -ne 0 ]; then
    die 7 "load request failed (curl exit $crc; 28 means it exceeded $LOAD_TIMEOUT_MINUTES min)." \
      "server log (last 20 lines):" "$(tail -n 20 "$LOG")"
  fi
  HTTP="$(printf '%s\n' "$RAW" | tail -n 1)"
  BODY="$(printf '%s\n' "$RAW" | sed '$d')"
  if [ "$HTTP" = "409" ]; then
    if [ "$SECONDS" -ge "$RETRY_UNTIL" ]; then
      die 7 "a pipeline run was still in progress after 2 minutes." "response body: $BODY"
    fi
    note "a pipeline run is already in progress (409); retrying in 5 s"
    sleep 5
    continue
  fi
  break
done
if [ "$HTTP" != "200" ]; then
  die 7 "POST /api/v1/pipeline/run returned HTTP $HTTP." "response body: $BODY" \
    "server log (last 20 lines):" "$(tail -n 20 "$LOG")"
fi
PSTATUS="$(jget "$BODY" status)"
PMSG="$(jget "$BODY" message)"
case "$PSTATUS" in
  ok) finish "OK (loaded, rows_added $(jget "$BODY" rows_added): $PMSG)" ;;
  *)
    case "$PMSG" in
      *unchanged*) finish "OK (skipped/unchanged: $PMSG)" ;;
      *) die 7 "load did not complete (status: ${PSTATUS:-none}): $PMSG" "response body: $BODY" \
           "server log (last 20 lines):" "$(tail -n 20 "$LOG")" ;;
    esac
    ;;
esac

echo "[7/7] Verify"

if META="$(curl -fsS -m 60 "$BASE/api/v1/meta" 2>/dev/null)"; then
  DV="$(jget "$META" data_version)"
  LU="$(jget "$META" last_updated)"
  if [ -n "$DV" ] && [ -n "$LU" ]; then
    check "meta data_version" PASS "$DV"
    check "meta last_updated" PASS "$LU"
  else
    check "meta data_version" FAIL "missing data_version or last_updated"
  fi
else
  check "meta" FAIL "GET /api/v1/meta failed"
fi

if COV="$(curl -fsS -m 120 "$BASE/api/v1/coverage" 2>/dev/null)"; then
  N="$(jget "$COV" count)"
  case "$N" in
    ''|*[!0-9]*) check "coverage rows" FAIL "no count in response" ;;
    *)
      if [ "$N" -ge 2000 ]; then check "coverage rows" PASS "$N (need >= 2000)"
      else check "coverage rows" FAIL "$N (need >= 2000)"; fi
      ;;
  esac
else
  check "coverage rows" FAIL "GET /api/v1/coverage failed"
fi

FRAW="$(curl -s -m 900 -w '\n%{http_code}' "$BASE/api/v1/forecast?province=ncr&commodity=rice" || true)"
FCODE="$(printf '%s\n' "$FRAW" | tail -n 1)"
FBODY="$(printf '%s\n' "$FRAW" | sed '$d')"
if [ "$FCODE" = "200" ]; then
  FSRC="$(jget "$FBODY" source)"
  if [ "$FSRC" = "real" ]; then check "forecast ncr/rice" PASS "HTTP 200, source real"
  else check "forecast ncr/rice" FAIL "HTTP 200, source '$FSRC' (need real)"; fi
else
  check "forecast ncr/rice" FAIL "HTTP $FCODE"
fi

RRAW="$(curl -sS -m "$TIMEOUT_S" -X POST -H 'Content-Type: application/json' -d '{"mode":"wfp"}' \
  -w '\n%{http_code}' "$BASE/api/v1/pipeline/run" || true)"
RCODE="$(printf '%s\n' "$RRAW" | tail -n 1)"
RBODY="$(printf '%s\n' "$RRAW" | sed '$d')"
RSTATUS="$(jget "$RBODY" status)"
RMSG="$(jget "$RBODY" message)"
if [ "$RCODE" != "200" ]; then
  check "rerun wfp" FAIL "HTTP $RCODE"
else
  case "$RSTATUS" in
    ok) check "rerun wfp" WARN "HDX changed between runs; loaded again" ;;
    *)
      case "$RMSG" in
        *unchanged*) check "rerun wfp" PASS "skipped/unchanged" ;;
        *) check "rerun wfp" FAIL "status ${RSTATUS:-none}: $RMSG" ;;
      esac
      ;;
  esac
fi

echo
printf '%-22s %-6s %s\n' "Check" "Result" "Detail"
for row in "${RESULTS[@]}"; do
  IFS='|' read -r name result detail <<<"$row"
  printf '%-22s %-6s %s\n' "$name" "$result" "$detail"
done
echo

if [ "$FAILED" -ne 0 ]; then
  die 8 "verification failed (see the table above). The server is still running on port $PORT." \
    "PID $PID. Stop it with: kill $PID"
fi
echo "Mercado live data is ready: $BASE (API docs at $BASE/docs), server PID $PID. Stop it with: kill $PID"
