param(
    [ValidateSet("Daily", "Weekly")]
    [string]$Frequency = "Daily",
    [ValidatePattern("^([01]\d|2[0-3]):[0-5]\d$")]
    [string]$Time = "21:30",
    [ValidateRange(0, 6)]
    [int]$Day = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$syncScript = Join-Path $repoRoot "scripts\garmin\sync-garmin.ps1"
$taskName = "Runner Plaza Garmin Sync"
$pwshPath = (Get-Command pwsh -ErrorAction Stop).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$syncScript`""
$action = New-ScheduledTaskAction -Execute $pwshPath -Argument $arguments -WorkingDirectory $repoRoot
$at = [DateTime]::Today.Add([TimeSpan]::Parse($Time))

if ($Frequency -eq "Weekly") {
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek ([System.DayOfWeek]$Day) -At $at
} else {
    $trigger = New-ScheduledTaskTrigger -Daily -At $at
}

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Sync Garmin running activities and refresh Runner Plaza training review." -Force | Out-Null
Write-Output "[OK] Installed '$taskName' ($Frequency at $Time)."
