#requires -version 5
<#
Starts the Runner Plaza local dev server (site/server.mjs, default port 4173)
and opens it in the default browser.
#>

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$port = if ($env:PORT) { $env:PORT } else { "4173" }
$url = "http://127.0.0.1:$port/"

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
