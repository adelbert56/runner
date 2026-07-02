#requires -version 5
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
    if ($branchName -eq "main" -and Test-CleanGitTree) {
        Invoke-Step -Label "git-sync" -Command @("git", "pull", "--ff-only", "origin", "main")
    } elseif ($branchName -ne "main") {
        Write-Warning "Current branch is '$branchName'. Skipping full git pull, but public site data will still sync from origin/main."
    } else {
        Write-Warning "Working tree is not clean; skipping full git pull, but public site data will still sync from origin/main."
    }
    Invoke-Step -Label "site-sync" -Command @("npm", "run", "site:sync:remote")
} else {
    Write-Warning "git is not available; skipping public site data sync."
}

Write-Host "Starting Runner Plaza dev server on $url ..."

Start-Process -FilePath "npm" -ArgumentList "run", "dev" -NoNewWindow

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
