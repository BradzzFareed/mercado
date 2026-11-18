# One-command live-data setup for Mercado (Windows PowerShell 5.1).
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup_live_data.ps1 [-Port 8000] [-SkipTests] [-ForceReset] [-LoadTimeoutMinutes 20]
#
# Environment equivalents: PORT, SKIP_TESTS=1, FORCE_RESET=1, LOAD_TIMEOUT_MINUTES, MERCADO_DATA_DIR.
# Exit codes: 2 prerequisites, 3 uv sync, 4 tests, 5 database, 6 server or port, 7 load, 8 verify.
# See scripts/README.md for the steps and the keep/reset rule.
[CmdletBinding()]
param(
    [int]$Port,
    [switch]$SkipTests,
    [switch]$ForceReset,
    [int]$LoadTimeoutMinutes
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = [IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$Backend = Join-Path $Repo 'backend'

if (-not $PSBoundParameters.ContainsKey('Port')) {
    $Port = 8000
    if ($env:PORT) { $Port = [int]$env:PORT }
}
if (-not $PSBoundParameters.ContainsKey('LoadTimeoutMinutes')) {
    $LoadTimeoutMinutes = 20
    if ($env:LOAD_TIMEOUT_MINUTES) { $LoadTimeoutMinutes = [int]$env:LOAD_TIMEOUT_MINUTES }
}
$DoSkipTests = $SkipTests.IsPresent -or ($env:SKIP_TESTS -eq '1')
$DoForceReset = $ForceReset.IsPresent -or ($env:FORCE_RESET -eq '1')

if ($Port -lt 1 -or $Port -gt 65535) { Write-Host "Invalid port: $Port" -ForegroundColor Red; exit 2 }
if ($LoadTimeoutMinutes -lt 1) { Write-Host "Invalid LoadTimeoutMinutes: $LoadTimeoutMinutes" -ForegroundColor Red; exit 2 }

if ($env:MERCADO_DATA_DIR) {
    $dirArg = $env:MERCADO_DATA_DIR
    if (-not [IO.Path]::IsPathRooted($dirArg)) { $dirArg = Join-Path $Backend $dirArg }
} else {
    $dirArg = Join-Path $Backend 'data'
}
$DataDir = [IO.Path]::GetFullPath($dirArg).TrimEnd('\')
if ($DataDir -match '^[A-Za-z]:$') {
    Write-Host "Refusing to use data directory '$DataDir'" -ForegroundColor Red
    exit 2
}

$Db = Join-Path $DataDir 'mercado.db'
$LiveDir = Join-Path $DataDir 'live'
$LogOut = Join-Path $DataDir 'server.log'
$LogErr = Join-Path $DataDir 'server.err.log'
$PidFile = Join-Path $DataDir 'server.pid'
$Base = "http://127.0.0.1:$Port"
$Py = $null
$ServerPid = $null
$script:Open = $false
$script:Failed = $false
$Checks = New-Object System.Collections.ArrayList

function Write-Step([int]$n, [string]$name) {
    Write-Host -NoNewline ("[{0}/7] {1}... " -f $n, $name)
    $script:Open = $true
}

function Write-Done([string]$text) {
    $script:Open = $false
    Write-Host $text
}

function Write-Note([string]$text) {
    if ($script:Open) { Write-Host ''; $script:Open = $false }
    Write-Host "  $text"
}

function Fail([int]$code, [string]$msg, [string[]]$detail = @()) {
    if ($script:Open) { Write-Host ''; $script:Open = $false }
    Write-Host "FAIL: $msg" -ForegroundColor Red
    foreach ($line in $detail) { Write-Host "  $line" }
    exit $code
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Url,
        [string]$Body = $null,
        [int]$TimeoutSec = 60
    )
    try {
        $params = @{ Uri = $Url; Method = $Method; UseBasicParsing = $true; TimeoutSec = $TimeoutSec; ErrorAction = 'Stop' }
        if ($null -ne $Body) { $params.Body = $Body; $params.ContentType = 'application/json' }
        $r = Invoke-WebRequest @params
        return [pscustomobject]@{ Code = [int]$r.StatusCode; Body = [string]$r.Content; Error = '' }
    } catch {
        $resp = $_.Exception.Response
        if ($null -eq $resp) {
            return [pscustomobject]@{ Code = 0; Body = ''; Error = $_.Exception.Message }
        }
        $text = ''
        try {
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $text = $reader.ReadToEnd()
            $reader.Close()
        } catch { }
        return [pscustomobject]@{ Code = [int]$resp.StatusCode; Body = $text; Error = '' }
    }
}

function Get-PortState {
    $r = Invoke-Api -Method GET -Url "$Base/api/v1/health" -TimeoutSec 3
    if ($r.Code -eq 200) { return 'health' }
    if ($r.Code -eq 0) { return 'free' }
    return 'busy'
}

function Get-JsonField($text, [string]$field) {
    try {
        $obj = $text | ConvertFrom-Json
    } catch {
        return ''
    }
    $value = $obj.$field
    if ($null -eq $value) { return '' }
    return [string]$value
}

function Add-Check([string]$name, [string]$result, [string]$detail) {
    [void]$Checks.Add([pscustomobject]@{ Check = $name; Result = $result; Detail = $detail })
    if ($result -ne 'PASS' -and $result -ne 'WARN') { $script:Failed = $true }
}

Push-Location $Backend

# ---- [1/7] prerequisites
Write-Step 1 'Prerequisites'
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Fail 2 'uv is not on PATH.' @(
        'Install uv (https://docs.astral.sh/uv/getting-started/installation/), open a new PowerShell window, then rerun.',
        'This script does not install system tools.')
}
$pyFound = & uv python find '>=3.14'
if ($LASTEXITCODE -ne 0 -or -not $pyFound) {
    Fail 2 'Python >= 3.14 is not available to uv.' @('Install one with: uv python install 3.14', 'Then rerun this script.')
}
$PySys = @($pyFound)[0]
& $PySys -c "import sys; raise SystemExit(sys.version_info < (3, 14))"
if ($LASTEXITCODE -ne 0) {
    Fail 2 "uv found $PySys, which is older than Python 3.14." @('Install one with: uv python install 3.14')
}
$pyVer = & $PySys -c "import sys; print(sys.version.split()[0])"
Write-Done "OK (Python $pyVer via uv)"

# ---- port preflight (before any file is touched)
Write-Host -NoNewline "Port preflight: 127.0.0.1:$Port... "
switch (Get-PortState) {
    'free' { Write-Host 'free, OK' }
    'health' {
        Write-Host ''
        Fail 6 "port $Port already serves /health. Not starting a second server and not reusing it." @(
            "Nothing was changed. If it is a Mercado server from an earlier run, stop it (PID file: $PidFile).",
            'Or choose another port with -Port.')
    }
    'busy' {
        Write-Host ''
        Fail 6 "port $Port is in use by another service (no Mercado /health answer)." @(
            'Nothing was changed. Choose another port with -Port.')
    }
}

# ---- [2/7] uv sync
Write-Step 2 'uv sync (backend)'
& uv sync
if ($LASTEXITCODE -ne 0) { Fail 3 'uv sync failed in backend\ (see output above).' }
$Py = Join-Path $Backend '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Py)) {
    Fail 3 'backend\.venv\Scripts\python.exe is missing after uv sync.' @(
        'If the venv was created on Linux (WSL), remove backend\.venv yourself and rerun. This script does not delete the venv.')
}
Write-Done 'OK'

# ---- [3/7] tests
Write-Step 3 'Backend tests'
if ($DoSkipTests) {
    Write-Done 'SKIPPED (SKIP_TESTS=1)'
} else {
    & uv run pytest -q | Tee-Object -Variable TestOut | Out-Host
    $rc = $LASTEXITCODE
    $hasSummary = @($TestOut | Where-Object { $_ -match '\d+ (passed|failed|error)' }).Count -gt 0
    if ($rc -ne 0 -and -not $hasSummary) {
        Write-Note 'pytest did not run (no test summary); retrying once with UV_LINK_MODE=copy'
        $saved = $env:UV_LINK_MODE
        $env:UV_LINK_MODE = 'copy'
        try {
            & uv run python -m pytest -q | Tee-Object -Variable TestOut | Out-Host
            $rc = $LASTEXITCODE
        } finally {
            if ($null -eq $saved) { Remove-Item Env:\UV_LINK_MODE -ErrorAction SilentlyContinue } else { $env:UV_LINK_MODE = $saved }
        }
    }
    if ($rc -ne 0) { Fail 4 "pytest failed (exit $rc)." }
    $summary = @($TestOut | Where-Object { $_ -match '\d+ (passed|failed|error)' }) | Select-Object -Last 1
    $passed = 'pass count not reported'
    if ($summary -match '(\d+) passed') { $passed = "$($Matches[1]) passed" }
    Write-Done "OK ($passed)"
}
Write-Host "Database and server paths: data dir $DataDir"

# ---- [4/7] database decision
Write-Step 4 'Database decision'
$helperOut = & $Py (Join-Path $ScriptDir 'db_state.py') $Db
if ($LASTEXITCODE -ne 0) { Fail 5 'scripts\db_state.py failed.' }
$helperText = $helperOut -join ''
$state = Get-JsonField $helperText 'state'
$reason = Get-JsonField $helperText 'reason'
if ($DoForceReset -and $state -ne 'missing') {
    $reason = "forced by -ForceReset (helper said: $reason)"
    $state = 'reset'
}
switch ($state) {
    'keep' { Write-Done "OK (keep: $reason)" }
    'missing' { Write-Done "OK (missing: $reason; nothing to back up)" }
    'reset' {
        $backupDir = Join-Path $HOME 'mercado_backup'
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backup = Join-Path $backupDir "mercado.db.$stamp"
        try {
            New-Item -ItemType Directory -Force -Path $backupDir -ErrorAction Stop | Out-Null
            if (Test-Path -LiteralPath $backup) { throw "backup name already exists: $backup" }
            Copy-Item -LiteralPath $Db -Destination $backup -ErrorAction Stop
            $h1 = (Get-FileHash -LiteralPath $Db -Algorithm SHA256 -ErrorAction Stop).Hash
            $h2 = (Get-FileHash -LiteralPath $backup -Algorithm SHA256 -ErrorAction Stop).Hash
            if ($h1 -ne $h2) { throw 'backup verification failed' }
            if (Test-Path -LiteralPath "$Db-wal") {
                Copy-Item -LiteralPath "$Db-wal" -Destination "$backup-wal" -ErrorAction Stop
            }
        } catch {
            Fail 5 "backup failed; database left untouched. $($_.Exception.Message)"
        }
        try {
            foreach ($f in @($Db, "$Db-wal", "$Db-shm")) {
                if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -ErrorAction Stop }
            }
            if (Test-Path -LiteralPath $LiveDir) { Remove-Item -LiteralPath $LiveDir -Recurse -Force -ErrorAction Stop }
        } catch {
            Fail 5 "could not remove the database (backup is at $backup). $($_.Exception.Message)"
        }
        Write-Done "OK (reset: $reason; backup: $backup)"
    }
    default { Fail 5 "unexpected helper state '$state'." }
}

# ---- [5/7] start the backend
Write-Step 5 "Start the backend (port $Port)"
if ((Get-PortState) -ne 'free') { Fail 6 "port $Port is no longer free; not starting a server." }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
Set-Content -LiteralPath $LogOut -Value ''
Set-Content -LiteralPath $LogErr -Value ''
$savedSched = $env:MERCADO_SCHEDULER
$savedDir = $env:MERCADO_DATA_DIR
$env:MERCADO_SCHEDULER = '0'
$env:MERCADO_DATA_DIR = $DataDir
try {
    $proc = Start-Process -FilePath $Py `
        -ArgumentList @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', "$Port") `
        -WorkingDirectory $Backend -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr
} finally {
    if ($null -eq $savedSched) { Remove-Item Env:\MERCADO_SCHEDULER -ErrorAction SilentlyContinue } else { $env:MERCADO_SCHEDULER = $savedSched }
    if ($null -eq $savedDir) { Remove-Item Env:\MERCADO_DATA_DIR -ErrorAction SilentlyContinue } else { $env:MERCADO_DATA_DIR = $savedDir }
}

function Get-LogTail {
    $lines = @()
    foreach ($f in @($LogOut, $LogErr)) {
        if (Test-Path -LiteralPath $f) { $lines += (Get-Content -LiteralPath $f -Tail 20) }
    }
    return @($lines | Select-Object -Last 20)
}

$deadline = (Get-Date).AddSeconds(120)
while ($true) {
    if ($proc.HasExited) {
        Remove-Item -LiteralPath $PidFile -ErrorAction SilentlyContinue
        Fail 6 'the server exited during startup.' (Get-LogTail)
    }
    if ((Invoke-Api -Method GET -Url "$Base/api/v1/health" -TimeoutSec 3).Code -eq 200) { break }
    if ((Get-Date) -ge $deadline) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $PidFile -ErrorAction SilentlyContinue
        Fail 6 'the server did not answer /health within 120 s (started server stopped).' (Get-LogTail)
    }
    Start-Sleep -Seconds 1
}
# The venv python.exe can be a launcher that hands off to a child; record the process that owns the socket.
$ServerPid = $proc.Id
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { $ServerPid = $listener.OwningProcess }
Set-Content -LiteralPath $PidFile -Value $ServerPid
Write-Done "OK (pid $ServerPid, log $LogOut)"

# ---- [6/7] load real WFP data
Write-Step 6 'Load real WFP data (POST /api/v1/pipeline/run, mode wfp)'
$runUrl = "$Base/api/v1/pipeline/run"
$runBody = '{"mode":"wfp"}'
$loadSec = $LoadTimeoutMinutes * 60
$retryUntil = (Get-Date).AddSeconds(120)
while ($true) {
    $resp = Invoke-Api -Method POST -Url $runUrl -Body $runBody -TimeoutSec $loadSec
    if ($resp.Code -eq 0) {
        $tail = Get-LogTail
        Fail 7 "load request failed: $($resp.Error)" (@('server log (last 20 lines):') + $tail)
    }
    if ($resp.Code -eq 409) {
        if ((Get-Date) -ge $retryUntil) { Fail 7 'a pipeline run was still in progress after 2 minutes.' @("response body: $($resp.Body)") }
        Write-Note 'a pipeline run is already in progress (409); retrying in 5 s'
        Start-Sleep -Seconds 5
        continue
    }
    break
}
if ($resp.Code -ne 200) {
    $tail = Get-LogTail
    Fail 7 "POST /api/v1/pipeline/run returned HTTP $($resp.Code)." (@("response body: $($resp.Body)", 'server log (last 20 lines):') + $tail)
}
$loadStatus = Get-JsonField $resp.Body 'status'
$loadMsg = Get-JsonField $resp.Body 'message'
if ($loadStatus -eq 'ok') {
    Write-Done "OK (loaded, rows_added $(Get-JsonField $resp.Body 'rows_added'): $loadMsg)"
} elseif ($loadMsg -match 'unchanged') {
    Write-Done "OK (skipped/unchanged: $loadMsg)"
} else {
    $tail = Get-LogTail
    Fail 7 "load failed (status: $loadStatus): $loadMsg" (@("response body: $($resp.Body)", 'server log (last 20 lines):') + $tail)
}

# ---- [7/7] verify
Write-Host '[7/7] Verify'

$meta = Invoke-Api -Method GET -Url "$Base/api/v1/meta" -TimeoutSec 60
if ($meta.Code -eq 200) {
    $dv = Get-JsonField $meta.Body 'data_version'
    $lu = Get-JsonField $meta.Body 'last_updated'
    if ($dv -and $lu) {
        Add-Check 'meta data_version' 'PASS' $dv
        Add-Check 'meta last_updated' 'PASS' $lu
    } else {
        Add-Check 'meta data_version' 'FAIL' 'missing data_version or last_updated'
    }
} else {
    Add-Check 'meta' 'FAIL' "GET /api/v1/meta returned HTTP $($meta.Code)"
}

$cov = Invoke-Api -Method GET -Url "$Base/api/v1/coverage" -TimeoutSec 120
if ($cov.Code -eq 200) {
    $n = Get-JsonField $cov.Body 'count'
    if ($n -match '^\d+$' -and [int]$n -ge 2000) { Add-Check 'coverage rows' 'PASS' "$n (need >= 2000)" }
    else { Add-Check 'coverage rows' 'FAIL' "$n (need >= 2000)" }
} else {
    Add-Check 'coverage rows' 'FAIL' "GET /api/v1/coverage returned HTTP $($cov.Code)"
}

$fc = Invoke-Api -Method GET -Url "$Base/api/v1/forecast?province=ncr&commodity=rice" -TimeoutSec 900
if ($fc.Code -eq 200) {
    $src = Get-JsonField $fc.Body 'source'
    if ($src -eq 'real') { Add-Check 'forecast ncr/rice' 'PASS' 'HTTP 200, source real' }
    else { Add-Check 'forecast ncr/rice' 'FAIL' "HTTP 200, source '$src' (need real)" }
} else {
    Add-Check 'forecast ncr/rice' 'FAIL' "HTTP $($fc.Code)"
}

$rr = Invoke-Api -Method POST -Url $runUrl -Body $runBody -TimeoutSec $loadSec
if ($rr.Code -ne 200) {
    Add-Check 'rerun wfp' 'FAIL' "HTTP $($rr.Code)"
} else {
    $rs = Get-JsonField $rr.Body 'status'
    $rm = Get-JsonField $rr.Body 'message'
    if ($rs -eq 'ok') { Add-Check 'rerun wfp' 'WARN' 'HDX changed between runs; loaded again' }
    elseif ($rm -match 'unchanged') { Add-Check 'rerun wfp' 'PASS' 'skipped/unchanged' }
    else { Add-Check 'rerun wfp' 'FAIL' "status ${rs}: $rm" }
}

Write-Host ''
$Checks | Format-Table -AutoSize | Out-String | Write-Host -NoNewline
Write-Host ''

Pop-Location

if ($script:Failed) {
    Fail 8 "verification failed (see the table above). The server is still running on port $Port. PID $ServerPid. Stop it with: Stop-Process -Id $ServerPid"
}
Write-Host "Mercado live data is ready: $Base (API docs at $Base/docs), server PID $ServerPid. Stop it with: Stop-Process -Id $ServerPid"
