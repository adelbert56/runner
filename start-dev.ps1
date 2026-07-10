#requires -version 5
param(
    [switch]$PreviewLocalData
)
<#
Refreshes public site data from origin/main, starts the Runner Plaza local dev
server (site/server.mjs, default port 4173), and opens it in the default browser.
#>

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$port = if ($env:PORT) { $env:PORT } else { "4173" }
$url = "http://127.0.0.1:$port/"

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [string[]]$Command
    )

    Write-Host "[$Label] $($Command -join ' ')"
    & $Command[0] $Command[1..($Command.Length - 1)]
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Invoke-OptionalStep {
    # Best-effort step: failure (e.g. offline, unreachable origin) must never
    # block the dev server from starting.
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [string[]]$Command
    )

    try {
        Invoke-Step -Label $Label -Command $Command
    } catch {
        Write-Warning "$Label skipped: $($_.Exception.Message)"
    }
}

function Test-PublicDataDirty {
    $paths = @(
        "site/data/announcements.json",
        "site/data/automation-health.json",
        "site/data/content.json",
        "site/data/message-cloud.json",
        "site/data/races.json",
        "site/data/runner-quips.json"
    )
    $status = & git status --porcelain -- $paths 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    return -not [string]::IsNullOrWhiteSpace(($status -join "`n"))
}

function Test-PublicDataMatchesOriginMain {
    $paths = @(
        "site/data/announcements.json",
        "site/data/automation-health.json",
        "site/data/content.json",
        "site/data/message-cloud.json",
        "site/data/races.json",
        "site/data/runner-quips.json"
    )

    foreach ($path in $paths) {
        $localPath = Join-Path $root $path
        if (-not (Test-Path -LiteralPath $localPath)) {
            return $false
        }

        # Compare blob hashes: string comparison of `git show` output loses
        # the trailing newline (PowerShell splits output into lines), which
        # made this check fail even when the files were identical.
        $remoteHash = & git rev-parse "origin/main:$path" 2>$null
        if ($LASTEXITCODE -ne 0) {
            return $false
        }

        $localHash = & git hash-object -- $localPath 2>$null
        if ($LASTEXITCODE -ne 0 -or $localHash -ne $remoteHash) {
            return $false
        }
    }

    return $true
}

function Test-CleanGitTree {
    $status = & git status --short 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    return [string]::IsNullOrWhiteSpace(($status -join "`n"))
}

function Get-GitBranchName {
    $branch = & git branch --show-current 2>$null
    if ($LASTEXITCODE -ne 0) {
        return ""
    }
    return ($branch -join "").Trim()
}

if (Get-Command git -ErrorAction SilentlyContinue) {
    $branchName = Get-GitBranchName
    if ($PreviewLocalData) {
        Write-Warning "Preview mode enabled. Local site/data/*.json will be served as-is and may differ from the live website."
    } else {
        if ($branchName -eq "main" -and (Test-CleanGitTree)) {
            Invoke-OptionalStep -Label "git-sync" -Command @("git", "pull", "--ff-only", "origin", "main")
        } elseif ($branchName -ne "main") {
            Write-Warning "Current branch is '$branchName'. Skipping full git pull, but public site data will still sync from origin/main."
        } else {
            Write-Warning "Working tree is not clean; skipping full git pull, but public site data will still sync from origin/main."
        }

        if (-not (Test-PublicDataMatchesOriginMain)) {
            if (Test-PublicDataDirty) {
                throw "Local site/data/*.json differs from origin/main and includes uncommitted changes. To preview unpublished local data, run '.\start-dev.ps1 -PreviewLocalData'. To view the same data as the website, commit/push your changes or discard the local site/data diff first."
            }
            throw "Local site/data/*.json no longer matches origin/main, even though git does not show a local site/data diff. This usually means you are previewing data from another local commit while the website still serves older main data. Run '.\start-dev.ps1 -PreviewLocalData' if that is intentional, or sync/push main before using live mode."
        }

        Invoke-OptionalStep -Label "site-sync" -Command @("npm", "run", "site:sync:remote")
    }
} else {
    Write-Warning "git is not available; skipping public site data sync."
}

Write-Host "Starting Runner Plaza dev server on $url ..."

Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm", "run", "dev" -NoNewWindow

# Wait for the server to come up, then open the browser.
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if ($ready) {
    Start-Process $url
} else {
    Write-Warning "Server did not respond within 15s; open $url manually."
}
