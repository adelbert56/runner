[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$IncludeClaudeVmBundles,
    [switch]$IncludeOldPlaywright,
    [switch]$IncludeLockedServiceCaches,
    [switch]$IncludeGeminiBackups,
    [switch]$IncludeGeminiMigratedIde,
    [switch]$IncludeNvidiaOtaArtifacts,
    [int]$TempOlderThanDays = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Format-Size {
    param([Int64]$Bytes)
    if ($Bytes -ge 1GB) { return ("{0:N2} GB" -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ("{0:N2} MB" -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ("{0:N2} KB" -f ($Bytes / 1KB)) }
    return "$Bytes B"
}

function Get-SizeBytes {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return 0L }
    $sum = 0L
    Get-ChildItem -LiteralPath $Path -Force -Recurse -File -ErrorAction SilentlyContinue |
        ForEach-Object { $sum += $_.Length }
    return $sum
}

function Remove-Target {
    param([object]$Target, [datetime]$TempCutoff)

    if ($Target.Mode -eq "Directory") {
        Remove-Item -LiteralPath $Target.Path -Recurse -Force -ErrorAction SilentlyContinue
        return
    }

    $items = Get-ChildItem -LiteralPath $Target.Path -Force -ErrorAction SilentlyContinue
    if ($Target.Mode -eq "ContentsOlderThan") {
        $items = $items | Where-Object { $_.LastWriteTime -lt $TempCutoff }
    }
    $items | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$userProfile = $env:USERPROFILE
$localAppData = $env:LOCALAPPDATA

$targets = @(
    [pscustomobject]@{ Name = "使用者暫存檔"; Id = "UserTemp"; Path = (Join-Path $localAppData "Temp"); Mode = "ContentsOlderThan"; Default = $true },
    [pscustomobject]@{ Name = "uv 套件快取"; Id = "UvCache"; Path = (Join-Path $localAppData "uv\cache"); Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "Claude uv 快取"; Id = "ClaudeUvCache"; Path = (Join-Path $localAppData "Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\uv"); Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "Claude roaming uv 快取"; Id = "ClaudeRoamingUvCache"; Path = (Join-Path $localAppData "Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\uv"); Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "Claude 瀏覽器快取"; Id = "ClaudeBrowserCache"; Path = (Join-Path $localAppData "Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\Cache"); Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "Claude 程式碼快取"; Id = "ClaudeCodeCache"; Path = (Join-Path $localAppData "Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\Code Cache"); Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "Claude GPU 快取"; Id = "ClaudeGpuCache"; Path = (Join-Path $localAppData "Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\GPUCache"); Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "NVIDIA 已下載安裝檔"; Id = "NvidiaDownloader"; Path = "C:\ProgramData\NVIDIA Corporation\Downloader"; Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "NVIDIA App 日誌"; Id = "NvidiaLogs"; Path = "C:\ProgramData\NVIDIA Corporation\NVIDIA app\Logs"; Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "NVIDIA App 工作階段日誌"; Id = "NvidiaSessionLogs"; Path = "C:\ProgramData\NVIDIA Corporation\NVIDIA app\SessionLogs"; Mode = "Contents"; Default = $true },
    [pscustomobject]@{ Name = "Claude VM bundles"; Id = "ClaudeVmBundles"; Path = (Join-Path $localAppData "Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\vm_bundles"); Mode = "Contents"; Default = $false },
    [pscustomobject]@{ Name = "舊版 Playwright chromium-1194"; Id = "OldPlaywright"; Path = (Join-Path $localAppData "ms-playwright\chromium-1194"); Mode = "Directory"; Default = $false },
    [pscustomobject]@{ Name = "舊版 Playwright chromium-1208"; Id = "OldPlaywright"; Path = (Join-Path $localAppData "ms-playwright\chromium-1208"); Mode = "Directory"; Default = $false },
    [pscustomobject]@{ Name = "舊版 Playwright headless shell 1194"; Id = "OldPlaywright"; Path = (Join-Path $localAppData "ms-playwright\chromium_headless_shell-1194"); Mode = "Directory"; Default = $false },
    [pscustomobject]@{ Name = "舊版 Playwright headless shell 1208"; Id = "OldPlaywright"; Path = (Join-Path $localAppData "ms-playwright\chromium_headless_shell-1208"); Mode = "Directory"; Default = $false },
    [pscustomobject]@{ Name = "ASUS Armoury Crate 診斷日誌"; Id = "AsusLogs"; Path = "C:\ProgramData\ASUS\ARMOURY CRATE Diagnosis\AsusLog"; Mode = "Contents"; Default = $false },
    [pscustomobject]@{ Name = "Gemini Antigravity 備份"; Id = "GeminiBackup"; Path = (Join-Path $userProfile ".gemini\antigravity-backup"); Mode = "Directory"; Default = $false },
    [pscustomobject]@{ Name = "Gemini Antigravity migrated IDE 副本"; Id = "GeminiMigratedIde"; Path = (Join-Path $userProfile ".gemini\antigravity-ide"); Mode = "Directory"; Default = $false },
    [pscustomobject]@{ Name = "NVIDIA App OTA 更新快取"; Id = "NvidiaOtaArtifacts"; Path = "C:\ProgramData\NVIDIA Corporation\NVIDIA app\UpdateFramework\ota-artifacts"; Mode = "Contents"; Default = $false }
)

$selected = $targets | Where-Object {
    $_.Default -or
    ($IncludeClaudeVmBundles -and $_.Id -eq "ClaudeVmBundles") -or
    ($IncludeOldPlaywright -and $_.Id -eq "OldPlaywright") -or
    ($IncludeLockedServiceCaches -and $_.Id -eq "AsusLogs") -or
    ($IncludeGeminiBackups -and $_.Id -eq "GeminiBackup") -or
    ($IncludeGeminiMigratedIde -and $_.Id -eq "GeminiMigratedIde") -or
    ($IncludeNvidiaOtaArtifacts -and $_.Id -eq "NvidiaOtaArtifacts")
}

Write-Output "[資訊] 模式：$(if ($Clean) { '清理' } else { '只掃描' })"
$cutoff = (Get-Date).AddDays(-$TempOlderThanDays)
$totalBefore = 0L
$totalAfter = 0L
$rows = @()

foreach ($target in $selected) {
    if (-not (Test-Path -LiteralPath $target.Path)) { continue }
    $before = Get-SizeBytes -Path $target.Path
    $after = $before
    if ($Clean) {
        Remove-Target -Target $target -TempCutoff $cutoff
        $after = Get-SizeBytes -Path $target.Path
    }
    $totalBefore += $before
    $totalAfter += $after
    $rows += [pscustomobject]@{
        "項目" = $target.Name
        "清理前" = Format-Size $before
        "清理後" = Format-Size $after
        "釋放空間" = Format-Size ($before - $after)
        "路徑" = $target.Path
    }
}

if ($rows.Count -gt 0) {
    $rows | Format-Table "項目", "清理前", "清理後", "釋放空間", "路徑" -AutoSize | Out-String -Width 260
} else {
    Write-Output "[資訊] 沒有找到符合條件的清理項目。"
}

if ($Clean) {
    Write-Output ("[完成] 總共釋放：" + (Format-Size ($totalBefore - $totalAfter)))
} else {
    Write-Output ("[資訊] 預估可清理大小：" + (Format-Size $totalBefore))
}

$drive = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.Name -eq "C:\" } | Select-Object -First 1
if ($drive) {
    $freeGb = [math]::Round($drive.AvailableFreeSpace / 1GB, 2)
    $usedGb = [math]::Round(($drive.TotalSize - $drive.AvailableFreeSpace) / 1GB, 2)
    Write-Output "[資訊] C 槽可用 ${freeGb} GB，已使用 ${usedGb} GB"
}
