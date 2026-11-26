param(
    [ValidateRange(1, 3650)]
    [int]$Days = 90,
    [ValidateRange(0, 90)]
    [int]$RecoveryDays = 21,
    [switch]$SkipPublish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$statusPath = Join-Path $repoRoot "runner\訓練\garmin-sync-status.json"
$fetchScript = Join-Path $repoRoot "scripts\garmin\fetch_garmin.py"
$reviewScript = Join-Path $repoRoot "scripts\build-training-review.mjs"
$projectPython = Join-Path $repoRoot ".venv\Scripts\python.exe"

function Write-SyncStatus([string]$Status, [string]$Message) {
    $payload = [ordered]@{
        updatedAt = (Get-Date).ToString("o")
        status = $Status
        message = $Message
    }
    $payload | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statusPath -Encoding UTF8
}

try {
    Set-Location -LiteralPath $repoRoot
    $uv = Get-Command uv -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($uv) {
        $pythonCommand = $uv.Source
        $pythonArgs = @("run", "python")
        $env:UV_CACHE_DIR = Join-Path $env:TEMP "runner-uv-cache"
    }
    elseif (Test-Path -LiteralPath $projectPython -PathType Leaf) {
        $pythonCommand = $projectPython
        $pythonArgs = @()
    }
    else {
        throw "Runner needs uv on PATH or a configured .venv\Scripts\python.exe to sync Garmin activities. Run uv sync from the Runner folder after installing uv."
    }

    & $pythonCommand @pythonArgs $fetchScript --days $Days --recovery-days $RecoveryDays --non-interactive
    $fetchExitCode = $LASTEXITCODE
    if ($fetchExitCode -eq 3) {
        $interactiveCommand = if ($uv) { "uv run python" } else { ".\.venv\Scripts\python.exe" }
        throw "Garmin token is unavailable or expired. Run '$interactiveCommand scripts/garmin/fetch_garmin.py' once and complete sign-in, then the scheduled sync will resume."
    }
    if ($fetchExitCode -ne 0) {
        throw "Garmin fetch exited with code $fetchExitCode"
    }

    if (-not $SkipPublish) {
        & node $reviewScript
        if ($LASTEXITCODE -ne 0) {
            throw "Training review publish exited with code $LASTEXITCODE"
        }
    }

    $message = if ($SkipPublish) { "Garmin activities synced; encrypted review publish was skipped." } else { "Garmin activities and encrypted training review synced." }
    Write-SyncStatus "ok" $message
    Write-Output "[OK] $message"
    exit 0
}
catch {
    $message = $_.Exception.Message
    Write-SyncStatus "error" $message
    Write-Error "[X] Garmin sync failed: $message"
    exit 1
}
