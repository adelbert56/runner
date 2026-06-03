[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cleaner = Join-Path $scriptDir "Clean-CDrive.ps1"

if (-not (Test-Path -LiteralPath $cleaner)) {
    Write-Output "[錯誤] 找不到清理腳本：$cleaner"
    Read-Host "按 Enter 結束"
    exit 1
}

function Invoke-Cleaner {
    param([string[]]$ArgsList)

    & powershell -NoProfile -ExecutionPolicy Bypass -File $cleaner @ArgsList
}

while ($true) {
    Clear-Host
    Write-Output "C 槽清理工具"
    Write-Output "============="
    Write-Output ""
    Write-Output "1. 只掃描，不刪除"
    Write-Output "2. 清理預設安全快取"
    Write-Output "3. 深度清理：預設項目 + Claude VM bundles + 舊版 Playwright"
    Write-Output "4. 清理 Gemini Antigravity 備份"
    Write-Output "5. 清理 NVIDIA OTA 更新快取"
    Write-Output "6. 嘗試清理 ASUS 服務日誌"
    Write-Output "7. 清理所有額外項目"
    Write-Output "8. 離開"
    Write-Output ""
    Write-Output "注意："
    Write-Output "- 第 1 項只會掃描，不會刪除檔案。"
    Write-Output "- 第 7 項會刪除 Gemini/Antigravity 的 migrated IDE 資料，請確認後再使用。"
    Write-Output ""

    $choice = Read-Host "請選擇"
    if ($choice -eq "1") {
        Invoke-Cleaner -ArgsList @(
            "-IncludeClaudeVmBundles",
            "-IncludeOldPlaywright",
            "-IncludeLockedServiceCaches",
            "-IncludeGeminiBackups",
            "-IncludeGeminiMigratedIde",
            "-IncludeNvidiaOtaArtifacts"
        )
    } elseif ($choice -eq "2") {
        Invoke-Cleaner -ArgsList @("-Clean")
    } elseif ($choice -eq "3") {
        Invoke-Cleaner -ArgsList @("-Clean", "-IncludeClaudeVmBundles", "-IncludeOldPlaywright")
    } elseif ($choice -eq "4") {
        Invoke-Cleaner -ArgsList @("-Clean", "-IncludeGeminiBackups")
    } elseif ($choice -eq "5") {
        Invoke-Cleaner -ArgsList @("-Clean", "-IncludeNvidiaOtaArtifacts")
    } elseif ($choice -eq "6") {
        Invoke-Cleaner -ArgsList @("-Clean", "-IncludeLockedServiceCaches")
    } elseif ($choice -eq "7") {
        Invoke-Cleaner -ArgsList @(
            "-Clean",
            "-IncludeClaudeVmBundles",
            "-IncludeOldPlaywright",
            "-IncludeLockedServiceCaches",
            "-IncludeGeminiBackups",
            "-IncludeGeminiMigratedIde",
            "-IncludeNvidiaOtaArtifacts"
        )
    } elseif ($choice -eq "8") {
        exit 0
    } else {
        Write-Output "選項無效。"
    }

    Write-Output ""
    $again = Read-Host "回到選單？[Y/N]"
    if ($again -notmatch "^[Yy]") {
        break
    }
}
